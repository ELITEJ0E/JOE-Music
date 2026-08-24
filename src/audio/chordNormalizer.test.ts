import { describe, it, expect } from "vitest";
import { parseChordLabel, normalizeChord, isValidChordLabel, pitchClassOfNote } from "./chordNormalizer";
import { resolveGuitarChord } from "./guitarChordResolver";
import { resolvePowerChord, verifyPowerChordNotes } from "./powerChordResolver";
import { findChordByName } from "../data/chordDatabase";

describe("Chord Normalizer & Power Chord Resolver", () => {
  it("normalizes and validates all standard and procedural chords", () => {
    const testCases = [
      { input: "C", expectedCanonical: "C", expectedValid: true },
      { input: "Cm", expectedCanonical: "Cm", expectedValid: true },
      { input: "Cm7", expectedCanonical: "Cm7", expectedValid: true },
      { input: "Cmaj7", expectedCanonical: "Cmaj7", expectedValid: true },
      { input: "C7", expectedCanonical: "C7", expectedValid: true },
      { input: "Cadd9", expectedCanonical: "Cadd9", expectedValid: true },
      { input: "Csus4", expectedCanonical: "Csus4", expectedValid: true },
      { input: "G/B", expectedCanonical: "G/B", expectedValid: true },
      { input: "D/F#", keyContext: "D", expectedCanonical: "D/F#", expectedValid: true },
      { input: "Am/C", expectedCanonical: "Am/C", expectedValid: true },
      { input: "Cm7/Bb", expectedCanonical: "Cm7/Bb", expectedValid: true },
      { input: "Fmaj7/A", expectedCanonical: "Fmaj7/A", expectedValid: true },
      { input: "Bb/D", expectedCanonical: "Bb/D", expectedValid: true },
      { input: "A5", expectedCanonical: "A5", expectedValid: true, expectedVoicingType: "generated" },
      { input: "C5", expectedCanonical: "C5", expectedValid: true, expectedVoicingType: "generated" },
      { input: "E5", expectedCanonical: "E5", expectedValid: true, expectedVoicingType: "generated" },
      { input: "A5/C#", keyContext: "A", expectedCanonical: "A5/C#", expectedValid: true },
      { input: "Aadd9", expectedCanonical: "Aadd9", expectedValid: true, expectedVoicingType: "exact" },
      { input: "unknown", expectedCanonical: "Unknown chord", expectedValid: false },
    ];

    for (const tc of testCases) {
      const norm = parseChordLabel(tc.input, (tc as any).keyContext);
      const voicingRes = resolveGuitarChord(tc.input, { keyContext: (tc as any).keyContext });

      expect(norm.isValid).toBe(tc.expectedValid);
      expect(norm.canonicalLabel).toBe(tc.expectedCanonical);
      if (tc.expectedVoicingType) {
        expect(voicingRes.voicingType).toBe(tc.expectedVoicingType);
      }
    }
  });

  it("procedurally generates valid power chords on 6th and 5th strings", () => {
    const eShape = resolvePowerChord("E");
    expect(eShape?.frets).toEqual([0, 2, 2, "x", "x", "x"]);
    expect(eShape?.cagedShape).toBe("E");

    const aShape = resolvePowerChord("A");
    expect(aShape?.frets).toEqual(["x", 0, 2, 2, "x", "x"]);
    expect(aShape?.cagedShape).toBe("A");
  });
});

