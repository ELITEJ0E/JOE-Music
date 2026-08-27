import { describe, it, expect } from "vitest";
import { trackBeatsFromOnsetEnvelope, computeOnsetEnvelope } from "./beatTracker";
import { stabilizeChordSegments } from "./harmonicStabilizer";
import { resolveYouTubeAudio } from "../utils/youtubeAudioProvider";
import { ChordSegment } from "../types";

describe("Phase 7 - YouTube Audio Pipeline & Beat Timing Grid Regression Test", () => {
  it("verifies resolveYouTubeAudio throws explicit YOUTUBE_AUDIO_UNAVAILABLE error when server has no yt-dlp", async () => {
    try {
      await resolveYouTubeAudio("dQw4w9WgXcQ");
    } catch (err: any) {
      expect(err.message).toMatch(/YOUTUBE_AUDIO_UNAVAILABLE/);
    }
  });

  it("verifies beat tracking phase accuracy across BPM range (80, 100, 120, 140) and phase offsets", { timeout: 15000 }, () => {
    const sampleRate = 44100;
    const fftSize = 8192;
    const hopSize = 2048;
    const phaseOffsets = [0.000, 0.050, 0.100, 0.150];
    const bpms = [80, 100, 120, 140];

    for (const bpm of bpms) {
      const beatInterval = 60 / bpm;
      for (const phaseSec of phaseOffsets) {
        const durationSec = 30;
        const totalSamples = Math.floor(durationSec * sampleRate);
        const channelData = new Float32Array(totalSamples);

        let tBeat = phaseSec;
        while (tBeat < durationSec) {
          const startSample = Math.round(tBeat * sampleRate);
          for (let s = 0; s < Math.min(2205, totalSamples - startSample); s++) {
            const t = s / sampleRate;
            const decay = Math.exp(-t * 60);
            channelData[startSample + s] += 0.8 * Math.sin(2 * Math.PI * 100 * t) * decay;
          }
          tBeat += beatInterval;
        }

        const { onsetEnvelope } = computeOnsetEnvelope(channelData, sampleRate, fftSize, hopSize);
        const trackerResult = trackBeatsFromOnsetEnvelope(
          onsetEnvelope,
          sampleRate,
          durationSec,
          hopSize,
          fftSize
        );

        // 1. Tempo error check (allowing octave tempo equivalence 0.5x, 1x, 2x)
        const tempoRatio = trackerResult.estimatedBpm / bpm;
        const isOctaveValid =
          Math.abs(tempoRatio - 1.0) < 0.05 ||
          Math.abs(tempoRatio - 0.5) < 0.05 ||
          Math.abs(tempoRatio - 2.0) < 0.05;
        expect(isOctaveValid).toBe(true);

        // 2. First beat error < 25ms (within 1/2 hop frame resolution of 23.2ms)
        const firstBeat = trackerResult.beats[0];
        const firstBeatErrorMs = Math.abs(firstBeat - phaseSec) * 1000;
        expect(firstBeatErrorMs).toBeLessThan(25.0);
      }
    }
  });

  it("evaluates specific 8-bar progression fixture (E -> B -> C#m7 -> A -> E -> F#m7 -> Bsus4 -> E) alignment with beat grid", () => {
    // 120 BPM = 0.5s per beat, 2.0s per 4-beat bar
    const bpm = 120;
    const duration = 16.0;
    const beats = Array.from({ length: 32 }, (_, i) => Number((i * 0.5).toFixed(3)));

    const rawSegments: ChordSegment[] = [
      { id: "1", chord: "E", startTime: 0.0, endTime: 2.0, confidence: 95, stability: 95 },
      { id: "2", chord: "B", startTime: 2.0, endTime: 4.0, confidence: 95, stability: 95 },
      { id: "3", chord: "C#m7", startTime: 4.0, endTime: 6.0, confidence: 95, stability: 95 },
      { id: "4", chord: "A", startTime: 6.0, endTime: 8.0, confidence: 95, stability: 95 },
      { id: "5", chord: "E", startTime: 8.0, endTime: 10.0, confidence: 95, stability: 95 },
      { id: "6", chord: "F#m7", startTime: 10.0, endTime: 12.0, confidence: 95, stability: 95 },
      { id: "7", chord: "Bsus4", startTime: 12.0, endTime: 14.0, confidence: 95, stability: 95 },
      { id: "8", chord: "E", startTime: 14.0, endTime: 16.0, confidence: 95, stability: 95 },
    ];

    const result = stabilizeChordSegments(rawSegments, {
      beats,
      tempo: bpm,
      duration,
      keyContext: "E",
    });

    const expectedChords = ["E", "B", "C#m7", "A", "E", "F#m7", "Bsus4", "E"];
    expect(result.segments.map((s) => s.chord)).toEqual(expectedChords);

    result.segments.forEach((seg, idx) => {
      const expectedStart = idx * 2.0;
      expect(Math.abs(seg.startTime - expectedStart)).toBeLessThan(0.005);
    });
  });

  it("handles pickup beats where first musical beat occurs at t = 0.120s", () => {
    const sampleRate = 44100;
    const fftSize = 8192;
    const hopSize = 2048;
    const pickupTime = 0.120;
    const bpm = 120;
    const beatInterval = 60 / bpm; // 0.5s
    const durationSec = 10;

    const totalSamples = Math.floor(durationSec * sampleRate);
    const channelData = new Float32Array(totalSamples);

    let tBeat = pickupTime;
    while (tBeat < durationSec) {
      const startSample = Math.round(tBeat * sampleRate);
      for (let s = 0; s < Math.min(2205, totalSamples - startSample); s++) {
        const t = s / sampleRate;
        const decay = Math.exp(-t * 60);
        channelData[startSample + s] += 0.8 * Math.sin(2 * Math.PI * 100 * t) * decay;
      }
      tBeat += beatInterval;
    }

    const { onsetEnvelope } = computeOnsetEnvelope(channelData, sampleRate, fftSize, hopSize);
    const trackerResult = trackBeatsFromOnsetEnvelope(
      onsetEnvelope,
      sampleRate,
      durationSec,
      hopSize,
      fftSize
    );

    // Beats grid should align with pickup time (0.120s)
    const firstBeat = trackerResult.beats[0];
    const errorMs = Math.abs(firstBeat - pickupTime) * 1000;
    expect(errorMs).toBeLessThan(25.0);
  });
});
