// Procedural Power Chord Voicing Resolver for JOE-Music
// Algorithmically generates standard guitar power-chord (5th) shapes for all 12 chromatic roots.

import { ChordVoicing } from "../types";
import { pitchClassOfNote } from "./chordNormalizer";

export type GuitarVoicing = ChordVoicing;

// Standard tuning open string pitch classes (Low E=4, A=9, D=2, G=7, B=11, High E=4)
const OPEN_STRING_PITCH_CLASSES = [4, 9, 2, 7, 11, 4];

// Chromatic note names for sharp and flat keys
const PITCH_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PITCH_NAMES_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/**
 * Normalizes root note string to canonical capitalized representation.
 */
function getCanonicalRootName(root: string): { name: string; pc: number; isFlat: boolean } | null {
  if (!root || typeof root !== "string") return null;
  const clean = root.trim();
  const pc = pitchClassOfNote(clean);
  if (pc === -1) return null;

  const isFlat = clean.includes("b") || clean.toUpperCase().includes("FLAT");
  const name = isFlat ? PITCH_NAMES_FLAT[pc] : PITCH_NAMES_SHARP[pc];
  return { name, pc, isFlat };
}

/**
 * Returns the note name for a pitch class, matching the key/accidental context of the root.
 */
function getNoteName(pc: number, preferFlat: boolean): string {
  const normPc = ((pc % 12) + 12) % 12;
  return preferFlat ? PITCH_NAMES_FLAT[normPc] : PITCH_NAMES_SHARP[normPc];
}

/**
 * Verifies that a set of guitar frets in standard tuning strictly contains
 * only the specified root and perfect fifth, and that all frets are within 0..24.
 */
export function verifyPowerChordNotes(
  frets: (number | "x")[],
  rootPc: number,
  fifthPc: number
): boolean {
  const presentPcs = new Set<number>();

  for (let sIdx = 0; sIdx < frets.length; sIdx++) {
    const f = frets[sIdx];
    if (typeof f === "number") {
      if (f < 0 || f > 24) return false;
      const pc = (OPEN_STRING_PITCH_CLASSES[sIdx] + f) % 12;
      // Power chords must strictly contain ONLY root or perfect fifth
      if (pc !== rootPc && pc !== fifthPc) {
        return false;
      }
      presentPcs.add(pc);
    }
  }

  // Must contain both the root and the fifth
  return presentPcs.has(rootPc) && presentPcs.has(fifthPc);
}

/**
 * Generates an algorithmic power-chord voicing for any of the 12 chromatic roots.
 * Supports standard E-string-root (R R+2 R+2 x x x) and A-string-root (x R R+2 R+2 x x) shapes.
 * 
 * Chooses the most playable candidate (preferring lower fret positions).
 * Respects guitar fret range 0..24.
 * Strictly verifies that the resulting voicing contains root and perfect fifth.
 * 
 * For slash chords (e.g. A5/C#):
 * Only generates a voicing if the voicing actually contains root, fifth, and bass note
 * and is a musically valid power chord inversion (e.g. A5/E over fifth).
 * Non-power chord slash notes (e.g. A5/C#) return null.
 */
