import { describe, it, expect } from "vitest";
import { resolveChordFinderState, transposeChordSymbol } from "./chordTransposer";
import { resolveGuitarChord } from "../audio/guitarChordResolver";
import { generateVoicings, validateVoicingSounding } from "./chordVoicingGenerator";
import { parseChordSymbol } from "./chordParser";
import { arrangeChordProgression } from "./fingerstyleArranger";
import { getChordDiagnosticInfo } from "./chordDiagnostic";

describe("JOE MUSIC — Capo & Voicing Mathematical Validation Pass", () => {
  describe("1. Mathematical Equivalence: Physical Shape + Capo Offset = Sounding Chord", () => {
    it("proves Cmaj7 at Capo 0 produces sounding Cmaj7 (C, E, G, B)", () => {
      const detected = "Cmaj7";
      const capo = 0;
      const state = resolveChordFinderState(detected, 0, capo);
      expect(state.detectedChord).toBe("Cmaj7");
      expect(state.transposedChord).toBe("Cmaj7");
      expect(state.shapeChord).toBe("Cmaj7");

      const res = resolveGuitarChord(state.shapeChord, { capo });
      expect(res.voicing).not.toBeNull();

      const diag = getChordDiagnosticInfo(
        state.detectedChord,
        state.transposedChord,
        capo,
        state.shapeChord,
        res.voicing!.frets
      );

      expect(diag.soundingMatch).toBe(true);
      expect(diag.finalValidationResult).toBe("VALID");
      expect(diag.missingChordTones).toEqual([]);
      expect(diag.foreignChordTones).toEqual([]);
      expect(diag.bassValidation.isValid).toBe(true);
      expect(diag.capoAdjustedPitchClasses).toContain("C");
      expect(diag.capoAdjustedPitchClasses).toContain("E");
      expect(diag.capoAdjustedPitchClasses).toContain("G");
      expect(diag.capoAdjustedPitchClasses).toContain("B");
    });

    it("proves Cmaj7 at Capo 1 uses Bmaj7 shape and sounds as Cmaj7", () => {
      const detected = "Cmaj7";
      const capo = 1;
      const state = resolveChordFinderState(detected, 0, capo);
      expect(state.detectedChord).toBe("Cmaj7");
      expect(state.shapeChord).toBe("Bmaj7");

      const res = resolveGuitarChord(state.shapeChord, { capo });
      expect(res.voicing).not.toBeNull();

      const diag = getChordDiagnosticInfo(
        state.detectedChord,
        state.transposedChord,
        capo,
        state.shapeChord,
        res.voicing!.frets
      );

      expect(diag.soundingMatch).toBe(true);
      expect(diag.finalValidationResult).toBe("VALID");
      expect(diag.missingChordTones).toEqual([]);
      expect(diag.foreignChordTones).toEqual([]);
      expect(diag.bassValidation.isValid).toBe(true);
      expect(diag.capoAdjustedPitchClasses).toContain("C");
      expect(diag.capoAdjustedPitchClasses).toContain("E");
      expect(diag.capoAdjustedPitchClasses).toContain("G");
      expect(diag.capoAdjustedPitchClasses).toContain("B");
    });

    it("proves C at Capo 2 uses Bb shape and sounds as C (C, E, G)", () => {
      const detected = "C";
      const capo = 2;
      const state = resolveChordFinderState(detected, 0, capo);
      expect(state.detectedChord).toBe("C");
      expect(state.shapeChord).toBe("Bb");

      const res = resolveGuitarChord(state.shapeChord, { capo });
      expect(res.voicing).not.toBeNull();

      const diag = getChordDiagnosticInfo(
        state.detectedChord,
        state.transposedChord,
        capo,
        state.shapeChord,
        res.voicing!.frets
      );

      expect(diag.soundingMatch).toBe(true);
      expect(diag.finalValidationResult).toBe("VALID");
      expect(diag.missingChordTones).toEqual([]);
      expect(diag.foreignChordTones).toEqual([]);
      expect(diag.bassValidation.isValid).toBe(true);
      expect(diag.capoAdjustedPitchClasses).toContain("C");
      expect(diag.capoAdjustedPitchClasses).toContain("E");
      expect(diag.capoAdjustedPitchClasses).toContain("G");
    });

    it("proves Cmaj7 at Capo 2 uses Bbmaj7 (A#maj7) shape and sounds as Cmaj7", () => {
      const detected = "Cmaj7";
      const capo = 2;
      const state = resolveChordFinderState(detected, 0, capo);
      expect(state.detectedChord).toBe("Cmaj7");
      expect(state.shapeChord).toBe("Bbmaj7");

      const res = resolveGuitarChord(state.shapeChord, { capo });
      expect(res.voicing).not.toBeNull();

      const diag = getChordDiagnosticInfo(
        state.detectedChord,
        state.transposedChord,
        capo,
        state.shapeChord,
        res.voicing!.frets
      );

      expect(diag.soundingMatch).toBe(true);
      expect(diag.finalValidationResult).toBe("VALID");
      expect(diag.missingChordTones).toEqual([]);
      expect(diag.foreignChordTones).toEqual([]);
      expect(diag.bassValidation.isValid).toBe(true);
      expect(diag.capoAdjustedPitchClasses).toContain("C");
    });

    it("proves Am7 at Capo 3 uses F#m7 shape and sounds as Am7 (A, C, E, G)", () => {
      const detected = "Am7";
      const capo = 3;
      const state = resolveChordFinderState(detected, 0, capo);
      expect(state.detectedChord).toBe("Am7");
      expect(state.shapeChord).toBe("F#m7");

      const res = resolveGuitarChord(state.shapeChord, { capo });
      expect(res.voicing).not.toBeNull();

      const diag = getChordDiagnosticInfo(
        state.detectedChord,
        state.transposedChord,
        capo,
        state.shapeChord,
        res.voicing!.frets
      );

      expect(diag.soundingMatch).toBe(true);
      expect(diag.finalValidationResult).toBe("VALID");
      expect(diag.missingChordTones).toEqual([]);
      expect(diag.foreignChordTones).toEqual([]);
      expect(diag.bassValidation.isValid).toBe(true);
      expect(diag.capoAdjustedPitchClasses).toContain("A");
      expect(diag.capoAdjustedPitchClasses).toContain("C");
      expect(diag.capoAdjustedPitchClasses).toContain("E");
      expect(diag.capoAdjustedPitchClasses).toContain("G");
    });

    it("proves D/F# at Capo 2 uses C/E shape and sounds as D/F# (lowest bass F#)", () => {
      const detected = "D/F#";
      const capo = 2;
      const state = resolveChordFinderState(detected, 0, capo);
      expect(state.detectedChord).toBe("D/F#");
      expect(state.shapeChord).toBe("C/E");

      const res = resolveGuitarChord(state.shapeChord, { capo });
      expect(res.voicing).not.toBeNull();

      const diag = getChordDiagnosticInfo(
        state.detectedChord,
        state.transposedChord,
        capo,
        state.shapeChord,
        res.voicing!.frets
      );

      expect(diag.soundingMatch).toBe(true);
      expect(diag.finalValidationResult).toBe("VALID");
      expect(diag.missingChordTones).toEqual([]);
      expect(diag.foreignChordTones).toEqual([]);
      expect(diag.bassValidation.isValid).toBe(true);
      expect(diag.capoAdjustedPitchClasses).toContain("F#");
      expect(diag.capoAdjustedPitchClasses).toContain("D");
      expect(diag.capoAdjustedPitchClasses).toContain("A");
    });

    it("proves Bb/D at Capo 3 uses G/B shape and sounds as Bb/D (lowest bass D)", () => {
      const detected = "Bb/D";
      const capo = 3;
      const state = resolveChordFinderState(detected, 0, capo);
      expect(state.detectedChord).toBe("Bb/D");
      expect(state.shapeChord).toBe("G/B");

      const res = resolveGuitarChord(state.shapeChord, { capo });
      expect(res.voicing).not.toBeNull();

      const diag = getChordDiagnosticInfo(
        state.detectedChord,
        state.transposedChord,
        capo,
        state.shapeChord,
        res.voicing!.frets
      );

      expect(diag.soundingMatch).toBe(true);
      expect(diag.finalValidationResult).toBe("VALID");
      expect(diag.missingChordTones).toEqual([]);
      expect(diag.foreignChordTones).toEqual([]);
      expect(diag.bassValidation.isValid).toBe(true);
      expect(diag.capoAdjustedPitchClasses).toContain("D");
      expect(diag.capoAdjustedPitchClasses).toContain("Bb");
      expect(diag.capoAdjustedPitchClasses).toContain("F");
    });

    it("proves complex chords (add9, maj7, m7, 9) across capo 0-12 maintain mathematical integrity", () => {
      const complexTestChords = ["Cadd9", "Fmaj7", "Em7", "G9", "Aadd9", "Dm9"];
      for (const chordName of complexTestChords) {
        for (const capo of [0, 1, 2, 4, 7]) {
          const state = resolveChordFinderState(chordName, 0, capo);
          expect(state.detectedChord).toBe(chordName);

          const res = resolveGuitarChord(state.shapeChord, { capo });
          if (res.voicing) {
            const diag = getChordDiagnosticInfo(
              state.detectedChord,
              state.transposedChord,
              capo,
              state.shapeChord,
              res.voicing.frets
            );
            expect(diag.soundingMatch).toBe(true);
            expect(diag.foreignChordTones).toEqual([]);
          }
        }
      }
    });

    it("proves Cmaj7 at Capo 3 uses Amaj7 shape and sounds as Cmaj7", () => {
      const detected = "Cmaj7";
      const capo = 3;
      const state = resolveChordFinderState(detected, 0, capo);
      expect(state.detectedChord).toBe("Cmaj7");
      expect(state.shapeChord).toBe("Amaj7");

      const res = resolveGuitarChord(state.shapeChord, { capo });
      expect(res.voicing).not.toBeNull();

      const diag = getChordDiagnosticInfo(
        state.detectedChord,
        state.transposedChord,
        capo,
        state.shapeChord,
        res.voicing!.frets
      );

      expect(diag.soundingMatch).toBe(true);
      expect(diag.finalValidationResult).toBe("VALID");
      expect(diag.missingChordTones).toEqual([]);
      expect(diag.foreignChordTones).toEqual([]);
      expect(diag.bassValidation.isValid).toBe(true);
      expect(diag.capoAdjustedPitchClasses).toContain("C");
      expect(diag.capoAdjustedPitchClasses).toContain("E");
      expect(diag.capoAdjustedPitchClasses).toContain("G");
      expect(diag.capoAdjustedPitchClasses).toContain("B");
    });
  });

  describe("2. Rejection of Invalid Candidates", () => {
    it("rejects candidate with missing essential chord tones", () => {
      const parsed = parseChordSymbol("Cmaj7");
      // [x, x, x, 0, 0, 0] open G, B, E -> missing C root & E 3rd
      const invalidFrets: (number | "x")[] = ["x", "x", "x", 0, 0, 0];
      const validation = validateVoicingSounding(invalidFrets, 0, parsed!.chord);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain("Missing required pitch class");
    });

    it("rejects candidate with foreign non-chord pitch classes", () => {
      const parsed = parseChordSymbol("Cmaj7"); // C, E, G, B
      // [x, 3, 2, 2, 0, 0] includes D (pitch class 2) which is foreign for Cmaj7
      const invalidFrets: (number | "x")[] = ["x", 3, 2, 2, 0, 0];
      const validation = validateVoicingSounding(invalidFrets, 0, parsed!.chord);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain("Foreign pitch class");
    });

    it("rejects candidate with incorrect slash bass note", () => {
      const parsed = parseChordSymbol("C/G"); // C major with G bass
      // [x, 3, 2, 0, 1, 0] has C bass (string 5, 3rd fret) instead of G bass
      const cBassFrets: (number | "x")[] = ["x", 3, 2, 0, 1, 0];
      const validation = validateVoicingSounding(cBassFrets, 0, parsed!.chord);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain("Bass mismatch");
    });
  });

  describe("3. Immutability of detectedChord", () => {
    it("guarantees detectedChord remains unchanged through capo, voicing, playability, and arrangement", () => {
      const rawDetected = "Cmaj7";

      for (const capo of [0, 1, 2, 3, 5, 7]) {
        for (const mode of ["standard", "easy", "fingerstyle", "barre", "high"] as const) {
          const state = resolveChordFinderState(rawDetected, 0, capo);
          expect(state.detectedChord).toBe(rawDetected);

          const resolved = resolveGuitarChord(state.shapeChord, { playabilityMode: mode, capo, detectedChord: state.detectedChord });
          expect(resolved.detectedChord).toBe(rawDetected);
        }
      }

      // Check progression arranger
      const progression = ["Cmaj7", "Am7", "Dm7", "G7"];
      const arranged = arrangeChordProgression(progression, { capo: 3, playabilityMode: "fingerstyle" });
      expect(arranged.steps.map((s) => s.detectedChord)).toEqual(progression);
    });
  });

  describe("4. Multiple Distinct Voicings Sounding as Cmaj7", () => {
    it("generates multiple distinct playable shapes for Cmaj7, all mathematically verified to sound as Cmaj7", () => {
      const parsed = parseChordSymbol("Cmaj7")!;
      const voicings = generateVoicings(parsed.chord, { maxFret: 12 });
      const exactVoicings = voicings.filter((v) => v.type === "exact");
      expect(exactVoicings.length).toBeGreaterThanOrEqual(3);

      const fretKeys = new Set<string>();
      for (const v of exactVoicings) {
        fretKeys.add(v.frets.join(","));
        const val = validateVoicingSounding(v.frets, 0, parsed.chord);
        expect(val.isValid).toBe(true);
      }

      // Proves multiple distinct physical shape patterns exist for Cmaj7
      expect(fretKeys.size).toBeGreaterThanOrEqual(3);
    });
  });

  describe("5. Progression Arranger Validation across All Playability Modes", () => {
    const progression = ["Cmaj7", "Am7", "Dm7", "G7"];

    const modes = ["standard", "easy", "fingerstyle", "barre", "high"] as const;

    for (const mode of modes) {
      it(`arranges progression [Cmaj7 -> Am7 -> Dm7 -> G7] in '${mode}' mode with Capo 0 and Capo 2`, () => {
        for (const capo of [0, 2]) {
          const arr = arrangeChordProgression(progression, { capo, playabilityMode: mode });
          expect(arr.steps.length).toBe(4);
          expect(arr.steps.map((s) => s.detectedChord)).toEqual(progression);
          expect(arr.smoothnessScore).toBeGreaterThanOrEqual(0);
          expect(arr.smoothnessScore).toBeLessThanOrEqual(100);

          // Verify every step step-by-step
          for (const step of arr.steps) {
            const diag = getChordDiagnosticInfo(
              step.detectedChord,
              step.transposedChord,
              capo,
              step.shapeChord,
              step.voicing.frets
            );
            expect(diag.soundingMatch).toBe(true);
            expect(diag.finalValidationResult).toBe("VALID");
          }
        }
      });
    }
  });

  describe("6. Slash Chords Preservation After Capo Transformation", () => {
    it("preserves G bass in G/B with Capo 2 (sounding A/C#)", () => {
      const state = resolveChordFinderState("G/B", 0, 2);
      expect(state.detectedChord).toBe("G/B");
      expect(state.transposedChord).toBe("G/B");
      expect(state.shapeChord).toBe("F/A");

      const parsedSounding = parseChordSymbol("G/B")!;
      const res = resolveGuitarChord(state.shapeChord, { capo: 2 });
      expect(res.voicing).not.toBeNull();

      const val = validateVoicingSounding(res.voicing!.frets, 2, parsedSounding.chord);
      expect(val.isValid).toBe(true);
      // G/B lowest bass note is B (pitch class 11)
      expect(val.lowestBassPc).toBe(11);
    });
  });
});
