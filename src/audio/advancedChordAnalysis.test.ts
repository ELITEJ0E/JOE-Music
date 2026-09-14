import { describe, it, expect } from "vitest";
import { extractEnhancedChromagram, NOTE_NAMES } from "./chromaExtractor";
import {
  parseDiatonicProfile,
  estimateRootCandidates,
  evaluateQualityForRoot,
  rankChordCandidatesForWindow
} from "./twoStageChordEngine";
import {
  buildMusicalGrid,
  aggregateChromasForBeatUnits,
  optimizeChordSequence,
  analyzeBeatSynchronousHarmonics
} from "./beatSynchronousAnalyzer";

describe("Enhanced Chroma Extractor & Two-Stage Chord Engine", () => {
  it("Stage 1 & 2: accurately detects root and major quality from synthetic chord chroma", () => {
    // Simulate A Major chord chroma: A(9), C#(1), E(4)
    const chroma = new Float32Array(12);
    chroma[9] = 1.0;  // Root A
    chroma[1] = 0.85; // Major 3rd C#
    chroma[4] = 0.80; // Perfect 5th E

    // Bass chroma: A is strong fundamental
    const bassChroma = new Float32Array(12);
    bassChroma[9] = 1.0;

    const keyProfile = parseDiatonicProfile("A Major");
    const candidates = rankChordCandidatesForWindow(chroma, bassChroma, keyProfile, 3);

    expect(candidates.length).toBeGreaterThan(0);
    const winner = candidates[0];
    expect(winner.root).toBe("A");
    expect(winner.quality).toBe(""); // Major triad canonical symbol is ""
    expect(winner.chord).toBe("A");
    expect(winner.isSlash).toBe(false);
  });

  it("Stage 2: cleanly distinguishes Minor triad from Major triad based on 3rd evidence", () => {
    // Simulate F# minor chord: F#(6), A(9), C#(1)
    const chroma = new Float32Array(12);
    chroma[6] = 1.0;  // Root F#
    chroma[9] = 0.75; // Minor 3rd A
    chroma[1] = 0.70; // 5th C#
    // Stray vocal harmonic at A# (4 semitones above F#) is very weak
    chroma[10] = 0.08;

    const bassChroma = new Float32Array(12);
    bassChroma[6] = 0.95; // F# bass

    const keyProfile = parseDiatonicProfile("A Major");
    const candidates = rankChordCandidatesForWindow(chroma, bassChroma, keyProfile, 3);

    const winner = candidates[0];
    expect(winner.root).toBe("F#");
    expect(winner.quality).toBe("m");
    expect(winner.chord).toBe("F#m");
  });

  it("Anti-Overfitting: prefers clean triad over complex 7th when 7th evidence is weak", () => {
    // D Major triad: D(2), F#(6), A(9) with very faint 7th (C#)
    const chroma = new Float32Array(12);
    chroma[2] = 1.0;  // D
    chroma[6] = 0.80; // F#
    chroma[9] = 0.75; // A
    chroma[1] = 0.15; // C# (weak background vocal, not a deliberate maj7)

    const bassChroma = new Float32Array(12);
    bassChroma[2] = 0.90;

    const keyProfile = parseDiatonicProfile("A Major");
    const candidates = rankChordCandidatesForWindow(chroma, bassChroma, keyProfile, 3);

    const winner = candidates[0];
    // Anti-overfitting must choose "D" rather than "Dmaj7"
    expect(winner.chord).toBe("D");
  });

  it("Slash Chord Protection: rejects transient/weak bass movement and preserves root chord", () => {
    // E Major chord: E(4), G#(8), B(11) with a brief bass note on G# (first inversion tone)
    // but G# bass energy is NOT significantly dominant over E (e.g. bass ratio < 2.0)
    const chroma = new Float32Array(12);
    chroma[4] = 1.0;
    chroma[8] = 0.75;
    chroma[11] = 0.80;

    const bassChroma = new Float32Array(12);
    bassChroma[4] = 0.70; // Root E is present
    bassChroma[8] = 0.75; // G# is slightly higher, but ratio is only 1.07 (< 2.0 threshold)

    const keyProfile = parseDiatonicProfile("A Major");
    const candidates = rankChordCandidatesForWindow(chroma, bassChroma, keyProfile, 3);

    const winner = candidates[0];
    expect(winner.chord).toBe("E");
    expect(winner.isSlash).toBe(false);
  });

  it("Slash Chord Acceptance: accepts genuine inversion when bass is dominant (> 2.0x root)", () => {
    // C/E chord: C Major with powerful sustained low E bass (e.g. bass pedal on 3rd)
    const chroma = new Float32Array(12);
    chroma[0] = 0.90; // C
    chroma[4] = 0.85; // E
    chroma[7] = 0.80; // G

    const bassChroma = new Float32Array(12);
    bassChroma[0] = 0.20; // C bass is weak
    bassChroma[4] = 0.85; // E bass is 4.25x stronger than C!

    const keyProfile = parseDiatonicProfile("C Major");
    const candidates = rankChordCandidatesForWindow(chroma, bassChroma, keyProfile, 3);

    const winner = candidates[0];
    expect(winner.root).toBe("C");
    expect(winner.bass).toBe("E");
    expect(winner.chord).toBe("C/E");
    expect(winner.isSlash).toBe(true);
  });
});

