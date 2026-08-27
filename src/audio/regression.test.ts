import { describe, it, expect } from "vitest";
import { stabilizeChordSegments } from "./harmonicStabilizer";
import { ChordSegment } from "../types";

describe("Regression Tests", () => {
  it("E -> B -> C#m7 -> A -> E -> F#m7 -> Bsus4 -> E (No transient slash chords)", () => {
    // A sequence with a transient slash E/B
    const rawSegments: ChordSegment[] = [
      { id: "1", chord: "E", startTime: 0, endTime: 2, confidence: 90, stability: 90 },
      { id: "2", chord: "B", startTime: 2, endTime: 4, confidence: 85, stability: 90 },
      { id: "3", chord: "C#m7", startTime: 4, endTime: 6, confidence: 80, stability: 90 },
      { id: "4", chord: "A", startTime: 6, endTime: 8, confidence: 88, stability: 90 },
      { id: "5", chord: "E", startTime: 8, endTime: 9.5, confidence: 90, stability: 90 },
      { id: "6", chord: "E/B", startTime: 9.5, endTime: 10, confidence: 75, stability: 80 }, // Transient slash
      { id: "7", chord: "F#m7", startTime: 10, endTime: 12, confidence: 85, stability: 90 },
      { id: "8", chord: "Bsus4", startTime: 12, endTime: 14, confidence: 80, stability: 90 },
      { id: "9", chord: "E", startTime: 14, endTime: 16, confidence: 95, stability: 90 },
    ];

    const result = stabilizeChordSegments(rawSegments, {
      beats: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      tempo: 120,
      keyContext: "E Major",
      duration: 16
    });

    const chords = result.segments.map(s => s.chord);
    
    // Check that E/B was absorbed by E or F#m7
    expect(chords).not.toContain("E/B");
    expect(chords).toEqual(["E", "B", "C#m7", "A", "E", "F#m7", "Bsus4", "E"]);
  });
});
