import { describe, it, expect } from "vitest";
import { calculateStartFret } from "../components/ChordDiagram";
import { validateChordDatabase } from "./chordValidation";
import { CHORD_DATABASE } from "../data/chordDatabase";

describe("Chord Diagram Rendering & Start Fret Calculation", () => {
  it("validates the CHORD_DATABASE without syntax errors", () => {
    const report = validateChordDatabase(CHORD_DATABASE);
    expect(report.invalidCount).toBe(0);
  });

  it("calculates correct startFret for open and barre positions", () => {
    const testCases = [
      {
        name: "C Major Open",
        frets: ["x", 3, 2, 0, 1, 0],
        barre: undefined,
        expectedStartFret: 1,
      },
      {
        name: "C Major A-shape (3rd fret)",
        frets: ["x", 3, 5, 5, 5, 3],
        barre: { fret: 3, fromString: 1, toString: 5 },
        expectedStartFret: 3,
      },
      {
        name: "C Major E-shape (8th fret)",
        frets: [8, 10, 10, 9, 8, 8],
        barre: { fret: 8, fromString: 0, toString: 5 },
        expectedStartFret: 8,
      },
      {
        name: "F Major",
        frets: [1, 3, 3, 2, 1, 1],
        barre: { fret: 1, fromString: 0, toString: 5 },
        expectedStartFret: 1,
      },
      {
        name: "F# Minor",
        frets: [2, 4, 4, 2, 2, 2],
        barre: { fret: 2, fromString: 0, toString: 5 },
        expectedStartFret: 2,
      },
    ];

    for (const tc of testCases) {
      const startFret = calculateStartFret(tc.frets as (number | "x")[], tc.barre);
      expect(startFret).toBe(tc.expectedStartFret);
    }
  });
});

export function runChordDiagramTests() {
  console.log("=== RUNNING CHORD DATABASE & DIAGRAM TESTS ===");

  // 1. Validate the entire CHORD_DATABASE
  const report = validateChordDatabase(CHORD_DATABASE);
  console.log(`[DATABASE VALIDATION] Total: ${report.totalChecked}, Valid: ${report.validCount}, Errors: ${report.invalidCount}`);
  if (report.errors.length > 0) {
    report.errors.forEach(e => {
      console.warn(`[CHORD DATA ERROR] ${e.chordId} (${e.chordName}): ${e.error}`);
    });
  }

  // 2. Test exact chord cases specified in requirements
  const testCases = [
    {
      name: "C Major Open",
      frets: ["x", 3, 2, 0, 1, 0],
      barre: undefined,
      expectedStartFret: 1,
      isOpen: true,
    },
    {
      name: "C Major A-shape (3rd fret)",
      frets: ["x", 3, 5, 5, 5, 3],
      barre: { fret: 3, fromString: 1, toString: 5 },
      expectedStartFret: 3,
      isOpen: false,
    },
    {
      name: "C Major E-shape (8th fret)",
      frets: [8, 10, 10, 9, 8, 8],
      barre: { fret: 8, fromString: 0, toString: 5 },
      expectedStartFret: 8,
      isOpen: false,
    },
    {
      name: "F Major",
      frets: [1, 3, 3, 2, 1, 1],
      barre: { fret: 1, fromString: 0, toString: 5 },
      expectedStartFret: 1,
      isOpen: true,
    },
    {
      name: "F# Minor",
      frets: [2, 4, 4, 2, 2, 2],
      barre: { fret: 2, fromString: 0, toString: 5 },
      expectedStartFret: 2,
      isOpen: false,
    },
    {
      name: "G Minor",
      frets: [3, 5, 5, 3, 3, 3],
      barre: { fret: 3, fromString: 0, toString: 5 },
      expectedStartFret: 3,
      isOpen: false,
    },
    {
      name: "B Minor 7",
      frets: ["x", 2, 4, 2, 3, 2],
      barre: { fret: 2, fromString: 1, toString: 5 },
      expectedStartFret: 2,
      isOpen: false,
    },
    {
      name: "G Major 9",
      frets: [3, "x", 4, 2, 3, "x"],
      barre: undefined,
      expectedStartFret: 1, // frets 2,3,4 fit within 1..5 open position
      isOpen: true,
    },
    {
      name: "D Minor 9",
      frets: ["x", 5, 3, 5, 5, "x"],
      barre: undefined,
      expectedStartFret: 1, // frets 3,5 fit within 1..5
      isOpen: true,
    },
    {
      name: "E7#9 (Hendrix Chord)",
      frets: [0, 7, 6, 7, 8, "x"],
      barre: undefined,
      expectedStartFret: 6, // frets 6,7,8 -> starts at 6
      isOpen: false,
    },
  ];

  let testPassed = 0;
  for (const tc of testCases) {
    const startFret = calculateStartFret(tc.frets as (number | "x")[], tc.barre);
    const isOpen = startFret === 1;

    const pass = startFret === tc.expectedStartFret && isOpen === tc.isOpen;
    if (pass) {
      testPassed++;
      console.log(`[PASS] ${tc.name}: startFret=${startFret} (${isOpen ? "open nut" : `${startFret}fr label`})`);
    } else {
      console.warn(`[FAIL] ${tc.name}: got startFret=${startFret}, expected ${tc.expectedStartFret}`);
    }
  }

  console.log(`[TEST RESULTS] Passed ${testPassed}/${testCases.length} chord diagram test cases.`);
  return { report, testPassed, totalTests: testCases.length };
}
