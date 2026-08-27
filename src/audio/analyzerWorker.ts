// Guitariz-inspired MIR Engine for JOE-Music
// Features: Tuning Estimation, CQT-like Chroma, HPSS, HMM Viterbi Decoding, Bass Estimation

import { normalizeChord } from "./chordNormalizer";
import { NOTE_NAMES, scoreCandidate } from "./chordScoring";
import { stabilizeChordSegments } from "./harmonicStabilizer";
import { trackBeatsFromOnsetEnvelope } from "./beatTracker";

// Define Chord Qualities
const QUALITIES = [
  { q: "maj", p: [0, 4, 7], label: "" },
  { q: "min", p: [0, 3, 7], label: "m" },
  { q: "7", p: [0, 4, 7, 10], label: "7" },
  { q: "maj7", p: [0, 4, 7, 11], label: "maj7" },
  { q: "min7", p: [0, 3, 7, 10], label: "m7" },
  { q: "dim", p: [0, 3, 6], label: "dim" },
  { q: "aug", p: [0, 4, 8], label: "aug" },
  { q: "sus2", p: [0, 2, 7], label: "sus2" },
  { q: "sus4", p: [0, 5, 7], label: "sus4" },
  { q: "add9", p: [0, 2, 4, 7], label: "add9" },
  { q: "5", p: [0, 7], label: "5" }
];

// Generate 132 templates
const CHORD_STATES = [];
NOTE_NAMES.forEach((root, rootIdx) => {
  QUALITIES.forEach(qual => {
    const profile = new Float32Array(12);
    qual.p.forEach(interval => {
      profile[(rootIdx + interval) % 12] = 1.0;
    });
    // Add harmonic weighting
    if (qual.p.includes(7)) profile[(rootIdx + 7) % 12] = 0.8;
    CHORD_STATES.push({
      id: CHORD_STATES.length,
      root: root,
      rootIdx: rootIdx,
      quality: qual.q,
      label: root + qual.label,
      profile: profile,
      intervals: qual.p
    });
  });
});

