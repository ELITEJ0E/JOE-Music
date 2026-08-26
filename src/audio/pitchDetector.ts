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

// Static reusable buffers to eliminate GC allocations during real-time 60fps pitch tracking
let cachedBufferCapacity = 0;
let cachedD: Float32Array = new Float32Array(0);
let cachedCmndf: Float32Array = new Float32Array(0);

function ensureBuffers(capacity: number) {
  if (capacity > cachedBufferCapacity) {
    cachedBufferCapacity = Math.max(capacity, 4096);
    cachedD = new Float32Array(cachedBufferCapacity);
    cachedCmndf = new Float32Array(cachedBufferCapacity);
  }
}

/**
 * True YIN (CMNDF) pitch detector with parabolic peak interpolation
 */
export function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
  minFreq: number = 40, // Low B / Drop A bass and guitar
  maxFreq: number = 1200, // High frets
  previousFrequency?: number
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

  ensureBuffers(maxPeriod + 1);
  const d = cachedD;
  const cmndf = cachedCmndf;

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
  const threshold = 0.15;
  let minima: {tau: number, value: number}[] = [];
  
  for (let tau = minPeriod; tau < maxPeriod; tau++) {
    if (cmndf[tau] < threshold) {
      let startTau = tau;
      // Find the bottom of this local valley
      while (tau + 1 <= maxPeriod && cmndf[tau + 1] < cmndf[tau]) {
        tau++;
      }
      minima.push({ tau: tau, value: cmndf[tau] });
    }
  }

  let bestTau = -1;
  
  if (minima.length > 0) {
    // Octave error resistance:
    // Prefer the first minimum, but check if there's a sub-harmonic (longer tau / half frequency)
    // that is also a strong minimum and aligns better with previous history.
    bestTau = minima[0].tau;
    
    if (previousFrequency && previousFrequency > minFreq) {
      const prevTau = sampleRate / previousFrequency;
      let closestTau = minima[0].tau;
      let minDiff = Math.abs(minima[0].tau - prevTau);
      
      for (let i = 1; i < minima.length; i++) {
        const diff = Math.abs(minima[i].tau - prevTau);
        // If we have another minimum that is closer to previous frequency 
        // AND its cmndf value is still good, prefer it to prevent octave jumps
        if (diff < minDiff && minima[i].value < threshold + 0.1) {
          minDiff = diff;
          closestTau = minima[i].tau;
        }
      }
      bestTau = closestTau;
    } else {
      // Without history, if we see a strong minimum at ~2x the first tau, it might be the true fundamental
      // while the first tau is a strong harmonic.
      for (let i = 1; i < minima.length; i++) {
         if (Math.abs(minima[i].tau - 2 * minima[0].tau) < 5) {
             if (minima[i].value < threshold * 1.5) { // somewhat lenient if it's an octave below
                 bestTau = minima[i].tau;
             }
         }
      }
    }
  } else {
    // Fallback: If no tau crossed the threshold, pick the global minimum in [minPeriod, maxPeriod]
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
  referenceA4: number = 440,
  previousFrequency?: number
): TunerResult | null {
  const result = detectPitch(buffer, sampleRate, 40, 1200, previousFrequency);
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
