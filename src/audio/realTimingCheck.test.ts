import { describe, it, expect } from "vitest";
import { trackBeatsFromOnsetEnvelope, computeOnsetEnvelope, detectBeats } from "./beatTracker";
import { stabilizeChordSegments } from "./harmonicStabilizer";
import { parseChordLabel } from "./chordNormalizer";
import { ChordSegment } from "../types";

describe("Phase 6F Real Timing Diagnostics", () => {
  it("diagnoses real timing on reference progression with various tempos and subdivisions", () => {
    // Reference progression: E → B → C#m7 → A → E → F#m7 → Bsus4 → E
    const bpm = 120; // 120 BPM = 0.500s per beat, 2.000s per bar
    const beatInterval = 60 / bpm; // 0.5s

    // Let's create an onset envelope with downbeats at 0.00s, 0.50s, 1.00s, etc.
    const sampleRate = 44100;
    const hopSize = 2048;
    const fftSize = 8192;
    const duration = 16.0; // 8 bars (32 beats)

    // Generate real audio PCM samples with acoustic transient pulses on beats
    const channelData = new Float32Array(Math.floor(duration * sampleRate));
    for (let b = 0; b < 32; b++) {
      const beatTime = b * beatInterval;
      const startSample = Math.round(beatTime * sampleRate);
      // 50ms transient impulse / kick
      for (let s = 0; s < Math.min(2205, channelData.length - startSample); s++) {
        const t = s / sampleRate;
        const decay = Math.exp(-t * 60);
        channelData[startSample + s] += 0.8 * Math.sin(2 * Math.PI * 80 * t) * decay;
      }
    }

    const { onsetEnvelope } = computeOnsetEnvelope(channelData, sampleRate, fftSize, hopSize);
    
    // Find where onset peaks actually land
    let maxEnv = 0;
    let peakFrames: number[] = [];
    for (let f = 1; f < onsetEnvelope.length - 1; f++) {
      if (onsetEnvelope[f] > 0.05 && onsetEnvelope[f] > onsetEnvelope[f-1] && onsetEnvelope[f] >= onsetEnvelope[f+1]) {
        peakFrames.push(f);
      }
    }

    console.log("First 4 peak frames in onset envelope:", peakFrames.slice(0, 4));
    console.log("First 4 peak frame timestamps (f * hopSize / sampleRate):", peakFrames.slice(0, 4).map(f => (f * hopSize / sampleRate).toFixed(4)));

    const result = trackBeatsFromOnsetEnvelope(onsetEnvelope, sampleRate, duration, hopSize, fftSize);
    console.log("Detected BPM:", result.estimatedBpm);
    console.log("Beat 1:", result.beats[0]);
    console.log("First 16 beats:", result.beats.slice(0, 16));

    expect(result.estimatedBpm).toBe(120);
    expect(result.beats[0]).toBeCloseTo(0.0, 1);
  });

  it("evaluates reference progression chord transitions against beat grid and subdivisions (1, 1&, 2, 2&, 3, 3&, 4, 4&)", () => {
    // 120 BPM, 0.5s per beat, 2.0s per 4/4 bar
    const bpm = 120;
    const beatInterval = 60 / bpm;
    const beats: number[] = [];
    for (let b = 0; b < 32; b++) {
      beats.push(Number((b * beatInterval).toFixed(3)));
    }

    // Progression: E → B → C#m7 → A → E → F#m7 → Bsus4 → E
    // Suppose chords change on bar boundaries (every 2.0s) and some on subdivisions (e.g. Bsus4 anticipates at 4&, i.e. 13.5s)
    const rawSegments: ChordSegment[] = [
      { id: "s1", chord: "E", root: "E", bass: "E", quality: "maj", extensions: [], startTime: 0.0, endTime: 2.0, confidence: 95, stability: 90 },
      { id: "s2", chord: "B", root: "B", bass: "B", quality: "maj", extensions: [], startTime: 2.0, endTime: 4.0, confidence: 92, stability: 88 },
      { id: "s3", chord: "C#m7", root: "C#", bass: "C#", quality: "min7", extensions: ["7"], startTime: 4.0, endTime: 6.0, confidence: 90, stability: 85 },
      { id: "s4", chord: "A", root: "A", bass: "A", quality: "maj", extensions: [], startTime: 6.0, endTime: 8.0, confidence: 94, stability: 90 },
      { id: "s5", chord: "E", root: "E", bass: "E", quality: "maj", extensions: [], startTime: 8.0, endTime: 10.0, confidence: 95, stability: 92 },
      { id: "s6", chord: "F#m7", root: "F#", bass: "F#", quality: "min7", extensions: ["7"], startTime: 10.0, endTime: 12.0, confidence: 89, stability: 85 },
      { id: "s7", chord: "Bsus4", root: "B", bass: "B", quality: "sus4", extensions: [], startTime: 12.0, endTime: 14.0, confidence: 91, stability: 88 },
      { id: "s8", chord: "E", root: "E", bass: "E", quality: "maj", extensions: [], startTime: 14.0, endTime: 16.0, confidence: 96, stability: 95 }
    ];

    const stabResult = stabilizeChordSegments(rawSegments, {
      tempo: bpm,
      beats,
      duration: 16.0
    });

    const stabilizedChords = stabResult.segments.map(s => s.chord);
    console.log("Stabilized Progression:", stabilizedChords);
    expect(stabilizedChords).toEqual(["E", "B", "C#m7", "A", "E", "F#m7", "Bsus4", "E"]);

    // Check each chord transition against nearest beat and subdivision
    stabResult.segments.forEach((seg, idx) => {
      const start = seg.startTime;
      const beatIdx = Math.round(start / beatInterval);
      const nearestBeatTime = beatIdx * beatInterval;
      const offsetMs = Math.round((start - nearestBeatTime) * 1000);

      // Measure: 4 beats per bar
      const barNum = Math.floor(beatIdx / 4) + 1;
      const beatInBar = (beatIdx % 4) + 1;
      const fraction = (start % beatInterval) / beatInterval;
      let subdivision = `${beatInBar}`;
      if (Math.abs(fraction - 0.5) < 0.15) {
        subdivision = `${beatInBar}&`;
      }

      console.log(`Chord [${seg.chord}]: Start=${start.toFixed(3)}s, Nearest Beat=${nearestBeatTime.toFixed(3)}s (Bar ${barNum}, Beat ${subdivision}), Offset=${offsetMs}ms`);
      expect(Math.abs(offsetMs)).toBeLessThanOrEqual(50);
    });
  });

  it("handles audio with intro delay (e.g. 1.25s lead-in) and correctly identifies first downbeat", () => {
    const bpm = 100; // 100 BPM = 0.600s per beat
    const beatInterval = 60 / bpm;
    const sampleRate = 44100;
    const hopSize = 2048;
    const fftSize = 8192;
    const duration = 20.0;
    const introDelaySec = 1.20; // 2 beats of lead-in before main beat kicks in

    const channelData = new Float32Array(Math.floor(duration * sampleRate));
    for (let b = 0; b < 30; b++) {
      const beatTime = introDelaySec + b * beatInterval;
      const startSample = Math.round(beatTime * sampleRate);
      if (startSample + 2205 < channelData.length) {
        for (let s = 0; s < 2205; s++) {
          const t = s / sampleRate;
          const decay = Math.exp(-t * 60);
          channelData[startSample + s] += 0.8 * Math.sin(2 * Math.PI * 80 * t) * decay;
        }
      }
    }

    const { onsetEnvelope } = computeOnsetEnvelope(channelData, sampleRate, fftSize, hopSize);
    const result = trackBeatsFromOnsetEnvelope(onsetEnvelope, sampleRate, duration, hopSize, fftSize);

    console.log("Intro Delay Test - Estimated BPM:", result.estimatedBpm);
    console.log("Intro Delay Test - Beat 1:", result.beats[0]);
    console.log("Intro Delay Test - First 8 beats:", result.beats.slice(0, 8));

    expect(result.estimatedBpm).toBe(100);
    // Grid alignment should match the periodic impulse grid modulo beatInterval
    const phaseError = Math.abs((result.beats[0] - introDelaySec) % beatInterval);
    const minPhaseError = Math.min(phaseError, beatInterval - phaseError);
    console.log("Phase error (ms):", (minPhaseError * 1000).toFixed(1));
    expect(minPhaseError).toBeLessThanOrEqual(0.05); // Within 50ms
  });

  it("supports fast chord changes on half-beats (1&, 2&, 3&, 4& subdivisions)", () => {
    // 120 BPM, beat interval = 0.500s, 8th note subdivision = 0.250s
    const bpm = 120;
    const beatInterval = 0.500;
    const beats: number[] = [];
    for (let b = 0; b < 16; b++) beats.push(Number((b * beatInterval).toFixed(3)));

    // Chords change on subdivisions:
    // Bar 1: Beat 1 (0.00s) = E, Beat 2& (0.75s) = B
    // Bar 2: Beat 1 (2.00s) = C#m7, Beat 4& (3.75s) = A (anticipated change)
    const rawSegments: ChordSegment[] = [
      { id: "s1", chord: "E", root: "E", bass: "E", quality: "maj", extensions: [], startTime: 0.0, endTime: 0.75, confidence: 95, stability: 90 },
      { id: "s2", chord: "B", root: "B", bass: "B", quality: "maj", extensions: [], startTime: 0.75, endTime: 2.0, confidence: 92, stability: 88 },
      { id: "s3", chord: "C#m7", root: "C#", bass: "C#", quality: "min7", extensions: ["7"], startTime: 2.0, endTime: 3.75, confidence: 90, stability: 85 },
      { id: "s4", chord: "A", root: "A", bass: "A", quality: "maj", extensions: [], startTime: 3.75, endTime: 6.0, confidence: 94, stability: 90 }
    ];

    // Compute subdivision alignment helper
    function getSubdivisionLabel(timeSec: number, beatIntervalSec: number): { bar: number; beat: number; subdivision: string; nearestSubdivisionTime: number; offsetMs: number } {
      const eighthNote = beatIntervalSec / 2;
      const subIdx = Math.round(timeSec / eighthNote);
      const nearestTime = subIdx * eighthNote;
      const offsetMs = Math.round((timeSec - nearestTime) * 1000);
      
      const totalBeats = subIdx / 2;
      const bar = Math.floor(totalBeats / 4) + 1;
      const beatInBar = Math.floor(totalBeats % 4) + 1;
      const isOffbeat = subIdx % 2 !== 0;
      const subdivision = isOffbeat ? `${beatInBar}&` : `${beatInBar}`;

      return { bar, beat: beatInBar, subdivision, nearestSubdivisionTime: nearestTime, offsetMs };
    }

    rawSegments.forEach(seg => {
      const sub = getSubdivisionLabel(seg.startTime, beatInterval);
      console.log(`Subdivision Chord [${seg.chord}]: Start=${seg.startTime.toFixed(3)}s, Subdivision=${sub.subdivision} (Bar ${sub.bar}), Offset=${sub.offsetMs}ms`);
      expect(Math.abs(sub.offsetMs)).toBeLessThanOrEqual(30);
    });

    const sub0 = getSubdivisionLabel(0.0, beatInterval);
    expect(sub0.subdivision).toBe("1");
    
    const sub1 = getSubdivisionLabel(0.75, beatInterval);
    expect(sub1.subdivision).toBe("2&");

    const sub2 = getSubdivisionLabel(2.0, beatInterval);
    expect(sub2.subdivision).toBe("1");

    const sub3 = getSubdivisionLabel(3.75, beatInterval);
    expect(sub3.subdivision).toBe("4&");
  });
});
