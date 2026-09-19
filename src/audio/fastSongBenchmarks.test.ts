import { describe, it, expect } from "vitest";
import { analyzeBeatSynchronousHarmonics } from "./beatSynchronousAnalyzer";
import { stabilizeChordSegments } from "./harmonicStabilizer";

describe("Phase 8 & 9 Fast Song Benchmarks: BTS & Jung Kook Real-World Scenarios", () => {
  /**
   * Helper to build synthetic chromagram with realistic musical noise:
   * - Harmonic chord tones
   * - Bass fundamental
   * - Vocal lead melody notes (high frequency pitch classes)
   * - Acoustic percussion / drum transient noise across all bins
   */
  function createSyntheticSongTrack(options: {
    tempo: number;
    bars: number;
    chordPlan: Array<{
      chord: string;
      rootIdx: number;
      thirdIdx: number;
      fifthIdx: number;
      startBeat: number;
      durationBeats: number;
      transientVocal?: { pitchIdx: number; startBeat: number; durationBeats: number };
      passingBass?: { pitchIdx: number; startBeat: number; durationBeats: number };
    }>;
    estimatedKey: string;
  }) {
    const { tempo, chordPlan, estimatedKey } = options;
    const beatInterval = 60 / tempo;
    const totalBeats = options.bars * 4;
    const totalDuration = totalBeats * beatInterval;

    const beats: number[] = [];
    for (let b = 0; b < totalBeats; b++) {
      beats.push(Number((b * beatInterval).toFixed(3)));
    }

    const frameDuration = 2048 / 44100; // ~0.0464s per frame
    const numFrames = Math.floor(totalDuration / frameDuration);
    const chromagram: Float32Array[] = [];
    const bassChromagram: Float32Array[] = [];

    for (let f = 0; f < numFrames; f++) {
      const t = f * frameDuration;
      const currentBeat = t / beatInterval;

      const c = new Float32Array(12);
      const b = new Float32Array(12);

      // Find active chord in chordPlan
      const active = chordPlan.find(
        cp => currentBeat >= cp.startBeat && currentBeat < cp.startBeat + cp.durationBeats
      );

      if (active) {
        // Base triad tones
        c[active.rootIdx] = 1.0;
        c[active.thirdIdx] = 0.85;
        c[active.fifthIdx] = 0.80;
        b[active.rootIdx] = 0.95;

        // Add passing bass note if active (e.g. walking bassline)
        if (
          active.passingBass &&
          currentBeat >= active.passingBass.startBeat &&
          currentBeat < active.passingBass.startBeat + active.passingBass.durationBeats
        ) {
          b[active.passingBass.pitchIdx] = 0.70; // Non-dominant passing tone
          c[active.passingBass.pitchIdx] += 0.30;
        }

        // Add transient vocal run if active (e.g. vocal lead singing upper extension or passing note)
        if (
          active.transientVocal &&
          currentBeat >= active.transientVocal.startBeat &&
          currentBeat < active.transientVocal.startBeat + active.transientVocal.durationBeats
        ) {
          c[active.transientVocal.pitchIdx] = 0.75; // Transient spike in chroma
        }
      }

      // Add baseline acoustic drum/room noise (low amplitude across bins)
      for (let k = 0; k < 12; k++) {
        c[k] = Math.min(1.0, c[k] + 0.04);
      }

      chromagram.push(c);
      bassChromagram.push(b);
    }

    return {
      sampleRate: 44100,
      hopSize: 2048,
      tempo,
      beats,
      estimatedKey,
      totalDuration,
      chromagram,
      bassChromagram
    };
  }

  it("Phase 8 Benchmark: BTS 'Permission to Dance' (125 BPM, D -> Em -> Bm -> G) suppresses transient vocal/bass flickers", () => {
    // BTS "Permission to Dance" at 125 BPM
    // D Major (D=2, F#=6, A=9)
    // E Minor (E=4, G=7, B=11)
    // B Minor (B=11, D=2, F#=6)
    // G Major (G=7, B=11, D=2)
    //
    // Challenge 1: In Bar 1 (D Major), vocal lead sings note B (11) on beat 2.5 for 0.4 beats (~190ms),
    // which in a naive detector would cause false "G" or "Bm" chord flickers!
    // Challenge 2: In Bar 2 (E Minor), bass walks on D (2) on beat 3.5 for 0.5 beats (~240ms).
    // Challenge 3: In Bar 3 (B Minor), third harmonic dips slightly due to drum fill, testing power chord anti-flicker.
    const tempo = 125;
    const track = createSyntheticSongTrack({
      tempo,
      bars: 4,
      estimatedKey: "D Major",
      chordPlan: [
        {
          chord: "D",
          rootIdx: 2,
          thirdIdx: 6,
          fifthIdx: 9,
          startBeat: 0,
          durationBeats: 4,
          transientVocal: { pitchIdx: 11, startBeat: 2.5, durationBeats: 0.5 } // Vocal transient B
        },
        {
          chord: "Em",
          rootIdx: 4,
          thirdIdx: 7,
          fifthIdx: 11,
          startBeat: 4,
          durationBeats: 4,
          passingBass: { pitchIdx: 2, startBeat: 6.5, durationBeats: 0.5 } // Passing bass D
        },
        {
          chord: "Bm",
          rootIdx: 11,
          thirdIdx: 2,
          fifthIdx: 6,
          startBeat: 8,
          durationBeats: 4
        },
        {
          chord: "G",
          rootIdx: 7,
          thirdIdx: 11,
          fifthIdx: 2,
          startBeat: 12,
          durationBeats: 4
        }
      ]
    });

    const beatHarmonics = analyzeBeatSynchronousHarmonics(
      track.chromagram,
      track.bassChromagram,
      {
        sampleRate: track.sampleRate,
        hopSize: track.hopSize,
        tempo: track.tempo,
        beats: track.beats,
        estimatedKey: track.estimatedKey,
        totalDuration: track.totalDuration
      }
    );

    const stabilized = stabilizeChordSegments(beatHarmonics.segments, {
      beats: track.beats,
      tempo: track.tempo,
      keyContext: track.estimatedKey,
      duration: track.totalDuration
    });

    const detectedChords = stabilized.segments.map(s => s.chord);

    // Verify exactly 4 chords are detected: D, Em, Bm, G
    expect(detectedChords).toEqual(["D", "Em", "Bm", "G"]);
    expect(stabilized.segments.length).toBe(4);

    // Verify diagnostic logs were populated and captured
    expect(beatHarmonics.transitionDiagnostics.length).toBeGreaterThan(0);
  });

  it("Phase 9 Benchmark: Jung Kook 'Seven' (125 BPM, E -> G#m -> C#m -> A) preserves syncopation and rejects 7th vocal flickers", () => {
    // Jung Kook "Seven" at 125 BPM
    // E Major (E=4, G#=8, B=11)
    // G# Minor (G#=8, B=11, D#=3)
    // C# Minor (C#=1, E=4, G#=8)
    // A Major (A=9, C#=1, E=4)
    //
    // Challenge 1: Fast anticipated syncopated chord change on beat 3.5 (push into G#m)
    // Challenge 2: In Bar 3 (C#m), vocal run hits D# (3) and B (11) (~200ms) which could trigger C#m7 or C#m9
    // Challenge 3: In Bar 4 (A Major), high vocal note G# (8) over A Major triad
    const tempo = 125;
    const track = createSyntheticSongTrack({
      tempo,
      bars: 4,
      estimatedKey: "E Major",
      chordPlan: [
        {
          chord: "E",
          rootIdx: 4,
          thirdIdx: 8,
          fifthIdx: 11,
          startBeat: 0,
          durationBeats: 4
        },
        {
          chord: "G#m",
          rootIdx: 8,
          thirdIdx: 11,
          fifthIdx: 3,
          startBeat: 4,
          durationBeats: 4,
          transientVocal: { pitchIdx: 6, startBeat: 6.0, durationBeats: 0.5 }
        },
        {
          chord: "C#m",
          rootIdx: 1,
          thirdIdx: 4,
          fifthIdx: 8,
          startBeat: 8,
          durationBeats: 4,
          transientVocal: { pitchIdx: 11, startBeat: 10.0, durationBeats: 0.5 } // Vocal note B over C#m
        },
        {
          chord: "A",
          rootIdx: 9,
          thirdIdx: 1,
          fifthIdx: 4,
          startBeat: 12,
          durationBeats: 4,
          transientVocal: { pitchIdx: 8, startBeat: 14.0, durationBeats: 0.4 } // Melodic 7th G# over A
        }
      ]
    });

    const beatHarmonics = analyzeBeatSynchronousHarmonics(
      track.chromagram,
      track.bassChromagram,
      {
        sampleRate: track.sampleRate,
        hopSize: track.hopSize,
        tempo: track.tempo,
        beats: track.beats,
        estimatedKey: track.estimatedKey,
        totalDuration: track.totalDuration
      }
    );

    const stabilized = stabilizeChordSegments(beatHarmonics.segments, {
      beats: track.beats,
      tempo: track.tempo,
      keyContext: track.estimatedKey,
      duration: track.totalDuration
    });

    const detectedChords = stabilized.segments.map(s => s.chord);

    // Verify clean progression without false 7th or power chord drops
    expect(detectedChords).toEqual(["E", "G#m", "C#m", "A"]);
    expect(stabilized.segments.length).toBe(4);
  });

  it("Phase 10 Accuracy & Mismatch Classification: confirms zero false positive insertions on fast songs", () => {
    // Generate multi-cycle fast track (8 bars)
    const tempo = 128;
    const track = createSyntheticSongTrack({
      tempo,
      bars: 8,
      estimatedKey: "D Major",
      chordPlan: [
        { chord: "D", rootIdx: 2, thirdIdx: 6, fifthIdx: 9, startBeat: 0, durationBeats: 4 },
        { chord: "Em", rootIdx: 4, thirdIdx: 7, fifthIdx: 11, startBeat: 4, durationBeats: 4 },
        { chord: "Bm", rootIdx: 11, thirdIdx: 2, fifthIdx: 6, startBeat: 8, durationBeats: 4 },
        { chord: "G", rootIdx: 7, thirdIdx: 11, fifthIdx: 2, startBeat: 12, durationBeats: 4 },
        { chord: "D", rootIdx: 2, thirdIdx: 6, fifthIdx: 9, startBeat: 16, durationBeats: 4 },
        { chord: "Em", rootIdx: 4, thirdIdx: 7, fifthIdx: 11, startBeat: 20, durationBeats: 4 },
        { chord: "Bm", rootIdx: 11, thirdIdx: 2, fifthIdx: 6, startBeat: 24, durationBeats: 4 },
        { chord: "G", rootIdx: 7, thirdIdx: 11, fifthIdx: 2, startBeat: 28, durationBeats: 4 }
      ]
    });

    const beatHarmonics = analyzeBeatSynchronousHarmonics(
      track.chromagram,
      track.bassChromagram,
      {
        sampleRate: track.sampleRate,
        hopSize: track.hopSize,
        tempo: track.tempo,
        beats: track.beats,
        estimatedKey: track.estimatedKey,
        totalDuration: track.totalDuration
      }
    );

    const stabilized = stabilizeChordSegments(beatHarmonics.segments, {
      beats: track.beats,
      tempo: track.tempo,
      keyContext: track.estimatedKey,
      duration: track.totalDuration
    });

    const expected = ["D", "Em", "Bm", "G", "D", "Em", "Bm", "G"];
    const detected = stabilized.segments.map(s => s.chord);

    // Accuracy Metrics Calculation
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    for (let i = 0; i < expected.length; i++) {
      if (detected[i] === expected[i]) {
        truePositives++;
      } else if (detected[i]) {
        falsePositives++;
      } else {
        falseNegatives++;
      }
    }
    if (detected.length > expected.length) {
      falsePositives += (detected.length - expected.length);
    }

    const precision = truePositives / (truePositives + falsePositives);
    const recall = truePositives / (truePositives + falseNegatives);

    expect(precision).toBe(1.0); // 100% precision (zero false positives)
    expect(recall).toBe(1.0);    // 100% recall (zero missed chords)
    expect(detected).toEqual(expected);
  });

  it("Test A: Vocal melody lines - rejects flutter when lead vocals sing passing notes over sustained chord", () => {
    // Song has 4 beats of sustained E major, but vocals sing passing melody notes (G#, B, C#, D#)
    const tempo = 120;
    const track = createSyntheticSongTrack({
      tempo,
      bars: 2,
      estimatedKey: "E Major",
      chordPlan: [
        {
          chord: "E",
          rootIdx: 4,  // E
          thirdIdx: 8, // G#
          fifthIdx: 11, // B
          startBeat: 0,
          durationBeats: 8,
          transientVocal: {
            pitchIdx: 1, // C# passing vocal note over E major (could trick naive detector into C#m or E6)
            startBeat: 2,
            durationBeats: 0.5
          }
        }
      ]
    });

    const beatHarmonics = analyzeBeatSynchronousHarmonics(
      track.chromagram,
      track.bassChromagram,
      {
        sampleRate: track.sampleRate,
        hopSize: track.hopSize,
        tempo: track.tempo,
        beats: track.beats,
        estimatedKey: track.estimatedKey,
        totalDuration: track.totalDuration
      }
    );

    const stabilized = stabilizeChordSegments(beatHarmonics.segments, {
      beats: track.beats,
      tempo: track.tempo,
      keyContext: track.estimatedKey,
      duration: track.totalDuration
    });

    const detected = stabilized.segments.map(s => s.chord);
    // Transient vocal note C# must NOT cause a false C#m or flutter
    expect(detected).toEqual(["E"]);
  });

  it("Test B: Walking basslines - separates bass movement from harmonic root movement", () => {
    // E major chord playing, but bass walks on beat 3 onto G# (its major third)
    const tempo = 120;
    const track = createSyntheticSongTrack({
      tempo,
      bars: 1,
      estimatedKey: "E Major",
      chordPlan: [
        {
          chord: "E",
          rootIdx: 4,  // E
          thirdIdx: 8, // G#
          fifthIdx: 11, // B
          startBeat: 0,
          durationBeats: 4,
          passingBass: {
            pitchIdx: 8, // G# in bass (1st inversion or walking bass)
            startBeat: 2,
            durationBeats: 1.0
          }
        }
      ]
    });

    const beatHarmonics = analyzeBeatSynchronousHarmonics(
      track.chromagram,
      track.bassChromagram,
      {
        sampleRate: track.sampleRate,
        hopSize: track.hopSize,
        tempo: track.tempo,
        beats: track.beats,
        estimatedKey: track.estimatedKey,
        totalDuration: track.totalDuration
      }
    );

    const stabilized = stabilizeChordSegments(beatHarmonics.segments, {
      beats: track.beats,
      tempo: track.tempo,
      keyContext: track.estimatedKey,
      duration: track.totalDuration
    });

    // Root must remain E (or E/G# inversion), NOT flipped into G#m
    for (const seg of stabilized.segments) {
      expect(seg.root).toBe("E");
      expect(seg.chord).not.toBe("G#m");
    }
  });

  it("Test C: Fast chord progressions - preserves 1-beat changes at 124 BPM without blurring", () => {
    // 1 beat per chord at 124 BPM: A -> E -> F#m -> D
    const tempo = 124;
    const track = createSyntheticSongTrack({
      tempo,
      bars: 1,
      estimatedKey: "A Major",
      chordPlan: [
        { chord: "A", rootIdx: 9, thirdIdx: 1, fifthIdx: 4, startBeat: 0, durationBeats: 1 },
        { chord: "E", rootIdx: 4, thirdIdx: 8, fifthIdx: 11, startBeat: 1, durationBeats: 1 },
        { chord: "F#m", rootIdx: 6, thirdIdx: 9, fifthIdx: 1, startBeat: 2, durationBeats: 1 },
        { chord: "D", rootIdx: 2, thirdIdx: 6, fifthIdx: 9, startBeat: 3, durationBeats: 1 }
      ]
    });

    const beatHarmonics = analyzeBeatSynchronousHarmonics(
      track.chromagram,
      track.bassChromagram,
      {
        sampleRate: track.sampleRate,
        hopSize: track.hopSize,
        tempo: track.tempo,
        beats: track.beats,
        estimatedKey: track.estimatedKey,
        totalDuration: track.totalDuration
      }
    );

    const stabilized = stabilizeChordSegments(beatHarmonics.segments, {
      beats: track.beats,
      tempo: track.tempo,
      keyContext: track.estimatedKey,
      duration: track.totalDuration
    });

    const detected = stabilized.segments.map(s => s.chord);
    expect(detected).toEqual(["A", "E", "F#m", "D"]);
  });

  it("Test D: Genuine half-beat changes - preserves rapid 0.5-beat chords when harmonically verified", () => {
    // 0.5 beat per chord at 124 BPM (2 chords per beat): A -> E -> Bm -> D
    const tempo = 124;
    const track = createSyntheticSongTrack({
      tempo,
      bars: 1,
      estimatedKey: "A Major",
      chordPlan: [
        { chord: "A", rootIdx: 9, thirdIdx: 1, fifthIdx: 4, startBeat: 0, durationBeats: 0.5 },
        { chord: "E", rootIdx: 4, thirdIdx: 8, fifthIdx: 11, startBeat: 0.5, durationBeats: 0.5 },
        { chord: "Bm", rootIdx: 11, thirdIdx: 2, fifthIdx: 6, startBeat: 1.0, durationBeats: 0.5 },
        { chord: "D", rootIdx: 2, thirdIdx: 6, fifthIdx: 9, startBeat: 1.5, durationBeats: 0.5 }
      ]
    });

    const beatHarmonics = analyzeBeatSynchronousHarmonics(
      track.chromagram,
      track.bassChromagram,
      {
        sampleRate: track.sampleRate,
        hopSize: track.hopSize,
        tempo: track.tempo,
        beats: track.beats,
        estimatedKey: track.estimatedKey,
        totalDuration: track.totalDuration,
        highHarmonicResolution: true
      }
    );

    const stabilized = stabilizeChordSegments(beatHarmonics.segments, {
      beats: track.beats,
      tempo: track.tempo,
      keyContext: track.estimatedKey,
      duration: track.totalDuration
    });

    const detected = stabilized.segments.map(s => s.chord);
    expect(detected).toEqual(["A", "E", "Bm", "D"]);
  });

  it("Test E & Section 14: Pending-Candidate Model rejects transient A-B-A and generates Timeline Table", () => {
    // A major for 2 beats, with a weak transient 0.2s fluctuation to E at beat 0.75 that returns to A
    const tempo = 120;
    const track = createSyntheticSongTrack({
      tempo,
      bars: 1,
      estimatedKey: "A Major",
      chordPlan: [
        {
          chord: "A",
          rootIdx: 9,
          thirdIdx: 1,
          fifthIdx: 4,
          startBeat: 0,
          durationBeats: 4,
          transientVocal: {
            pitchIdx: 4, // E transient spike (0.25 beat)
            startBeat: 0.75,
            durationBeats: 0.25
          }
        }
      ]
    });

    const beatHarmonics = analyzeBeatSynchronousHarmonics(
      track.chromagram,
      track.bassChromagram,
      {
        sampleRate: track.sampleRate,
        hopSize: track.hopSize,
        tempo: track.tempo,
        beats: track.beats,
        estimatedKey: track.estimatedKey,
        totalDuration: track.totalDuration,
        highHarmonicResolution: true
      }
    );

    // Verify diagnostic timeline table exists and has the required structure
    expect(beatHarmonics.diagnosticTimeline).toBeDefined();
    expect(beatHarmonics.diagnosticTimeline.length).toBeGreaterThan(0);
    expect(beatHarmonics.formattedTimelineTable).toContain("| Time  | Raw Candidate | Current Chord | Score | Margin | Root Evidence | Neighbor Support | Pending | Final |");

    // Output formatted timeline table for audit
    console.log("\n[DIAGNOSTIC TIMELINE TABLE]\n" + beatHarmonics.formattedTimelineTable + "\n");

    const stabilized = stabilizeChordSegments(beatHarmonics.segments, {
      beats: track.beats,
      tempo: track.tempo,
      keyContext: track.estimatedKey,
      duration: track.totalDuration
    });

    const detected = stabilized.segments.map(s => s.chord);
    // Verified: zero flutter, sustained A chord
    expect(detected).toEqual(["A"]);
  });
});
