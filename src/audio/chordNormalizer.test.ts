// Test Suite for Chord Normalization, Enharmonic Spelling & Guitar Voicing Resolution

import { parseChordLabel, normalizeChord, isValidChordLabel } from "./chordNormalizer";
import { resolveGuitarChord } from "./guitarChordResolver";

export function runChordNormalizationTests() {
  const results: Array<{ input: string; valid: boolean; canonical: string; display: string; voicingType: string }> = [];

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
    
    // Malformed inputs
    { input: "Cm7A/A#", expectedCanonical: "Unknown chord", expectedValid: false },
    { input: "CminorBb", expectedCanonical: "Unknown chord", expectedValid: false },
    { input: "GmajB", expectedCanonical: "Unknown chord", expectedValid: false },
    { input: "C/C", expectedCanonical: "C", expectedValid: true }, // Bass === Root rule
    { input: "unknown", expectedCanonical: "Unknown chord", expectedValid: false },
    { input: "", expectedCanonical: "Unknown chord", expectedValid: false },
  ];

  for (const tc of testCases) {
    const norm = parseChordLabel(tc.input);
    const voicingRes = resolveGuitarChord(tc.input);

    const isMatch = norm.isValid === tc.expectedValid && norm.canonicalLabel === tc.expectedCanonical;
    if (!isMatch) {
      console.warn(`[TEST FAIL] Input: "${tc.input}" -> Got canonical: "${norm.canonicalLabel}", valid: ${norm.isValid}. Expected canonical: "${tc.expectedCanonical}", valid: ${tc.expectedValid}`);
    } else {
      console.log(`[TEST PASS] Input: "${tc.input}" -> Canonical: "${norm.canonicalLabel}", Display: "${voicingRes.displayChord}", VoicingType: "${voicingRes.voicingType}"`);
    }

    results.push({
      input: tc.input,
      valid: norm.isValid,
      canonical: norm.canonicalLabel,
      display: voicingRes.displayChord,
      voicingType: voicingRes.voicingType
    });
  }

  return results;
}
