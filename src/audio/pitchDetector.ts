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
  if (!freq || freq < 20 || freq > 5000) {
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
 * Autocorrelation / YIN hybrid pitch detector with parabolic peak interpolation
 */
export function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
  minFreq: number = 60, // Low B / Drop A guitar
  maxFreq: number = 1000 // High frets
): { frequency: number; clarity: number } | null {
  const bufferSize = buffer.length;

  // 1. Calculate RMS volume
  let sumSquares = 0;
  for (let i = 0; i < bufferSize; i++) {
    sumSquares += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sumSquares / bufferSize);

  // Noise gate threshold: guitar signal must have sufficient energy
  if (rms < 0.012) {
    return null;
  }

  // 2. Compute Autocorrelation with Difference function (YIN-style)
  const minPeriod = Math.floor(sampleRate / maxFreq);
  const maxPeriod = Math.floor(sampleRate / minFreq);

  // Autocorrelation buffer
  const correlations = new Float32Array(maxPeriod + 1);

  for (let lag = minPeriod; lag <= maxPeriod; lag++) {
    let sum = 0;
    for (let i = 0; i < bufferSize - lag; i++) {
      sum += buffer[i] * buffer[i + lag];
    }
    correlations[lag] = sum;
  }

  // 3. Find global maximum peak in lag range
  let maxCorr = -1;
  let bestLag = -1;

  for (let lag = minPeriod; lag <= maxPeriod; lag++) {
    if (correlations[lag] > maxCorr) {
      maxCorr = correlations[lag];
      bestLag = lag;
    }
  }

  if (bestLag === -1 || maxCorr <= 0) {
    return null;
  }

  // 4. Parabolic peak interpolation for sub-sample accuracy
  let interpolatedLag = bestLag;
  if (bestLag > minPeriod && bestLag < maxPeriod) {
    const alpha = correlations[bestLag - 1];
    const beta = correlations[bestLag];
    const gamma = correlations[bestLag + 1];
    const denominator = 2 * (2 * beta - alpha - gamma);
    if (denominator !== 0) {
      const delta = (alpha - gamma) / denominator;
      interpolatedLag = bestLag + delta;
    }
  }

  const frequency = sampleRate / interpolatedLag;

  // Clarity calculation (normalized relative to zero-lag power)
  let zeroLagPower = 0;
  for (let i = 0; i < bufferSize; i++) {
    zeroLagPower += buffer[i] * buffer[i];
  }
  const clarity = zeroLagPower > 0 ? Math.min(1, Math.max(0, maxCorr / zeroLagPower)) : 0;

  if (clarity < 0.35 || frequency < minFreq || frequency > maxFreq) {
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
    if (diff < minDiff && diff < calibratedTarget * 0.18) {
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