export function resolvePowerChord(root: string, bass?: string): GuitarVoicing | null {
  const rootInfo = getCanonicalRootName(root);
  if (!rootInfo) return null;

  const { name: rootName, pc: rootPc, isFlat } = rootInfo;
  const fifthPc = (rootPc + 7) % 12;
  const fifthName = getNoteName(fifthPc, isFlat);

  // Bass / Slash Chord check
  if (bass) {
    const bassInfo = getCanonicalRootName(bass);
    if (bassInfo && bassInfo.pc !== rootPc) {
      // If bass note is NOT the perfect fifth, standard power chords cannot accommodate it
      // without introducing non-power chord intervals (e.g. 3rds or 7ths)
      if (bassInfo.pc !== fifthPc) {
        return null;
      }

      // If bass is the 5th (e.g. A5/E), check if an inverted low-5th power chord is playable
      // Low E open (0: E) + A string open (0: A) + D string 2 (E) + G string 2 (A) -> [0, 0, 2, 2, "x", "x"]
      if (rootPc === 9 && bassInfo.pc === 4) {
        // A5/E inversion
        const frets: (number | "x")[] = [0, 0, 2, 2, "x", "x"];
        if (verifyPowerChordNotes(frets, rootPc, fifthPc)) {
          return {
            id: "gen-a5-e-inv",
            name: "A5/E",
            root: "A",
            quality: "5",
            frets,
            fingers: [0, 0, 1, 2, 0, 0],
            notes: ["E", "A", "E", "A"],
            intervals: ["5", "1", "5", "1"],
            cagedShape: "A",
            difficulty: "Beginner",
            voicingType: "generated",
            voicingConfidence: 0.90
          };
        }
      }

      // Other 5th inversions return null if no standard compact shape exists
      return null;
    }
  }

  // 1. Calculate lowest fret on Low E-string (String 0, Open = E / PC 4)
  // Fret on E string = (rootPc - 4 + 12) % 12
  const eFret = (rootPc - 4 + 12) % 12;

  // 2. Calculate lowest fret on A-string (String 1, Open = A / PC 9)
  // Fret on A string = (rootPc - 9 + 12) % 12
  const aFret = (rootPc - 9 + 12) % 12;

  // Generate E-string root candidate: [eFret, eFret + 2, eFret + 2, "x", "x", "x"]
  const eCandidateFrets: (number | "x")[] = [eFret, eFret + 2, eFret + 2, "x", "x", "x"];
  const eCandidateValid = eFret + 2 <= 24 && verifyPowerChordNotes(eCandidateFrets, rootPc, fifthPc);

  // Generate A-string root candidate: ["x", aFret, aFret + 2, aFret + 2, "x", "x"]
  const aCandidateFrets: (number | "x")[] = ["x", aFret, aFret + 2, aFret + 2, "x", "x"];
  const aCandidateValid = aFret + 2 <= 24 && verifyPowerChordNotes(aCandidateFrets, rootPc, fifthPc);

  // Choose the best position (prefer lower fret for maximum playability)
  let chosenShape: "E" | "A";
  if (eCandidateValid && aCandidateValid) {
    chosenShape = eFret < aFret ? "E" : "A";
  } else if (eCandidateValid) {
    chosenShape = "E";
  } else if (aCandidateValid) {
    chosenShape = "A";
  } else {
    return null;
  }

  if (chosenShape === "E") {
    const startFret = eFret;
    const fingers: (number | 0)[] = eFret === 0 ? [0, 1, 2, 0, 0, 0] : [1, 3, 4, 0, 0, 0];
    const baseFret = startFret > 1 ? startFret : undefined;

    return {
      id: `gen-${rootName.toLowerCase()}5-e`,
      name: `${rootName}5`,
      root: rootName,
      quality: "5",
      frets: eCandidateFrets,
      fingers,
      baseFret,
      position: baseFret,
      notes: [rootName, fifthName, rootName],
      intervals: ["1", "5", "1"],
      cagedShape: "E",
      difficulty: "Beginner",
      voicingType: "generated",
      voicingConfidence: 0.90
    };
  } else {
    const startFret = aFret;
    const fingers: (number | 0)[] = aFret === 0 ? [0, 0, 1, 2, 0, 0] : [0, 1, 3, 4, 0, 0];
    const baseFret = startFret > 1 ? startFret : undefined;

    return {
      id: `gen-${rootName.toLowerCase()}5-a`,
      name: `${rootName}5`,
      root: rootName,
      quality: "5",
      frets: aCandidateFrets,
      fingers,
      baseFret,
      position: baseFret,
      notes: [rootName, fifthName, rootName],
      intervals: ["1", "5", "1"],
      cagedShape: "A",
      difficulty: "Beginner",
      voicingType: "generated",
      voicingConfidence: 0.90
    };
  }
}
