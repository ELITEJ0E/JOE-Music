// Structured Chord Representation & Enharmonic Normalization Module for JOE-Music

export type CanonicalQuality =
  | "maj"
  | "min"
  | "5"
  | "dim"
  | "aug"
  | "sus2"
  | "sus4"
  | "6"
  | "m6"
  | "7"
  | "maj7"
  | "m7"
  | "add9"
  | "9"
  | "maj9"
  | "m9"
  | "11"
  | "13"
  | "dim7"
  | "min7b5";

export interface RawChordHypothesis {
  root: string;
  quality: string;
  bass?: string;
  extensions?: string[];
  confidence?: number;
}

export interface NormalizedChord {
  root: string;            // e.g. "C", "Bb", "F#"
  quality: CanonicalQuality; // e.g. "min", "m7", "maj7"
  qualitySymbol: string;   // e.g. "m", "m7", "maj7", ""
  bass?: string;           // e.g. "Bb" (present ONLY if bass pitch class !== root pitch class)
  extensions: string[];    // e.g. ["9"]
  canonicalLabel: string;  // e.g. "Cm7/Bb", "C", "G/B"
  displayLabel: string;    // e.g. "Cm7/Bb" or "C"
  isValid: boolean;
}

// Chromatic pitch names (0 = C, 1 = C#/Db, 2 = D, ..., 11 = B)
const PITCH_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PITCH_NAMES_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Pitch class map
const NOTE_PITCH_CLASS_MAP: Record<string, number> = {
  C: 0, "C#": 1, DB: 1, DFLAT: 1, CSHARP: 1,
  D: 2, "D#": 3, EB: 3, EFLAT: 3, DSHARP: 3,
  E: 4, FB: 4, ESHARP: 5,
  F: 5, "F#": 6, GB: 6, GFLAT: 6, FSHARP: 6,
  G: 7, "G#": 8, AB: 8, AFLAT: 8, GSHARP: 8,
  A: 9, "A#": 10, BB: 10, BFLAT: 10, ASHARP: 10,
  B: 11, CB: 11, BSHARP: 0
};

// Keys using flats
const FLAT_KEYS = new Set([
  "F", "BB", "EB", "AB", "DB", "GB", "CB",
  "DM", "GM", "CM", "FM", "BBM", "EBM",
  "F MAJ", "BB MAJ", "EB MAJ", "AB MAJ", "DB MAJ", "GB MAJ",
  "D MIN", "G MIN", "C MIN", "F MIN", "BB MIN", "EB MIN"
]);

/**
 * Returns the pitch class index (0..11) for any note name.
 */
