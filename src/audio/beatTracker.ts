// Beat Tracking & Onset Analysis Module
// Computes tempo (BPM), onset envelope, phase offset, and beat grid timestamps

export interface BeatAnalysisResult {
  estimatedBpm: number;
  beatIntervalSec: number;
  bestPhaseOffset: number;
  beats: number[];
  bpmConfidence: number;
  onsetEnvelope: Float32Array;
  sampleRate: number;
  hopSize: number;
  fftSize: number;
  diagnostics?: {
    numFrames: number;
    bestLag: number;
    topPeaks: Array<{ lag: number; score: number }>;
  };
}

export function computeOnsetEnvelope(
  channelData: Float32Array,
  sampleRate: number,
  fftSize = 8192,
  hopSize = 2048
): { onsetEnvelope: Float32Array; numFrames: number } {
  const numFrames = Math.floor((channelData.length - fftSize) / hopSize);
  if (numFrames <= 0) {
    return { onsetEnvelope: new Float32Array(0), numFrames: 0 };
  }

  const hannWindow = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }

  const onsetEnvelope = new Float32Array(numFrames);
  let prevSpectrum = new Float32Array(fftSize / 2);

  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);

  for (let f = 0; f < numFrames; f++) {
    const frameStart = f * hopSize;
    for (let i = 0; i < fftSize; i++) {
      real[i] = channelData[frameStart + i] * hannWindow[i];
      imag[i] = 0;
    }

    fft(real, imag);

    let onsetFlux = 0;
    const spectrum = new Float32Array(fftSize / 2);

    for (let i = 0; i < fftSize / 2; i++) {
      const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
      spectrum[i] = mag;
      const diff = mag - prevSpectrum[i];
      if (diff > 0) onsetFlux += diff;
    }

    prevSpectrum = spectrum;
    onsetEnvelope[f] = onsetFlux;
  }

  return { onsetEnvelope, numFrames };
}

