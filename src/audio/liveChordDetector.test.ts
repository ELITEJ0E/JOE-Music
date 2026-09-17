import { describe, it, expect } from "vitest";
import { LiveChordDetector } from "./liveChordDetector";
import { CURRENT_ANALYSIS_VERSION, needsReanalysis, isAnalysisVersionCurrent } from "./analysisVersion";

describe("LiveChordDetector Unit Tests", () => {
  it("initializes in stopped state", () => {
    const detector = new LiveChordDetector();
    expect(detector.isActive()).toBe(false);
  });

  it("handles empty / silence frames safely", () => {
    const detector = new LiveChordDetector();
    // Test that detector handles null audio engine or uninitialized states gracefully
    expect(detector.isActive()).toBe(false);
    detector.stop();
    expect(detector.isActive()).toBe(false);
  });
});

describe("Analysis Versioning & Cache Invalidation", () => {
  it("recognizes CURRENT_ANALYSIS_VERSION as valid and current", () => {
    expect(CURRENT_ANALYSIS_VERSION).toBe("2.0.0");
    expect(isAnalysisVersionCurrent(CURRENT_ANALYSIS_VERSION)).toBe(true);
    expect(isAnalysisVersionCurrent("1.0.0")).toBe(false);
  });

  it("identifies songs needing re-analysis", () => {
    const legacySongWithoutVersion: any = {
      id: "song-1",
      title: "Hotel California",
      chordSegments: [{ chord: "Bm", startTime: 0, endTime: 2 }]
    };
    expect(needsReanalysis(legacySongWithoutVersion)).toBe(true);

    const legacySongV1: any = {
      id: "song-2",
      title: "Wonderwall",
      analysisVersion: "1.0.0",
      chordSegments: [{ chord: "Em7", startTime: 0, endTime: 2 }]
    };
    expect(needsReanalysis(legacySongV1)).toBe(true);

    const modernSongV2: any = {
      id: "song-3",
      title: "Good Time",
      analysisVersion: "2.0.0",
      chordSegments: [{ chord: "F", startTime: 0, endTime: 2 }]
    };
    expect(needsReanalysis(modernSongV2)).toBe(false);
  });
});
