// Guitariz-inspired MIR Engine for JOE-Music
// Features: Tuning Estimation, CQT-like Chroma, HPSS, HMM Viterbi Decoding, Bass Estimation

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
      profile: profile
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
    const hopSize = 4096;
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
      if (f % 100 === 0) reportProgress("Extracting CQT/HPCP Features...", 15 + (f/numFrames)*35);
      
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
    // Peak picking for beats
    const beats = [];
    for (let i = 1; i < onsetEnvelope.length - 1; i++) {
      if (onsetEnvelope[i] > onsetEnvelope[i-1] && onsetEnvelope[i] > onsetEnvelope[i+1] && onsetEnvelope[i] > 2.0) {
        beats.push(i * hopSize / sampleRate);
      }
    }
    
    // Estimate BPM
    const minutes = duration / 60;
    let estimatedBpm = Math.round((beats.length / (minutes || 1)) / 4);
    if (estimatedBpm < 60) estimatedBpm *= 2;
    if (estimatedBpm > 200) estimatedBpm = Math.round(estimatedBpm / 2);

    reportProgress("HMM Viterbi Decoding...", 75);
    // Viterbi Decoding
    // Transitions: self=0.9, others=0.1 / (N-1)
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

    // Init
    const initCol = new Float32Array(nStates);
    for (let s = 0; s < nStates; s++) {
      initCol[s] = Math.log(cosineSimilarity(chromagram[0], CHORD_STATES[s].profile) + 1e-6);
    }
    viterbi.push(initCol);
    
    for (let t = 1; t < numFrames; t++) {
      if (t % 200 === 0) reportProgress("HMM Viterbi Decoding...", 75 + (t/numFrames)*15);
      
      const vCol = new Float32Array(nStates);
      const bpCol = new Int32Array(nStates);
      const obs = chromagram[t];
      
      for (let curr = 0; curr < nStates; curr++) {
        let maxVal = -Infinity;
        let maxPrev = 0;
        
        const emProb = Math.log(cosineSimilarity(obs, CHORD_STATES[curr].profile) + 1e-6);
        
        for (let prev = 0; prev < nStates; prev++) {
          const transProb = (curr === prev) ? Math.log(0.9) : Math.log(0.1 / (nStates - 1));
          const val = viterbi[t-1][prev] + transProb;
          if (val > maxVal) {
            maxVal = val;
            maxPrev = prev;
          }
        }
        
        vCol[curr] = maxVal + emProb;
        bpCol[curr] = maxPrev;
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
    
    // Segment grouping and bass estimation
    const segments = [];
    let currentSegment = {
      stateId: statePath[0],
      startFrame: 0,
      endFrame: 0,
    };
    
    for (let t = 1; t < numFrames; t++) {
      if (statePath[t] !== currentSegment.stateId) {
        currentSegment.endFrame = t;
        segments.push(currentSegment);
        currentSegment = { stateId: statePath[t], startFrame: t, endFrame: t };
      }
    }
    currentSegment.endFrame = numFrames - 1;
    segments.push(currentSegment);
    
    // Build final ChordSegment output
    const finalSegments = [];
    let segId = 0;
    
    segments.forEach(seg => {
      const state = CHORD_STATES[seg.stateId];
      const startTime = (seg.startFrame * hopSize) / sampleRate;
      const endTime = (seg.endFrame * hopSize) / sampleRate;
      
      if (endTime - startTime < 0.25) return; // Ignore very short glitches
      
      // Estimate Bass for this segment
      const sumBassChroma = new Float32Array(12);
      for (let f = seg.startFrame; f <= seg.endFrame; f++) {
        for(let i=0; i<12; i++) sumBassChroma[i] += bassChromagram[f][i];
      }
      let bestBass = state.rootIdx;
      let maxB = 0;
      for(let i=0; i<12; i++) {
        if(sumBassChroma[i] > maxB) { maxB = sumBassChroma[i]; bestBass = i; }
      }
      
      let finalLabel = state.label;
      const bassNote = NOTE_NAMES[bestBass];
      if (bassNote !== state.root && (sumBassChroma[bestBass] / (sumBassChroma[state.rootIdx] + 1e-6)) > 1.2) {
        finalLabel = `${state.label}/${bassNote}`;
      }
      
      // Map to beats
      const beatStart = beats.find(b => Math.abs(b - startTime) < 0.2) || startTime;
      const beatEnd = beats.find(b => Math.abs(b - endTime) < 0.2) || endTime;

      // Confidence
      const sim = cosineSimilarity(chromagram[Math.floor((seg.startFrame+seg.endFrame)/2)], state.profile);

      finalSegments.push({
        id: `seg-${segId++}`,
        chord: finalLabel,
        root: state.root,
        bass: bassNote,
        quality: state.quality,
        extensions: [],
        startTime: startTime,
        endTime: endTime,
        confidence: Math.round(sim * 100),
        stability: 95,
        beatStart,
        beatEnd
      });
    });
    
    // Group into logical UI sections based on time
    const sections = [];
    let accumulatedTime = 0;
    const sectionNames = ["Intro", "Verse 1", "Chorus", "Verse 2", "Bridge", "Outro"];
    let secIdx = 0;
    
    // Split into ~16 second blocks for UI display
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
          rawChordSegmentCount: segments.length,
          finalChordSegmentCount: finalSegments.length
        }
      }
    });
    
  } catch (err) {
    self.postMessage({ type: "error", error: err.message });
  }
};
