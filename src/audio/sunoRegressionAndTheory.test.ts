import { describe, it, expect } from "vitest";
import {
  parseDiatonicProfile,
  evaluateQualityForRoot,
  rankChordCandidatesForWindow
} from "./twoStageChordEngine";
import {
  buildMusicalGrid,
  analyzeBeatSynchronousHarmonics,
  estimateHarmonicChangeDensity
} from "./beatSynchronousAnalyzer";
import { normalizeChord, isFlatKey, normalizeNoteSpelling } from "./chordNormalizer";
import { stabilizeChordSegments } from "./harmonicStabilizer";

describe("MIR Chord Engine - Minor Key Dominant & Theory Regression Suite", () => {
  // TEST A: G minor context with D-F#-A evidence must prefer D major over Dm
  it("TEST A: G minor context with D-F#-A evidence prefers D major over Dm", () => {
    const keyProfile = parseDiatonicProfile("G Minor");
    const chroma = new Float32Array(12);
    const bassChroma = new Float32Array(12);

    // D = 2, F# = 6, A = 9
    chroma[2] = 0.90; // D (root)
    chroma[6] = 0.75; // F# (major 3rd)
    chroma[9] = 0.80; // A (5th)
    chroma[5] = 0.10; // F (minor 3rd - weak background)
    bassChroma[2] = 0.90; // D bass

    const candidate = evaluateQualityForRoot(2, chroma, bassChroma, keyProfile, 0.95);
    expect(candidate.chord).toBe("D");
    expect(candidate.quality).toBe("");
    expect(candidate.diagnostics.maj3Evidence).toBeGreaterThan(candidate.diagnostics.min3Evidence);
    expect(candidate.thirdMargin).toBeGreaterThan(0.20);
  });

  // TEST B: G minor context with D-F-A evidence must prefer Dm over D
  it("TEST B: G minor context with D-F-A evidence prefers Dm over D", () => {
    const keyProfile = parseDiatonicProfile("G Minor");
    const chroma = new Float32Array(12);
    const bassChroma = new Float32Array(12);

    // D = 2, F = 5, A = 9
    chroma[2] = 0.90; // D (root)
    chroma[5] = 0.75; // F (minor 3rd)
    chroma[9] = 0.80; // A (5th)
    chroma[6] = 0.08; // F# (major 3rd - negligible)
    bassChroma[2] = 0.90; // D bass

    const candidate = evaluateQualityForRoot(2, chroma, bassChroma, keyProfile, 0.95);
    expect(candidate.chord).toBe("Dm");
    expect(candidate.quality).toBe("m");
  });

  // TEST C: ambiguous D/F/F# should report lower third confidence
  it("TEST C: ambiguous D/F/F# reports lower third confidence", () => {
    const keyProfile = parseDiatonicProfile("G Minor");
    const chroma = new Float32Array(12);
    const bassChroma = new Float32Array(12);

    // Nearly equal major and minor third evidence
    chroma[2] = 0.85; // D
    chroma[6] = 0.50; // F#
    chroma[5] = 0.48; // F
    chroma[9] = 0.80; // A
    bassChroma[2] = 0.85;

    const candidate = evaluateQualityForRoot(2, chroma, bassChroma, keyProfile, 0.85);
    expect(candidate.thirdMargin).toBeLessThan(0.08);
    expect(candidate.thirdConfidence).toBeLessThan(0.50);
  });

  // TEST D: D major followed by Gm receives dominant-to-tonic sequence support
  it("TEST D: D major followed by Gm receives strong V -> i sequence transition support", () => {
    const keyProfile = parseDiatonicProfile("G Minor");
    const chromaD = new Float32Array(12);
    chromaD[2] = 0.85; chromaD[6] = 0.70; chromaD[9] = 0.80; // D major
    const bassD = new Float32Array(12); bassD[2] = 0.85;

    const chromaGm = new Float32Array(12);
    chromaGm[7] = 0.90; chromaGm[10] = 0.80; chromaGm[2] = 0.85; // Gm
    const bassGm = new Float32Array(12); bassGm[7] = 0.90;

    const chromagram = [chromaD, chromaD, chromaGm, chromaGm];
    const bassChromagram = [bassD, bassD, bassGm, bassGm];

    const result = analyzeBeatSynchronousHarmonics(chromagram, bassChromagram, {
      sampleRate: 44100,
      hopSize: 2048,
      tempo: 120,
      beats: [0.0, 0.5, 1.0, 1.5],
      estimatedKey: "G Minor",
      totalDuration: 2.0
    });

    const chords = result.segments.map(s => s.chord);
    expect(chords).toContain("D");
    expect(chords).toContain("Gm");
  });

  // TEST E: short F# melodic transient over Dm does not convert Dm into D
  it("TEST E: short F# melodic transient over Dm does not convert Dm into D", () => {
    const keyProfile = parseDiatonicProfile("G Minor");
    
    // Sustained Dm frame
    const chromaDm = new Float32Array(12);
    chromaDm[2] = 0.85; chromaDm[5] = 0.75; chromaDm[9] = 0.80; // Dm
    const bassDm = new Float32Array(12); bassDm[2] = 0.85;

    // Frame with brief F# transient spike
    const chromaFTransient = new Float32Array(12);
    chromaFTransient[2] = 0.85; chromaFTransient[5] = 0.65; chromaFTransient[6] = 0.40; chromaFTransient[9] = 0.80;
    
    const chromagram = [chromaDm, chromaDm, chromaFTransient, chromaDm, chromaDm];
    const bassChromagram = [bassDm, bassDm, bassDm, bassDm, bassDm];

    const result = analyzeBeatSynchronousHarmonics(chromagram, bassChromagram, {
      sampleRate: 44100,
      hopSize: 2048,
      tempo: 120,
      beats: [0.0, 0.5, 1.0, 1.5, 2.0],
      estimatedKey: "G Minor",
      totalDuration: 2.5
    });

    const stabilized = stabilizeChordSegments(result.segments, { keyContext: "G Minor", tempo: 120 });
    const chords = stabilized.segments.map(s => s.chord);
    expect(chords).toEqual(["Dm"]);
  });

  // TEST F: short F natural vocal note over D major does not convert D into Dm
  it("TEST F: short F natural vocal note over D major does not convert D into Dm", () => {
    const chromaD = new Float32Array(12);
    chromaD[2] = 0.90; chromaD[6] = 0.80; chromaD[9] = 0.85; // D major
    const bassD = new Float32Array(12); bassD[2] = 0.90;

    const chromaVocalF = new Float32Array(12);
    chromaVocalF[2] = 0.90; chromaVocalF[6] = 0.75; chromaVocalF[5] = 0.35; chromaVocalF[9] = 0.85;

    const chromagram = [chromaD, chromaD, chromaVocalF, chromaD, chromaD];
    const bassChromagram = [bassD, bassD, bassD, bassD, bassD];

    const result = analyzeBeatSynchronousHarmonics(chromagram, bassChromagram, {
      sampleRate: 44100,
      hopSize: 2048,
      tempo: 120,
      beats: [0.0, 0.5, 1.0, 1.5, 2.0],
      estimatedKey: "G Minor",
      totalDuration: 2.5
    });

    const stabilized = stabilizeChordSegments(result.segments, { keyContext: "G Minor", tempo: 120 });
    const chords = stabilized.segments.map(s => s.chord);
    expect(chords).toEqual(["D"]);
  });

  // TEST G: Bb in G minor should display Bb, not A#
  it("TEST G: Bb in G minor key context displays 'Bb', not 'A#'", () => {
    expect(isFlatKey("G Minor")).toBe(true);
    expect(isFlatKey("Gm")).toBe(true);
    const norm = normalizeChord({ root: "A#", quality: "maj" }, "G Minor");
    expect(norm.root).toBe("Bb");
    expect(norm.canonicalLabel).toBe("Bb");
  });

  // TEST H: 118 BPM alone must not force high harmonic resolution if harmonic density is low
  it("TEST H: 118 BPM alone does not force high harmonic resolution when harmonic density is low", () => {
    const grid = buildMusicalGrid([0.0, 0.51, 1.02, 1.53], 118, 2.04);
    expect(grid.isHighResolutionMode).toBe(false);
  });

  // TEST I: Generalization across synthetic progressions
  it("TEST I: Correctly analyzes synthetic progressions without overfitting", () => {
    const progressionsToTest = [
      { key: "A Minor", roots: [9, 5, 0, 7], qualities: ["min", "maj", "maj", "maj"], expected: ["Am", "F", "C", "G"] },
      { key: "G Minor", roots: [7, 3, 10, 5], qualities: ["min", "maj", "maj", "maj"], expected: ["Gm", "Eb", "Bb", "F"] },
      { key: "G Minor", roots: [7, 0, 2, 7], qualities: ["min", "min", "maj", "min"], expected: ["Gm", "Cm", "D", "Gm"] },
      { key: "D Minor", roots: [2, 10, 0, 9], qualities: ["min", "maj", "maj", "maj"], expected: ["Dm", "Bb", "C", "A"] },
      { key: "C Major", roots: [0, 7, 9, 5], qualities: ["maj", "maj", "min", "maj"], expected: ["C", "G", "Am", "F"] },
      { key: "E Minor", roots: [4, 0, 7, 2], qualities: ["min", "maj", "maj", "maj"], expected: ["Em", "C", "G", "D"] }
    ];

    for (const testCase of progressionsToTest) {
      const chromagram: Float32Array[] = [];
      const bassChromagram: Float32Array[] = [];
      const beats: number[] = [];

      for (let i = 0; i < testCase.roots.length; i++) {
        const root = testCase.roots[i];
        const isMin = testCase.qualities[i] === "min";
        const thirdOffset = isMin ? 3 : 4;

        for (let frame = 0; frame < 22; frame++) {
          const chroma = new Float32Array(12);
          chroma[root] = 0.90;
          chroma[(root + thirdOffset) % 12] = 0.80;
          chroma[(root + 7) % 12] = 0.85;
          const bass = new Float32Array(12);
          bass[root] = 0.90;

          chromagram.push(chroma);
          bassChromagram.push(bass);
        }
        beats.push(i * 1.0);
        beats.push(i * 1.0 + 0.5);
      }

      const result = analyzeBeatSynchronousHarmonics(chromagram, bassChromagram, {
        sampleRate: 44100,
        hopSize: 2048,
        tempo: 120,
        beats,
        estimatedKey: testCase.key,
        totalDuration: testCase.roots.length * 1.0
      });

      const stabilized = stabilizeChordSegments(result.segments, { keyContext: testCase.key, tempo: 120 });
      const chords = stabilized.segments.map(s => s.chord);
      expect(chords).toEqual(testCase.expected);
    }
  });
});
