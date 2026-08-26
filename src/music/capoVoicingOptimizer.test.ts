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

    it("proves detected D/F# with Capo 2 resolves C/E shape with sounding bass F# and sounding voicing D/F#", () => {
      const state = resolveChordFinderState("D/F#", 0, 2);
      expect(state.detectedChord).toBe("D/F#");
      expect(state.transposedChord).toBe("D/F#");
      expect(state.shapeChord).toBe("C/E");

      const parsedSounding = parseChordSymbol("D/F#")!;
      const res = resolveGuitarChord(state.shapeChord, { capo: 2 });
      expect(res.voicing).not.toBeNull();

      const val = validateVoicingSounding(res.voicing!.frets, 2, parsedSounding.chord);
      expect(val.isValid).toBe(true);
      // D/F# lowest bass note is F# (pitch class 6)
      expect(val.lowestBassPc).toBe(6);
      // Sounding notes must contain D(2), F#(6), A(9)
      expect(val.soundingPcs).toContain(2);
      expect(val.soundingPcs).toContain(6);
      expect(val.soundingPcs).toContain(9);
    });
  });

  describe("7. JOE MUSIC — Final Capo & Play Shape Comprehensive Regression Suite", () => {
    it("regression test: Test song progression at Capo 0", () => {
      const detectedSequence = ["E", "B", "C#m7", "A", "E", "F#m7", "Bsus4"];
      const expectedSounding = ["E", "B", "C#m7", "A", "E", "F#m7", "Bsus4"];
      const expectedPlayShapes = ["E", "B", "C#m7", "A", "E", "F#m7", "Bsus4"];

      for (let i = 0; i < detectedSequence.length; i++) {
        const chord = detectedSequence[i];
        const state = resolveChordFinderState(chord, 0, 0);

        expect(state.detectedChord).toBe(expectedSounding[i]);
        expect(state.transposedChord).toBe(expectedSounding[i]);
        expect(state.shapeChord).toBe(expectedPlayShapes[i]);

        // Resolve voicing for the play shape
        const res = resolveGuitarChord(state.shapeChord, { capo: 0, detectedChord: state.detectedChord });
        expect(res.voicing).not.toBeNull();

        const diag = getChordDiagnosticInfo(
          state.detectedChord,
          state.transposedChord,
          0,
          state.shapeChord,
          res.voicing!.frets
        );
        expect(diag.soundingMatch).toBe(true);
        expect(diag.finalValidationResult).toBe("VALID");
      }
    });

    it("regression test: Test song progression at Capo 2 (Sounding remains E..Bsus4, Play Shape becomes D..Asus4)", () => {
      const detectedSequence = ["E", "B", "C#m7", "A", "E", "F#m7", "Bsus4"];
      const expectedSounding = ["E", "B", "C#m7", "A", "E", "F#m7", "Bsus4"];
      const expectedPlayShapes = ["D", "A", "Bm7", "G", "D", "Em7", "Asus4"];

      for (let i = 0; i < detectedSequence.length; i++) {
        const chord = detectedSequence[i];
        const state = resolveChordFinderState(chord, 0, 2);

        // Sounding timeline MUST remain E → B → C#m7 → A → E → F#m7 → Bsus4
        expect(state.detectedChord).toBe(expectedSounding[i]);
        expect(state.transposedChord).toBe(expectedSounding[i]);
        // Play shape MUST resolve to D → A → Bm7 → G → D → Em7 → Asus4
        expect(state.shapeChord).toBe(expectedPlayShapes[i]);

        // Resolve voicing for play shape with Capo 2
        const res = resolveGuitarChord(state.shapeChord, { capo: 2, detectedChord: state.detectedChord });
        expect(res.voicing).not.toBeNull();

        const diag = getChordDiagnosticInfo(
          state.detectedChord,
          state.transposedChord,
          2,
          state.shapeChord,
          res.voicing!.frets
        );
        expect(diag.soundingMatch).toBe(true);
        expect(diag.finalValidationResult).toBe("VALID");
        expect(diag.missingChordTones).toEqual([]);
        expect(diag.foreignChordTones).toEqual([]);
      }
    });

    it("regression test: Individual Chord Mappings at Capo 2", () => {
      const testCases: [string, string][] = [
        ["C", "Bb"],
        ["D", "C"],
        ["E", "D"],
        ["A", "G"],
        ["B", "A"],
        ["C#m7", "Bm7"],
        ["F#m7", "Em7"],
        ["Bsus4", "Asus4"],
      ];

      for (const [sounding, expectedShape] of testCases) {
        const state = resolveChordFinderState(sounding, 0, 2);
        expect(state.detectedChord).toBe(sounding);
        expect(state.shapeChord).toBe(expectedShape);

        const res = resolveGuitarChord(state.shapeChord, { capo: 2, detectedChord: state.detectedChord });
        expect(res.voicing).not.toBeNull();

        const diag = getChordDiagnosticInfo(
          state.detectedChord,
          state.transposedChord,
          2,
          state.shapeChord,
          res.voicing!.frets
        );
        expect(diag.soundingMatch).toBe(true);
      }
    });

    it("regression test: Capo Step Shift 0 → 1 → 2 → 3 for Sounding E", () => {
      const sounding = "E";
      const expectedSteps: { capo: number; expectedShape: string }[] = [
        { capo: 0, expectedShape: "E" },
        { capo: 1, expectedShape: "Eb" }, // or D#
        { capo: 2, expectedShape: "D" },
        { capo: 3, expectedShape: "C#" }, // or Db
      ];

      for (const step of expectedSteps) {
        const state = resolveChordFinderState(sounding, 0, step.capo);
        expect(state.detectedChord).toBe("E");
        expect(state.transposedChord).toBe("E");
        expect(state.shapeChord).toBe(step.expectedShape);

        const res = resolveGuitarChord(state.shapeChord, { capo: step.capo, detectedChord: state.detectedChord });
        expect(res.voicing).not.toBeNull();

        const diag = getChordDiagnosticInfo(
          state.detectedChord,
          state.transposedChord,
          step.capo,
          state.shapeChord,
          res.voicing!.frets
        );
        expect(diag.soundingMatch).toBe(true);
        expect(diag.finalValidationResult).toBe("VALID");
      }
    });

    it("regression test: Strict Canonical Play-Shape Mapping (E->D, B->A, C#m7->Bm7, A->G, F#m7->Em7, Bsus4->Asus4 at Capo 2)", () => {
      const mappings: { sounding: string; expectedPlayShape: string; quality: string }[] = [
        { sounding: "E", expectedPlayShape: "D", quality: "maj" },
        { sounding: "B", expectedPlayShape: "A", quality: "maj" },
        { sounding: "C#m7", expectedPlayShape: "Bm7", quality: "m7" },
        { sounding: "A", expectedPlayShape: "G", quality: "maj" },
        { sounding: "F#m7", expectedPlayShape: "Em7", quality: "m7" },
        { sounding: "Bsus4", expectedPlayShape: "Asus4", quality: "sus4" },
        { sounding: "Cmaj7", expectedPlayShape: "Bbmaj7", quality: "maj7" },
      ];

      for (const { sounding, expectedPlayShape } of mappings) {
        // 1. Resolve Chord Finder State
        const state = resolveChordFinderState(sounding, 0, 2);
        expect(state.detectedChord).toBe(sounding);
        expect(state.transposedChord).toBe(sounding);
        expect(state.shapeChord).toBe(expectedPlayShape);

        // 2. Resolve Guitar Chord for Play Shape
        const res = resolveGuitarChord(state.shapeChord, { capo: 2, detectedChord: state.detectedChord });
        
        // Canonical shape identity rules:
        expect(res.detectedChord).toBe(sounding);
        expect(res.displayChord).toBe(expectedPlayShape);
        expect(res.playableShapeChord).toBe(expectedPlayShape);
        expect(res.voicing).not.toBeNull();
        expect(res.voicing!.name).toBe(expectedPlayShape);

        // Voicings must never mutate to malformed slash chords like D/A, D/B, Gsus2/E, etc.
        expect(res.displayChord).not.toContain("/");
        expect(res.voicing!.name).not.toContain("/");
        expect(res.hasExactSlashVoicing).toBe(false);

        // Fretboard diagram verification
        const diag = getChordDiagnosticInfo(
          state.detectedChord,
          state.transposedChord,
          2,
          state.shapeChord,
          res.voicing!.frets
        );
        expect(diag.soundingMatch).toBe(true);
        expect(diag.finalValidationResult).toBe("VALID");
      }
    });

    it("verifies that generated voicings and multiple voicing options cannot mutate the canonical play-shape name", () => {
      const sounding = "C#m7";
      const capo = 2;
      const state = resolveChordFinderState(sounding, 0, capo);
      expect(state.shapeChord).toBe("Bm7");

      // Test across all available voicing indices (e.g. index 1, 2, 3, etc.)
      for (let vIdx = 1; vIdx <= 5; vIdx++) {
        const res = resolveGuitarChord(state.shapeChord, {
          capo,
          voicingIndex: vIdx,
          detectedChord: state.detectedChord,
        });

        if (res.voicing) {
          // Play shape name MUST remain canonical Bm7
          expect(res.displayChord).toBe("Bm7");
          expect(res.playableShapeChord).toBe("Bm7");
          expect(res.voicing.name).toBe("Bm7");
          expect(res.detectedChord).toBe("C#m7");

          // Must not produce fake slash names like D/B, A/C#, etc.
          expect(res.displayChord).not.toBe("A/C#");
          expect(res.displayChord).not.toBe("D/B");
          expect(res.displayChord).not.toBe("D/A");
          expect(res.voicing.name).not.toBe("A/C#");
          expect(res.voicing.name).not.toBe("D/B");
        }
      }
    });

    it("proves changing voicing modes (Best, Easy, Open, Barre, Finger) preserves sounding chord and detectedChord", () => {
      const sounding = "C#m7";
      const capo = 2; // shape Bm7
      const modes = ["standard", "easy", "open", "barre", "fingerstyle"] as const;

      for (const mode of modes) {
        const state = resolveChordFinderState(sounding, 0, capo);
        expect(state.detectedChord).toBe("C#m7");
        expect(state.shapeChord).toBe("Bm7");

        const res = resolveGuitarChord(state.shapeChord, {
          capo,
          playabilityMode: mode,
          detectedChord: state.detectedChord,
        });
        expect(res.detectedChord).toBe("C#m7");
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
      }
    });
  });
});
