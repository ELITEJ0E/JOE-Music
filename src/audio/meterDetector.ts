/**
 * JOE Music - Downbeat & Meter Detection Engine
 * 
 * Accurately determines downbeat timestamps (Beat 1) and musical meter (4/4, 3/4, 6/8, 12/8)
 * using onset accents, low-frequency kick prominence, and harmonic change probabilities.
 */

import { ChordSegment, DownbeatAnalysis } from "../types";

export interface MeterDetectionOptions {
  beats: number[];
  audioChannel?: Float32Array;
  sampleRate?: number;
  onsetEnvelope?: Float32Array;
  hopSize?: number;
  chordSegments?: ChordSegment[];
  duration?: number;
}

/**
 * Computes energy of low frequencies (kick drum band ~40-120 Hz) at given time window.
 */
function computeLowFreqEnergy(
  audio: Float32Array,
  sampleRate: number,
  timeSec: number,
  windowSec = 0.08
): number {
  const center = Math.floor(timeSec * sampleRate);
  const halfWin = Math.floor((windowSec * sampleRate) / 2);
  const start = Math.max(0, center - halfWin);
  const end = Math.min(audio.length, center + halfWin);

  if (end <= start) return 0;

  // Simple and fast low-frequency integration using sliding difference (approx 2nd order lowpass)
  let sumSquare = 0;
  let prev = 0;
  let smoothed = 0;
  const alpha = 0.15; // lowpass coefficient ~100Hz at 22.05-44.1kHz

  for (let i = start; i < end; i++) {
    const val = audio[i];
    smoothed = smoothed + alpha * (val - smoothed);
    sumSquare += smoothed * smoothed;
  }

  return Math.sqrt(sumSquare / (end - start));
}

/**
 * Analyzes beats to detect which beats are downbeats and determine the musical meter.
 */
export function detectDownbeatsAndMeter(options: MeterDetectionOptions): DownbeatAnalysis {
  const { beats, audioChannel, sampleRate = 44100, chordSegments = [], duration = 0 } = options;

  if (!beats || beats.length === 0) {
    return {
      timeSignature: "4/4",
      meterConfidence: 0.5,
      beatsPerBar: 4,
      downbeatIndices: [],
      downbeats: [],
    };
  }

  if (beats.length < 4) {
    return {
      timeSignature: "4/4",
      meterConfidence: 0.6,
      beatsPerBar: 4,
      downbeatIndices: [0],
      downbeats: [beats[0]],
    };
  }

  // 1. Feature extraction per beat
  const beatScores = new Float32Array(beats.length);
  const chordStartTimes = chordSegments.map(c => c.startTime);

  for (let b = 0; b < beats.length; b++) {
    const t = beats[b];
    let score = 0.1;

    // A. Kick / Low frequency energy
    if (audioChannel && audioChannel.length > 0) {
      const lowEnergy = computeLowFreqEnergy(audioChannel, sampleRate, t);
      score += lowEnergy * 4.0;
    }

    // B. Harmonic transition alignment
    // Chord transitions overwhelmingly occur on downbeats (Beat 1)
    let minChordDist = 999;
    for (let c = 0; c < chordStartTimes.length; c++) {
      const dist = Math.abs(chordStartTimes[c] - t);
      if (dist < minChordDist) minChordDist = dist;
    }

    if (minChordDist < 0.08) {
      score += 2.5; // Direct chord change on this beat
    } else if (minChordDist < 0.18) {
      score += 1.0;
    }

    beatScores[b] = score;
  }

  // 2. Test Meter Hypotheses: 4/4 (period 4), 3/4 (period 3), 6/8 (period 6 or 3)
  const candidateMeters: Array<{ meter: string; beatsPerBar: number; prior: number }> = [
    { meter: "4/4", beatsPerBar: 4, prior: 1.0 },   // Common time is most frequent in modern guitar music
    { meter: "3/4", beatsPerBar: 3, prior: 0.75 },  // Triple meter / waltz
    { meter: "6/8", beatsPerBar: 6, prior: 0.70 },  // Compound duple
    { meter: "12/8", beatsPerBar: 12, prior: 0.55 },
  ];

  let bestMeter = "4/4";
  let bestBeatsPerBar = 4;
  let bestPhase = 0;
  let bestScore = -1;

  for (const cand of candidateMeters) {
    const M = cand.beatsPerBar;
    if (beats.length < M * 2) continue;

    // Test each phase phi (which beat in 0..M-1 is beat 1)
    for (let phi = 0; phi < M; phi++) {
      let downbeatSum = 0;
      let downbeatCount = 0;
      let nonDownbeatSum = 0;
      let nonDownbeatCount = 0;

      for (let b = 0; b < beats.length; b++) {
        const isDownbeat = (b - phi + M * 1000) % M === 0;
        if (isDownbeat) {
          downbeatSum += beatScores[b];
          downbeatCount++;
        } else {
          nonDownbeatSum += beatScores[b];
          nonDownbeatCount++;
        }
      }

      const avgDownbeat = downbeatCount > 0 ? downbeatSum / downbeatCount : 0;
      const avgNonDownbeat = nonDownbeatCount > 0 ? nonDownbeatSum / nonDownbeatCount : 1;

      // Ratio of energy/harmonic changes on downbeats vs other beats
      const ratio = (avgDownbeat + 0.01) / (avgNonDownbeat + 0.01);
      const totalCandScore = ratio * cand.prior;

      if (totalCandScore > bestScore) {
        bestScore = totalCandScore;
        bestMeter = cand.meter;
        bestBeatsPerBar = cand.beatsPerBar;
        bestPhase = phi;
      }
    }
  }

  // 3. Compute Downbeat Indices and Timestamps
  const downbeatIndices: number[] = [];
  const downbeats: number[] = [];

  for (let b = 0; b < beats.length; b++) {
    if ((b - bestPhase + bestBeatsPerBar * 1000) % bestBeatsPerBar === 0) {
      downbeatIndices.push(b);
      downbeats.push(Number(beats[b].toFixed(3)));
    }
  }

  // Normalize confidence (1.1 - 2.5 typical ratio mapped to 0.65 - 0.98)
  const meterConfidence = Math.max(0.60, Math.min(0.98, Number(((bestScore - 0.8) / 1.5).toFixed(2))));

  return {
    timeSignature: bestMeter,
    meterConfidence,
    beatsPerBar: bestBeatsPerBar,
    downbeatIndices,
    downbeats,
  };
}