export function trackBeatsFromOnsetEnvelope(
  onsetEnvelope: Float32Array,
  sampleRate: number,
  duration: number,
  hopSize = 2048,
  fftSize = 8192
): BeatAnalysisResult {
  const fps = sampleRate / hopSize;
  const numFrames = onsetEnvelope.length;

  if (numFrames < 4) {
    return {
      estimatedBpm: 120,
      beatIntervalSec: 0.5,
      bestPhaseOffset: 0,
      beats: [0],
      bpmConfidence: 0,
      onsetEnvelope,
      sampleRate,
      hopSize,
      fftSize
    };
  }

  // (a) Tempo estimation via autocorrelation of onset envelope across 60-200 BPM range
  let onsetSum = 0;
  for (let i = 0; i < numFrames; i++) onsetSum += onsetEnvelope[i];
  const onsetMean = onsetSum / (numFrames || 1);

  // Standardized / zero-mean onset envelope
  const normOnset = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    normOnset[i] = onsetEnvelope[i] - onsetMean;
  }

  const minBpm = 60;
  const maxBpm = 200;
  const minLag = Math.max(1, Math.floor((60 / maxBpm) * fps));
  const maxLag = Math.min(numFrames - 1, Math.ceil((60 / minBpm) * fps));

  const autocor = new Float32Array(maxLag + 1);
  if (maxLag > minLag && numFrames > maxLag) {
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      const limit = normOnset.length - lag;
      for (let i = 0; i < limit; i++) {
        sum += normOnset[i] * normOnset[i + lag];
      }
      autocor[lag] = sum;
    }
  }

  interface Peak { lag: number; score: number; }
  let peaks: Peak[] = [];
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (autocor[lag] > autocor[lag - 1] && autocor[lag] > autocor[lag + 1]) {
      peaks.push({ lag, score: autocor[lag] });
    }
  }

  peaks.sort((a, b) => b.score - a.score);
  const topPeaks = peaks.slice(0, 8);

  let bestLag = minLag;
  let bestScore = -Infinity;

  topPeaks.forEach(peak => {
    const lag = peak.lag;
    let totalScore = peak.score;

    const doubleLag = lag * 2;
    if (doubleLag <= maxLag) {
      totalScore += 0.45 * autocor[doubleLag];
    }

    const halfLag = Math.round(lag / 2);
    if (halfLag >= minLag) {
      totalScore += 0.45 * autocor[halfLag];
    }

    const bpmCand = 60 / ((lag * hopSize) / sampleRate);
    const tempoPrior = Math.exp(-Math.pow(Math.log2(bpmCand / 115) / 0.7, 2));
    totalScore *= (0.7 + 0.3 * tempoPrior);

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestLag = lag;
    }
  });

  if (topPeaks.length === 0) {
    let maxCorr = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (autocor[lag] > maxCorr) { maxCorr = autocor[lag]; bestLag = lag; }
    }
  }

  // Parabolic interpolation around peak to get exact fractional lag
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const alpha = autocor[bestLag - 1];
    const beta = autocor[bestLag];
    const gamma = autocor[bestLag + 1];
    const denom = alpha - 2 * beta + gamma;
    if (Math.abs(denom) > 1e-6) {
      const delta = 0.5 * (alpha - gamma) / denom;
      if (Math.abs(delta) < 1.0) {
        refinedLag = bestLag + delta;
      }
    }
  }

  // (b) Fine continuous search & joint period-phase optimization across the full onset envelope
  // Coarse beat period candidate
  const coarseInterval = Math.max(0.25, Math.min(1.25, (refinedLag * hopSize) / sampleRate));
  const onsetFluxSampleOffset = fftSize / 2; // 4096 samples for N=8192 (STFT window center)

  // Continuous onset energy scoring function for candidate (period T, phase offset phi)
  const windowSigmaFrames = Math.max(1.0, (0.035 * sampleRate) / hopSize); // 35ms Gaussian window

  function scoreGrid(periodSec: number, phaseSec: number): number {
    let score = 0;
    let count = 0;
    let beatTime = phaseSec;
    while (beatTime < duration) {
      const centerFrame = (beatTime * sampleRate - onsetFluxSampleOffset) / hopSize;
      if (centerFrame >= 0 && centerFrame < numFrames) {
        const minF = Math.max(0, Math.floor(centerFrame - 3));
        const maxF = Math.min(numFrames - 1, Math.ceil(centerFrame + 3));

        let localEnergy = 0;
        for (let f = minF; f <= maxF; f++) {
          const dist = f - centerFrame;
          const weight = Math.exp(-0.5 * Math.pow(dist / windowSigmaFrames, 2));
          localEnergy += onsetEnvelope[f] * weight;
        }
        score += localEnergy;
        count++;
      }
      beatTime += periodSec;
    }
    return count > 0 ? score / Math.sqrt(count) : 0;
  }

  // 1. Coarse Phase Search at coarseInterval
  const numCoarsePhaseCandidates = 100;
  let bestPhaseOffset = 0;
  let maxCoarsePhaseScore = -Infinity;
  for (let p = 0; p < numCoarsePhaseCandidates; p++) {
    const candPhase = (p / numCoarsePhaseCandidates) * coarseInterval;
    const score = scoreGrid(coarseInterval, candPhase);
    if (score > maxCoarsePhaseScore) {
      maxCoarsePhaseScore = score;
      bestPhaseOffset = candPhase;
    }
  }

  // 2. Fine High-Resolution Period Search around coarseInterval (+/- 3% in steps of 0.0002s)
  const periodRange = 0.03 * coarseInterval;
  const numPeriodSteps = 150;
  const periodStep = (2 * periodRange) / numPeriodSteps;

  let bestPeriod = coarseInterval;
  let bestJointScore = -Infinity;
  let bestJointPhase = bestPhaseOffset;

  const periodScores: { period: number; score: number }[] = [];

  for (let step = 0; step <= numPeriodSteps; step++) {
    const candPeriod = coarseInterval - periodRange + step * periodStep;

    // Fast local phase search for this candidate period
    const numPhaseSteps = 40;
    let maxPhaseScoreForPeriod = -Infinity;
    let bestPhaseForPeriod = 0;

    for (let p = 0; p < numPhaseSteps; p++) {
      const candPhase = (p / numPhaseSteps) * candPeriod;
      const score = scoreGrid(candPeriod, candPhase);
      if (score > maxPhaseScoreForPeriod) {
        maxPhaseScoreForPeriod = score;
        bestPhaseForPeriod = candPhase;
      }
    }

    periodScores.push({ period: candPeriod, score: maxPhaseScoreForPeriod });

    if (maxPhaseScoreForPeriod > bestJointScore) {
      bestJointScore = maxPhaseScoreForPeriod;
      bestPeriod = candPeriod;
      bestJointPhase = bestPhaseForPeriod;
    }
  }

  // 3. Sub-step Parabolic Peak Refinement on period score curve
  const bestPeriodIdx = periodScores.findIndex((p) => p.period === bestPeriod);
  let refinedBeatIntervalSec = bestPeriod;

  if (bestPeriodIdx > 0 && bestPeriodIdx < periodScores.length - 1) {
    const alpha = periodScores[bestPeriodIdx - 1].score;
    const beta = periodScores[bestPeriodIdx].score;
    const gamma = periodScores[bestPeriodIdx + 1].score;
    const denom = alpha - 2 * beta + gamma;
    if (Math.abs(denom) > 1e-6) {
      const delta = 0.5 * (alpha - gamma) / denom;
      if (Math.abs(delta) < 1.0) {
        refinedBeatIntervalSec = bestPeriod + delta * periodStep;
      }
    }
  }

  const beatIntervalSec = Math.max(0.25, Math.min(1.25, refinedBeatIntervalSec));

  // 4. Final Ultra-Fine Phase Refinement (+/- 10ms with 0.5ms steps around bestJointPhase)
  bestPhaseOffset = bestJointPhase;
  let bestFinalPhaseScore = -Infinity;
  for (let deltaSec = -0.015; deltaSec <= 0.015; deltaSec += 0.0005) {
    let candPhase = bestJointPhase + deltaSec;
    while (candPhase < 0) candPhase += beatIntervalSec;
    while (candPhase >= beatIntervalSec) candPhase -= beatIntervalSec;

    const score = scoreGrid(beatIntervalSec, candPhase);
    if (score > bestFinalPhaseScore) {
      bestFinalPhaseScore = score;
      bestPhaseOffset = candPhase;
    }
  }

  let estimatedBpm = Math.round(60 / beatIntervalSec);
  if (estimatedBpm < 60) estimatedBpm = 60;
  if (estimatedBpm > 200) estimatedBpm = 200;

  const bpmConfidence = Math.min(99, Math.max(0, Math.round((autocor[Math.round(bestLag)] / (onsetSum || 1)) * 100)));

  // Normalize bestPhaseOffset: if phase is within 40ms of beatIntervalSec, wrap to 0 for initial beat
  if (bestPhaseOffset > beatIntervalSec - 0.04) {
    bestPhaseOffset = 0;
  }

  // Generate beat grid starting from the earliest downbeat in the file
  const beats: number[] = [];
  let currentBeatTime = bestPhaseOffset;
  // Back-propagate if phase offset leaves an initial beat near t = 0
  while (currentBeatTime - beatIntervalSec >= -0.04) {
    currentBeatTime -= beatIntervalSec;
  }

  while (currentBeatTime < duration) {
    if (currentBeatTime >= -0.04) {
      const normalizedTime = Math.max(0, currentBeatTime);
      beats.push(Number(normalizedTime.toFixed(3)));
    }
    currentBeatTime += beatIntervalSec;
  }

  if (beats.length === 0) {
    beats.push(0);
  }
  beats.sort((a, b) => a - b);

  return {
    estimatedBpm,
    beatIntervalSec,
    bestPhaseOffset,
    beats,
    bpmConfidence,
    onsetEnvelope,
    sampleRate,
    hopSize,
    fftSize,
    diagnostics: {
      numFrames,
      bestLag,
      topPeaks
    }
  };
}

export function detectBeats(
  channelData: Float32Array,
  sampleRate: number,
  duration: number,
  fftSize = 8192,
  hopSize = 2048
): BeatAnalysisResult {
  const { onsetEnvelope } = computeOnsetEnvelope(channelData, sampleRate, fftSize, hopSize);
  return trackBeatsFromOnsetEnvelope(onsetEnvelope, sampleRate, duration, hopSize, fftSize);
}

// Fast pure-JS FFT implementation
export function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      const tr = real[i]; real[i] = real[j]; real[j] = tr;
      const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
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
