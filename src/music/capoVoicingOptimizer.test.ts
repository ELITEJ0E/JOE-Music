import { describe, it, expect } from "vitest";
import { resolveChordFinderState, transposeChordSymbol } from "./chordTransposer";
import { resolveGuitarChord } from "../audio/guitarChordResolver";
import { generateVoicings } from "./chordVoicingGenerator";
import { parseChordSymbol } from "./chordParser";

describe("PHASE 6D — Capo-Aware Voicing Optimization & Model", () => {
  describe("Sounding Chord, Transpose, and Capo Transformations", () => {
    it("preserves immutable detectedChord and separates transposedChord from shapeChord", () => {
      // F, capo 0
      const fCapo0 = resolveChordFinderState("F", 0, 0);
      expect(fCapo0.detectedChord).toBe("F");
      expect(fCapo0.transposedChord).toBe("F");
      expect(fCapo0.shapeChord).toBe("F");

      // F, capo 3 -> sounding F, shape D
      const fCapo3 = resolveChordFinderState("F", 0, 3);
      expect(fCapo3.detectedChord).toBe("F");
      expect(fCapo3.transposedChord).toBe("F");
      expect(fCapo3.shapeChord).toBe("D");

      // Bb, capo 3 -> sounding Bb, shape G
      const bbCapo3 = resolveChordFinderState("Bb", 0, 3);
      expect(bbCapo3.detectedChord).toBe("Bb");
      expect(bbCapo3.transposedChord).toBe("Bb");
      expect(bbCapo3.shapeChord).toBe("G");

      // C, capo 2 -> sounding C, shape Bb
      const cCapo2 = resolveChordFinderState("C", 0, 2);
      expect(cCapo2.detectedChord).toBe("C");
      expect(cCapo2.transposedChord).toBe("C");
      expect(cCapo2.shapeChord).toBe("Bb");

      // D, capo 2 -> sounding D, shape C
      const dCapo2 = resolveChordFinderState("D", 0, 2);
      expect(dCapo2.detectedChord).toBe("D");
      expect(dCapo2.transposedChord).toBe("D");
      expect(dCapo2.shapeChord).toBe("C");

      // G, capo 2 -> sounding G, shape F
      const gCapo2 = resolveChordFinderState("G", 0, 2);
      expect(gCapo2.detectedChord).toBe("G");
      expect(gCapo2.transposedChord).toBe("G");
      expect(gCapo2.shapeChord).toBe("F");
    });

    it("handles Transposition arithmetic correctly", () => {
      // C +2 -> D
      expect(transposeChordSymbol("C", 2)).toBe("D");
      // F +2 -> G
      expect(transposeChordSymbol("F", 2)).toBe("G");
      // G/B +2 -> A/C#
      expect(transposeChordSymbol("G/B", 2)).toBe("A/C#");
    });

    it("handles Combined Transpose + Capo workflows correctly", () => {
      // C + transpose 2 + capo 2 -> sounding D, physical C shape
      const cTrans2Capo2 = resolveChordFinderState("C", 2, 2);
      expect(cTrans2Capo2.detectedChord).toBe("C");
      expect(cTrans2Capo2.transposedChord).toBe("D");
      expect(cTrans2Capo2.shapeChord).toBe("C");

      // F + transpose 2 + capo 3 -> sounding G, physical E shape
      const fTrans2Capo3 = resolveChordFinderState("F", 2, 3);
      expect(fTrans2Capo3.detectedChord).toBe("F");
      expect(fTrans2Capo3.transposedChord).toBe("G");
      expect(fTrans2Capo3.shapeChord).toBe("E");
    });
  });

  describe("Guitar Voicing Optimization for Shape Chords", () => {
    it("generates D-shape voicings for F with capo 3", () => {
      const state = resolveChordFinderState("F", 0, 3);
      expect(state.shapeChord).toBe("D");

      const resolved = resolveGuitarChord(state.shapeChord);
      expect(resolved.voicing).not.toBeNull();
      // First voicing for shape "D" is open D shape [x, x, 0, 2, 3, 2]
      expect(resolved.voicing!.frets).toEqual(["x", "x", 0, 2, 3, 2]);
      expect(resolved.voicing!.cagedShape).toBe("D");
    });

    it("generates G-shape voicings for Bb with capo 3", () => {
      const state = resolveChordFinderState("Bb", 0, 3);
      expect(state.shapeChord).toBe("G");

      const resolved = resolveGuitarChord(state.shapeChord);
      expect(resolved.voicing).not.toBeNull();
      // First voicing for shape "G" is open G shape [3, 2, 0, 0, 0, 3] or [3, 2, 0, 0, 3, 3]
      expect(resolved.voicing!.cagedShape).toBe("G");
      expect(resolved.voicing!.baseFret).toBe(1);
    });

    it("generates C-shape voicings for D with capo 2", () => {
      const state = resolveChordFinderState("D", 0, 2);
      expect(state.shapeChord).toBe("C");

      const resolved = resolveGuitarChord(state.shapeChord);
      expect(resolved.voicing).not.toBeNull();
      // Open C shape [x, 3, 2, 0, 1, 0]
      expect(resolved.voicing!.frets).toEqual(["x", 3, 2, 0, 1, 0]);
      expect(resolved.voicing!.cagedShape).toBe("C");
    });

    it("generates E-shape voicings for F with capo 0 (or standard F barre)", () => {
      const state = resolveChordFinderState("F", 0, 0);
      expect(state.shapeChord).toBe("F");

      const resolved = resolveGuitarChord(state.shapeChord);
      expect(resolved.voicing).not.toBeNull();
      // 1st fret E-shape barre [1, 3, 3, 2, 1, 1]
      expect(resolved.voicing!.frets).toEqual([1, 3, 3, 2, 1, 1]);
      expect(resolved.voicing!.cagedShape).toBe("E");
      expect(resolved.voicing!.barre).toBeDefined();
    });
  });

  describe("Playability Modes (Standard, Easy, Fingerstyle, Barre, High)", () => {
    it("Easy/Open mode avoids barres and prefers open or simplified shapes", () => {
      const parsed = parseChordSymbol("F");
      const easyVoicings = generateVoicings(parsed!.chord, { playabilityMode: "easy" });
      expect(easyVoicings.length).toBeGreaterThan(0);

      const topEasy = easyVoicings[0];
      // Top easy voicing shouldn't be a 6-string full barre if an easier shape exists
      const isBarre = !!topEasy.barre;
      if (isBarre) {
        expect(topEasy.baseFret).toBeLessThanOrEqual(3);
      }
    });

    it("Barre mode prioritizes barre shapes", () => {
      const parsed = parseChordSymbol("F");
      const barreVoicings = generateVoicings(parsed!.chord, { playabilityMode: "barre" });
      expect(barreVoicings.length).toBeGreaterThan(0);
      expect(barreVoicings[0].barre).toBeDefined();
    });

    it("High Position mode prioritizes higher fret positions (5th+ fret)", () => {
      const parsed = parseChordSymbol("C");
      const highVoicings = generateVoicings(parsed!.chord, { playabilityMode: "high" });
      expect(highVoicings.length).toBeGreaterThan(0);
      expect(highVoicings[0].baseFret).toBeGreaterThanOrEqual(5);
    });

    it("Fingerstyle mode prioritizes open strings and bass foundation", () => {
      const parsed = parseChordSymbol("G");
      const fingerVoicings = generateVoicings(parsed!.chord, { playabilityMode: "fingerstyle" });
      expect(fingerVoicings.length).toBeGreaterThan(0);
      expect(fingerVoicings[0].notes.length).toBe(6);
    });
  });
});