const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function reportProgress(message, percent) {
  self.postMessage({ type: "progress", message, percent });
}

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < 12; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Fast pure-JS FFT implementation
function fft(real, imag) {
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
      for (let j = 0; j < halfLen; j++) {
        const u = i + j;
        const v = i + j + halfLen;
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

self.onmessage = function (e) {
  try {
    const { channelData, sampleRate, duration } = e.data;
    reportProgress("Preprocessing Audio...", 5);

    // 1. STFT & HPCP Extraction
    reportProgress("Extracting CQT/HPCP Features...", 15);
    
    // We use a high resolution FFT to emulate CQT for chroma extraction
    const fftSize = 8192;
    const hopSize = 2048; // Updated for ~21.5 frames/sec temporal resolution
    const numFrames = Math.floor((channelData.length - fftSize) / hopSize);
    
    const hannWindow = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    }

    const chromagram = [];
    const bassChromagram = [];
    const onsetEnvelope = new Float32Array(numFrames);
    let prevSpectrum = new Float32Array(fftSize / 2);

    // Tuning Estimation Variables
    const peakFreqs = [];

    // STFT Loop
    for (let f = 0; f < numFrames; f++) {
      if (f % 200 === 0) reportProgress("Extracting CQT/HPCP Features...", 15 + (f/numFrames)*35);
      
      const frameStart = f * hopSize;
      const real = new Float32Array(fftSize);
      const imag = new Float32Array(fftSize);
      
      for (let i = 0; i < fftSize; i++) {
        real[i] = channelData[frameStart + i] * hannWindow[i];
      }
      
      fft(real, imag);
      
      const chroma = new Float32Array(12);
      const bassChroma = new Float32Array(12);
      let energy = 0;
      let onsetFlux = 0;
      
      const spectrum = new Float32Array(fftSize / 2);
      
      for (let i = 0; i < fftSize / 2; i++) {
        const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        spectrum[i] = mag;
        energy += mag;
        
        const diff = mag - prevSpectrum[i];
        if (diff > 0) onsetFlux += diff;
        
        const freq = (i * sampleRate) / fftSize;
        if (mag > 0.01) {
          if (freq >= 40 && freq <= 250) { // Bass region
            const midi = 69 + 12 * Math.log2(freq / 440);
            const pitchClass = Math.round(midi) % 12;
            bassChroma[(pitchClass + 12) % 12] += mag;
          }
          if (freq >= 65.41 && freq <= 1046.50) { // Harmonic region
            const exactMidi = 69 + 12 * Math.log2(freq / 440);
            const pitchClass = Math.round(exactMidi) % 12;
            chroma[(pitchClass + 12) % 12] += mag;
            
            // Collect prominent peaks for tuning estimation
            if (mag > 0.5) peakFreqs.push(exactMidi - Math.round(exactMidi));
          }
        }
      }
      
      prevSpectrum = spectrum;
      onsetEnvelope[f] = onsetFlux;
      
      // Normalize chromas
      let maxC = Math.max(...chroma) || 1;
      for (let i = 0; i < 12; i++) chroma[i] /= maxC;
      
      let maxB = Math.max(...bassChroma) || 1;
      for (let i = 0; i < 12; i++) bassChroma[i] /= maxB;
      
      chromagram.push(chroma);
      bassChromagram.push(bassChroma);
    }

    reportProgress("Estimating Tuning & Key...", 55);
    // Tuning deviation
    peakFreqs.sort((a,b) => a - b);
    let tuningDeviationCents = 0;
    if (peakFreqs.length > 0) {
      const medianDeviation = peakFreqs[Math.floor(peakFreqs.length / 2)];
      tuningDeviationCents = Math.round(medianDeviation * 100);
    }
    
    // Global Key Estimation
    const globalChroma = new Float32Array(12);
    for (let c of chromagram) {
      for (let i=0; i<12; i++) globalChroma[i] += c[i];
    }
    let bestKeyScore = -Infinity;
    let estimatedKey = "C Major";
    for (let i = 0; i < 12; i++) {
      let majScore = 0, minScore = 0;
      for (let j = 0; j < 12; j++) {
        majScore += globalChroma[(i+j)%12] * KS_MAJOR[j];
        minScore += globalChroma[(i+j)%12] * KS_MINOR[j];
      }
      if (majScore > bestKeyScore) { bestKeyScore = majScore; estimatedKey = NOTE_NAMES[i] + " Major"; }
      if (minScore > bestKeyScore) { bestKeyScore = minScore; estimatedKey = NOTE_NAMES[i] + " Minor"; }
    }

    reportProgress("Beat Tracking...", 65);
    const beatTrackingResult = trackBeatsFromOnsetEnvelope(
      onsetEnvelope,
      sampleRate,
      duration,
      hopSize,
      fftSize
    );
    const {
      estimatedBpm,
      beatIntervalSec,
      bpmConfidence,
      beats
    } = beatTrackingResult;

    // Helper: Distance to nearest beat
    function getDistanceToNearestBeat(timeSec) {
      if (beats.length === 0) return 999;
      let minDiff = Infinity;
      for (let i = 0; i < beats.length; i++) {
        const diff = Math.abs(timeSec - beats[i]);
        if (diff < minDiff) {
          minDiff = diff;
        } else if (diff > minDiff) {
          break;
        }
      }
      return minDiff;
    }

    reportProgress("Beat-Aware Adaptive HMM Viterbi Decoding...", 75);
    if (numFrames < 4) {
      throw new Error(`Audio buffer is too short (${numFrames} frames calculated, minimum of 4 required). Please provide longer audio.`);
    }

    const nStates = CHORD_STATES.length;
    const viterbi = [];
    const backpointers = [];
    
    // Check for NaN or Inf in chromagram
    let hasNaNOrInf = false;
    for (let c of chromagram) {
      for (let i = 0; i < 12; i++) {
        if (isNaN(c[i]) || !isFinite(c[i])) {
          hasNaNOrInf = true;
          break;
        }
      }
      if (hasNaNOrInf) break;
    }

    // Beat-Aware Adaptive HMM Configuration
    const EMISSION_SCALE = 2.5; // Scaled emission log-likelihood
    const pSelfBase = 0.88;    // Normal self-transition probability between beats
    const pSelfBeat = 0.68;    // Lower self-transition probability on/near beat boundaries

    // Init Frame t = 0
    const initCol = new Float32Array(nStates);
    for (let s = 0; s < nStates; s++) {
      const sim = cosineSimilarity(chromagram[0], CHORD_STATES[s].profile);
      initCol[s] = EMISSION_SCALE * Math.log(sim + 1e-6);
    }
    viterbi.push(initCol);
    
    for (let t = 1; t < numFrames; t++) {
      if (t % 400 === 0) reportProgress("Beat-Aware Adaptive HMM Viterbi Decoding...", 75 + (t/numFrames)*15);
      
      const frameTime = (t * hopSize) / sampleRate;
      const distToBeat = getDistanceToNearestBeat(frameTime);
      // Gaussian weighting around beat boundaries (sigma = 80ms)
      const beatFactor = Math.exp(-Math.pow(distToBeat / 0.08, 2));
      
      // Adaptive self-transition: lowers to ~0.68 at beats, stays ~0.88 between beats
      const pSelf = pSelfBase - (pSelfBase - pSelfBeat) * beatFactor;
      const logSelf = Math.log(pSelf);
      const logOther = Math.log((1 - pSelf) / (nStates - 1));
      
      const obs = chromagram[t];
      const emProbs = new Float32Array(nStates);
      for (let s = 0; s < nStates; s++) {
        const sim = cosineSimilarity(obs, CHORD_STATES[s].profile);
        emProbs[s] = EMISSION_SCALE * Math.log(sim + 1e-6);
      }

      // Find top 2 max values in viterbi[t-1] for O(N) transition optimization
      const prevCol = viterbi[t-1];
      let max1Val = -Infinity, max1State = 0;
      let max2Val = -Infinity, max2State = 0;
      for (let s = 0; s < nStates; s++) {
        const val = prevCol[s];
        if (val > max1Val) {
          max2Val = max1Val;
          max2State = max1State;
          max1Val = val;
          max1State = s;
        } else if (val > max2Val) {
          max2Val = val;
          max2State = s;
        }
      }

      const vCol = new Float32Array(nStates);
      const bpCol = new Int32Array(nStates);

      for (let curr = 0; curr < nStates; curr++) {
        const valSelf = prevCol[curr] + logSelf;
        const bestOtherVal = (curr === max1State) ? max2Val : max1Val;
        const bestOtherState = (curr === max1State) ? max2State : max1State;
        const valOther = bestOtherVal + logOther;

        if (valSelf >= valOther) {
          vCol[curr] = valSelf + emProbs[curr];
          bpCol[curr] = curr;
        } else {
          vCol[curr] = valOther + emProbs[curr];
          bpCol[curr] = bestOtherState;
        }
      }

      viterbi.push(vCol);
      backpointers.push(bpCol);
    }
    
    reportProgress("Finalizing Chord Timeline...", 90);
    // Backtrack
    let lastState = 0;
    let maxV = -Infinity;
    for (let s = 0; s < nStates; s++) {
      if (viterbi[numFrames-1][s] > maxV) { maxV = viterbi[numFrames-1][s]; lastState = s; }
    }
    
    const statePath = new Int32Array(numFrames);
    statePath[numFrames-1] = lastState;
    for (let t = numFrames - 1; t > 0; t--) {
      statePath[t-1] = backpointers[t-1][statePath[t]];
    }
    
    // Segment grouping
    const rawSegments = [];
    let currentSeg = {
      stateId: statePath[0],
      startFrame: 0,
      endFrame: 0,
    };
    
    for (let t = 1; t < numFrames; t++) {
      if (statePath[t] !== currentSeg.stateId) {
        currentSeg.endFrame = t;
        rawSegments.push(currentSeg);
        currentSeg = { stateId: statePath[t], startFrame: t, endFrame: t };
      }
    }
    currentSeg.endFrame = numFrames - 1;
    rawSegments.push(currentSeg);
    
    // Merge short noise glitches (< 0.25 seconds safety floor)
    const MIN_SEGMENT_DURATION = 0.25; // seconds
    const minFrames = Math.max(2, Math.round((MIN_SEGMENT_DURATION * sampleRate) / hopSize));

    const mergedSegments = [];
    for (let i = 0; i < rawSegments.length; i++) {
      const seg = rawSegments[i];
      const durFrames = seg.endFrame - seg.startFrame;
      if (durFrames < minFrames && mergedSegments.length > 0) {
        mergedSegments[mergedSegments.length - 1].endFrame = seg.endFrame;
      } else {
        mergedSegments.push({ ...seg });
      }
    }

    // Build final ChordSegment output with Beat-Snap alignment
    const finalSegments = [];
    let transitionsNearBeats = 0;
    let transitionsAwayFromBeats = 0;
    let currentStartTime = 0;

    for (let i = 0; i < mergedSegments.length; i++) {
      const seg = mergedSegments[i];
      const state = CHORD_STATES[seg.stateId];
      
      const rawStartTime = (seg.startFrame * hopSize) / sampleRate;
      const rawEndTime = ((seg.endFrame + 1) * hopSize) / sampleRate;
      
      // Beat-snap transition alignment within 0.20s threshold
      let snappedEndTime = rawEndTime;
      if (i < mergedSegments.length - 1) {
        const dist = getDistanceToNearestBeat(rawEndTime);
        if (dist <= 0.20) {
          transitionsNearBeats++;
          let nearestB = rawEndTime;
          let minDist = Infinity;
          for (let b of beats) {
            if (Math.abs(b - rawEndTime) < minDist) {
              minDist = Math.abs(b - rawEndTime);
              nearestB = b;
            }
          }
          snappedEndTime = nearestB;
        } else {
          transitionsAwayFromBeats++;
        }
      } else {
        snappedEndTime = duration;
      }
      
      const startTime = (i === 0) ? 0 : currentStartTime;
      const endTime = Math.max(startTime + 0.15, snappedEndTime);
      currentStartTime = endTime;

      const viterbiChordState = CHORD_STATES[seg.stateId];
      const viterbiChord = viterbiChordState.label;

      // Extract Mean Chroma and Mean Bass Chroma for the segment
      const numSegFrames = seg.endFrame - seg.startFrame + 1;
      const meanChroma = new Float32Array(12);
      const meanBassChroma = new Float32Array(12);
      
      for (let f = seg.startFrame; f <= seg.endFrame; f++) {
        for (let k = 0; k < 12; k++) {
          meanChroma[k] += chromagram[f][k];
          meanBassChroma[k] += bassChromagram[f][k];
        }
      }
      
      let maxC = 0, maxB = 0;
      for (let k = 0; k < 12; k++) {
        meanChroma[k] /= numSegFrames;
        meanBassChroma[k] /= numSegFrames;
        if (meanChroma[k] > maxC) maxC = meanChroma[k];
        if (meanBassChroma[k] > maxB) maxB = meanBassChroma[k];
      }
      // Normalize to 0-1 for evidence scoring
      const rawChromaArray = [];
      for (let k = 0; k < 12; k++) {
        meanChroma[k] = maxC > 0 ? meanChroma[k] / maxC : 0;
        meanBassChroma[k] = maxB > 0 ? meanBassChroma[k] / maxB : 0;
        rawChromaArray.push(Number(meanChroma[k].toFixed(3)));
      }

      // Helper: get diatonic chords for key
      const [keyNote, keyQuality] = estimatedKey.split(" ");
      const keyRootIdx = NOTE_NAMES.indexOf(keyNote);
      let diatonicRoots: number[] = [];
      let diatonicQualities: string[] = [];
      
      if (keyQuality === "Major") {
        diatonicRoots = [0, 2, 4, 5, 7, 9, 11].map(iv => (keyRootIdx + iv) % 12);
        diatonicQualities = ["maj", "min", "min", "maj", "maj", "min", "dim"];
      } else {
        diatonicRoots = [0, 2, 3, 5, 7, 8, 10].map(iv => (keyRootIdx + iv) % 12);
        diatonicQualities = ["min", "dim", "maj", "min", "min", "maj", "maj"];
      }

      // Evidence-Aware Scoring Function uses imported scoreCandidate
      const scoredCandidates = CHORD_STATES.map(c => {
         const result = scoreCandidate(c, meanChroma, meanBassChroma);
         
         // 8. Weak Diatonic Prior
         const diatonicIdx = diatonicRoots.indexOf(result.candidate.rootIdx);
         if (diatonicIdx !== -1) {
            const expectedQuality = diatonicQualities[diatonicIdx];
            if (result.candidate.quality === expectedQuality || result.candidate.quality === expectedQuality + "7") {
               result.score += 0.04; // Weak prior, won't override strong evidence
               result.trebleScore += 0.04;
            }
         }
         return result;
      });
      
      // Step 1: Initial sort by score
      scoredCandidates.sort((a, b) => b.score - a.score);
      
      const rawMirWinner = scoredCandidates[0].candidate.label;
      const top5Candidates = scoredCandidates.slice(0, 5).map(c => ({
          chord: c.candidate.label,
          score: Number(c.score.toFixed(3)),
          trebleScore: Number(c.trebleScore.toFixed(3)),
          thirdEvidence: Number(c.thirdEvidence.toFixed(3)),
          missingTones: c.missingTones.join(", ")
      }));
      
      // Step 2: Post-process power chords vs triads
      let winner = scoredCandidates[0];
      
      if (winner.candidate.quality === "5") {
         // Find best major/minor triads for this root
         const root = winner.candidate.rootIdx;
         const bestMajor = scoredCandidates.find(c => c.candidate.rootIdx === root && c.candidate.quality === "maj");
         const bestMinor = scoredCandidates.find(c => c.candidate.rootIdx === root && c.candidate.quality === "min");
         
         const majorScore = bestMajor ? bestMajor.score : -Infinity;
         const minorScore = bestMinor ? bestMinor.score : -Infinity;
         const bestTriadScore = Math.max(majorScore, minorScore);
         
         // Evaluate third presence (maj3 or min3)
         const pcMaj3 = (root + 4) % 12;
         const pcMin3 = (root + 3) % 12;
         const actualThirdEvidence = Math.max(meanChroma[pcMaj3], meanChroma[pcMin3]);
         
         const POWER_CHORD_MARGIN = 0.12;
         const POWER_CHORD_ABSENCE_THRESHOLD = 0.12; // 6. Prevent G -> G5 if third is present even slightly
         
         // If third is moderately present OR the score margin isn't huge, fallback to the best triad
         if (actualThirdEvidence >= POWER_CHORD_ABSENCE_THRESHOLD || winner.score <= bestTriadScore + POWER_CHORD_MARGIN) {
             if (majorScore >= minorScore && bestMajor) {
                 winner = bestMajor;
             } else if (bestMinor) {
                 winner = bestMinor;
             }
             // Re-sort so winner is at index 0 for consistency
             scoredCandidates.splice(scoredCandidates.indexOf(winner), 1);
             scoredCandidates.unshift(winner);
         }
      }
      
      // 7. Prevent false minor/major decisions (e.g. F vs Fm) when margin is small
      if (winner.candidate.quality === "min" || winner.candidate.quality === "maj") {
         const root = winner.candidate.rootIdx;
         const isWinnerMinor = winner.candidate.quality === "min";
         const oppQuality = isWinnerMinor ? "maj" : "min";
         const opponent = scoredCandidates.find(c => c.candidate.rootIdx === root && c.candidate.quality === oppQuality);
         
         if (opponent) {
             const margin = winner.score - opponent.score;
             // If they are very close, and the opponent is the diatonic one, prefer the opponent
             const oppDiatonicIdx = diatonicRoots.indexOf(opponent.candidate.rootIdx);
             const oppIsDiatonic = oppDiatonicIdx !== -1 && diatonicQualities[oppDiatonicIdx] === oppQuality;
             
             if (margin < 0.05 && oppIsDiatonic) {
                 winner = opponent;
                 scoredCandidates.splice(scoredCandidates.indexOf(winner), 1);
                 scoredCandidates.unshift(winner);
             }
         }
      }
      
      const alt = scoredCandidates[1];
      
      const bestBassNote = NOTE_NAMES[winner.bassNoteIdx];

      // Use structured normalization
      const norm = normalizeChord({
        root: winner.candidate.root,
        quality: winner.candidate.quality,
        bass: bestBassNote !== winner.candidate.root ? bestBassNote : undefined
      }, estimatedKey);

      // Recompute confidence mapping
      const confidence = Math.max(0, Math.min(99, Math.round(winner.score * 100)));
      const midFrame = Math.floor((seg.startFrame + seg.endFrame) / 2);
      const stability = Math.min(99, Math.round(cosineSimilarity(chromagram[midFrame], winner.candidate.profile) * 95 + 5));

      const diag = {
        detectedChord: norm.canonicalLabel,
        rawMirWinner,
        viterbiChord,
        top5Candidates,
        rawChromaArray,
        topAlternative: alt ? alt.candidate.label : "none",
        detectedScore: Number(winner.score.toFixed(3)),
        trebleScore: Number(winner.trebleScore.toFixed(3)),
        alternativeScore: alt ? Number(alt.score.toFixed(3)) : 0,
        scoreMargin: alt ? Number((winner.score - alt.score).toFixed(3)) : 0,
        requiredTones: winner.requiredTones,
        toneEvidence: winner.toneEvidence,
        missingTones: winner.missingTones,
        complexityPenalty: winner.complexityPenalty,
        slashPenalty: winner.slashPenalty,
        thirdEvidence: Number(winner.thirdEvidence.toFixed(3)),
        slashBassEvidence: Number(meanBassChroma[winner.bassNoteIdx].toFixed(3)),
        slashBassRatio: winner.isSlash ? Number((meanBassChroma[winner.bassNoteIdx] / (winner.rootBassEv + 1e-6)).toFixed(3)) : 1.0,
        thirdStatus: winner.thirdEvidence >= 0.25 ? "MODERATE/STRONG" : "WEAK/ABSENT"
      };

      finalSegments.push({
        id: `seg-${i}`,
        chord: norm.canonicalLabel,
        root: norm.root,
        bass: norm.bass || norm.root,
        quality: norm.qualitySymbol,
        extensions: norm.extensions,
        startTime: Number(startTime.toFixed(3)),
        endTime: Number(endTime.toFixed(3)),
        rawStartTime: Number(rawStartTime.toFixed(3)),
        rawEndTime: Number(rawEndTime.toFixed(3)),
        confidence: confidence,
        stability: stability,
        beatStart: beats.find(b => Math.abs(b - startTime) < 0.2),
        beatEnd: beats.find(b => Math.abs(b - endTime) < 0.2),
        diagnostics: diag
      });
    }

    // Apply Post-MIR Harmonic Stabilization & Musical Segmentation Layer
    const rawChordSegmentCount = finalSegments.length;
    const stabilizationResult = stabilizeChordSegments(finalSegments, {
      beats,
      tempo: estimatedBpm,
      keyContext: estimatedKey,
      duration,
    });
    const stabilizedSegments = stabilizationResult.segments;
    const stabDiag = stabilizationResult.diagnostics;

    // Diagnostics calculations based on stabilized timeline
    const segDurations = stabilizedSegments.map(s => s.endTime - s.startTime);
    const avgSegmentDuration = Number((segDurations.reduce((a, b) => a + b, 0) / (stabilizedSegments.length || 1)).toFixed(2));
    const sortedDurs = [...segDurations].sort((a, b) => a - b);
    const medianSegmentDuration = Number((sortedDurs[Math.floor(sortedDurs.length / 2)] || 0).toFixed(2));
    const minSegmentDuration = Number((sortedDurs[0] || 0).toFixed(2));
    const maxSegmentDuration = Number((sortedDurs[sortedDurs.length - 1] || 0).toFixed(2));

    const numChordChanges = Math.max(0, stabilizedSegments.length - 1);
    const changesPerMinute = Number((numChordChanges / ((duration / 60) || 1)).toFixed(1));
    const averageChordConfidence = Math.round(stabilizedSegments.reduce((a, b) => a + b.confidence, 0) / (stabilizedSegments.length || 1));
    const averageTransitionConfidence = Math.round(stabilizedSegments.reduce((a, b) => a + b.stability, 0) / (stabilizedSegments.length || 1));

    // Group into logical UI sections
    const sections = [];
    const sectionNames = ["Intro", "Verse 1", "Chorus", "Verse 2", "Bridge", "Outro"];
    let secIdx = 0;
    let currentSecChords = [];
    let currentSecStart = 0;
    
    stabilizedSegments.forEach(seg => {
      currentSecChords.push(seg.chord);
      if (seg.endTime - currentSecStart > 16 || seg.id === stabilizedSegments[stabilizedSegments.length-1].id) {
        if (currentSecChords.length > 0) {
          sections.push({
            name: sectionNames[secIdx % sectionNames.length],
            startTime: currentSecStart,
            bars: Math.max(4, Math.floor(currentSecChords.length / 2)),
            chords: currentSecChords,
            strummingPattern: "D - D U - U D -",
            confidence: seg.confidence
          });
          secIdx++;
          currentSecChords = [];
          currentSecStart = seg.endTime;
        }
      }
    });

    const uniqueChords = Array.from(new Set(stabilizedSegments.map(s => s.chord)));
    const overallConfidence = stabilizedSegments.reduce((a,b) => a + b.confidence, 0) / (stabilizedSegments.length || 1);

    reportProgress("Analysis Complete", 100);

    self.postMessage({
      type: "result",
      analysis: {
        estimatedBpm,
        tuningDeviationCents,
        key: estimatedKey,
        sections,
        chordSegments: stabilizedSegments,
        rawTimelinesForDebug: finalSegments, // this has rawMirWinner, viterbiChord, top5Candidates
        uniqueChords,
        overallConfidence: Math.min(99, Math.round(overallConfidence)),
        beats,
        diagnostics: {
          workerSampleCount: channelData.length,
          featureFrameCount: numFrames,
          chromaFrameCount: chromagram.length,
          bassFrameCount: bassChromagram.length,
          keyResult: estimatedKey,
          estimatedBpm,
          beatIntervalSec,
          bpmConfidence,
          numChordStates: nStates,
          observationMatrixDims: `${numFrames}x${nStates}`,
          hasNaNOrInf,
          viterbiInputDims: `${numFrames}x${nStates}`,
          viterbiOutputLen: statePath.length,
          rawChordSegmentCount,
          finalChordSegmentCount: stabilizedSegments.length,
          rawSegmentCount: stabDiag.rawSegmentCount,
          stabilizedSegmentCount: stabDiag.stabilizedSegmentCount,
          mergedSegments: stabDiag.mergedSegments,
          rejectedTransientSlashSegments: stabDiag.rejectedTransientSlashSegments,
          finalProgression: stabDiag.finalProgression,
          avgSegmentDuration,
          medianSegmentDuration,
          minSegmentDuration,
          maxSegmentDuration,
          numChordChanges,
          changesPerMinute,
          averageChordConfidence,
          averageTransitionConfidence,
          transitionsNearBeats,
          transitionsAwayFromBeats
        }
      }
    });
    
  } catch (err) {
    self.postMessage({ type: "error", error: err.message });
  }
};
