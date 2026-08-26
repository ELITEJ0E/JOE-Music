import { describe, it, expect } from "vitest";
import { scoreCandidate } from "./chordScoring";
import { resolveChordFinderState } from "../music/chordTransposer";

describe("Slash Chord Harmonic Competition", () => {
  const mockMeanChroma = new Float32Array(12).fill(0.1);
  const mockMeanBassChroma = new Float32Array(12).fill(0.1);

  // Helper to create a candidate
  const makeCandidate = (rootIdx: number, quality: string, intervals: number[]) => ({
    rootIdx,
    quality,
    intervals,
    label: "mock"
  });

  const E_intervals = [0, 4, 7];
  const E_rootIdx = 4; // E
  const B_rootIdx = 11; // B
  
  it("E/B -> E (Does not generate a slash chord simply because another pitch is strong in the bass unless overwhelming)", () => {
    // True chord is E
    const chroma = new Float32Array(12).fill(0.1);
    chroma[4] = 1.0; // E
    chroma[8] = 1.0; // G#
    chroma[11] = 1.0; // B
    
    const bassChroma = new Float32Array(12).fill(0.1);
    bassChroma[4] = 0.5; // E bass is moderate
    bassChroma[11] = 0.8; // B bass is strong

    const candidate = makeCandidate(E_rootIdx, "maj", E_intervals);
    const result = scoreCandidate(candidate, chroma, bassChroma);
    
    // bassRatio = 0.8 / 0.5 = 1.6 < 2.0 -> fails ratio threshold, so no slash
    expect(result.isSlash).toBe(false);
    expect(result.bassNoteIdx).toBe(4);
  });

  it("B/Eb -> C#m7 (C#m7 defeats B/Eb when full pitch-class evidence supports C#m7)", () => {
    // True chord is C#m7
    const chroma = new Float32Array(12).fill(0.1);
    chroma[1] = 1.0; // C#
    chroma[4] = 1.0; // E
    chroma[8] = 1.0; // G#
    chroma[11] = 1.0; // B
    
    const bassChroma = new Float32Array(12).fill(0.1);
    bassChroma[1] = 0.3; // C# bass is weak
    bassChroma[3] = 0.8; // Eb/D# bass is strong
    
    const csm7_candidate = makeCandidate(1, "min7", [0, 3, 7, 10]);
    const b_candidate = makeCandidate(11, "maj", [0, 4, 7]);
    
    const resCsm7 = scoreCandidate(csm7_candidate, chroma, bassChroma);
    const resB = scoreCandidate(b_candidate, chroma, bassChroma);
    
    // C#m7 score should be higher than B score
    expect(resCsm7.score).toBeGreaterThan(resB.score);
  });

  it("E/A -> E (Does not generate non-chord tone slash without massive evidence)", () => {
    // True chord is E
    const chroma = new Float32Array(12).fill(0.1);
    chroma[4] = 1.0; // E
    chroma[8] = 1.0; // G#
    chroma[11] = 1.0; // B
    
    const bassChroma = new Float32Array(12).fill(0.1);
    bassChroma[4] = 0.5; // E bass is moderate
    bassChroma[9] = 0.9; // A bass is strong

    const candidate = makeCandidate(E_rootIdx, "maj", E_intervals);
    const result = scoreCandidate(candidate, chroma, bassChroma);
    
    // A is not a chord tone, slashPenalty = 0.6.
    // bassRatio = 0.9 / 0.5 = 1.8 < 2.0 -> fails ratio threshold
    expect(result.isSlash).toBe(false);
    expect(result.bassNoteIdx).toBe(4);
  });
});

describe("Capo Preservation Logic", () => {
  it("verify capo 2 produces playable shapes while preserving original sounding chords", () => {
    // Progression: E → B → C#m7 → A → E → F#m7 → Bsus4
    // With Capo 2 Shapes: D → A → Bm7 → G → D → Em7 → Asus4
    const originalChords = ["E", "B", "C#m7", "A", "E", "F#m7", "Bsus4"];
    const expectedShapes = ["D", "A", "Bm7", "G", "D", "Em7", "Asus4"];
    
    const results = originalChords.map(c => resolveChordFinderState(c, 0, 2).shapeChord);
    expect(results).toEqual(expectedShapes);
  });
});
