import { describe, it, expect } from "vitest";
import { stabilizeChordSegments } from "./harmonicStabilizer";
import { resolveChordFinderState } from "../music/chordTransposer";
import { resolveGuitarChord } from "./guitarChordResolver";
import { ChordSegment } from "../types";

describe("Post-MIR Harmonic Stabilizer & Musical Segmentation Engine", () => {
  it("stabilizes transient guitar bass/slash fluctuations into a single continuous parent chord", () => {
    // Example from prompt:
    // Raw:
    // E/B 0.0–0.4
    // E 0.4–0.9
    // E/B 0.9–1.3
    // E/A 1.3–1.7
    // E 1.7–4.0
    //
    // Final:
    // E 0.0–4.0
    const rawSegments: ChordSegment[] = [
      {
        id: "raw-0",
        chord: "E/B",
        root: "E",
        bass: "B",
        quality: "maj",
        extensions: [],
        startTime: 0.0,
        endTime: 0.4,
        confidence: 88,
        stability: 85,
      },
      {
        id: "raw-1",
        chord: "E",
        root: "E",
        bass: "E",
        quality: "maj",
        extensions: [],
        startTime: 0.4,
        endTime: 0.9,
        confidence: 94,
        stability: 92,
      },
      {
        id: "raw-2",
        chord: "E/B",
        root: "E",
        bass: "B",
        quality: "maj",
        extensions: [],
        startTime: 0.9,
        endTime: 1.3,
        confidence: 87,
        stability: 86,
      },
      {
        id: "raw-3",
        chord: "E/A",
        root: "E",
        bass: "A",
        quality: "maj",
        extensions: [],
        startTime: 1.3,
        endTime: 1.7,
        confidence: 82,
        stability: 80,
      },
      {
        id: "raw-4",
        chord: "E",
        root: "E",
        bass: "E",
        quality: "maj",
        extensions: [],
        startTime: 1.7,
        endTime: 4.0,
        confidence: 96,
        stability: 95,
      },
    ];

    const result = stabilizeChordSegments(rawSegments, {
      tempo: 120,
      beats: [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
      duration: 4.0,
    });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].chord).toBe("E");
    expect(result.segments[0].startTime).toBe(0.0);
    expect(result.segments[0].endTime).toBe(4.0);

    // Diagnostics checks
    expect(result.diagnostics.rawSegmentCount).toBe(5);
    expect(result.diagnostics.stabilizedSegmentCount).toBe(1);
    expect(result.diagnostics.mergedSegments).toBeGreaterThanOrEqual(4);
    expect(result.diagnostics.rejectedTransientSlashSegments).toBe(3); // E/B, E/B, E/A
    expect(result.diagnostics.finalProgression).toEqual(["E"]);
  });

  it("preserves distinct harmonic changes (E -> B) without over-merging across different roots", () => {
    const rawSegments: ChordSegment[] = [
      {
        id: "raw-0",
        chord: "E",
        root: "E",
        bass: "E",
        quality: "maj",
        extensions: [],
        startTime: 0.0,
        endTime: 4.0,
        confidence: 95,
        stability: 95,
      },
      {
        id: "raw-1",
        chord: "B",
        root: "B",
        bass: "B",
        quality: "maj",
        extensions: [],
        startTime: 4.0,
        endTime: 8.0,
        confidence: 95,
        stability: 95,
      },
    ];

    const result = stabilizeChordSegments(rawSegments, {
      tempo: 120,
      beats: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      duration: 8.0,
    });

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].chord).toBe("E");
    expect(result.segments[0].startTime).toBe(0.0);
    expect(result.segments[0].endTime).toBe(4.0);

    expect(result.segments[1].chord).toBe("B");
    expect(result.segments[1].startTime).toBe(4.0);
    expect(result.segments[1].endTime).toBe(8.0);

    expect(result.diagnostics.finalProgression).toEqual(["E", "B"]);
  });

  it("regression test: Sounding E -> B -> C#m7 -> A -> E -> F#m7 -> Bsus4 -> E with transient pick noise stabilizes cleanly and yields exact Capo 2 Play Shapes D -> A -> Bm7 -> G -> D -> Em7 -> Asus4 -> D", () => {
    // Raw noisy timeline from MIR with string attack transients
    const rawNoisySegments: ChordSegment[] = [
      // Bar 1: E major with string 5 bass attack (E/B)
      { id: "s0", chord: "E/B", root: "E", bass: "B", quality: "maj", extensions: [], startTime: 0.0, endTime: 0.3, confidence: 85, stability: 80 },
      { id: "s1", chord: "E", root: "E", bass: "E", quality: "maj", extensions: [], startTime: 0.3, endTime: 4.0, confidence: 95, stability: 92 },

      // Bar 2: B major with transient 3rd in bass (B/Eb)
      { id: "s2", chord: "B/Eb", root: "B", bass: "Eb", quality: "maj", extensions: [], startTime: 4.0, endTime: 4.3, confidence: 80, stability: 75 },
      { id: "s3", chord: "B", root: "B", bass: "B", quality: "maj", extensions: [], startTime: 4.3, endTime: 8.0, confidence: 94, stability: 90 },

      // Bar 3: C#m7 with minor 7th in bass (C#m7/B)
      { id: "s4", chord: "C#m7/B", root: "C#", bass: "B", quality: "m7", extensions: [], startTime: 8.0, endTime: 8.35, confidence: 82, stability: 78 },
      { id: "s5", chord: "C#m7", root: "C#", bass: "C#", quality: "m7", extensions: [], startTime: 8.35, endTime: 12.0, confidence: 92, stability: 90 },

      // Bar 4: A major with open 6th string bleed (A/E)
      { id: "s6", chord: "A/E", root: "A", bass: "E", quality: "maj", extensions: [], startTime: 12.0, endTime: 12.4, confidence: 84, stability: 80 },
      { id: "s7", chord: "A", root: "A", bass: "A", quality: "maj", extensions: [], startTime: 12.4, endTime: 16.0, confidence: 96, stability: 94 },

      // Bar 5: E major
      { id: "s8", chord: "E/B", root: "E", bass: "B", quality: "maj", extensions: [], startTime: 16.0, endTime: 16.3, confidence: 86, stability: 82 },
      { id: "s9", chord: "E", root: "E", bass: "E", quality: "maj", extensions: [], startTime: 16.3, endTime: 20.0, confidence: 95, stability: 93 },

      // Bar 6: F#m7 with 5th bass transient (F#m7/C#)
      { id: "s10", chord: "F#m7/C#", root: "F#", bass: "C#", quality: "m7", extensions: [], startTime: 20.0, endTime: 20.35, confidence: 81, stability: 79 },
      { id: "s11", chord: "F#m7", root: "F#", bass: "F#", quality: "m7", extensions: [], startTime: 20.35, endTime: 24.0, confidence: 93, stability: 91 },

      // Bar 7: Bsus4 with transient 5th (Bsus4/F#)
      { id: "s12", chord: "Bsus4/F#", root: "B", bass: "F#", quality: "sus4", extensions: [], startTime: 24.0, endTime: 24.4, confidence: 83, stability: 80 },
      { id: "s13", chord: "Bsus4", root: "B", bass: "B", quality: "sus4", extensions: [], startTime: 24.4, endTime: 28.0, confidence: 92, stability: 90 },

      // Bar 8: E major
      { id: "s14", chord: "E/B", root: "E", bass: "B", quality: "maj", extensions: [], startTime: 28.0, endTime: 28.3, confidence: 85, stability: 82 },
      { id: "s15", chord: "E", root: "E", bass: "E", quality: "maj", extensions: [], startTime: 28.3, endTime: 32.0, confidence: 95, stability: 94 },
    ];

    const beats: number[] = [];
    for (let t = 0; t <= 32; t += 0.5) beats.push(t);

    const stabilized = stabilizeChordSegments(rawNoisySegments, {
      tempo: 120,
      beats,
      duration: 32.0,
    });

    // 1. Check Sounding Stabilized Progression
    const expectedSounding = ["E", "B", "C#m7", "A", "E", "F#m7", "Bsus4", "E"];
    expect(stabilized.diagnostics.finalProgression).toEqual(expectedSounding);
    expect(stabilized.segments.map((s) => s.chord)).toEqual(expectedSounding);

    // Diagnostics checks
    expect(stabilized.diagnostics.rawSegmentCount).toBe(16);
    expect(stabilized.diagnostics.stabilizedSegmentCount).toBe(8);
    expect(stabilized.diagnostics.mergedSegments).toBeGreaterThanOrEqual(8);
    expect(stabilized.diagnostics.rejectedTransientSlashSegments).toBe(8);

    // 2. Feed the stabilized progression to the Capo 2 resolver pipeline
    const expectedCapo2PlayShapes = ["D", "A", "Bm7", "G", "D", "Em7", "Asus4", "D"];

    const actualPlayShapes: string[] = [];
    for (const seg of stabilized.segments) {
      const state = resolveChordFinderState(seg.chord, 0, 2);
      const res = resolveGuitarChord(state.shapeChord, {
        capo: 2,
        detectedChord: state.detectedChord,
      });

      actualPlayShapes.push(res.displayChord);

      // Verify no malformed play shape names
      expect(res.displayChord).not.toContain("/");
      expect(res.voicing).not.toBeNull();
      expect(res.voicing!.name).not.toContain("/");
    }

    expect(actualPlayShapes).toEqual(expectedCapo2PlayShapes);

    // Verify absolutely NONE of the regression artifacts exist:
    const bannedArtifacts = ["D/A", "A/Db", "D/B", "D/G", "D/Gb", "Gsus2/E", "G/E"];
    for (const artifact of bannedArtifacts) {
      expect(actualPlayShapes).not.toContain(artifact);
      expect(stabilized.diagnostics.finalProgression).not.toContain(artifact);
    }
  });

  it("preserves genuine sustained intentional slash chords like D/F# or C/E in progression", () => {
    // A genuine sustained descending bassline: G (2.0s) -> D/F# (2.0s) -> Em (2.0s)
    const genuineSlashProgression: ChordSegment[] = [
      {
        id: "g-0",
        chord: "G",
        root: "G",
        bass: "G",
        quality: "maj",
        extensions: [],
        startTime: 0.0,
        endTime: 2.0,
        confidence: 95,
        stability: 95,
      },
      {
        id: "g-1",
        chord: "D/F#",
        root: "D",
        bass: "F#",
        quality: "maj",
        extensions: [],
        startTime: 2.0,
        endTime: 4.0, // Sustained for 2.0 seconds (> minSlashDuration)
        confidence: 93,
        stability: 92,
        diagnostics: {
          slashBassRatio: 1.6,
          slashBassEvidence: 0.65,
        } as any,
      },
      {
        id: "g-2",
        chord: "Em",
        root: "E",
        bass: "E",
        quality: "min",
        extensions: [],
        startTime: 4.0,
        endTime: 6.0,
        confidence: 94,
        stability: 94,
      },
    ];

    const result = stabilizeChordSegments(genuineSlashProgression, {
      tempo: 120,
      beats: [0, 1, 2, 3, 4, 5, 6],
      duration: 6.0,
    });

    expect(result.diagnostics.finalProgression).toEqual(["G", "D/F#", "Em"]);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[1].chord).toBe("D/F#");
  });
});
