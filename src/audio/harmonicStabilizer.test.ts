import { describe, it, expect } from "vitest";
import { stabilizeChordSegments } from "./harmonicStabilizer";
import { resolveChordFinderState } from "../music/chordTransposer";
import { resolveGuitarChord } from "./guitarChordResolver";
import { ChordSegment } from "../types";

describe("Post-MIR Harmonic Stabilizer & Musical Segmentation Engine", () => {
  // Test 1: D -> A with bass-note fluctuation (D/A must NOT become a separate chord)
  it("1. D -> A with a bass-note fluctuation: D/A must NOT become a separate chord", () => {
    const rawSegments: ChordSegment[] = [
      { id: "s0", chord: "D", root: "D", bass: "D", quality: "maj", extensions: [], startTime: 0.0, endTime: 1.7, confidence: 95, stability: 92 },
      { id: "s1", chord: "D/A", root: "D", bass: "A", quality: "maj", extensions: [], startTime: 1.7, endTime: 2.0, confidence: 80, stability: 75 }, // Brief 0.3s string 5 attack
      { id: "s2", chord: "A", root: "A", bass: "A", quality: "maj", extensions: [], startTime: 2.0, endTime: 4.0, confidence: 94, stability: 90 },
    ];

    const result = stabilizeChordSegments(rawSegments, {
      tempo: 120,
      beats: [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
      duration: 4.0,
    });

    expect(result.diagnostics.finalProgression).toEqual(["D", "A"]);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].chord).toBe("D");
    expect(result.segments[1].chord).toBe("A");
    expect(result.diagnostics.finalProgression).not.toContain("D/A");
  });

  // Test 2: D -> A with a passing melodic note: passing note must NOT create a new chord
  it("2. D -> A with a passing melodic note: passing note must NOT create a new chord", () => {
    const rawSegments: ChordSegment[] = [
      { id: "s0", chord: "D", root: "D", bass: "D", quality: "maj", extensions: [], startTime: 0.0, endTime: 1.8, confidence: 95, stability: 94 },
      { id: "s1", chord: "Em", root: "E", bass: "E", quality: "min", extensions: [], startTime: 1.8, endTime: 2.0, confidence: 55, stability: 50 }, // Fleeting passing melodic note
      { id: "s2", chord: "A", root: "A", bass: "A", quality: "maj", extensions: [], startTime: 2.0, endTime: 4.0, confidence: 94, stability: 92 },
    ];

    const result = stabilizeChordSegments(rawSegments, {
      tempo: 120,
      beats: [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
      duration: 4.0,
    });

    expect(result.diagnostics.finalProgression).toEqual(["D", "A"]);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].chord).toBe("D");
    expect(result.segments[1].chord).toBe("A");
  });

  // Test 3: D -> A with a genuine sustained A: A must still be detected
  it("3. D -> A with a genuine sustained A: A must still be detected", () => {
    const rawSegments: ChordSegment[] = [
      { id: "s0", chord: "D", root: "D", bass: "D", quality: "maj", extensions: [], startTime: 0.0, endTime: 2.0, confidence: 95, stability: 95 },
      { id: "s1", chord: "A", root: "A", bass: "A", quality: "maj", extensions: [], startTime: 2.0, endTime: 4.0, confidence: 95, stability: 95 },
    ];

    const result = stabilizeChordSegments(rawSegments, {
      tempo: 120,
      beats: [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
      duration: 4.0,
    });

    expect(result.diagnostics.finalProgression).toEqual(["D", "A"]);
    expect(result.segments[0].chord).toBe("D");
    expect(result.segments[0].startTime).toBe(0.0);
    expect(result.segments[0].endTime).toBe(2.0);
    expect(result.segments[1].chord).toBe("A");
    expect(result.segments[1].startTime).toBe(2.0);
    expect(result.segments[1].endTime).toBe(4.0);
  });

  // Test 4: D -> A -> Bm7 -> G: output must contain exactly 4 musical chord regions
  it("4. D -> A -> Bm7 -> G: output must contain exactly 4 musical chord regions", () => {
    const rawSegments: ChordSegment[] = [
      { id: "s0", chord: "D/A", root: "D", bass: "A", quality: "maj", extensions: [], startTime: 0.0, endTime: 0.3, confidence: 82, stability: 78 },
      { id: "s1", chord: "D", root: "D", bass: "D", quality: "maj", extensions: [], startTime: 0.3, endTime: 2.0, confidence: 96, stability: 94 },

      { id: "s2", chord: "A/E", root: "A", bass: "E", quality: "maj", extensions: [], startTime: 2.0, endTime: 2.3, confidence: 80, stability: 75 },
      { id: "s3", chord: "A", root: "A", bass: "A", quality: "maj", extensions: [], startTime: 2.3, endTime: 4.0, confidence: 95, stability: 93 },

      { id: "s4", chord: "Bm7/F#", root: "B", bass: "F#", quality: "m7", extensions: [], startTime: 4.0, endTime: 4.3, confidence: 81, stability: 76 },
      { id: "s5", chord: "Bm7", root: "B", bass: "B", quality: "m7", extensions: [], startTime: 4.3, endTime: 6.0, confidence: 94, stability: 92 },

      { id: "s6", chord: "G/D", root: "G", bass: "D", quality: "maj", extensions: [], startTime: 6.0, endTime: 6.3, confidence: 83, stability: 79 },
      { id: "s7", chord: "G", root: "G", bass: "G", quality: "maj", extensions: [], startTime: 6.3, endTime: 8.0, confidence: 96, stability: 95 },
    ];

    const beats: number[] = [];
    for (let t = 0; t <= 8; t += 0.5) beats.push(t);

    const result = stabilizeChordSegments(rawSegments, {
      tempo: 120,
      beats,
      duration: 8.0,
    });

    expect(result.diagnostics.finalProgression).toEqual(["D", "A", "Bm7", "G"]);
    expect(result.segments).toHaveLength(4);
    expect(result.segments.map((s) => s.chord)).toEqual(["D", "A", "Bm7", "G"]);
    expect(result.segments[0].durationBeats).toBe(4);
    expect(result.segments[1].durationBeats).toBe(4);
    expect(result.segments[2].durationBeats).toBe(4);
    expect(result.segments[3].durationBeats).toBe(4);
  });

  // Test 5 & 6: Reference progression E -> B -> C#m7 -> A -> E -> F#m7 -> Bsus4 -> E and Capo 2 Play Shapes
  it("5 & 6. Reference progression: Sounding E -> B -> C#m7 -> A -> E -> F#m7 -> Bsus4 -> E with Capo 2 Play Shapes D -> A -> Bm7 -> G -> D -> Em7 -> Asus4 -> D", () => {
    const rawNoisySegments: ChordSegment[] = [
      // Bar 1: E major
      { id: "s0", chord: "E/B", root: "E", bass: "B", quality: "maj", extensions: [], startTime: 0.0, endTime: 0.3, confidence: 85, stability: 80 },
      { id: "s1", chord: "E", root: "E", bass: "E", quality: "maj", extensions: [], startTime: 0.3, endTime: 4.0, confidence: 95, stability: 92 },

      // Bar 2: B major
      { id: "s2", chord: "B/Eb", root: "B", bass: "Eb", quality: "maj", extensions: [], startTime: 4.0, endTime: 4.3, confidence: 80, stability: 75 },
      { id: "s3", chord: "B", root: "B", bass: "B", quality: "maj", extensions: [], startTime: 4.3, endTime: 8.0, confidence: 94, stability: 90 },

      // Bar 3: C#m7
      { id: "s4", chord: "C#m7/B", root: "C#", bass: "B", quality: "m7", extensions: [], startTime: 8.0, endTime: 8.35, confidence: 82, stability: 78 },
      { id: "s5", chord: "C#m7", root: "C#", bass: "C#", quality: "m7", extensions: [], startTime: 8.35, endTime: 12.0, confidence: 92, stability: 90 },

      // Bar 4: A major
      { id: "s6", chord: "A/E", root: "A", bass: "E", quality: "maj", extensions: [], startTime: 12.0, endTime: 12.4, confidence: 84, stability: 80 },
      { id: "s7", chord: "A", root: "A", bass: "A", quality: "maj", extensions: [], startTime: 12.4, endTime: 16.0, confidence: 96, stability: 94 },

      // Bar 5: E major
      { id: "s8", chord: "E/B", root: "E", bass: "B", quality: "maj", extensions: [], startTime: 16.0, endTime: 16.3, confidence: 86, stability: 82 },
      { id: "s9", chord: "E", root: "E", bass: "E", quality: "maj", extensions: [], startTime: 16.3, endTime: 20.0, confidence: 95, stability: 93 },

      // Bar 6: F#m7
      { id: "s10", chord: "F#m7/C#", root: "F#", bass: "C#", quality: "m7", extensions: [], startTime: 20.0, endTime: 20.35, confidence: 81, stability: 79 },
      { id: "s11", chord: "F#m7", root: "F#", bass: "F#", quality: "m7", extensions: [], startTime: 20.35, endTime: 24.0, confidence: 93, stability: 91 },

      // Bar 7: Bsus4
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

    // Verify absolutely NONE of the regression artifacts exist
    const bannedArtifacts = ["D/A", "A/Db", "D/B", "D/G", "D/Gb", "Gsus2/E", "G/E"];
    for (const artifact of bannedArtifacts) {
      expect(actualPlayShapes).not.toContain(artifact);
      expect(stabilized.diagnostics.finalProgression).not.toContain(artifact);
    }
  });

  // Test 7: Ensure chord extensions survive stabilization (Cmaj7 -> Cmaj7, C#m7 -> C#m7, Asus4 -> Asus4)
  it("7. Ensure chord extensions survive stabilization: Cmaj7, C#m7, Asus4 do not collapse into basic triads", () => {
    const rawSegments: ChordSegment[] = [
      { id: "s0", chord: "Cmaj7", root: "C", bass: "C", quality: "maj7", extensions: ["maj7"], startTime: 0.0, endTime: 2.0, confidence: 95, stability: 94 },
      { id: "s1", chord: "C#m7", root: "C#", bass: "C#", quality: "m7", extensions: ["7"], startTime: 2.0, endTime: 4.0, confidence: 94, stability: 93 },
      { id: "s2", chord: "Asus4", root: "A", bass: "A", quality: "sus4", extensions: ["sus4"], startTime: 4.0, endTime: 6.0, confidence: 96, stability: 95 },
    ];

    const result = stabilizeChordSegments(rawSegments, {
      tempo: 120,
      beats: [0, 1, 2, 3, 4, 5, 6],
      duration: 6.0,
    });

    expect(result.diagnostics.finalProgression).toEqual(["Cmaj7", "C#m7", "Asus4"]);
    expect(result.segments[0].chord).toBe("Cmaj7");
    expect(result.segments[1].chord).toBe("C#m7");
    expect(result.segments[2].chord).toBe("Asus4");
  });

  // Test 8: Ensure genuine sustained slash chords survive: D/F# held for multiple beats remains D/F#
  it("8. Ensure genuine slash chords survive: D/F# held for multiple beats should remain D/F#", () => {
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
        },
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

  // Test 9: Ensure short slash artifacts disappear: D/A lasting only a fraction of a beat should resolve back to D
  it("9. Ensure short slash artifacts disappear: D/A lasting only a fraction of a beat should resolve back to D", () => {
    const rawSegments: ChordSegment[] = [
      { id: "s0", chord: "D", root: "D", bass: "D", quality: "maj", extensions: [], startTime: 0.0, endTime: 1.8, confidence: 95, stability: 94 },
      { id: "s1", chord: "D/A", root: "D", bass: "A", quality: "maj", extensions: [], startTime: 1.8, endTime: 2.0, confidence: 80, stability: 70 }, // 0.2s transient artifact
      { id: "s2", chord: "D", root: "D", bass: "D", quality: "maj", extensions: [], startTime: 2.0, endTime: 4.0, confidence: 96, stability: 95 },
    ];

    const result = stabilizeChordSegments(rawSegments, {
      tempo: 120,
      beats: [0, 1, 2, 3, 4],
      duration: 4.0,
    });

    expect(result.diagnostics.finalProgression).toEqual(["D"]);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].chord).toBe("D");
    expect(result.segments[0].startTime).toBe(0.0);
    expect(result.segments[0].endTime).toBe(4.0);
  });

  // Test 10: Owl City "Good Time" progression regression
  it("10. Owl City progression regression: F -> C -> G -> Am should NOT be ruined by short transients", () => {
    const rawSegments: ChordSegment[] = [
      // F major (with a short Fm glitch at the start)
      { id: "s0", chord: "Fm", root: "F", bass: "F", quality: "min", extensions: [], startTime: 0.0, endTime: 0.25, confidence: 75, stability: 70, diagnostics: { scoreMargin: 0.03, thirdEvidence: 0.2 } },
      { id: "s1", chord: "F", root: "F", bass: "F", quality: "maj", extensions: [], startTime: 0.25, endTime: 1.5, confidence: 95, stability: 92, diagnostics: { scoreMargin: 0.3, thirdEvidence: 0.7 } },
      
      // C major (with a short glitch at boundary)
      { id: "s2", chord: "F", root: "F", bass: "F", quality: "maj", extensions: [], startTime: 1.5, endTime: 1.7, confidence: 60, stability: 60, diagnostics: { scoreMargin: 0.05, thirdEvidence: 0.4 } },
      { id: "s3", chord: "C", root: "C", bass: "C", quality: "maj", extensions: [], startTime: 1.7, endTime: 3.5, confidence: 94, stability: 90, diagnostics: { scoreMargin: 0.4, thirdEvidence: 0.8 } },
      
      // G major (with a G5 artifact)
      { id: "s4", chord: "G5", root: "G", bass: "G", quality: "5", extensions: [], startTime: 3.5, endTime: 4.0, confidence: 70, stability: 65, diagnostics: { scoreMargin: 0.02, thirdEvidence: 0.1 } },
      { id: "s5", chord: "G", root: "G", bass: "G", quality: "maj", extensions: [], startTime: 4.0, endTime: 5.5, confidence: 96, stability: 93, diagnostics: { scoreMargin: 0.5, thirdEvidence: 0.9 } },
      
      // Am
      { id: "s6", chord: "Am", root: "A", bass: "A", quality: "min", extensions: [], startTime: 5.5, endTime: 7.5, confidence: 95, stability: 95, diagnostics: { scoreMargin: 0.3, thirdEvidence: 0.6 } }
    ];

    const beats: number[] = [];
    for (let t = 0; t <= 8; t += 0.5) beats.push(t);

    const result = stabilizeChordSegments(rawSegments, {
      tempo: 126, // ~126 bpm for Good Time
      beats,
      duration: 7.5,
    });

    // The micro glitches (Fm, early F bleeding, G5) should be absorbed into the strong blocks.
    expect(result.diagnostics.finalProgression).toEqual(["F", "C", "G", "Am"]);
  });

  // Test 11: Negative tests for transient bass notes
  it("11. Transient passing tones should not disrupt the underlying chord progression", () => {
    const rawSegments: ChordSegment[] = [
      { id: "s0", chord: "C", root: "C", bass: "C", quality: "maj", extensions: [], startTime: 0.0, endTime: 1.8, confidence: 95, stability: 94 },
      // Passing bass note creating C/B transient
      { id: "s1", chord: "C/B", root: "C", bass: "B", quality: "maj", extensions: [], startTime: 1.8, endTime: 2.1, confidence: 80, stability: 70 },
      // Passing chord Am7 transient
      { id: "s2", chord: "Am7", root: "A", bass: "A", quality: "min7", extensions: [], startTime: 2.1, endTime: 2.3, confidence: 60, stability: 55, diagnostics: { scoreMargin: 0.02, thirdEvidence: 0.4 } },
      { id: "s3", chord: "Am", root: "A", bass: "A", quality: "min", extensions: [], startTime: 2.3, endTime: 4.0, confidence: 96, stability: 95, diagnostics: { scoreMargin: 0.4, thirdEvidence: 0.8 } },
    ];

    const result = stabilizeChordSegments(rawSegments, {
      tempo: 120,
      beats: [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
      duration: 4.0,
    });

    // C/B should be absorbed into C (slash rejection), and the short Am7 into Am (transition glitch)
    expect(result.diagnostics.finalProgression).toEqual(["C", "Am"]);
  });
});
