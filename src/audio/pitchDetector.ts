import { TunerResult } from "../types";

const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Converts frequency in Hz to closest Musical Note, Octave, and Cents offset
 */
export function frequencyToNoteInfo(
  freq: number,
  referenceA4: number = 440
): {
  note: string;
  octave: number;
  cents: number;
  targetFreq: number;
} {
  if (!freq || freq < 30 || freq > 5000) {
    return { note: "--", octave: 0, cents: 0, targetFreq: 0 };
  }

  // 69 = A4 (referenceA4 Hz)
  const midiNote = 12 * (Math.log(freq / referenceA4) / Math.log(2)) + 69;
  const roundedMidi = Math.round(midiNote);
  const cents = Math.round((midiNote - roundedMidi) * 100);

  const noteIndex = ((roundedMidi % 12) + 12) % 12;
  const note = NOTE_STRINGS[noteIndex];
  const octave = Math.floor(roundedMidi / 12) - 1;

  // Target exact frequency of the nearest chromatic note
  const targetFreq = referenceA4 * Math.pow(2, (roundedMidi - 69) / 12);

  return { note, octave, cents, targetFreq };
}

/**
 * True YIN (CMNDF) pitch detector with parabolic peak interpolation
 */
export function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
  minFreq: number = 40, // Low B / Drop A bass and guitar
  maxFreq: number = 1200 // High frets
): { frequency: number; clarity: number } | null {
  const bufferSize = buffer.length;

  // 1. Calculate RMS volume for noise gate
  let sumSquares = 0;
  for (let i = 0; i < bufferSize; i++) {
    sumSquares += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sumSquares / bufferSize);

  // Noise gate threshold: guitar signal must have sufficient energy
  if (rms < 0.008) {
    return null;
  }

  // 2. Compute Difference function d(tau) = sum((buffer[i] - buffer[i+tau])^2)
  const minPeriod = Math.max(1, Math.floor(sampleRate / maxFreq));
  const maxPeriod = Math.min(bufferSize - 1, Math.floor(sampleRate / minFreq));

  if (minPeriod >= maxPeriod || maxPeriod >= bufferSize) {
    return null;
  }

  const windowSize = bufferSize - maxPeriod;
  if (windowSize <= 0) {
    return null;
  }

  const d = new Float32Array(maxPeriod + 1);
  for (let tau = 1; tau <= maxPeriod; tau++) {
    let sum = 0;
    for (let i = 0; i < windowSize; i++) {
      const diff = buffer[i] - buffer[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // 3. Compute Cumulative Mean Normalized Difference Function (CMNDF):
  // cmndf(0) = 1; cmndf(tau) = d(tau) / ((1/tau) * sum(d(1..tau)))
  const cmndf = new Float32Array(maxPeriod + 1);
  cmndf[0] = 1;

  let runningSum = 0;
  for (let tau = 1; tau <= maxPeriod; tau++) {
    runningSum += d[tau];
    if (runningSum === 0) {
      cmndf[tau] = 1;
    } else {
      cmndf[tau] = d[tau] / ((1 / tau) * runningSum);
    }
  }

  // 4. Absolute threshold and local minimum search
  // Walk tau from minPeriod upward and pick the FIRST tau where cmndf drops below threshold
  // AND is a local minimum
  const threshold = 0.15;
  let bestTau = -1;

  for (let tau = minPeriod; tau < maxPeriod; tau++) {
    if (cmndf[tau] < threshold) {
      // Find the bottom of this local valley
      while (tau + 1 <= maxPeriod && cmndf[tau + 1] < cmndf[tau]) {
        tau++;
      }
      bestTau = tau;
      break;
    }
  }

  // Fallback: If no tau crossed the threshold, pick the global minimum in [minPeriod, maxPeriod]
  if (bestTau === -1) {
    let globalMinVal = Infinity;
    for (let tau = minPeriod; tau <= maxPeriod; tau++) {
      if (cmndf[tau] < globalMinVal) {
        globalMinVal = cmndf[tau];
        bestTau = tau;
      }
    }
  }

  if (bestTau <= 0 || bestTau > maxPeriod) {
    return null;
  }

  // 5. Parabolic interpolation around chosen tau for sub-sample accuracy
  let interpolatedTau = bestTau;
  if (bestTau > minPeriod && bestTau < maxPeriod) {
    const alpha = cmndf[bestTau - 1];
    const beta = cmndf[bestTau];
    const gamma = cmndf[bestTau + 1];
    const denominator = 2 * (alpha - 2 * beta + gamma);
    if (denominator !== 0) {
      const delta = (alpha - gamma) / denominator;
      if (Math.abs(delta) < 1) {
        interpolatedTau = bestTau + delta;
      }
    }
  }

  const frequency = sampleRate / interpolatedTau;
  const rawClarity = 1 - cmndf[bestTau];
  const clarity = Math.max(0, Math.min(1, rawClarity));

  if (clarity < 0.30 || frequency < minFreq || frequency > maxFreq) {
    return null;
  }

  return { frequency, clarity };
}

/**
 * Analyzes audio input and maps to tuning targets
 */
export function analyzePitchFrame(
  buffer: Float32Array,
  sampleRate: number,
  targetTuningFrequencies: number[],
  referenceA4: number = 440
): TunerResult | null {
  const result = detectPitch(buffer, sampleRate);
  if (!result) return null;

  const { frequency, clarity } = result;
  const noteInfo = frequencyToNoteInfo(frequency, referenceA4);

  // Find matching string if close
  let stringIndex: number | null = null;
  let minDiff = Infinity;

  // Scale target tuning frequencies if referenceA4 differs from 440
  const freqRatio = referenceA4 / 440;
  targetTuningFrequencies.forEach((targetF, idx) => {
    const calibratedTarget = targetF * freqRatio;
    const diff = Math.abs(frequency - calibratedTarget);
    if (diff < minDiff && diff < calibratedTarget * 0.22) {
      minDiff = diff;
      stringIndex = idx;
    }
  });

  const inTune = Math.abs(noteInfo.cents) <= 3;

  return {
    frequency,
    note: noteInfo.note,
    octave: noteInfo.octave,
    cents: noteInfo.cents,
    targetFrequency: noteInfo.targetFreq,
    inTune,
    stringIndex,
    clarity,
  };
}
