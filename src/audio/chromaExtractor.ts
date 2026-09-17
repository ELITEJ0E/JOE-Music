// High-Resolution Spectral & Chroma Extractor for JOE-Music
// Features: Hann windowing, Log-magnitude dynamic range compression,
// Local spectral peak picking (noise rejection), Parabolic sub-bin interpolation,
// Separated Bass Chroma (35-260 Hz) and Harmonic Chroma (65-2200 Hz),
// and Krumhansl-Schmuckler key estimation.

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/**
 * In-place Radix-2 Cooley-Tukey FFT
 */
export function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const tr = real[i]; real[i] = real[j]; real[j] = tr;
      const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let uReal = 1, uImag = 0;
      for (let k = 0; k < halfLen; k++) {
        const u = i + k;
        const v = i + k + halfLen;
        const tReal = uReal * real[v] - uImag * imag[v];
        const tImag = uReal * imag[v] + uImag * real[v];
        real[v] = real[u] - tReal; imag[v] = imag[u] - tImag;
        real[u] += tReal; imag[u] += tImag;
        const nextUReal = uReal * wReal - uImag * wImag;
        uImag = uReal * wImag + uImag * wReal;
        uReal = nextUReal;
      }
    }
  }
}

/**
 * Parabolic (Quadratic) sub-bin frequency interpolation
 */
export function getInterpolatedPeakFreq(
  spectrum: Float32Array,
  i: number,
  sampleRate: number,
  fftSize: number
): { freq: number; peakMag: number } {
  const mag = spectrum[i];
  if (i > 0 && i < spectrum.length - 1) {
    const alpha = spectrum[i - 1];
    const beta = mag;
    const gamma = spectrum[i + 1];
    const denom = alpha - 2 * beta + gamma;
    if (Math.abs(denom) > 1e-7) {
      const p = (0.5 * (alpha - gamma)) / denom;
      if (isFinite(p) && Math.abs(p) <= 1.0) {
        const trueBin = i + p;
        const peakMag = beta - 0.25 * (alpha - gamma) * p;
        return {
          freq: (trueBin * sampleRate) / fftSize,
          peakMag: Math.max(0, peakMag)
        };
      }
    }
  }
  return { freq: (i * sampleRate) / fftSize, peakMag: mag };
}

export interface SpectralAnalysisResult {
  chromagram: Float32Array[];       // Harmonic chroma per frame [numFrames][12]
  bassChromagram: Float32Array[];   // Bass chroma per frame [numFrames][12]
  onsetEnvelope: Float32Array;      // Onset detection curve
  tuningDeviationCents: number;     // Estimated cents deviation from A=440
  estimatedKey: string;             // e.g. "A Major"
  globalChroma: Float32Array;       // 12-bin overall energy profile
  fftSize: number;
  hopSize: number;
  numFrames: number;
}

export interface ChromaExtractionOptions {
  fftSize?: number;
  hopSize?: number;
  onProgress?: (pct: number) => void;
}

/**
 * Computes robust Harmonic and Bass Chromagrams with spectral whitening,
 * peak filtering to eliminate drum noise, and logarithmic compression.
 */
