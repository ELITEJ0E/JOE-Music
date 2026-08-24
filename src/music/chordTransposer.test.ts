import { describe, it, expect } from "vitest";
import {
  transposeChordSymbol,
  transposeNote,
  resolveChordFinderState,
} from "./chordTransposer";
import { resolveGuitarChord } from "../audio/guitarChordResolver";

describe("Phase 6C — Chord Finder Transpose + Capo + Voicing Integration", () => {
  describe("Canonical Semitone Transposition", () => {
    it("preserves root and quality for C transpose 0", () => {
      expect(transposeChordSymbol("C", 0)).toBe("C");
    });

    it("transposes C by +2 to D", () => {
      expect(transposeChordSymbol("C", 2)).toBe("D");
    });

    it("transposes C by -2 to Bb (preserves proper flat enharmonic spelling)", () => {
      expect(transposeChordSymbol("C", -2)).toBe("Bb");
    });

    it("transposes Cm7 by +2 to Dm7 (preserves minor 7th quality)", () => {
      expect(transposeChordSymbol("Cm7", 2)).toBe("Dm7");
    });

    it("transposes Cmaj7 by +2 to Dmaj7", () => {
      expect(transposeChordSymbol("Cmaj7", 2)).toBe("Dmaj7");
    });

    it("transposes Cadd9 by +2 to Dadd9", () => {
      expect(transposeChordSymbol("Cadd9", 2)).toBe("Dadd9");
    });
  });

  describe("Slash Chords Independent Root & Bass Transposition", () => {
    it("transposes G/B by +2 to A/C# (A root in sharp context -> C# bass)", () => {
      expect(transposeChordSymbol("G/B", 2)).toBe("A/C#");
    });

    it("transposes Fmaj9/A by +2 to Gmaj9/B", () => {
      expect(transposeChordSymbol("Fmaj9/A", 2)).toBe("Gmaj9/B");
    });

    it("transposes D/F# by +2 to E/G#", () => {
      expect(transposeChordSymbol("D/F#", 2)).toBe("E/G#");
    });

    it("transposes C/E by -2 to Bb/D", () => {
      expect(transposeChordSymbol("C/E", -2)).toBe("Bb/D");
    });
  });

  describe("Capo & Transpose Combined State (resolveChordFinderState)", () => {
    it("handles C with transpose=0 and capo=0 -> transposed=C, shape=C", () => {
      const res = resolveChordFinderState("C", 0, 0);
      expect(res.detectedChord).toBe("C");
      expect(res.transposedChord).toBe("C");
      expect(res.shapeChord).toBe("C");
    });

    it("handles C with transpose=+2 and capo=0 -> transposed=D, shape=D", () => {
      const res = resolveChordFinderState("C", 2, 0);
      expect(res.detectedChord).toBe("C");
      expect(res.transposedChord).toBe("D");
      expect(res.shapeChord).toBe("D");
    });

    it("handles C with transpose=-2 and capo=0 -> transposed=Bb, shape=Bb", () => {
      const res = resolveChordFinderState("C", -2, 0);
      expect(res.detectedChord).toBe("C");
      expect(res.transposedChord).toBe("Bb");
      expect(res.shapeChord).toBe("Bb");
    });

    it("handles C with transpose=+2 and capo=2 -> transposed=D, shape=C", () => {
      // Sounding D, Capo 2 -> Play C shape
      const res = resolveChordFinderState("C", 2, 2);
      expect(res.detectedChord).toBe("C");
      expect(res.transposedChord).toBe("D");
      expect(res.shapeChord).toBe("C");
    });

    it("handles G/B with transpose=+2 and capo=0 -> transposed=A/C#, shape=A/C#", () => {
      const res = resolveChordFinderState("G/B", 2, 0);
      expect(res.detectedChord).toBe("G/B");
      expect(res.transposedChord).toBe("A/C#");
      expect(res.shapeChord).toBe("A/C#");
    });

    it("handles G/B with transpose=+2 and capo=2 -> transposed=A/C#, shape=G/B", () => {
      const res = resolveChordFinderState("G/B", 2, 2);
      expect(res.detectedChord).toBe("G/B");
      expect(res.transposedChord).toBe("A/C#");
      expect(res.shapeChord).toBe("G/B");
    });

    it("handles Fmaj9/A with transpose=+2 and capo=0 -> transposed=Gmaj9/B, shape=Gmaj9/B", () => {
      const res = resolveChordFinderState("Fmaj9/A", 2, 0);
      expect(res.detectedChord).toBe("Fmaj9/A");
      expect(res.transposedChord).toBe("Gmaj9/B");
      expect(res.shapeChord).toBe("Gmaj9/B");
    });

    it("handles Fmaj9/A with transpose=+2 and capo=2 -> transposed=Gmaj9/B, shape=Fmaj9/A", () => {
      const res = resolveChordFinderState("Fmaj9/A", 2, 2);
      expect(res.detectedChord).toBe("Fmaj9/A");
      expect(res.transposedChord).toBe("Gmaj9/B");
      expect(res.shapeChord).toBe("Fmaj9/A");
    });

    it("handles Cadd9 with transpose=+2 and capo=2 -> transposed=Dadd9, shape=Cadd9", () => {
      const res = resolveChordFinderState("Cadd9", 2, 2);
      expect(res.detectedChord).toBe("Cadd9");
      expect(res.transposedChord).toBe("Dadd9");
      expect(res.shapeChord).toBe("Cadd9");
    });
  });

  describe("Procedural Voicing Resolution with shapeChord and Voicing Selector", () => {
    it("generates voicings directly for shapeChord without shifting frets manually", () => {
      const state = resolveChordFinderState("C", 2, 2); // Sounding D, Capo 2 -> Shape C
      const voicingRes = resolveGuitarChord(state.shapeChord);

      expect(voicingRes.voicing).not.toBeNull();
      // Should generate standard open C shape [x, 3, 2, 0, 1, 0]
      expect(voicingRes.voicing?.frets).toEqual(["x", 3, 2, 0, 1, 0]);
      expect(voicingRes.voicing?.baseFret).toBe(1);
      expect(voicingRes.voicing?.cagedShape).toBe("C");
    });

    it("allows switching voicings without mutating detectedChord or transposedChord", () => {
      const state = resolveChordFinderState("C", 2, 0); // Sounding D, Capo 0 -> Shape D
      expect(state.detectedChord).toBe("C");
      expect(state.transposedChord).toBe("D");
      expect(state.shapeChord).toBe("D");

      const v1 = resolveGuitarChord(state.shapeChord, { voicingIndex: 1 });
      const v2 = resolveGuitarChord(state.shapeChord, { voicingIndex: 2 });

      expect(v1.voicing).not.toBeNull();
      expect(v2.voicing).not.toBeNull();
      // Changing voicing selector returns distinct fingering shapes
      expect(v1.voicing?.frets).not.toEqual(v2.voicing?.frets);

      // State remains completely immutable
      expect(state.detectedChord).toBe("C");
      expect(state.transposedChord).toBe("D");
      expect(state.shapeChord).toBe("D");
    });
  });
});
