import { describe, it, expect } from "vitest";
import { ChordVoicing } from "../types";
import { parseChordLabel, pitchClassOfNote, normalizeNoteSpelling } from "../audio/chordNormalizer";
import { findChordByName, CHORD_DATABASE } from "../data/chordDatabase";
import { resolveGuitarChord } from "../audio/guitarChordResolver";
import { resolvePowerChord } from "../audio/powerChordResolver";
import { buildChord, getDefiningPitchClasses, getRequiredPitchClasses, ALL_SUPPORTED_QUALITIES } from "../music/chordTheory";
import { generateVoicings, validateVoicingSounding, getStringPitchClass } from "../music/chordVoicingGenerator";
import { getChordsForDictionary } from "../music/chordIntegration";

describe("Chord Library Accuracy & Procedural Engine Pass", () => {
  it("strictly validates C vs Cm harmonic distinction (never identical shapes)", () => {
    const cMajorDef = buildChord("C", "maj");
    const cMinorDef = buildChord("C", "min");

    const cMajorVoicings = generateVoicings(cMajorDef);
    const cMinorVoicings = generateVoicings(cMinorDef);

    expect(cMajorVoicings.length).toBeGreaterThan(0);
    expect(cMinorVoicings.length).toBeGreaterThan(0);

    const cMajorFretKeys = new Set(cMajorVoicings.map(v => v.frets.join(",")));
    const cMinorFretKeys = new Set(cMinorVoicings.map(v => v.frets.join(",")));

    // Ensure no overlapping fretboard shapes between C major and C minor
    for (const key of cMajorFretKeys) {
      expect(cMinorFretKeys.has(key)).toBe(false);
    }

    // Check that C major contains E (pitch class 4) and not Eb (3)
    const topCMajor = cMajorVoicings[0];
    const cMajPcs = topCMajor.frets
      .map((f, s) => f !== "x" ? getStringPitchClass(s, f) : null)
      .filter((pc): pc is number => pc !== null);
    expect(cMajPcs).toContain(4); // E
    expect(cMajPcs).not.toContain(3); // Eb

    // Check that C minor contains Eb (pitch class 3) and not E (4)
    const topCMinor = cMinorVoicings[0];
    const cMinPcs = topCMinor.frets
      .map((f, s) => f !== "x" ? getStringPitchClass(s, f) : null)
      .filter((pc): pc is number => pc !== null);
    expect(cMinPcs).toContain(3); // Eb
    expect(cMinPcs).not.toContain(4); // E
  });

  it("strictly distinguishes C7, Cm7, and Cmaj7 defining quality tones", () => {
    const c7Def = buildChord("C", "7");
    const cm7Def = buildChord("C", "m7");
    const cmaj7Def = buildChord("C", "maj7");

    const c7Voicings = generateVoicings(c7Def);
    const cm7Voicings = generateVoicings(cm7Def);
    const cmaj7Voicings = generateVoicings(cmaj7Def);

    expect(c7Voicings.length).toBeGreaterThan(0);
    expect(cm7Voicings.length).toBeGreaterThan(0);
    expect(cmaj7Voicings.length).toBeGreaterThan(0);

    // C7 must contain E (4) and Bb (10)
    const topC7 = c7Voicings[0];
    const c7Pcs = topC7.frets.map((f, s) => f !== "x" ? getStringPitchClass(s, f) : null).filter((pc): pc is number => pc !== null);
    expect(c7Pcs).toContain(0); // C
    expect(c7Pcs).toContain(4); // E
    expect(c7Pcs).toContain(10); // Bb

    // Cm7 must contain Eb (3) and Bb (10)
    const topCm7 = cm7Voicings[0];
    const cm7Pcs = topCm7.frets.map((f, s) => f !== "x" ? getStringPitchClass(s, f) : null).filter((pc): pc is number => pc !== null);
    expect(cm7Pcs).toContain(0); // C
    expect(cm7Pcs).toContain(3); // Eb
    expect(cm7Pcs).toContain(10); // Bb

    // Cmaj7 must contain E (4) and B (11)
    const topCmaj7 = cmaj7Voicings[0];
    const cmaj7Pcs = topCmaj7.frets.map((f, s) => f !== "x" ? getStringPitchClass(s, f) : null).filter((pc): pc is number => pc !== null);
    expect(cmaj7Pcs).toContain(0); // C
    expect(cmaj7Pcs).toContain(4); // E
    expect(cmaj7Pcs).toContain(11); // B
  });

  it("prioritizes open and canonical CAGED shapes at the top of ranking", () => {
    // Open C Major: x,3,2,0,1,0
    const cMaj = generateVoicings(buildChord("C", "maj"));
    expect(cMaj[0].frets.join(",")).toBe("x,3,2,0,1,0");
    expect(cMaj[0].type).toBe("exact");

    // Open A Major: x,0,2,2,2,0
    const aMaj = generateVoicings(buildChord("A", "maj"));
    expect(aMaj[0].frets.join(",")).toBe("x,0,2,2,2,0");
    expect(aMaj[0].type).toBe("exact");

    // Open G Major: 3,2,0,0,0,3 or 3,2,0,0,3,3
    const gMaj = generateVoicings(buildChord("G", "maj"));
    expect(["3,2,0,0,0,3", "3,2,0,0,3,3"]).toContain(gMaj[0].frets.join(","));
    expect(gMaj[0].type).toBe("exact");

    // Open E Major: 0,2,2,1,0,0
    const eMaj = generateVoicings(buildChord("E", "maj"));
    expect(eMaj[0].frets.join(",")).toBe("0,2,2,1,0,0");
    expect(eMaj[0].type).toBe("exact");

    // Open D Major: x,x,0,2,3,2
    const dMaj = generateVoicings(buildChord("D", "maj"));
    expect(dMaj[0].frets.join(",")).toBe("x,x,0,2,3,2");
    expect(dMaj[0].type).toBe("exact");

    // F Major barre (1st fret E-shape): 1,3,3,2,1,1
    const fMaj = generateVoicings(buildChord("F", "maj"));
    expect(fMaj[0].frets.join(",")).toBe("1,3,3,2,1,1");
    expect(fMaj[0].type).toBe("exact");

    // B Minor barre (2nd fret A-shape): x,2,4,4,3,2
    const bMin = generateVoicings(buildChord("B", "min"));
    expect(bMin[0].frets.join(",")).toBe("x,2,4,4,3,2");
    expect(bMin[0].type).toBe("exact");
  });

  it("strictly verifies slash bass note on inverted chords", () => {
    // C/E must have E (pc 4) as the lowest note
    const cSlashE = buildChord("C", "maj", "E");
    const cSlashEVoicings = generateVoicings(cSlashE);
    expect(cSlashEVoicings.length).toBeGreaterThan(0);
    const topVoicing = cSlashEVoicings[0];
    let lowestPc: number | null = null;
    for (let s = 0; s < 6; s++) {
      if (topVoicing.frets[s] !== "x") {
        lowestPc = getStringPitchClass(s, topVoicing.frets[s] as number);
        break;
      }
    }
    expect(lowestPc).toBe(4); // E
  });

  it("verifies dictionary generates voicings for all supported qualities", () => {
    expect(ALL_SUPPORTED_QUALITIES.length).toBeGreaterThanOrEqual(18);
    const cAllVoicings = getChordsForDictionary("C", "All", "ALL", "");
    expect(cAllVoicings.length).toBeGreaterThan(30);

    // Verify presence of complex qualities in results
    const foundQualities = new Set(cAllVoicings.map(v => v.quality));
    expect(foundQualities.has("7")).toBe(true);
    expect(foundQualities.has("maj7")).toBe(true);
    expect(foundQualities.has("m7")).toBe(true);
    expect(foundQualities.has("dim")).toBe(true);
    expect(foundQualities.has("aug")).toBe(true);
    expect(foundQualities.has("sus4")).toBe(true);
    expect(foundQualities.has("add9")).toBe(true);
  });
});

