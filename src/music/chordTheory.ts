export type PitchClass = number; // 0-11, where C = 0

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function getPitchClass(noteName: string): PitchClass {
  const norm = noteName.replace(/x/g, "##").trim();
  const first = norm.charAt(0).toUpperCase();
  let pc = NOTE_NAMES.indexOf(first);
  if (pc === -1) return -1;

  for (let i = 1; i < norm.length; i++) {
    if (norm[i] === "#") pc = (pc + 1) % 12;
    else if (norm[i] === "b") pc = (pc + 11) % 12;
  }
  return pc;
}

export function getNoteName(pc: PitchClass, preferFlat = false): string {
  return preferFlat ? NOTE_NAMES_FLAT[((pc % 12) + 12) % 12] : NOTE_NAMES[((pc % 12) + 12) % 12];
}

export interface ChordDefinition {
  root: PitchClass;
  rootName: string;
  quality: string;
  intervals: number[]; // relative to root in semitones
  bass?: PitchClass;
  bassName?: string;
  extensions: number[];
  alterations: { interval: number; modifier: number }[];
}

export const CHORD_QUALITIES: Record<string, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  5: [0, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10], // half-diminished
  add9: [0, 4, 7, 14], // 14 % 12 = 2
  9: [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  11: [0, 4, 7, 10, 14, 17],
  m11: [0, 3, 7, 10, 14, 17],
  13: [0, 4, 7, 10, 14, 21], // 21 % 12 = 9
};

export const ALL_SUPPORTED_QUALITIES = [
  "maj",
  "min",
  "5",
  "dim",
  "aug",
  "sus2",
  "sus4",
  "6",
  "m6",
  "7",
  "maj7",
  "m7",
  "dim7",
  "m7b5",
  "add9",
  "9",
  "m9",
  "maj9",
  "11",
  "m11",
  "13",
];

// Aliases for chord qualities
export const QUALITY_ALIASES: Record<string, string> = {
  "": "maj",
  "M": "maj",
  "major": "maj",
  "Major": "maj",
  "maj": "maj",
  "m": "min",
  "-": "min",
  "minor": "min",
  "Minor": "min",
  "min": "min",
  "dim": "dim",
  "o": "dim",
  "aug": "aug",
  "+": "aug",
  "sus2": "sus2",
  "sus4": "sus4",
  "sus": "sus4",
  "6": "6",
  "m6": "m6",
  "-6": "m6",
  "7": "7",
  "dom7": "7",
  "maj7": "maj7",
  "M7": "maj7",
  "m7": "m7",
  "-7": "m7",
  "min7": "m7",
  "dim7": "dim7",
  "o7": "dim7",
  "m7b5": "m7b5",
  "halfdim": "m7b5",
  "min7b5": "m7b5",
  "ø": "m7b5",
  "5": "5",
  "add9": "add9",
  "add2": "add9",
  "9": "9",
  "m9": "m9",
  "maj9": "maj9",
  "11": "11",
  "m11": "m11",
  "13": "13"
};

export function buildChord(rootName: string, qualityAlias: string, bassName?: string): ChordDefinition {
  const root = getPitchClass(rootName);
  const q = QUALITY_ALIASES[qualityAlias] || qualityAlias || "maj";
  const intervals = CHORD_QUALITIES[q] || CHORD_QUALITIES["maj"];
  
  let bass: PitchClass | undefined = undefined;
  let normalizedBassName: string | undefined = undefined;

  if (bassName) {
    bass = getPitchClass(bassName);
    const isFlatContext = rootName.includes("b") || rootName === "F";
    normalizedBassName = getNoteName(bass, isFlatContext);
  }

  return {
    root,
    rootName,
    quality: q,
    intervals,
    bass,
    bassName: normalizedBassName,
    extensions: [],
    alterations: []
  };
}

/**
 * Defining pitch classes that can NEVER be omitted under any circumstances.
 * Without these defining tones, the chord loses its fundamental harmonic identity
 * (e.g. omitting the 3rd turns major/minor into an ambiguous power chord).
 */
