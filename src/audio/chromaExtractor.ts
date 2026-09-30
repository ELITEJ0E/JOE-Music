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
  chromagram: Float32Array[];       // Full harmonic chroma per frame [numFrames][12]
  lowMidChromagram: Float32Array[]; // Low-Mid harmonic chroma (90-500 Hz)
  midChromagram: Float32Array[];    // Mid harmonic chroma (180-1100 Hz)
  trebleChromagram: Float32Array[]; // Treble/High harmonic chroma (1100-4500 Hz)
  fullChromagram: Float32Array[];   // Full harmonic chroma (65-2400 Hz)
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
  const lowMidChromagram: Float32Array[] = [];
  const midChromagram: Float32Array[] = [];
  const trebleChromagram: Float32Array[] = [];
  const fullChromagram: Float32Array[] = [];
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
    const frameLowMidChroma = new Float32Array(12);
    const frameMidChroma = new Float32Array(12);
    const frameTrebleChroma = new Float32Array(12);
    const frameFullChroma = new Float32Array(12);
    const frameBassChroma = new Float32Array(12);

    // 1. Bass Pass: Local spectral peaks between 35 Hz and 270 Hz
    for (let i = minBassBin; i <= maxBassBin; i++) {
      const mag = spectrum[i];
      if (mag > noiseFloor && mag > spectrum[i - 1] && mag >= spectrum[i + 1]) {
        const { freq, peakMag } = getInterpolatedPeakFreq(spectrum, i, sampleRate, fftSize);
        if (freq >= 35 && freq <= 265) {
          const exactMidi = 69 + 12 * Math.log2(freq / 440);
          const pitchClass = ((Math.round(exactMidi) % 12) + 12) % 12;
          const centsError = exactMidi - Math.round(exactMidi);

          const centsWeight = Math.exp(-Math.pow(centsError / 0.38, 2));
          const logMag = Math.log1p(25 * peakMag);
          const bassFreqWeight = freq < 45 ? 0.8 : 1.0;

          frameBassChroma[pitchClass] += logMag * centsWeight * bassFreqWeight;
        }
      }
    }

    // 2. Multi-Band Harmonic Pass: Local spectral peaks between 65 Hz and 2400 Hz
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
          const rawEnergy = logMag * centsWeight;

          // Band 1: Low-Mid (90-500 Hz) - Fundamental & Root resonance
          if (freq >= 90 && freq <= 500) {
            frameLowMidChroma[pitchClass] += rawEnergy * 1.35;
          }

          // Band 2: Mid (180-1100 Hz) - Core Triad (Thirds & Fifths)
          if (freq >= 180 && freq <= 1100) {
            frameMidChroma[pitchClass] += rawEnergy * 1.20;
          }

          // Band 3: Treble / High (1100-4500 Hz) - Vocal lead, high synths, overtones
          if (freq >= 1100 && freq <= 4500) {
            frameTrebleChroma[pitchClass] += rawEnergy * 1.0;
          }

          // Band 3: Full Harmonic Chroma (65-2400 Hz) with Octave Weighting
          let octaveWeight = 1.0;
          if (freq >= 90 && freq <= 500) {
            octaveWeight = 1.35;
          } else if (freq > 500 && freq <= 1100) {
            octaveWeight = 1.20;
          } else if (freq > 1100 && freq <= 1800) {
            octaveWeight = 0.65;
          } else if (freq > 1800) {
            octaveWeight = 0.40;
          }

          frameFullChroma[pitchClass] += rawEnergy * octaveWeight;
          frameChroma[pitchClass] += rawEnergy * octaveWeight;

          if (peakMag > 0.15 && Math.abs(centsError) < 0.45) {
            peakDeviations.push(centsError);
          }
        }
      }
    }

    // Normalize each band array per frame
    let maxC = 0, maxLM = 0, maxM = 0, maxTr = 0, maxFull = 0, maxB = 0;
    for (let k = 0; k < 12; k++) {
      if (frameChroma[k] > maxC) maxC = frameChroma[k];
      if (frameLowMidChroma[k] > maxLM) maxLM = frameLowMidChroma[k];
      if (frameMidChroma[k] > maxM) maxM = frameMidChroma[k];
      if (frameTrebleChroma[k] > maxTr) maxTr = frameTrebleChroma[k];
      if (frameFullChroma[k] > maxFull) maxFull = frameFullChroma[k];
      if (frameBassChroma[k] > maxB) maxB = frameBassChroma[k];
    }

    if (maxC > 1e-5) { for (let k = 0; k < 12; k++) frameChroma[k] /= maxC; }
    if (maxLM > 1e-5) { for (let k = 0; k < 12; k++) frameLowMidChroma[k] /= maxLM; }
    if (maxM > 1e-5) { for (let k = 0; k < 12; k++) frameMidChroma[k] /= maxM; }
    if (maxTr > 1e-5) { for (let k = 0; k < 12; k++) frameTrebleChroma[k] /= maxTr; }
    if (maxFull > 1e-5) { for (let k = 0; k < 12; k++) frameFullChroma[k] /= maxFull; }
    if (maxB > 1e-5) { for (let k = 0; k < 12; k++) frameBassChroma[k] /= maxB; }

    // Transient Dampening & Spectral Flux Gating
    let chromaSum = 0;
    for (let k = 0; k < 12; k++) chromaSum += frameChroma[k];
    
    const sortedChroma = Array.from(frameChroma).sort((a, b) => b - a);
    const top3Energy = sortedChroma[0] + sortedChroma[1] + sortedChroma[2];
    const pitchClarity = chromaSum > 1e-5 ? top3Energy / chromaSum : 0;

    if (pitchClarity < 0.45 && chromagram.length > 0 && chromaSum > 1.0) {
      const prevChroma = chromagram[chromagram.length - 1];
      const prevBass = bassChromagram[bassChromagram.length - 1];
      for (let k = 0; k < 12; k++) {
        frameChroma[k] = (prevChroma[k] * 0.75) + (frameChroma[k] * 0.25);
        frameFullChroma[k] = (prevChroma[k] * 0.75) + (frameFullChroma[k] * 0.25);
        frameBassChroma[k] = (prevBass[k] * 0.75) + (frameBassChroma[k] * 0.25);
      }
    }

    for (let k = 0; k < 12; k++) {
      globalChroma[k] += frameChroma[k];
    }

    chromagram.push(frameChroma);
    lowMidChromagram.push(frameLowMidChroma);
    midChromagram.push(frameMidChroma);
    trebleChromagram.push(frameTrebleChroma);
    fullChromagram.push(frameFullChroma);
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
    lowMidChromagram,
    midChromagram,
    trebleChromagram,
    fullChromagram,
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