export function extractEnhancedChromagram(
  channelData: Float32Array,
  sampleRate: number,
  options: ChromaExtractionOptions = {}
): SpectralAnalysisResult {
  const fftSize = options.fftSize || 8192;
  const hopSize = options.hopSize || 2048;
  const numFrames = Math.max(1, Math.floor((channelData.length - fftSize) / hopSize));

  const hannWindow = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }

  const chromagram: Float32Array[] = [];
  const bassChromagram: Float32Array[] = [];
  const onsetEnvelope = new Float32Array(numFrames);
  const peakDeviations: number[] = [];
  const globalChroma = new Float32Array(12);

  let prevSpectrum = new Float32Array(fftSize / 2);
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  const spectrum = new Float32Array(fftSize / 2);

  const halfFft = fftSize / 2;
  const binResolution = sampleRate / fftSize;

  // Precalculate bin frequency boundaries
  const minBassBin = Math.max(1, Math.floor(35 / binResolution));
  const maxBassBin = Math.min(halfFft - 2, Math.ceil(270 / binResolution));
  const minHarmonicBin = Math.max(1, Math.floor(65 / binResolution));
  const maxHarmonicBin = Math.min(halfFft - 2, Math.ceil(2400 / binResolution));

  for (let f = 0; f < numFrames; f++) {
    if (options.onProgress && f % 250 === 0) {
      options.onProgress(f / numFrames);
    }

    const frameStart = f * hopSize;
    for (let i = 0; i < fftSize; i++) {
      real[i] = (frameStart + i < channelData.length)
        ? channelData[frameStart + i] * hannWindow[i]
        : 0;
      imag[i] = 0;
    }

    fft(real, imag);

    let onsetFlux = 0;
    let frameMeanMag = 0;

    for (let i = 0; i < halfFft; i++) {
      const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
      spectrum[i] = mag;
      frameMeanMag += mag;

      // Half-wave rectified spectral flux for onsets
      const diff = mag - prevSpectrum[i];
      if (diff > 0) onsetFlux += diff;
      prevSpectrum[i] = mag;
    }

    frameMeanMag /= halfFft;
    onsetEnvelope[f] = onsetFlux;

    // Adaptive noise threshold: require peaks to rise above local spectral floor
    const noiseFloor = Math.max(0.005, frameMeanMag * 0.4);

    const frameChroma = new Float32Array(12);
    const frameBassChroma = new Float32Array(12);

    // 1. Bass Pass: Local spectral peaks between 35 Hz and 270 Hz
    for (let i = minBassBin; i <= maxBassBin; i++) {
      const mag = spectrum[i];
      // Peak-picking: only consider true spectral peaks (rejects flat drum noise)
      if (mag > noiseFloor && mag > spectrum[i - 1] && mag >= spectrum[i + 1]) {
        const { freq, peakMag } = getInterpolatedPeakFreq(spectrum, i, sampleRate, fftSize);
        if (freq >= 35 && freq <= 265) {
          const exactMidi = 69 + 12 * Math.log2(freq / 440);
          const pitchClass = ((Math.round(exactMidi) % 12) + 12) % 12;
          const centsError = exactMidi - Math.round(exactMidi);

          // Sub-semitone Gaussian weighting
          const centsWeight = Math.exp(-Math.pow(centsError / 0.38, 2));

          // Logarithmic dynamic range compression
          const logMag = Math.log1p(25 * peakMag);

          // Perceptual low-frequency emphasis (slight roll-off for extreme sub-rumble below 40Hz)
          const bassFreqWeight = freq < 45 ? 0.8 : 1.0;

          frameBassChroma[pitchClass] += logMag * centsWeight * bassFreqWeight;
        }
      }
    }

    // 2. Harmonic Pass: Local spectral peaks between 65 Hz and 2400 Hz
    for (let i = minHarmonicBin; i <= maxHarmonicBin; i++) {
      const mag = spectrum[i];
      if (mag > noiseFloor && mag > spectrum[i - 1] && mag >= spectrum[i + 1]) {
        const { freq, peakMag } = getInterpolatedPeakFreq(spectrum, i, sampleRate, fftSize);
        if (freq >= 65 && freq <= 2350) {
          const exactMidi = 69 + 12 * Math.log2(freq / 440);
          const pitchClass = ((Math.round(exactMidi) % 12) + 12) % 12;
          const centsError = exactMidi - Math.round(exactMidi);

          const centsWeight = Math.exp(-Math.pow(centsError / 0.38, 2));
          const logMag = Math.log1p(20 * peakMag);

          // Perceptual spectral weighting: slightly prioritize fundamental octave (130-900 Hz)
          let octaveWeight = 1.0;
          if (freq >= 130 && freq <= 950) {
            octaveWeight = 1.25;
          } else if (freq > 1400) {
            octaveWeight = 0.75;
          }

          frameChroma[pitchClass] += logMag * centsWeight * octaveWeight;

          // Collect tuning deviation from high-confidence harmonic peaks
          if (peakMag > 0.15 && Math.abs(centsError) < 0.45) {
            peakDeviations.push(centsError);
          }
        }
      }
    }

    // Normalize frame chromas (L2 / Max norm with stability floor)
    let maxC = 0, maxB = 0;
    for (let k = 0; k < 12; k++) {
      if (frameChroma[k] > maxC) maxC = frameChroma[k];
      if (frameBassChroma[k] > maxB) maxB = frameBassChroma[k];
    }
    if (maxC > 1e-5) {
      for (let k = 0; k < 12; k++) {
        frameChroma[k] /= maxC;
      }
    }
    if (maxB > 1e-5) {
      for (let k = 0; k < 12; k++) {
        frameBassChroma[k] /= maxB;
      }
    }

    // 3. Transient Dampening & Spectral Flux Gating
    // Drum hits (kick, snare, crash) and pick attacks produce brief broadband noise across all 12 bins.
    // Detect transient bursts where pitch clarity (top 3 bins vs sum of all bins) is low.
    let chromaSum = 0;
    for (let k = 0; k < 12; k++) chromaSum += frameChroma[k];
    
    // Sort bin values to assess energy concentration
    const sortedChroma = Array.from(frameChroma).sort((a, b) => b - a);
    const top3Energy = sortedChroma[0] + sortedChroma[1] + sortedChroma[2];
    const pitchClarity = chromaSum > 1e-5 ? top3Energy / chromaSum : 0;

    // If a broadband transient occurs (low pitch clarity with energy spread across many bins)
    // and we have a preceding harmonic frame, attenuate the transient distortion by blending with previous frame
    if (pitchClarity < 0.45 && chromagram.length > 0 && chromaSum > 1.0) {
      const prevChroma = chromagram[chromagram.length - 1];
      const prevBass = bassChromagram[bassChromagram.length - 1];
      for (let k = 0; k < 12; k++) {
        // Favor previous harmonic profile (75%) over the noisy transient burst (25%)
        frameChroma[k] = (prevChroma[k] * 0.75) + (frameChroma[k] * 0.25);
        frameBassChroma[k] = (prevBass[k] * 0.75) + (frameBassChroma[k] * 0.25);
      }
    }

    for (let k = 0; k < 12; k++) {
      globalChroma[k] += frameChroma[k];
    }

    chromagram.push(frameChroma);
    bassChromagram.push(frameBassChroma);
  }

  // Estimate tuning deviation (median of stable harmonic peaks)
  let tuningDeviationCents = 0;
  if (peakDeviations.length >= 10) {
    peakDeviations.sort((a, b) => a - b);
    const medianDev = peakDeviations[Math.floor(peakDeviations.length / 2)];
    tuningDeviationCents = Math.round(medianDev * 100);
  }

  // Estimate Key using Krumhansl-Schmuckler profiles
  let bestKeyScore = -Infinity;
  let estimatedKey = "C Major";
  for (let i = 0; i < 12; i++) {
    let majScore = 0, minScore = 0;
    for (let j = 0; j < 12; j++) {
      const pc = (i + j) % 12;
      majScore += globalChroma[pc] * KS_MAJOR[j];
      minScore += globalChroma[pc] * KS_MINOR[j];
    }
    if (majScore > bestKeyScore) {
      bestKeyScore = majScore;
      estimatedKey = `${NOTE_NAMES[i]} Major`;
    }
    if (minScore > bestKeyScore) {
      bestKeyScore = minScore;
      estimatedKey = `${NOTE_NAMES[i]} Minor`;
    }
  }

  return {
    chromagram,
    bassChromagram,
    onsetEnvelope,
    tuningDeviationCents,
    estimatedKey,
    globalChroma,
    fftSize,
    hopSize,
    numFrames
  };
}
