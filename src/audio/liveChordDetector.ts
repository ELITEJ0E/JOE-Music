// Real-Time Live Microphone Chord Detector for JOE-Music
// Features: AnalyserNode spectral decomposition, 12-bin Harmonic & Bass Chromagram extraction,
// Real-time chord template evaluation, and temporal hysteresis to prevent display flicker.

import { audioEngine } from "./audioContext";
import { NOTE_NAMES } from "./chromaExtractor";
import { rankChordCandidatesForWindow } from "./twoStageChordEngine";

export interface LiveChordResult {
  chord: string;
  root: string;
  quality: string;
  bass?: string;
  confidence: number;
  isSilence: boolean;
  chroma: Float32Array;
}

export type LiveChordCallback = (result: LiveChordResult) => void;

export class LiveChordDetector {
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private isRunning: boolean = false;
  private callback: LiveChordCallback | null = null;

  // Smoothing buffers
  private freqData: Float32Array | null = null;
  private chromaSmooth = new Float32Array(12);
  private bassChromaSmooth = new Float32Array(12);

  // Hysteresis tracking
  private lastCandidateChord: string = "";
  private candidateHoldFrames: number = 0;
  private currentStableChord: string = "";
  private currentConfidence: number = 0;
  private lastProcessTime: number = 0;

  constructor() {}

  /**
   * Returns whether the detector is currently running.
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Starts real-time listening on the microphone input.
   */
  public async start(onChord: LiveChordCallback): Promise<void> {
    if (this.isRunning) {
      this.callback = onChord;
      return;
    }

    const { source } = await audioEngine.acquireInput("chord-finder-live");
    const ctx = audioEngine.getContext();

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const fftSize = 4096;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = 0.65;

    source.connect(this.analyser);

    this.freqData = new Float32Array(this.analyser.frequencyBinCount);
    this.callback = onChord;
    this.isRunning = true;
    this.lastCandidateChord = "";
    this.candidateHoldFrames = 0;
    this.currentStableChord = "";
    this.currentConfidence = 0;
    this.chromaSmooth.fill(0);
    this.bassChromaSmooth.fill(0);

    this.loop();
  }

  /**
   * Stops real-time listening and disconnects the analyser.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch (_) {}
      this.analyser = null;
    }

    audioEngine.releaseInput("chord-finder-live");
    this.callback = null;
  }

  private loop = () => {
    if (!this.isRunning || !this.analyser) return;

    const now = performance.now();
    // Throttle to ~25Hz (every 40ms) for smooth visual display and low CPU load
    if (now - this.lastProcessTime >= 38) {
      this.lastProcessTime = now;
      this.processFrame();
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  private processFrame(): void {
    if (!this.analyser || !this.freqData || !this.callback) return;

    const ctx = audioEngine.getContext();
    const sampleRate = ctx.sampleRate;
    const fftSize = this.analyser.fftSize;
    const binCount = this.analyser.frequencyBinCount;
    const binWidth = sampleRate / fftSize;

    this.analyser.getFloatFrequencyData(this.freqData);

    // 1. Calculate overall signal energy in guitar frequency range (70 Hz - 2000 Hz)
    const minBin = Math.max(1, Math.floor(70 / binWidth));
    const maxBin = Math.min(binCount - 1, Math.ceil(2000 / binWidth));

    let sumLinear = 0;
    let peakLinear = 0;

    for (let i = minBin; i <= maxBin; i++) {
      const db = this.freqData[i];
      // Convert dBFS (-100 to 0) to linear magnitude
      if (db > -80) {
        const lin = Math.pow(10, db / 20);
        sumLinear += lin;
        if (lin > peakLinear) peakLinear = lin;
      }
    }

    // Silence gate threshold: minimum energy required to consider a chord played
    if (sumLinear < 0.008 || peakLinear < 0.0015) {
      // Audio is below silence floor
      this.candidateHoldFrames = 0;
      this.chromaSmooth.fill(0);
      this.bassChromaSmooth.fill(0);

      this.callback({
        chord: this.currentStableChord || "-",
        root: "",
        quality: "",
        confidence: 0,
        isSilence: true,
        chroma: this.chromaSmooth,
      });
      return;
    }

    // 2. Extract 12-bin instantaneous chromagram
    const frameChroma = new Float32Array(12);
    const frameBass = new Float32Array(12);

    for (let i = minBin; i <= maxBin; i++) {
      const db = this.freqData[i];
      if (db <= -70) continue;

      // Peak-picking: only count local spectral peaks to avoid broadband noise
      if (i > 1 && i < binCount - 1) {
        if (this.freqData[i] <= this.freqData[i - 1] || this.freqData[i] < this.freqData[i + 1]) {
          continue;
        }
      }

      const freq = i * binWidth;
      const exactMidi = 69 + 12 * Math.log2(freq / 440);
      const pitchClass = ((Math.round(exactMidi) % 12) + 12) % 12;
      const centsError = exactMidi - Math.round(exactMidi);
      const centsWeight = Math.exp(-Math.pow(centsError / 0.40, 2));

      const lin = Math.pow(10, db / 20);
      const logMag = Math.log1p(30 * lin) * centsWeight;

      if (freq <= 260) {
        frameBass[pitchClass] += logMag;
      }
      frameChroma[pitchClass] += logMag;
    }

    // Normalize and apply exponential moving average
    let maxC = 0, maxB = 0;
    for (let k = 0; k < 12; k++) {
      if (frameChroma[k] > maxC) maxC = frameChroma[k];
      if (frameBass[k] > maxB) maxB = frameBass[k];
    }

    if (maxC > 1e-5) {
      for (let k = 0; k < 12; k++) {
        const normVal = frameChroma[k] / maxC;
        this.chromaSmooth[k] = this.chromaSmooth[k] * 0.45 + normVal * 0.55;
      }
    }
    if (maxB > 1e-5) {
      for (let k = 0; k < 12; k++) {
        const normVal = frameBass[k] / maxB;
        this.bassChromaSmooth[k] = this.bassChromaSmooth[k] * 0.45 + normVal * 0.55;
      }
    }

    // 3. Evaluate best chord matching the chroma profile
    const candidates = rankChordCandidatesForWindow(
      this.chromaSmooth,
      this.bassChromaSmooth,
      null // No key constraint for open live listening
    );

    if (candidates.length === 0 || candidates[0].score < 0.22) {
      return;
    }

    const topCandidate = candidates[0];
    const candChord = topCandidate.chord;

    // 4. Temporal Hysteresis Filter: require chord to be consistent for at least 3 frames (~120ms)
    // before switching, avoiding visual flutter
    if (candChord === this.lastCandidateChord) {
      this.candidateHoldFrames++;
    } else {
      this.lastCandidateChord = candChord;
      this.candidateHoldFrames = 1;
    }

    if (this.candidateHoldFrames >= 3 || !this.currentStableChord) {
      this.currentStableChord = candChord;
      this.currentConfidence = Math.round(topCandidate.score * 100);
    }

    this.callback({
      chord: this.currentStableChord,
      root: topCandidate.root,
      quality: topCandidate.quality,
      bass: topCandidate.bass !== topCandidate.root ? topCandidate.bass : undefined,
      confidence: this.currentConfidence,
      isSilence: false,
      chroma: this.chromaSmooth,
    });
  }
}

export const liveChordDetector = new LiveChordDetector();
