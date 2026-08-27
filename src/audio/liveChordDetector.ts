/**
 * Live Audio / Acoustic Chord Recognition Engine (Chord AI Style)
 * Listens to microphone / audio input in real-time, extracts chromagram pitch profiles,
 * matches against harmonic templates, and emits detected chords with confidence.
 */

import { audioEngine } from "./audioContext";
import { findChordByName } from "../data/chordDatabase";
import { parseChordLabel } from "./chordNormalizer";

export interface LiveChordDetection {
  chord: string;
  confidence: number;
  chroma: number[]; // 12-semitone pitch class energy [C, C#, D, D#, E, F, F#, G, G#, A, Bb, B]
  bassNote: string;
  rms: number; // Volume energy
  timestamp: number;
}

const PITCH_CLASSES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// Major and Minor template vectors
const CHORD_TEMPLATES: { name: string; root: number; quality: "maj" | "min" | "7" | "m7" | "maj7" | "5"; profile: number[] }[] = [];

// Populate templates
for (let r = 0; r < 12; r++) {
  const rootName = PITCH_CLASSES[r];
  
  // Major: 1, 3, 5
  const maj = new Array(12).fill(0);
  maj[r] = 1.0;
  maj[(r + 4) % 12] = 0.85;
  maj[(r + 7) % 12] = 0.75;
  CHORD_TEMPLATES.push({ name: rootName, root: r, quality: "maj", profile: maj });

  // Minor: 1, b3, 5
  const min = new Array(12).fill(0);
  min[r] = 1.0;
  min[(r + 3) % 12] = 0.85;
  min[(r + 7) % 12] = 0.75;
  CHORD_TEMPLATES.push({ name: `${rootName}m`, root: r, quality: "min", profile: min });

  // Dominant 7th: 1, 3, 5, b7
  const dom7 = new Array(12).fill(0);
  dom7[r] = 1.0;
  dom7[(r + 4) % 12] = 0.8;
  dom7[(r + 7) % 12] = 0.7;
  dom7[(r + 10) % 12] = 0.65;
  CHORD_TEMPLATES.push({ name: `${rootName}7`, root: r, quality: "7", profile: dom7 });

  // Minor 7th: 1, b3, 5, b7
  const min7 = new Array(12).fill(0);
  min7[r] = 1.0;
  min7[(r + 3) % 12] = 0.8;
  min7[(r + 7) % 12] = 0.7;
  min7[(r + 10) % 12] = 0.65;
  CHORD_TEMPLATES.push({ name: `${rootName}m7`, root: r, quality: "m7", profile: min7 });
}

export class LiveChordDetector {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  private isListening: boolean = false;
  private onChordDetected: ((detection: LiveChordDetection) => void) | null = null;
  private recentChromaHistory: number[][] = [];
  private historyLength = 5; // Smoothing window

  public async start(callback: (detection: LiveChordDetection) => void): Promise<boolean> {
    if (this.isListening) return true;

    try {
      this.audioCtx = audioEngine.getContext();
      if (this.audioCtx.state === "suspended") {
        await this.audioCtx.resume();
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 4096;
      this.analyser.smoothingTimeConstant = 0.7;

      this.sourceNode.connect(this.analyser);
      this.onChordDetected = callback;
      this.isListening = true;
      this.recentChromaHistory = [];

      this.processLoop();
      return true;
    } catch (err) {
      console.error("Failed to start microphone live chord detector:", err);
      this.stop();
      return false;
    }
  }

  public stop() {
    this.isListening = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.analyser = null;
    this.onChordDetected = null;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  private processLoop = () => {
    if (!this.isListening || !this.analyser || !this.audioCtx) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const freqData = new Float32Array(bufferLength);
    this.analyser.getFloatFrequencyData(freqData);

    // Compute RMS signal volume
    let sumSquares = 0;
    for (let i = 0; i < bufferLength; i++) {
      const linear = Math.pow(10, freqData[i] / 20);
      sumSquares += linear * linear;
    }
    const rms = Math.sqrt(sumSquares / bufferLength);

    // If there is adequate sound energy (> silence threshold)
    if (rms > 0.005) {
      const sampleRate = this.audioCtx.sampleRate;
      const chroma = this.computeChroma(freqData, sampleRate);

      // Smooth chroma over recent frames
      this.recentChromaHistory.push(chroma);
      if (this.recentChromaHistory.length > this.historyLength) {
        this.recentChromaHistory.shift();
      }

      const smoothedChroma = new Array(12).fill(0);
      for (const frame of this.recentChromaHistory) {
        for (let i = 0; i < 12; i++) {
          smoothedChroma[i] += frame[i] / this.recentChromaHistory.length;
        }
      }

      // Match best candidate template
      const detection = this.classifyChord(smoothedChroma, rms);
      if (detection && this.onChordDetected) {
        this.onChordDetected(detection);
      }
    }

    this.animationFrameId = requestAnimationFrame(this.processLoop);
  };

  private computeChroma(freqData: Float32Array, sampleRate: number): number[] {
    const chroma = new Array(12).fill(0);
    const binCount = freqData.length;
    const nyquist = sampleRate / 2;
    const binFreqStep = nyquist / binCount;

    // Analyze musical guitar frequency spectrum (~80 Hz to 2000 Hz)
    const minFreq = 75;
    const maxFreq = 1800;

    for (let bin = 1; bin < binCount; bin++) {
      const freq = bin * binFreqStep;
      if (freq < minFreq || freq > maxFreq) continue;

      const db = freqData[bin];
      if (db < -80) continue; // Noise gate

      const mag = Math.pow(10, (db + 80) / 40); // Compressed linear magnitude

      // MIDI note formula: 69 + 12 * log2(freq / 440)
      const midi = 69 + 12 * Math.log2(freq / 440);
      const semitone = Math.round(midi);
      const pitchClass = ((semitone % 12) + 12) % 12;

      chroma[pitchClass] += mag;
    }

    // Normalize chroma energy to 0 - 1
    const maxChroma = Math.max(...chroma, 0.0001);
    return chroma.map((v) => v / maxChroma);
  }

  private classifyChord(chroma: number[], rms: number): LiveChordDetection {
    let bestScore = -Infinity;
    let bestTemplate = CHORD_TEMPLATES[0];

    for (const tmpl of CHORD_TEMPLATES) {
      // Cosine similarity
      let dot = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < 12; i++) {
        dot += chroma[i] * tmpl.profile[i];
        normA += chroma[i] * chroma[i];
        normB += tmpl.profile[i] * tmpl.profile[i];
      }

      const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-6);

      // Penalize missing root
      const rootBonus = chroma[tmpl.root] > 0.4 ? 0.1 : -0.15;
      const score = sim + rootBonus;

      if (score > bestScore) {
        bestScore = score;
        bestTemplate = tmpl;
      }
    }

    // Find bass note (highest chroma energy in lower third)
    let maxBass = -1;
    let bassIndex = bestTemplate.root;
    for (let i = 0; i < 12; i++) {
      if (chroma[i] > maxBass) {
        maxBass = chroma[i];
        bassIndex = i;
      }
    }

    const confidence = Math.min(Math.max(Math.round((bestScore + 0.1) * 100), 45), 98);

    return {
      chord: bestTemplate.name,
      confidence,
      chroma,
      bassNote: PITCH_CLASSES[bassIndex],
      rms,
      timestamp: Date.now(),
    };
  }
}

export const liveChordDetector = new LiveChordDetector();
