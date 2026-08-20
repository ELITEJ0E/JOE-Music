import { ChordVoicing } from "../types";
import { parseChordLabel, pitchClassOfNote, normalizeNoteSpelling } from "../audio/chordNormalizer";
import { findChordByName, CHORD_DATABASE } from "../data/chordDatabase";

// Standard tuning open string pitch classes (Low E to High E)
const OPEN_STRING_PITCH_CLASSES = [4, 9, 2, 7, 11, 4]; // E, A, D, G, B, E
const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export interface VoicingVerificationResult {
  detectedChord: string;
  requiredPitchClasses: string[];
  selectedVoicingName: string;
  selectedFrets: string;
  actualPitchClasses: string[];
  missingChordTones: string[];
  voicingType: "exact" | "simplified" | "none";
  omissionReason?: string;
}

// Get required intervals (semitones from root) for quality
function getRequiredIntervals(quality: string): number[] {
  const q = quality.toLowerCase();
  switch (q) {
    case "":
    case "maj":
    case "major":
      return [0, 4, 7]; // Root, M3, P5
    case "min":
    case "minor":
    case "m":
    case "-":
      return [0, 3, 7]; // Root, m3, P5
    case "7":
      return [0, 4, 7, 10]; // Root, M3, P5, m7
    case "maj7":
      return [0, 4, 7, 11]; // Root, M3, P5, M7
    case "m7":
    case "min7":
      return [0, 3, 7, 10]; // Root, m3, P5, m7
    case "add9":
      return [0, 4, 7, 2]; // Root, M3, P5, M9
    case "sus4":
    case "sus":
      return [0, 5, 7]; // Root, P4, P5
    case "sus2":
      return [0, 2, 7]; // Root, M2, P5
    default:
      return [0, 4, 7]; // Default major triad
  }
}

export function getVoicingPitchClasses(frets: (number | "x")[]): number[] {
  const set = new Set<number>();
  frets.forEach((f, sIdx) => {
    if (typeof f === "number" && f >= 0) {
      const pc = (OPEN_STRING_PITCH_CLASSES[sIdx] + f) % 12;
      set.add(pc);
    }
  });
  return Array.from(set).sort((a, b) => a - b);
}

export function verifyVoicingForChord(
  chordLabel: string,
  voicingOverride?: ChordVoicing
): VoicingVerificationResult {
  const norm = parseChordLabel(chordLabel);
  if (!norm.isValid) {
    return {
      detectedChord: chordLabel,
      requiredPitchClasses: [],
      selectedVoicingName: "None",
      selectedFrets: "N/A",
      actualPitchClasses: [],
      missingChordTones: ["Invalid chord"],
      voicingType: "none",
      omissionReason: "Invalid chord specification"
    };
  }

  const rootPc = pitchClassOfNote(norm.root);
  const intervals = getRequiredIntervals(norm.quality);
  const requiredPcSet = new Set(intervals.map(iv => (rootPc + iv) % 12));
  const requiredPitchClasses = Array.from(requiredPcSet).map(pc => PITCH_NAMES[pc]);

  // Find voicing: use override if provided, else lookup in database
  let voicing = voicingOverride;
  if (!voicing) {
    const found = findChordByName(chordLabel);
    if (found) voicing = found;
  }

  if (!voicing) {
    return {
      detectedChord: chordLabel,
      requiredPitchClasses,
      selectedVoicingName: "None found",
      selectedFrets: "None",
      actualPitchClasses: [],
      missingChordTones: requiredPitchClasses,
      voicingType: "none",
      omissionReason: "No guitar voicing available in database"
    };
  }

  const actualPcs = getVoicingPitchClasses(voicing.frets);
  const actualPitchClasses = actualPcs.map(pc => PITCH_NAMES[pc]);

  // Check which required pitch classes are missing
  const missingPcs: number[] = [];
  for (const reqPc of requiredPcSet) {
    if (!actualPcs.includes(reqPc)) {
      missingPcs.push(reqPc);
    }
  }

  const missingChordTones = missingPcs.map(pc => PITCH_NAMES[pc]);
  const isExact = missingChordTones.length === 0;

  let voicingType: "exact" | "simplified" | "none" = isExact ? "exact" : "none";
  let omissionReason: string | undefined = undefined;

  if (!isExact) {
    omissionReason = `Omitted required tone(s): ${missingChordTones.join(", ")}`;
  }

  return {
    detectedChord: chordLabel,
    requiredPitchClasses,
    selectedVoicingName: voicing.name,
    selectedFrets: voicing.frets.join(", "),
    actualPitchClasses,
    missingChordTones,
    voicingType,
    omissionReason
  };
}

export function runFinalVerificationTests() {
  console.log("==================================================");
  console.log("FINAL CHORD VOICING SEMANTIC VERIFICATION REPORT");
  console.log("==================================================");

  const aOpenVoicing = findChordByName("A"); // x02220
  const cOpenVoicing = findChordByName("C"); // x32010
  const amOpenVoicing = findChordByName("Am"); // x02210

  const testScenarios = [
    {
      name: "1. A (Exact open A voicing)",
      chord: "A",
      voicing: aOpenVoicing
    },
    {
      name: "2. Aadd9 (Looking up Aadd9 voicing)",
      chord: "Aadd9",
      voicing: findChordByName("Aadd9") // Should be undefined or custom
    },
    {
      name: "3. Aadd9 evaluated with plain A voicing (x02220)",
      chord: "Aadd9",
      voicing: aOpenVoicing
    },
    {
      name: "4. C (Exact open C voicing)",
      chord: "C",
      voicing: cOpenVoicing
    },
    {
      name: "5. Cmaj7 evaluated with plain C voicing (x32010)",
      chord: "Cmaj7",
      voicing: cOpenVoicing
    },
    {
      name: "6. Am7 evaluated with plain Am voicing (x02210)",
      chord: "Am7",
      voicing: amOpenVoicing
    },
    {
      name: "7. Csus4 evaluated with plain C voicing (x32010)",
      chord: "Csus4",
      voicing: cOpenVoicing
    }
  ];

  const results = testScenarios.map(sc => {
    const res = verifyVoicingForChord(sc.chord, sc.voicing);
    return {
      scenario: sc.name,
      ...res
    };
  });

  console.table(results.map(r => ({
    "Test Scenario": r.scenario,
    "Detected Chord": r.detectedChord,
    "Required PITCHES": r.requiredPitchClasses.join(", "),
    "Selected Voicing": r.selectedVoicingName,
    "Actual PITCHES": r.actualPitchClasses.join(", "),
    "Missing Tones": r.missingChordTones.length > 0 ? r.missingChordTones.join(", ") : "None",
    "Voicing Type": r.voicingType,
    "Reason": r.omissionReason || "All tones present"
  })));

  return results;
}
