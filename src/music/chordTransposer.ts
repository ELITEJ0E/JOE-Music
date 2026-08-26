// Music Theory Transposition & Capo Calculation Engine for JOE-Music
// Strictly separates detectedChord (MIR sounding), transposedChord (musical key shift),
// and shapeChord (physical guitar fingering with capo).

import { getPitchClass, PitchClass } from "./chordTheory";

export const PITCH_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const PITCH_NAMES_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Pitch classes that are naturally flat in guitar / pop notation
// 0=C, 1=C#/Db, 2=D, 3=Eb, 4=E, 5=F, 6=F#, 7=G, 8=Ab/G#, 9=A, 10=Bb, 11=B
const FLAT_ROOT_PCS = new Set([5, 10, 3, 8]); // F, Bb, Eb, Ab

/**
 * Determines whether a given root pitch class or key context prefers flat note spelling.
 */
export function prefersFlatSpelling(rootPc: PitchClass, keyContext?: string): boolean {
  if (keyContext) {
    const cleanKey = keyContext.trim().toUpperCase();
    if (cleanKey.includes("B") && !cleanKey.includes("#")) return true;
    if (cleanKey.includes("FLAT") || cleanKey.startsWith("F") || cleanKey.startsWith("BB") || cleanKey.startsWith("EB") || cleanKey.startsWith("AB") || cleanKey.startsWith("DB")) return true;
    if (cleanKey === "C MIN" || cleanKey === "G MIN" || cleanKey === "D MIN" || cleanKey === "F MIN") return true;
  }
  return FLAT_ROOT_PCS.has(rootPc);
}

/**
 * Returns the note name for a pitch class with intelligent enharmonic selection.
 */
export function getSpelledNoteName(pc: PitchClass, contextRootPc?: PitchClass, keyContext?: string): string {
  const normalizedPc = ((pc % 12) + 12) % 12;

  // Naturals have only one spelling
  switch (normalizedPc) {
    case 0: return "C";
    case 2: return "D";
    case 4: return "E";
    case 5: return "F";
    case 7: return "G";
    case 9: return "A";
    case 11: return "B";
  }

  // Determine flat vs sharp preference
  const useFlat = contextRootPc !== undefined
    ? prefersFlatSpelling(contextRootPc, keyContext)
    : prefersFlatSpelling(normalizedPc, keyContext);

  // Defaults for specific pitch classes:
  // pc 10 is almost always Bb in guitar tabs
  if (normalizedPc === 10 && (contextRootPc === undefined || ![11, 6, 1].includes(contextRootPc))) {
    return "Bb";
  }
  // pc 3 is almost always Eb in guitar tabs
  if (normalizedPc === 3 && (contextRootPc === undefined || ![4, 11, 6].includes(contextRootPc))) {
    return "Eb";
  }
  // pc 1 is C# in sharp contexts (A, D, E, B) and Db in flat contexts
  if (normalizedPc === 1) {
    return useFlat ? "Db" : "C#";
  }
  // pc 6 is F# in sharp contexts (G, D, A, E, B) and Gb in flat contexts
  if (normalizedPc === 6) {
    return useFlat ? "Gb" : "F#";
  }
  // pc 8 is G# in sharp contexts (A, E, B) and Ab in flat contexts (F, Bb, Eb, Ab, C)
  if (normalizedPc === 8) {
    return useFlat ? "Ab" : "G#";
  }

  return useFlat ? PITCH_NAMES_FLAT[normalizedPc] : PITCH_NAMES_SHARP[normalizedPc];
}

/**
 * Transposes an individual note by a semitone offset.
 */
export function transposeNote(noteName: string, semitones: number, keyContext?: string): string {
  if (!noteName) return "";
  const pc = getPitchClass(noteName);
  if (pc === -1) return noteName;

  const targetPc = ((pc + semitones) % 12 + 12) % 12;
  return getSpelledNoteName(targetPc, targetPc, keyContext);
}

// Regex to strictly parse chord components: Root, Quality/Extensions, Slash Bass
const CHORD_COMPONENTS_REGEX = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;

/**
 * Transposes a chord symbol by a given semitone offset.
 * Operates purely on the canonical structure (root, quality, bass) without string replacement.
 * Preserves quality, extensions, alterations, and slash bass.
 */