describe("Beat-Synchronous Analyzer for Fast Modern Songs", () => {
  it("buildMusicalGrid generates subdivision units in fast mode (>= 115 BPM)", () => {
    const tempo = 124; // Fast pop tempo
    const beats = [0.0, 0.484, 0.968, 1.452, 1.935, 2.419, 2.903, 3.387];
    const totalDuration = 4.0;

    const { units, isFastMode } = buildMusicalGrid(beats, tempo, totalDuration);

    expect(isFastMode).toBe(true);
    // In fast mode, each beat is subdivided into two half-beat units (8th notes)
    expect(units.length).toBeGreaterThanOrEqual(14);
    expect(units[0].isSubdivision).toBe(false);
    expect(units[1].isSubdivision).toBe(true);
    expect(units[0].duration).toBeCloseTo(0.242, 2);
  });

  it("tracks fast 124 BPM progression (A -> E -> F#m -> D) without blurring or frame dropping", () => {
    // 4 bars at 124 BPM: 1 chord per bar = ~1.935s per chord
    // Total 4 chords over ~7.74s
    const tempo = 124;
    const beatInterval = 60 / tempo; // ~0.4838s
    const totalBeats = 16;
    const beats: number[] = [];
    for (let b = 0; b < totalBeats; b++) {
      beats.push(Number((b * beatInterval).toFixed(3)));
    }
    const totalDuration = totalBeats * beatInterval;

    // Build synthetic chromagram: 43 frames/sec (hopSize 2048 at 44100Hz = ~0.0464s per frame)
    const frameDuration = 2048 / 44100;
    const numFrames = Math.floor(totalDuration / frameDuration);
    const chromagram: Float32Array[] = [];
    const bassChromagram: Float32Array[] = [];

    // Chords:
    // Bar 1 (0 to 1.935s): A Major (A=9, C#=1, E=4)
    // Bar 2 (1.935s to 3.87s): E Major (E=4, G#=8, B=11)
    // Bar 3 (3.87s to 5.805s): F# Minor (F#=6, A=9, C#=1)
    // Bar 4 (5.805s to 7.74s): D Major (D=2, F#=6, A=9)
    for (let f = 0; f < numFrames; f++) {
      const t = f * frameDuration;
      const c = new Float32Array(12);
      const b = new Float32Array(12);

      if (t < 1.935) {
        // A Major
        c[9] = 1.0; c[1] = 0.8; c[4] = 0.75;
        b[9] = 0.95;
      } else if (t < 3.87) {
        // E Major
        c[4] = 1.0; c[8] = 0.8; c[11] = 0.75;
        b[4] = 0.95;
      } else if (t < 5.805) {
        // F# Minor
        c[6] = 1.0; c[9] = 0.75; c[1] = 0.70;
        b[6] = 0.95;
      } else {
        // D Major
        c[2] = 1.0; c[6] = 0.8; c[9] = 0.75;
        b[2] = 0.95;
      }

      // Add realistic background vocal noise across unrelated pitch classes
      c[7] = 0.05;
      c[10] = 0.06;

      chromagram.push(c);
      bassChromagram.push(b);
    }

    const result = analyzeBeatSynchronousHarmonics(chromagram, bassChromagram, {
      sampleRate: 44100,
      hopSize: 2048,
      tempo,
      beats,
      estimatedKey: "A Major",
      totalDuration
    });

    const chords = result.segments.map(s => s.chord);
    expect(result.isFastMode).toBe(true);
    expect(result.segments.length).toBe(4);
    expect(chords).toEqual(["A", "E", "F#m", "D"]);

    // Verify boundaries are aligned with the musical beat grid
    expect(result.segments[0].startTime).toBe(0);
    expect(result.segments[1].startTime).toBeCloseTo(1.935, 1);
    expect(result.segments[2].startTime).toBeCloseTo(3.87, 1);
    expect(result.segments[3].startTime).toBeCloseTo(5.805, 1);
  });
});