export function pitchClassOfNote(note: string): number {
  if (!note) return -1;
  const clean = note.trim().toUpperCase().replace(/FLAT/, "B").replace(/SHARP/, "#");
  if (NOTE_PITCH_CLASS_MAP[clean] !== undefined) {
    return NOTE_PITCH_CLASS_MAP[clean];
  }
  // Try matching first two characters
  const match = clean.match(/^([A-G][#B]?)/);
  if (match && NOTE_PITCH_CLASS_MAP[match[1]] !== undefined) {
    return NOTE_PITCH_CLASS_MAP[match[1]];
  }
  return -1;
}

/**
 * Checks whether a key context uses flat spellings.
 */
export function isFlatKey(keyContext?: string): boolean {
  if (!keyContext) return true; // Default to flat spellings (Bb, Eb, Ab) as standard for guitar
  const clean = keyContext.trim().toUpperCase();
  if (FLAT_KEYS.has(clean)) return true;
  if (clean.includes("B") && !clean.includes("#")) return true;
  if (clean.includes("FLAT")) return true;
  return false;
}

/**
 * Musically appropriate enharmonic spelling normalization.
 */
export function normalizeNoteSpelling(rawNote: string, keyContext?: string): string {
  if (!rawNote) return "";
  const pc = pitchClassOfNote(rawNote);
  if (pc === -1) return rawNote;

  const useFlat = isFlatKey(keyContext);
  return useFlat ? PITCH_NAMES_FLAT[pc] : PITCH_NAMES_SHARP[pc];
}

/**
 * Normalizes raw quality strings into canonical vocabulary and display symbols.
 */
export function normalizeQuality(rawQuality: string): { quality: CanonicalQuality; displaySymbol: string } {
  const clean = (rawQuality || "").trim().toLowerCase();

  switch (clean) {
    case "":
    case "maj":
    case "major":
      return { quality: "maj", displaySymbol: "" };
    case "m":
    case "min":
    case "minor":
    case "-":
      return { quality: "min", displaySymbol: "m" };
    case "5":
    case "power":
      return { quality: "5", displaySymbol: "5" };
    case "dim":
    case "o":
      return { quality: "dim", displaySymbol: "dim" };
    case "dim7":
    case "o7":
      return { quality: "dim7", displaySymbol: "dim7" };
    case "min7b5":
    case "m7b5":
    case "half-dim":
    case "ø":
      return { quality: "min7b5", displaySymbol: "m7b5" };
    case "aug":
    case "+":
      return { quality: "aug", displaySymbol: "aug" };
    case "sus2":
      return { quality: "sus2", displaySymbol: "sus2" };
    case "sus4":
    case "sus":
      return { quality: "sus4", displaySymbol: "sus4" };
    case "6":
      return { quality: "6", displaySymbol: "6" };
    case "m6":
    case "min6":
      return { quality: "m6", displaySymbol: "m6" };
    case "7":
    case "dom7":
      return { quality: "7", displaySymbol: "7" };
    case "maj7":
    case "m7_maj":
    case "Δ7":
      return { quality: "maj7", displaySymbol: "maj7" };
    case "m7":
    case "min7":
    case "-7":
      return { quality: "m7", displaySymbol: "m7" };
    case "add9":
    case "add2":
      return { quality: "add9", displaySymbol: "add9" };
    case "9":
      return { quality: "9", displaySymbol: "9" };
    case "maj9":
      return { quality: "maj9", displaySymbol: "maj9" };
    case "m9":
    case "min9":
      return { quality: "m9", displaySymbol: "m9" };
    case "11":
      return { quality: "11", displaySymbol: "11" };
    case "13":
      return { quality: "13", displaySymbol: "13" };
    default:
      // Fallback quality parsing
      if (clean.startsWith("min") || clean.startsWith("m7") || clean.startsWith("-")) {
        return { quality: "m7", displaySymbol: "m7" };
      }
      if (clean.startsWith("maj")) {
        return { quality: "maj7", displaySymbol: "maj7" };
      }
      return { quality: "maj", displaySymbol: "" };
  }
}

/**
 * Main normalizer converting structured hypotheses into canonical representation.
 */
export function normalizeChord(hypothesis: RawChordHypothesis, keyContext?: string): NormalizedChord {
  const normRoot = normalizeNoteSpelling(hypothesis.root, keyContext);
  const { quality, displaySymbol } = normalizeQuality(hypothesis.quality);

  let normBass: string | undefined = undefined;
  if (hypothesis.bass) {
    const rawB = normalizeNoteSpelling(hypothesis.bass, keyContext);
    // Validate Root/Bass pitch class relationship:
    // If bass === root pitch class, do NOT display a slash chord (e.g. C/C -> C)
    if (pitchClassOfNote(rawB) !== pitchClassOfNote(normRoot)) {
      normBass = rawB;
    }
  }

  const extensions = hypothesis.extensions || [];
  
  // Format canonical label: ROOT + QUALITY_SYMBOL + "/" + BASS
  let label = `${normRoot}${displaySymbol}`;
  if (normBass) {
    label += `/${normBass}`;
  }

  return {
    root: normRoot,
    quality: quality,
    qualitySymbol: displaySymbol,
    bass: normBass,
    extensions,
    canonicalLabel: label,
    displayLabel: label,
    isValid: true
  };
}

/**
 * Strict parser for chord labels.
 * Fails safely on malformed inputs like "Cm7A/A#", "CminorBb", "GmajB", "unknown".
 */
export function parseChordLabel(rawLabel: string, keyContext?: string): NormalizedChord {
  if (!rawLabel || typeof rawLabel !== "string") {
    return {
      root: "",
      quality: "maj",
      qualitySymbol: "",
      extensions: [],
      canonicalLabel: "Unknown chord",
      displayLabel: "Unknown chord",
      isValid: false
    };
  }

  const clean = rawLabel.trim();
  if (!clean || clean.toLowerCase() === "unknown" || clean.toLowerCase() === "none") {
    return {
      root: "",
      quality: "maj",
      qualitySymbol: "",
      extensions: [],
      canonicalLabel: "Unknown chord",
      displayLabel: "Unknown chord",
      isValid: false
    };
  }

  // Strict Regex Matching:
  // Root: [A-G][#b]?
  // Quality: maj7|min7|m7|maj9|min9|m9|add9|sus2|sus4|dim7|m7b5|dim|aug|m6|maj|min|m|7|5|6|11|13|minor|major|-7|-
  // Bass: (?:/([A-G][#b]?))?
  const regex = /^([A-G][#b]?)\s*(maj7|min7|m7|maj9|min9|m9|add9|sus2|sus4|dim7|m7b5|dim|aug|m6|maj|min|m|7|5|6|11|13|minor|major|-7|-)?\s*(?:\/([A-G][#b]?))?$/i;
  const match = clean.match(regex);

  if (!match) {
    return {
      root: "",
      quality: "maj",
      qualitySymbol: "",
      extensions: [],
      canonicalLabel: "Unknown chord",
      displayLabel: "Unknown chord",
      isValid: false
    };
  }

  const rawRoot = match[1];
  const rawQuality = match[2] || "";
  const rawBass = match[3];

  return normalizeChord({
    root: rawRoot,
    quality: rawQuality,
    bass: rawBass
  }, keyContext);
}

/**
 * Validates whether a given chord label is valid and well-formed.
 */
export function isValidChordLabel(label: string): boolean {
  const norm = parseChordLabel(label);
  return norm.isValid;
}