export function transposeChordSymbol(chordSymbol: string, semitones: number, keyContext?: string): string {
  if (!chordSymbol || chordSymbol === "-" || chordSymbol.toLowerCase() === "unknown chord") {
    return chordSymbol || "-";
  }

  if (semitones === 0) {
    return chordSymbol.trim();
  }

  const match = chordSymbol.trim().match(CHORD_COMPONENTS_REGEX);
  if (!match) {
    return chordSymbol;
  }

  const rawRoot = match[1];
  const qualityAndExtensions = match[2] || "";
  const rawBass = match[3];

  const rootPc = getPitchClass(rawRoot);
  if (rootPc === -1) return chordSymbol;

  const targetRootPc = ((rootPc + semitones) % 12 + 12) % 12;
  const newRootName = getSpelledNoteName(targetRootPc, targetRootPc, keyContext);

  let newBassName: string | undefined = undefined;
  if (rawBass) {
    const bassPc = getPitchClass(rawBass);
    if (bassPc !== -1) {
      const targetBassPc = ((bassPc + semitones) % 12 + 12) % 12;
      // Spell bass note in the context of the transposed root
      newBassName = getSpelledNoteName(targetBassPc, targetRootPc, keyContext);
    }
  }

  if (newBassName && newBassName !== newRootName) {
    return `${newRootName}${qualityAndExtensions}/${newBassName}`;
  }
  return `${newRootName}${qualityAndExtensions}`;
}

export interface TransposedChordResult {
  detectedChord: string;      // Sounding chord from audio / MIR (e.g. "C", "G/B")
  transposedChord: string;    // Sounding chord after musical transpose (e.g. "D", "A/C#")
  shapeChord: string;         // Physical guitar chord shape to finger with capo (e.g. "C", "G/B")
  transposeSemitones: number; // Musical transpose (-12 to +12)
  capoFret: number;           // Capo position (0 to 12)
  isValid: boolean;
  rootName: string;
  transposedRootName: string;
  shapeRootName: string;
  quality: string;
  bassName?: string;
  transposedBassName?: string;
  shapeBassName?: string;
}

/**
 * Main resolution function for Chord Finder state.
 * Composes Transpose and Capo calculations:
 *   1. transposedChord = transpose(detectedChord, transposeSemitones)
 *   2. shapeChord = transpose(transposedChord, -capoFret)
 */
export function resolveChordFinderState(
  detectedChord: string,
  transposeSemitones: number = 0,
  capoFret: number = 0,
  keyContext?: string
): TransposedChordResult {
  if (!detectedChord || detectedChord === "-" || detectedChord.toLowerCase() === "unknown chord") {
    return {
      detectedChord: detectedChord || "-",
      transposedChord: detectedChord || "-",
      shapeChord: detectedChord || "-",
      transposeSemitones,
      capoFret,
      isValid: false,
      rootName: "",
      transposedRootName: "",
      shapeRootName: "",
      quality: "",
    };
  }

  const match = detectedChord.trim().match(CHORD_COMPONENTS_REGEX);
  if (!match) {
    return {
      detectedChord,
      transposedChord: detectedChord,
      shapeChord: detectedChord,
      transposeSemitones,
      capoFret,
      isValid: false,
      rootName: "",
      transposedRootName: "",
      shapeRootName: "",
      quality: "",
    };
  }

  const rootName = match[1];
  const quality = match[2] || "";
  const bassName = match[3];

  // 1. Calculate transposedChord (Sounding chord after musical transpose)
  const transposedChord = transposeChordSymbol(detectedChord, transposeSemitones, keyContext);

  // 2. Calculate shapeChord (Physical chord shape: shapePitchClass = soundingPitchClass - capo)
  const shapeChord = transposeChordSymbol(transposedChord, -capoFret, keyContext);

  // Parse components of transposed and shape chords
  const transMatch = transposedChord.match(CHORD_COMPONENTS_REGEX);
  const shapeMatch = shapeChord.match(CHORD_COMPONENTS_REGEX);

  return {
    detectedChord,
    transposedChord,
    shapeChord,
    transposeSemitones,
    capoFret,
    isValid: true,
    rootName,
    transposedRootName: transMatch ? transMatch[1] : rootName,
    shapeRootName: shapeMatch ? shapeMatch[1] : rootName,
    quality,
    bassName,
    transposedBassName: transMatch ? transMatch[3] : bassName,
    shapeBassName: shapeMatch ? shapeMatch[3] : bassName,
  };
}