describe("Chord Voicing Semantic Verification", () => {
  it("strictly validates voicing chord tones against chord formula", () => {
    const aOpenVoicing = findChordByName("A");
    expect(aOpenVoicing).toBeDefined();

    const verifiedA = verifyVoicingForChord("A", aOpenVoicing!);
    expect(verifiedA.voicingType).toBe("exact");
    expect(verifiedA.missingChordTones.length).toBe(0);

    const verifiedAadd9 = verifyVoicingForChord("Aadd9", aOpenVoicing!);
    expect(verifiedAadd9.missingChordTones).toContain("B");
    expect(verifiedAadd9.voicingType).toBe("none");
  });
});

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
  voicingType: "exact" | "simplified" | "generated" | "none";
  omissionReason?: string;
}

// Get required intervals (semitones from root) for quality
function getRequiredIntervals(quality: string): number[] {
  const q = quality.toLowerCase();
  switch (q) {
    case "5":
      return [0, 7]; // Root, P5
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

  // Find voicing: use override if provided, else lookup in resolver
  let voicing = voicingOverride;
  let detectedVoicingType: "exact" | "simplified" | "generated" | "none" = "exact";

  if (!voicing) {
    const res = resolveGuitarChord(chordLabel);
    voicing = res.voicing || undefined;
    detectedVoicingType = res.voicingType;
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
      omissionReason: "No guitar voicing available"
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

  let voicingType: "exact" | "simplified" | "generated" | "none" = isExact
    ? (voicing.voicingType === "generated" || detectedVoicingType === "generated" ? "generated" : "exact")
    : "none";
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
      voicing: undefined // Resolver should return none
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
    },
    {
      name: "8. A5 (Procedural power chord resolver)",
      chord: "A5",
      voicing: undefined // Should resolve to generated A5 [x, 0, 2, 2, x, x]
    },
    {
      name: "9. B5 (Procedural power chord resolver)",
      chord: "B5",
      voicing: undefined // Should resolve to generated B5 [x, 2, 4, 4, x, x]
    },
    {
      name: "10. C5 (Procedural power chord resolver)",
      chord: "C5",
      voicing: undefined // Should resolve to generated C5 [x, 3, 5, 5, x, x]
    },
    {
      name: "11. D5 (Procedural power chord resolver)",
      chord: "D5",
      voicing: undefined // Should resolve to generated D5 [x, 5, 7, 7, x, x]
    },
    {
      name: "12. E5 (Procedural power chord resolver)",
      chord: "E5",
      voicing: undefined // Should resolve to generated E5 [0, 2, 2, x, x, x]
    },
    {
      name: "13. F5 (Procedural power chord resolver)",
      chord: "F5",
      voicing: undefined // Should resolve to generated F5 [1, 3, 3, x, x, x]
    },
    {
      name: "14. G5 (Procedural power chord resolver)",
      chord: "G5",
      voicing: undefined // Should resolve to generated G5 [3, 5, 5, x, x, x]
    },
    {
      name: "15. A5/C# (Slash power chord - must be rejected)",
      chord: "A5/C#",
      voicing: undefined // Should return none
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
