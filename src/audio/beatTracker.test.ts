import { describe, it, expect } from "vitest";
import { computeOnsetEnvelope, trackBeatsFromOnsetEnvelope, detectBeats } from "./beatTracker";

describe("Phase 6E Final - Long-Duration Beat Grid Validation", () => {
  const temposToTest = [60, 80, 100, 120, 140, 160];

  temposToTest.forEach((targetBpm) => {
    it(`evaluates long-term drift for 60s stream at ${targetBpm} BPM`, () => {
      const sampleRate = 44100;
      const duration = 60.0; // 60 seconds
      const numSamples = Math.floor(duration * sampleRate);
      const audioData = new Float32Array(numSamples);

      const actualBeatInterval = 60.0 / targetBpm;
      const sourceTimestamps: number[] = [];

      let t = 0.0;
      while (t <= duration - 0.1) {
        sourceTimestamps.push(Number(t.toFixed(4)));
        const startSample = Math.floor(t * sampleRate);
        const clickLen = Math.floor(0.01 * sampleRate);
        for (let i = 0; i < clickLen; i++) {
          if (startSample + i < numSamples) {
            const env = Math.exp(-i / (0.003 * sampleRate));
            const wave = Math.sin((2 * Math.PI * 440 * i) / sampleRate) + Math.sin((2 * Math.PI * 150 * i) / sampleRate);
            audioData[startSample + i] += 0.8 * env * wave;
          }
        }
        t += actualBeatInterval;
      }

      const fftSize = 8192;
      const hopSize = 2048;
      const beatResult = detectBeats(audioData, sampleRate, duration, fftSize, hopSize);

      // 1. Estimated BPM
      const estimatedBpm = beatResult.estimatedBpm;
      const bpmError = Math.abs(estimatedBpm - targetBpm);

      // 2. Beat interval error
      const beatIntervalErrorMs = Math.abs(beatResult.beatIntervalSec - actualBeatInterval) * 1000;

      // Helper to get timing error (ms) for target time
      const getErrorAtTime = (targetTimeSec: number) => {
        // Find closest source timestamp
        const closestSource = sourceTimestamps.reduce((prev, curr) =>
          Math.abs(curr - targetTimeSec) < Math.abs(prev - targetTimeSec) ? curr : prev
        );
        // Find closest detected beat
        const closestBeat = beatResult.beats.reduce((prev, curr) =>
          Math.abs(curr - closestSource) < Math.abs(prev - closestSource) ? curr : prev
        );
        return (closestBeat - closestSource) * 1000;
      };

      // 3. First beat error
      const firstBeatErrorMs = getErrorAtTime(sourceTimestamps[0]);

      // 4. Error at 30 seconds
      const errorAt30s = getErrorAtTime(30.0);

      // 5. Error at 60 seconds
      const errorAt60s = getErrorAtTime(sourceTimestamps[sourceTimestamps.length - 1]);

      // 6. Max accumulated drift across all beats
      let maxDriftMs = 0;
      sourceTimestamps.forEach((srcT) => {
        const errMs = Math.abs(getErrorAtTime(srcT));
        if (errMs > maxDriftMs) maxDriftMs = errMs;
      });

      console.log(`\n=== LONG-DURATION TEST: ${targetBpm} BPM (60s Stream) ===`);
      console.log(`Estimated BPM: ${estimatedBpm} (Target: ${targetBpm}, Error: ${bpmError} BPM)`);
      console.log(`Beat Interval Error: ${beatIntervalErrorMs.toFixed(2)} ms`);
      console.log(`First Beat Error (t=0s): ${firstBeatErrorMs.toFixed(2)} ms`);
      console.log(`Beat Error at ~30s: ${errorAt30s.toFixed(2)} ms`);
      console.log(`Beat Error at ~60s: ${errorAt60s.toFixed(2)} ms`);
      console.log(`Max Accumulated Drift: ${maxDriftMs.toFixed(2)} ms`);

      expect(bpmError).toBeLessThanOrEqual(2);
      expect(maxDriftMs).toBeLessThan(50);
    });
  });

  it("evaluates a 2-minute (120s) real-song simulated track for long-term drift", () => {
    const sampleRate = 44100;
    const duration = 120.0; // 2 minutes
    const numSamples = Math.floor(duration * sampleRate);
    const audioData = new Float32Array(numSamples);

    const actualBpm = 110;
    const actualBeatInterval = 60.0 / actualBpm;
    const actualPhaseOffset = 0.15; // 150ms pickup

    const sourceTimestamps: number[] = [];
    let t = actualPhaseOffset;
    while (t <= duration - 0.2) {
      sourceTimestamps.push(Number(t.toFixed(4)));
      const startSample = Math.floor(t * sampleRate);
      const clickLen = Math.floor(0.015 * sampleRate);
      for (let i = 0; i < clickLen; i++) {
        if (startSample + i < numSamples) {
          const env = Math.exp(-i / (0.004 * sampleRate));
          const wave = Math.sin((2 * Math.PI * 330 * i) / sampleRate) + Math.sin((2 * Math.PI * 110 * i) / sampleRate);
          audioData[startSample + i] += 0.85 * env * wave;
        }
      }
      t += actualBeatInterval;
    }

    const fftSize = 8192;
    const hopSize = 2048;
    const beatResult = detectBeats(audioData, sampleRate, duration, fftSize, hopSize);

    const getErrorAtTime = (targetTimeSec: number) => {
      const closestSource = sourceTimestamps.reduce((prev, curr) =>
        Math.abs(curr - targetTimeSec) < Math.abs(prev - targetTimeSec) ? curr : prev
      );
      const closestBeat = beatResult.beats.reduce((prev, curr) =>
        Math.abs(curr - closestSource) < Math.abs(prev - closestSource) ? curr : prev
      );
      return (closestBeat - closestSource) * 1000;
    };

    const firstBeatErrorMs = getErrorAtTime(sourceTimestamps[0]);
    const errorAt60s = getErrorAtTime(60.0);
    const errorAt120s = getErrorAtTime(sourceTimestamps[sourceTimestamps.length - 1]);

    let maxDriftMs = 0;
    sourceTimestamps.forEach((srcT) => {
      const errMs = Math.abs(getErrorAtTime(srcT));
      if (errMs > maxDriftMs) maxDriftMs = errMs;
    });

    console.log(`\n=== REAL-SONG 2-MINUTE TRACK TEST (110 BPM, 120s) ===`);
    console.log(`Estimated BPM: ${beatResult.estimatedBpm} (Target: ${actualBpm})`);
    console.log(`Phase Offset Error: ${(Math.abs(beatResult.bestPhaseOffset - actualPhaseOffset) * 1000).toFixed(2)} ms`);
    console.log(`First Beat Error (t=0.15s): ${firstBeatErrorMs.toFixed(2)} ms`);
    console.log(`Beat Error at 60s: ${errorAt60s.toFixed(2)} ms`);
    console.log(`Beat Error at 120s: ${errorAt120s.toFixed(2)} ms`);
    console.log(`Max Accumulated Drift across 2 Minutes: ${maxDriftMs.toFixed(2)} ms`);

    expect(Math.abs(beatResult.estimatedBpm - actualBpm)).toBeLessThanOrEqual(2);
    expect(maxDriftMs).toBeLessThan(50);
  });
});
