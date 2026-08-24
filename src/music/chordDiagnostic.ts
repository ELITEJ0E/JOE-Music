// Developer Diagnostic and Mathematical Validation Engine for JOE-Music

import { PitchClass } from "./chordTheory";
import { parseChordSymbol } from "./chordParser";
import { STANDARD_TUNING } from "./fretboard";
import { getAllowedPitchClasses, getRequiredPitchClasses } from "./chordVoicingGenerator";

export interface BassValidationResult {
  isValid: boolean;
  expectedBass: string;
  actualBass: string;
  message: string;
}

export interface ChordDiagnosticInfo {
  detectedChord: string;
  targetSoundingChord: string;
  capo: number;
  selectedPhysicalShape: string;
  frets: (number | "x")[];
  fingeredPitchClasses: string[];
  capoAdjustedPitchClasses: string[];
  requiredPitchClasses: string[];
  missingChordTones: string[];
  foreignChordTones: string[];
  bassValidation: BassValidationResult;
  soundingMatch: boolean;
  finalValidationResult: "VALID" | "INVALID";
  validationMessage: string;
}

const SHARP_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function getNoteName(pc: PitchClass, preferFlat = false): string {
  const normPc = ((pc % 12) + 12) % 12;
  return preferFlat ? FLAT_NOTE_NAMES[normPc] : SHARP_NOTE_NAMES[normPc];
}

/**
 * Computes complete mathematical diagnostic details for a chord voicing given capo and target sounding chord.
 */
export function getChordDiagnosticInfo(
  detectedChord: string,
  targetSoundingChord: string,
  capo: number,
  shapeChord: string,
  frets: (number | "x")[]
): ChordDiagnosticInfo {
  const parsedTarget = parseChordSymbol(targetSoundingChord);
  const preferFlat = targetSoundingChord.includes("b") || targetSoundingChord.startsWith("F");

  if (!parsedTarget.isValid || !parsedTarget.chord) {
    return {
      detectedChord,
      targetSoundingChord,
      capo,
      selectedPhysicalShape: `${shapeChord} [${frets.join(", ")}]`,
      frets,
      fingeredPitchClasses: [],
      capoAdjustedPitchClasses: [],
      requiredPitchClasses: [],
      missingChordTones: [],
      foreignChordTones: [],
      bassValidation: {
        isValid: false,
        expectedBass: "-",
        actualBass: "-",
        message: "Target sounding chord could not be parsed",
      },
      soundingMatch: false,
      finalValidationResult: "INVALID",
      validationMessage: "Target sounding chord syntax invalid",
    };
  }

  const chordDef = parsedTarget.chord;
  const allowedPcsSet = getAllowedPitchClasses(chordDef);
  const requiredPcsSet = getRequiredPitchClasses(chordDef);

  const fingeredPcsList: PitchClass[] = [];
  const capoAdjustedPcsList: PitchClass[] = [];
  const soundingPcsSet = new Set<PitchClass>();

  let lowestBassPc: PitchClass | null = null;
  let frettedCount = 0;

  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    if (f !== "x") {
      frettedCount++;
      // Fingered pitch without capo
      const fingeredMidi = STANDARD_TUNING[s] + f;
      const fingeredPc = ((fingeredMidi % 12) + 12) % 12;
      fingeredPcsList.push(fingeredPc);

      // Sounding pitch with capo offset
      const soundingMidi = STANDARD_TUNING[s] + capo + f;
      const soundingPc = ((soundingMidi % 12) + 12) % 12;
      capoAdjustedPcsList.push(soundingPc);
      soundingPcsSet.add(soundingPc);

      if (lowestBassPc === null) {
        lowestBassPc = soundingPc;
      }
    }
  }

  const fingeredNoteNames = fingeredPcsList.map((pc) => getNoteName(pc, preferFlat));
  const capoAdjustedNoteNames = capoAdjustedPcsList.map((pc) => getNoteName(pc, preferFlat));
  const requiredNoteNames = Array.from(requiredPcsSet).map((pc) => getNoteName(pc, preferFlat));

  // Find missing required chord tones
  const missingPcs = Array.from(requiredPcsSet).filter((pc) => !soundingPcsSet.has(pc));
  const missingChordTones = missingPcs.map((pc) => getNoteName(pc, preferFlat));

  // Find foreign pitch classes
  const foreignPcs = Array.from(soundingPcsSet).filter((pc) => !allowedPcsSet.has(pc));
  const foreignChordTones = foreignPcs.map((pc) => getNoteName(pc, preferFlat));

  // Validate Bass
  const expectedBassPc = chordDef.bass !== undefined ? chordDef.bass : chordDef.root;
  const expectedBassName = getNoteName(expectedBassPc, preferFlat);
  const actualBassName = lowestBassPc !== null ? getNoteName(lowestBassPc, preferFlat) : "None";

  let bassValid = true;
  let bassMessage = "PASS: Bass pitch class matches required root/bass";

  if (lowestBassPc === null) {
    bassValid = false;
    bassMessage = "FAIL: No playable notes on fretboard";
  } else if (lowestBassPc !== expectedBassPc) {
    bassValid = false;
    bassMessage = `FAIL: Expected lowest note ${expectedBassName}, but got ${actualBassName}`;
  }

  // Sounding Match check
  const hasEnoughNotes = frettedCount >= 3;
  const soundingMatch =
    hasEnoughNotes &&
    missingPcs.length === 0 &&
    foreignPcs.length === 0 &&
    bassValid;

  const finalValidationResult: "VALID" | "INVALID" = soundingMatch ? "VALID" : "INVALID";

  let validationMessage = "PASS: Fingering + capo offset perfectly matches target sounding chord";
  if (!hasEnoughNotes) {
    validationMessage = "FAIL: Less than 3 fretted notes";
  } else if (foreignPcs.length > 0) {
    validationMessage = `FAIL: Foreign notes present (${foreignChordTones.join(", ")})`;
  } else if (missingPcs.length > 0) {
    validationMessage = `FAIL: Missing required chord tones (${missingChordTones.join(", ")})`;
  } else if (!bassValid) {
    validationMessage = bassMessage;
  }

  return {
    detectedChord,
    targetSoundingChord,
    capo,
    selectedPhysicalShape: `${shapeChord} [${frets.join(", ")}]`,
    frets,
    fingeredPitchClasses: fingeredNoteNames,
    capoAdjustedPitchClasses: capoAdjustedNoteNames,
    requiredPitchClasses: requiredNoteNames,
    missingChordTones,
    foreignChordTones,
    bassValidation: {
      isValid: bassValid,
      expectedBass: expectedBassName,
      actualBass: actualBassName,
      message: bassMessage,
    },
    soundingMatch,
    finalValidationResult,
    validationMessage,
  };
}
