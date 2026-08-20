import { ChordVoicing } from "../types";
import { CHORD_DATABASE } from "../data/chordDatabase";

export interface ChordValidationError {
  chordId: string;
  chordName: string;
  error: string;
}

export interface ValidationReport {
  totalChecked: number;
  validCount: number;
  invalidCount: number;
  errors: ChordValidationError[];
}

/**
 * Development validation utility for Chord Database entries.
 * Checks:
 * - frets array has exactly 6 entries
 * - every fret is 'x' or integer >= 0
 * - barre.fret is integer >= 1
 * - barre.fromString is 0..5
 * - barre.toString is 0..5
 * - fromString <= toString
 * - barre.fret corresponds to at least one relevant fret position in frets array
 */
export function validateChordVoicing(chord: ChordVoicing): string[] {
  const errors: string[] = [];

  // 1. Frets array must have exactly 6 entries
  if (!chord.frets || !Array.isArray(chord.frets) || chord.frets.length !== 6) {
    errors.push(`Invalid frets length: expected 6, got ${chord.frets?.length ?? 0}`);
    return errors;
  }

  // 2. Every fret is 'x' or integer >= 0
  for (let s = 0; s < 6; s++) {
    const f = chord.frets[s];
    if (f !== "x") {
      if (typeof f !== "number" || !Number.isInteger(f) || f < 0) {
        errors.push(`Invalid fret value at string index ${s}: ${f}`);
      }
    }
  }

  // 3. Barre validation
  if (chord.barre) {
    const { fret, fromString, toString } = chord.barre;

    if (typeof fret !== "number" || !Number.isInteger(fret) || fret < 1) {
      errors.push(`Invalid barre.fret: expected integer >= 1, got ${fret}`);
    }

    if (typeof fromString !== "number" || !Number.isInteger(fromString) || fromString < 0 || fromString > 5) {
      errors.push(`Invalid barre.fromString: expected 0..5, got ${fromString}`);
    }

    if (typeof toString !== "number" || !Number.isInteger(toString) || toString < 0 || toString > 5) {
      errors.push(`Invalid barre.toString: expected 0..5, got ${toString}`);
    }

    if (fromString > toString) {
      errors.push(`Invalid barre bounds: fromString (${fromString}) > toString (${toString})`);
    }

    // Check that barre.fret corresponds to at least one relevant fret position in the specified string range
    if (typeof fret === "number" && fromString <= toString) {
      let foundMatchingFret = false;
      for (let s = fromString; s <= toString; s++) {
        if (chord.frets[s] === fret) {
          foundMatchingFret = true;
          break;
        }
      }
      if (!foundMatchingFret) {
        errors.push(`barre.fret (${fret}) does not match any fret in string range [${fromString}..${toString}]`);
      }
    }
  }

  return errors;
}

/**
 * Validates the entire Chord Database and generates a report.
 */
export function validateChordDatabase(database: ChordVoicing[] = CHORD_DATABASE): ValidationReport {
  const errors: ChordValidationError[] = [];
  let validCount = 0;

  for (const chord of database) {
    const errs = validateChordVoicing(chord);
    if (errs.length > 0) {
      for (const err of errs) {
        errors.push({
          chordId: chord.id,
          chordName: chord.name,
          error: err,
        });
      }
    } else {
      validCount++;
    }
  }

  return {
    totalChecked: database.length,
    validCount,
    invalidCount: errors.length,
    errors,
  };
}