export function runChordNormalizationTests() {
  const results: Array<{ input: string; valid: boolean; canonical: string; display: string; voicingType: string; status: "PASS" | "FAIL"; details?: string }> = [];

  const testCases = [
    { input: "C", expectedCanonical: "C", expectedValid: true },
    { input: "Cm", expectedCanonical: "Cm", expectedValid: true },
    { input: "Cm7", expectedCanonical: "Cm7", expectedValid: true },
    { input: "Cmaj7", expectedCanonical: "Cmaj7", expectedValid: true },
    { input: "C7", expectedCanonical: "C7", expectedValid: true },
    { input: "Cadd9", expectedCanonical: "Cadd9", expectedValid: true },
    { input: "Csus4", expectedCanonical: "Csus4", expectedValid: true },
    { input: "G/B", expectedCanonical: "G/B", expectedValid: true },
    { input: "D/F#", expectedCanonical: "D/F#", expectedValid: true },
    { input: "Am/C", expectedCanonical: "Am/C", expectedValid: true },
    { input: "Cm7/Bb", expectedCanonical: "Cm7/Bb", expectedValid: true },
    { input: "Fmaj7/A", expectedCanonical: "Fmaj7/A", expectedValid: true },
    { input: "Bb/D", expectedCanonical: "Bb/D", expectedValid: true },
    { input: "A#/C#", expectedCanonical: "Bb/Db", expectedValid: true }, // Default flat key context
    
    // Procedural Power Chords (Section 8 & 11)
    { input: "A5", expectedCanonical: "A5", expectedValid: true, expectedVoicingType: "generated" },
    { input: "B5", expectedCanonical: "B5", expectedValid: true, expectedVoicingType: "generated" },
    { input: "C5", expectedCanonical: "C5", expectedValid: true, expectedVoicingType: "generated" },
    { input: "D5", expectedCanonical: "D5", expectedValid: true, expectedVoicingType: "generated" },
    { input: "E5", expectedCanonical: "E5", expectedValid: true, expectedVoicingType: "generated" },
    { input: "F5", expectedCanonical: "F5", expectedValid: true, expectedVoicingType: "generated" },
    { input: "G5", expectedCanonical: "G5", expectedValid: true, expectedVoicingType: "generated" },
    { input: "F#5", keyContext: "D", expectedCanonical: "F#5", expectedValid: true, expectedVoicingType: "generated" },
    { input: "Gb5", expectedCanonical: "Gb5", expectedValid: true, expectedVoicingType: "generated" },
    { input: "Bb5", expectedCanonical: "Bb5", expectedValid: true, expectedVoicingType: "generated" },

    // Power chord slash chord restrictions
    { input: "A5/C#", keyContext: "A", expectedCanonical: "A5/C#", expectedValid: true, expectedVoicingType: "none" },

    // Semantic protection: Aadd9 must NOT resolve to A
    { input: "Aadd9", expectedCanonical: "Aadd9", expectedValid: true, expectedVoicingType: "none" },

    // Malformed inputs
    { input: "Cm7A/A#", expectedCanonical: "Unknown chord", expectedValid: false },
    { input: "CminorBb", expectedCanonical: "Unknown chord", expectedValid: false },
    { input: "GmajB", expectedCanonical: "Unknown chord", expectedValid: false },
    { input: "C/C", expectedCanonical: "C", expectedValid: true }, // Bass === Root rule
    { input: "unknown", expectedCanonical: "Unknown chord", expectedValid: false },
    { input: "", expectedCanonical: "Unknown chord", expectedValid: false },
  ];

  for (const tc of testCases) {
    const norm = parseChordLabel(tc.input, (tc as any).keyContext);
    const voicingRes = resolveGuitarChord(tc.input, { keyContext: (tc as any).keyContext });

    let isMatch = norm.isValid === tc.expectedValid && norm.canonicalLabel === tc.expectedCanonical;
    if (tc.expectedVoicingType && voicingRes.voicingType !== tc.expectedVoicingType) {
      isMatch = false;
    }

    const status = isMatch ? "PASS" : "FAIL";
    if (!isMatch) {
      console.warn(`[TEST FAIL] Input: "${tc.input}" -> Got canonical: "${norm.canonicalLabel}", valid: ${norm.isValid}, voicingType: "${voicingRes.voicingType}". Expected: canonical: "${tc.expectedCanonical}", valid: ${tc.expectedValid}, voicingType: "${tc.expectedVoicingType || 'any'}"`);
    } else {
      console.log(`[TEST PASS] Input: "${tc.input}" -> Canonical: "${norm.canonicalLabel}", Display: "${voicingRes.displayChord}", VoicingType: "${voicingRes.voicingType}"`);
    }

    results.push({
      input: tc.input,
      valid: norm.isValid,
      canonical: norm.canonicalLabel,
      display: voicingRes.displayChord,
      voicingType: voicingRes.voicingType,
      status
    });
  }

  // Procedural Power Chord Shape & Note Content Verification
  const powerChordVerifications = [
    { root: "A", expectedFrets: ["x", 0, 2, 2, "x", "x"], shape: "A" },
    { root: "B", expectedFrets: ["x", 2, 4, 4, "x", "x"], shape: "A" },
    { root: "C", expectedFrets: ["x", 3, 5, 5, "x", "x"], shape: "A" },
    { root: "D", expectedFrets: ["x", 5, 7, 7, "x", "x"], shape: "A" },
    { root: "E", expectedFrets: [0, 2, 2, "x", "x", "x"], shape: "E" },
    { root: "F", expectedFrets: [1, 3, 3, "x", "x", "x"], shape: "E" },
    { root: "G", expectedFrets: [3, 5, 5, "x", "x", "x"], shape: "E" },
  ];

  for (const pv of powerChordVerifications) {
    const v = resolvePowerChord(pv.root);
    if (!v) {
      console.error(`[POWER CHORD FAIL] resolvePowerChord("${pv.root}") returned null`);
      continue;
    }
    const fretsMatch = JSON.stringify(v.frets) === JSON.stringify(pv.expectedFrets);
    const rootPc = pitchClassOfNote(pv.root);
    const fifthPc = (rootPc + 7) % 12;
    const notesValid = verifyPowerChordNotes(v.frets, rootPc, fifthPc);

    if (fretsMatch && notesValid && v.cagedShape === pv.shape && v.voicingType === "generated" && v.voicingConfidence === 0.9) {
      console.log(`[POWER CHORD PASS] ${pv.root}5 -> Frets: [${v.frets.join(", ")}], Shape: ${v.cagedShape}, Confidence: ${v.voicingConfidence}`);
    } else {
      console.error(`[POWER CHORD FAIL] ${pv.root}5 -> Got Frets: [${v.frets.join(", ")}], Expected: [${pv.expectedFrets.join(", ")}]`);
    }
  }

  // Strict semantic separation assertions
  const a5Voicing = resolveGuitarChord("A5").voicing;
  const aTriadVoicing = findChordByName("A");
  const amTriadVoicing = findChordByName("Am");
  if (a5Voicing && aTriadVoicing && JSON.stringify(a5Voicing.frets) !== JSON.stringify(aTriadVoicing.frets)) {
    console.log("[SEMANTIC PASS] A5 (x022xx) != A major triad (x02220)");
  }
  if (a5Voicing && amTriadVoicing && JSON.stringify(a5Voicing.frets) !== JSON.stringify(amTriadVoicing.frets)) {
    console.log("[SEMANTIC PASS] A5 (x022xx) != Am triad (x02210)");
  }

  return results;
}
