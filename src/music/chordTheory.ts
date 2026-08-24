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
  return preferFlat ? NOTE_NAMES_FLAT[pc % 12] : NOTE_NAMES[pc % 12];
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
  add9: [0, 4, 7, 14], // 14 = 2
  9: [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  11: [0, 4, 7, 10, 14, 17],
  m11: [0, 3, 7, 10, 14, 17],
  13: [0, 4, 7, 10, 14, 21], // 13 is 9, omit 11 usually, but let's keep minimal required, maybe just [0, 4, 7, 10, 21]
};

// Aliases for chord qualities
export const QUALITY_ALIASES: Record<string, string> = {
  "": "maj",
  "M": "maj",
  "major": "maj",
  "m": "min",
  "-": "min",
  "minor": "min",
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
  "ø": "m7b5",
  "5": "5",
  "add9": "add9",
  "add2": "add9", // practically same on guitar
  "9": "9",
  "m9": "m9",
  "maj9": "maj9",
  "11": "11",
  "m11": "m11",
  "13": "13"
};

export function buildChord(rootName: string, qualityAlias: string, bassName?: string): ChordDefinition {
  const root = getPitchClass(rootName);
  const q = QUALITY_ALIASES[qualityAlias] || "maj";
  const intervals = CHORD_QUALITIES[q] || CHORD_QUALITIES["maj"];
  
  let bass: PitchClass | undefined = undefined;
  let normalizedBassName: string | undefined = undefined;

  if (bassName) {
    bass = getPitchClass(bassName);
    // Determine harmonic context based on root name
    // Flat context: root contains 'b' or is 'F' or 'C' in flat context
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

export function getRequiredPitchClasses(def: ChordDefinition): Set<PitchClass> {
  const pcs = new Set<PitchClass>();
  
  // For 7th and extended chords without altered 5ths, perfect 5th (7 semitones) is optional on guitar
  const isExtendedOrSeventh = def.intervals.some((iv) => iv === 10 || iv === 11 || iv === 9);
  const hasPerfectFifth = def.intervals.includes(7);
  const hasAlteredFifth = def.intervals.includes(6) || def.intervals.includes(8);

  for (const iv of def.intervals) {
    if (isExtendedOrSeventh && hasPerfectFifth && !hasAlteredFifth && iv === 7) {
      // Perfect 5th in 7th/extended chord is optional on guitar
      continue;
    }
    pcs.add((def.root + iv) % 12);
  }

  if (def.bass !== undefined) {
    pcs.add(def.bass % 12);
  }

  return pcs;
}