export function getDefiningPitchClasses(def: ChordDefinition): Set<PitchClass> {
  const pcs = new Set<PitchClass>();
  pcs.add(((def.root % 12) + 12) % 12);

  const q = def.quality;
  switch (q) {
    case "maj":
      pcs.add(((def.root + 4) % 12 + 12) % 12); // Major 3rd
      pcs.add(((def.root + 7) % 12 + 12) % 12); // 5th for triad
      break;
    case "min":
      pcs.add(((def.root + 3) % 12 + 12) % 12); // Minor 3rd
      pcs.add(((def.root + 7) % 12 + 12) % 12); // 5th for triad
      break;
    case "dim":
      pcs.add(((def.root + 3) % 12 + 12) % 12); // Minor 3rd
      pcs.add(((def.root + 6) % 12 + 12) % 12); // Diminished 5th
      break;
    case "aug":
      pcs.add(((def.root + 4) % 12 + 12) % 12); // Major 3rd
      pcs.add(((def.root + 8) % 12 + 12) % 12); // Augmented 5th
      break;
    case "5":
      pcs.add(((def.root + 7) % 12 + 12) % 12); // Perfect 5th
      break;
    case "sus2":
      pcs.add(((def.root + 2) % 12 + 12) % 12); // Major 2nd
      pcs.add(((def.root + 7) % 12 + 12) % 12); // 5th
      break;
    case "sus4":
      pcs.add(((def.root + 5) % 12 + 12) % 12); // Perfect 4th
      pcs.add(((def.root + 7) % 12 + 12) % 12); // 5th
      break;
    case "6":
      pcs.add(((def.root + 4) % 12 + 12) % 12); // Major 3rd
      pcs.add(((def.root + 9) % 12 + 12) % 12); // Major 6th
      break;
    case "m6":
      pcs.add(((def.root + 3) % 12 + 12) % 12); // Minor 3rd
      pcs.add(((def.root + 9) % 12 + 12) % 12); // Major 6th
      break;
    case "7":
      pcs.add(((def.root + 4) % 12 + 12) % 12); // Major 3rd
      pcs.add(((def.root + 10) % 12 + 12) % 12); // Minor 7th
      break;
    case "maj7":
      pcs.add(((def.root + 4) % 12 + 12) % 12); // Major 3rd
      pcs.add(((def.root + 11) % 12 + 12) % 12); // Major 7th
      break;
    case "m7":
      pcs.add(((def.root + 3) % 12 + 12) % 12); // Minor 3rd
      pcs.add(((def.root + 10) % 12 + 12) % 12); // Minor 7th
      break;
    case "dim7":
      pcs.add(((def.root + 3) % 12 + 12) % 12); // Minor 3rd
      pcs.add(((def.root + 6) % 12 + 12) % 12); // Diminished 5th
      pcs.add(((def.root + 9) % 12 + 12) % 12); // Diminished 7th
      break;
    case "m7b5":
      pcs.add(((def.root + 3) % 12 + 12) % 12); // Minor 3rd
      pcs.add(((def.root + 6) % 12 + 12) % 12); // Diminished 5th
      pcs.add(((def.root + 10) % 12 + 12) % 12); // Minor 7th
      break;
    case "add9":
      pcs.add(((def.root + 4) % 12 + 12) % 12); // Major 3rd
      pcs.add(((def.root + 2) % 12 + 12) % 12); // 9th (2)
      break;
    case "9":
      pcs.add(((def.root + 4) % 12 + 12) % 12); // Major 3rd
      pcs.add(((def.root + 10) % 12 + 12) % 12); // Minor 7th
      pcs.add(((def.root + 2) % 12 + 12) % 12); // 9th (2)
      break;
    case "m9":
      pcs.add(((def.root + 3) % 12 + 12) % 12); // Minor 3rd
      pcs.add(((def.root + 10) % 12 + 12) % 12); // Minor 7th
      pcs.add(((def.root + 2) % 12 + 12) % 12); // 9th (2)
      break;
    case "maj9":
      pcs.add(((def.root + 4) % 12 + 12) % 12); // Major 3rd
      pcs.add(((def.root + 11) % 12 + 12) % 12); // Major 7th
      pcs.add(((def.root + 2) % 12 + 12) % 12); // 9th (2)
      break;
    case "11":
      pcs.add(((def.root + 10) % 12 + 12) % 12); // Minor 7th
      pcs.add(((def.root + 5) % 12 + 12) % 12); // 11th (5)
      break;
    case "m11":
      pcs.add(((def.root + 3) % 12 + 12) % 12); // Minor 3rd
      pcs.add(((def.root + 10) % 12 + 12) % 12); // Minor 7th
      pcs.add(((def.root + 5) % 12 + 12) % 12); // 11th (5)
      break;
    case "13":
      pcs.add(((def.root + 4) % 12 + 12) % 12); // Major 3rd
      pcs.add(((def.root + 10) % 12 + 12) % 12); // Minor 7th
      pcs.add(((def.root + 9) % 12 + 12) % 12); // 13th (9)
      break;
    default:
      for (const iv of def.intervals) {
        pcs.add(((def.root + iv) % 12 + 12) % 12);
      }
  }

  if (def.bass !== undefined) {
    pcs.add(((def.bass % 12) + 12) % 12);
  }

  return pcs;
}

/**
 * Exact required pitch classes for a voicing to be classified as exact.
 */
export function getRequiredPitchClasses(def: ChordDefinition): Set<PitchClass> {
  const pcs = new Set<PitchClass>();
  
  // For triads (maj, min, dim, aug, 5, sus2, sus4): all 3 chord tones are required
  const isTriadOrPower = ["maj", "min", "5", "dim", "aug", "sus2", "sus4"].includes(def.quality);
  const isExtendedOrSeventh = !isTriadOrPower;
  const hasAlteredFifth = def.intervals.includes(6) || def.intervals.includes(8);

  for (const iv of def.intervals) {
    const normalizedIv = iv % 12;
    // Perfect 5th in standard 7th/extended chord is optional on guitar
    if (isExtendedOrSeventh && !hasAlteredFifth && normalizedIv === 7) {
      continue;
    }
    // In 13th chord, 11th is optional
    if (def.quality === "13" && normalizedIv === 5) {
      continue;
    }
    pcs.add(((def.root + normalizedIv) % 12 + 12) % 12);
  }

  if (def.bass !== undefined) {
    pcs.add(((def.bass % 12) + 12) % 12);
  }

  return pcs;
}
