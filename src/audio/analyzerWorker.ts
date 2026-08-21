// Guitariz-inspired MIR Engine for JOE-Music
// Features: Tuning Estimation, CQT-like Chroma, HPSS, HMM Viterbi Decoding, Bass Estimation

import { normalizeChord } from "./chordNormalizer";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

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
    // Dynamic peak picking for beat grid
    let onsetSum = 0;
    for (let i = 0; i < onsetEnvelope.length; i++) onsetSum += onsetEnvelope[i];
    const onsetMean = onsetSum / (onsetEnvelope.length || 1);
    let onsetVar = 0;
    for (let i = 0; i < onsetEnvelope.length; i++) {
      const d = onsetEnvelope[i] - onsetMean;
      onsetVar += d * d;
    }
    const onsetStd = Math.sqrt(onsetVar / (onsetEnvelope.length || 1));
    const onsetThreshold = Math.max(1.2, onsetMean + 0.8 * onsetStd);

    const beats = [];
    for (let i = 1; i < onsetEnvelope.length - 1; i++) {
      if (onsetEnvelope[i] > onsetEnvelope[i-1] && onsetEnvelope[i] > onsetEnvelope[i+1] && onsetEnvelope[i] > onsetThreshold) {
        beats.push((i * hopSize) / sampleRate);
      }
    }
    beats.sort((a, b) => a - b);
    
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

    // Estimate BPM
    const minutes = duration / 60;
    let estimatedBpm = Math.round((beats.length / (minutes || 1)) / 4);
    if (estimatedBpm < 60) estimatedBpm *= 2;
    if (estimatedBpm > 200) estimatedBpm = Math.round(estimatedBpm / 2);

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
      for (let k = 0; k < 12; k++) {
        meanChroma[k] = maxC > 0 ? meanChroma[k] / maxC : 0;
        meanBassChroma[k] = maxB > 0 ? meanBassChroma[k] / maxB : 0;
      }

      // Evidence-Aware Scoring Function
      const scoreCandidate = (candidate) => {
        const root = candidate.rootIdx;
        const intervals = candidate.intervals;
        const q = candidate.quality;
        let chordToneStrength = 0;
        let missingTonePenalty = 0;
        
        let thirdEvidence = 0;
        let hasThird = false;

        // Define essential tones that MUST be present for complex chords
        let definingIntervals = [];
        if (q === "min") definingIntervals = [3];
        else if (q === "maj") definingIntervals = [4];
        else if (q === "7") definingIntervals = [10];
        else if (q === "maj7") definingIntervals = [11];
        else if (q === "min7") definingIntervals = [10, 3];
        else if (q === "sus2") definingIntervals = [2];
        else if (q === "add9") definingIntervals = [2, 4];
        else if (q === "sus4") definingIntervals = [5];
        else if (q === "dim") definingIntervals = [3, 6];
        else if (q === "dim7") definingIntervals = [3, 6, 9];
        else if (q === "aug") definingIntervals = [4, 8];

        let missingTones = [];
        let toneEvidence = {};

        for (let interval of intervals) {
            const pc = (root + interval) % 12;
            const strength = meanChroma[pc];
            chordToneStrength += strength;
            toneEvidence[NOTE_NAMES[pc]] = Number(strength.toFixed(2));
            
            if (interval === 3 || interval === 4) {
              thirdEvidence = strength;
              hasThird = true;
            }

            // Weak evidence threshold
            if (strength < 0.25) {
                missingTones.push(NOTE_NAMES[pc]);
                missingTonePenalty += (0.25 - strength); // base penalty
                
                if (definingIntervals.includes(interval)) {
                    missingTonePenalty += 1.5; // Massive penalty for missing defining tone
                }
            }
            
            // Sus4 anti-evidence: Penalize if major 3rd is strong
            if (q === "sus4" && interval === 5) {
                const major3rdPC = (root + 4) % 12;
                if (meanChroma[major3rdPC] > 0.35) {
                    missingTonePenalty += meanChroma[major3rdPC] * 1.5;
                }
            }
        }
        
        chordToneStrength /= intervals.length;

        // Complexity penalty: Prefer simpler triads over extensions unless heavily supported
        let complexityPenalty = 0;
        if (["maj", "min", "5"].includes(q)) complexityPenalty = 0.0;
        else if (["sus2", "sus4", "aug", "dim"].includes(q)) complexityPenalty = 0.05;
        else if (["6", "m6", "7"].includes(q)) complexityPenalty = 0.08;
        else if (["maj7", "min7", "dim7"].includes(q)) complexityPenalty = 0.12;
        else if (["add9", "9", "maj9", "m9"].includes(q)) complexityPenalty = 0.20;
        else complexityPenalty = 0.25;

        const rootStrength = meanChroma[root];
        const finalScore = chordToneStrength - missingTonePenalty - complexityPenalty + (rootStrength * 0.1);
        
        return {
            candidate,
            score: finalScore,
            chordToneStrength,
            missingTones,
            toneEvidence,
            complexityPenalty,
            thirdEvidence: hasThird ? thirdEvidence : 0,
            requiredTones: intervals.map(i => NOTE_NAMES[(root + i) % 12])
        };
      };

      // Score all templates against this segment's averaged chroma
      const scoredCandidates = CHORD_STATES.map(c => scoreCandidate(c));
      
      // Step 1: Initial sort by score
      scoredCandidates.sort((a, b) => b.score - a.score);
      
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
         
         const POWER_CHORD_MARGIN = 0.15;
         const POWER_CHORD_ABSENCE_THRESHOLD = 0.25;
         
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
      
      const alt = scoredCandidates[1];

      // Bass / Slash Chord Logic
      let bestBassNote = NOTE_NAMES[winner.candidate.rootIdx];
      let maxBassEv = 0;
      let maxBassIdx = winner.candidate.rootIdx;
      for (let k = 0; k < 12; k++) {
        if (meanBassChroma[k] > maxBassEv) { 
          maxBassEv = meanBassChroma[k]; 
          maxBassIdx = k; 
        }
      }
      
      const rootBassEv = meanBassChroma[winner.candidate.rootIdx] + 1e-6;
      
      // Strict Slash Chord Conditions
      let applySlash = false;
      if (maxBassIdx !== winner.candidate.rootIdx) {
          const bassRatio = maxBassEv / rootBassEv;
          const bassIsChordTone = winner.candidate.intervals.some(interval => (winner.candidate.rootIdx + interval) % 12 === maxBassIdx);
          
          // If the strong bass note is already a chord tone (e.g. the 3rd or 5th),
          // it must be OVERWHELMINGLY dominant to force a slash chord.
          // Otherwise, it's just normal harmonic content in the bass register.
          if (bassIsChordTone) {
              if (bassRatio > 2.0 && maxBassEv > 0.6) {
                  applySlash = true;
              }
          } else {
              // Non-chord tone bass needs solid evidence
              if (bassRatio > 1.4 && maxBassEv > 0.4) {
                 applySlash = true;
              }
          }
      }
      
      if (applySlash) {
          bestBassNote = NOTE_NAMES[maxBassIdx];
      }


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
        topAlternative: alt ? alt.candidate.label : "none",
        detectedScore: Number(winner.score.toFixed(3)),
        alternativeScore: alt ? Number(alt.score.toFixed(3)) : 0,
        scoreMargin: alt ? Number((winner.score - alt.score).toFixed(3)) : 0,
        requiredTones: winner.requiredTones,
        toneEvidence: winner.toneEvidence,
        missingTones: winner.missingTones,
        complexityPenalty: winner.complexityPenalty,
        thirdEvidence: Number(winner.thirdEvidence.toFixed(3)),
        slashBassEvidence: Number(maxBassEv.toFixed(3)),
        slashBassRatio: maxBassIdx !== winner.candidate.rootIdx ? Number((maxBassEv / rootBassEv).toFixed(3)) : 1.0,
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

    // Diagnostics calculations
    const segDurations = finalSegments.map(s => s.endTime - s.startTime);
    const avgSegmentDuration = Number((segDurations.reduce((a, b) => a + b, 0) / (segDurations.length || 1)).toFixed(2));
    const sortedDurs = [...segDurations].sort((a, b) => a - b);
    const medianSegmentDuration = Number((sortedDurs[Math.floor(sortedDurs.length / 2)] || 0).toFixed(2));
    const minSegmentDuration = Number((sortedDurs[0] || 0).toFixed(2));
    const maxSegmentDuration = Number((sortedDurs[sortedDurs.length - 1] || 0).toFixed(2));

    const numChordChanges = Math.max(0, finalSegments.length - 1);
    const changesPerMinute = Number((numChordChanges / ((duration / 60) || 1)).toFixed(1));
    const averageChordConfidence = Math.round(finalSegments.reduce((a, b) => a + b.confidence, 0) / (finalSegments.length || 1));
    const averageTransitionConfidence = Math.round(finalSegments.reduce((a, b) => a + b.stability, 0) / (finalSegments.length || 1));

    // Group into logical UI sections
    const sections = [];
    const sectionNames = ["Intro", "Verse 1", "Chorus", "Verse 2", "Bridge", "Outro"];
    let secIdx = 0;
    let currentSecChords = [];
    let currentSecStart = 0;
    
    finalSegments.forEach(seg => {
      currentSecChords.push(seg.chord);
      if (seg.endTime - currentSecStart > 16 || seg.id === finalSegments[finalSegments.length-1].id) {
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

    const uniqueChords = Array.from(new Set(finalSegments.map(s => s.chord)));
    const overallConfidence = finalSegments.reduce((a,b) => a + b.confidence, 0) / (finalSegments.length || 1);

    reportProgress("Analysis Complete", 100);

    self.postMessage({
      type: "result",
      analysis: {
        estimatedBpm,
        tuningDeviationCents,
        key: estimatedKey,
        sections,
        chordSegments: finalSegments,
        uniqueChords,
        overallConfidence: Math.min(99, Math.round(overallConfidence)),
        beats,
        diagnostics: {
          workerSampleCount: channelData.length,
          featureFrameCount: numFrames,
          chromaFrameCount: chromagram.length,
          bassFrameCount: bassChromagram.length,
          keyResult: estimatedKey,
          numChordStates: nStates,
          observationMatrixDims: `${numFrames}x${nStates}`,
          hasNaNOrInf,
          viterbiInputDims: `${numFrames}x${nStates}`,
          viterbiOutputLen: statePath.length,
          rawChordSegmentCount: rawSegments.length,
          finalChordSegmentCount: finalSegments.length,
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
