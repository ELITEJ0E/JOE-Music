import { audioEngine } from "./audioContext";

export type DrumStyle =
  | "Metronome Click"
  | "Rock 4/4"
  | "Blues Shuffle"
  | "Funk 16ths"
  | "Metal Double Bass"
  | "Jazz Swing"
  | "Acoustic Folk"
  | "Reggae One-Drop"
  | "Bossa Nova"
  | "Slow Ballad 6/8";

export interface DrumStep {
  kick: boolean;
  snare: boolean;
  hihatClosed: boolean;
  hihatOpen: boolean;
  crash?: boolean;
  ride?: boolean;
  tom?: boolean;
}

export interface DrumPatternConfig {
  id: string;
  name: DrumStyle;
  timeSignature: "4/4" | "3/4" | "6/8" | "12/8";
  stepsCount: number; // 16 steps for 4/4 sixteenths, 12 for triplets/6/8
  swing: number; // 0 to 0.5
  steps: DrumStep[];
}

export const PRESET_DRUM_PATTERNS: Record<DrumStyle, DrumPatternConfig> = {
  "Metronome Click": {
    id: "metronome",
    name: "Metronome Click",
    timeSignature: "4/4",
    stepsCount: 4,
    swing: 0,
    steps: [
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false, crash: true },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
    ],
  },
  "Rock 4/4": {
    id: "rock-4-4",
    name: "Rock 4/4",
    timeSignature: "4/4",
    stepsCount: 16,
    swing: 0,
    steps: [
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false, crash: true },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: true, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: true, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: true },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
    ],
  },
  "Blues Shuffle": {
    id: "blues-shuffle",
    name: "Blues Shuffle",
    timeSignature: "4/4",
    stepsCount: 12, // Triplet feel
    swing: 0.35,
    steps: [
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false, ride: true },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false, ride: true },
      { kick: false, snare: true, hihatClosed: true, hihatOpen: false, ride: true },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false, ride: true },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false, ride: true },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false, ride: true },
      { kick: false, snare: true, hihatClosed: true, hihatOpen: false, ride: true },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false, ride: true },
    ],
  },
  "Funk 16ths": {
    id: "funk-16",
    name: "Funk 16ths",
    timeSignature: "4/4",
    stepsCount: 16,
    swing: 0.15,
    steps: [
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: true },
      { kick: false, snare: true, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: true },
      { kick: false, snare: true, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
    ],
  },
  "Metal Double Bass": {
    id: "metal-db",
    name: "Metal Double Bass",
    timeSignature: "4/4",
    stepsCount: 16,
    swing: 0,
    steps: [
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false, crash: true },
      { kick: true, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: true, snare: true, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: true, snare: true, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: false, hihatOpen: false },
    ],
  },
  "Jazz Swing": {
    id: "jazz-swing",
    name: "Jazz Swing",
    timeSignature: "4/4",
    stepsCount: 12,
    swing: 0.4,
    steps: [
      { kick: true, snare: false, hihatClosed: false, hihatOpen: false, ride: true },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false, ride: true },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false, ride: true },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false, ride: true },
      { kick: true, snare: false, hihatClosed: false, hihatOpen: false, ride: true },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false, ride: true },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false, ride: true },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false, ride: true },
    ],
  },
  "Acoustic Folk": {
    id: "acoustic-folk",
    name: "Acoustic Folk",
    timeSignature: "4/4",
    stepsCount: 16,
    swing: 0.1,
    steps: [
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: false, snare: true, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: false, snare: true, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: false },
    ],
  },
  "Reggae One-Drop": {
    id: "reggae-one-drop",
    name: "Reggae One-Drop",
    timeSignature: "4/4",
    stepsCount: 16,
    swing: 0.2,
    steps: [
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: true, hihatClosed: true, hihatOpen: false, crash: true },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: true },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
    ],
  },
  "Bossa Nova": {
    id: "bossa-nova",
    name: "Bossa Nova",
    timeSignature: "4/4",
    stepsCount: 16,
    swing: 0.15,
    steps: [
      { kick: true, snare: true, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: true, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: true, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: true, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: true, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: true, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
    ],
  },
  "Slow Ballad 6/8": {
    id: "ballad-6-8",
    name: "Slow Ballad 6/8",
    timeSignature: "6/8",
    stepsCount: 12,
    swing: 0,
    steps: [
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false, ride: true },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: true, hihatClosed: true, hihatOpen: false, ride: true },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false, ride: true },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: true, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: true, hihatClosed: true, hihatOpen: false, ride: true },
      { kick: false, snare: false, hihatClosed: true, hihatOpen: false },
      { kick: false, snare: false, hihatClosed: false, hihatOpen: true },
    ],
  },
};

class DrumEngine {
  private isPlaying: boolean = false;
  private bpm: number = 110;
  private currentPattern: DrumPatternConfig = PRESET_DRUM_PATTERNS["Rock 4/4"];
  private currentStepIndex: number = 0;
  private timerId: number | null = null;
  private nextStepTime: number = 0;
  private stepListeners: Set<(step: number, total: number) => void> = new Set();
  private volume: number = 0.8;

  public setBpm(newBpm: number) {
    this.bpm = Math.max(30, Math.min(300, newBpm));
  }

  public getBpm(): number {
    return this.bpm;
  }

  public setPattern(style: DrumStyle) {
    if (PRESET_DRUM_PATTERNS[style]) {
      this.currentPattern = PRESET_DRUM_PATTERNS[style];
      this.currentStepIndex = 0;
    }
  }

  public getCurrentPattern(): DrumPatternConfig {
    return this.currentPattern;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  public subscribeStep(cb: (step: number, total: number) => void) {
    this.stepListeners.add(cb);
    return () => this.stepListeners.delete(cb);
  }

  public start() {
    if (this.isPlaying) return;
    const ctx = audioEngine.getContext();
    this.isPlaying = true;
    this.currentStepIndex = 0;
    this.nextStepTime = ctx.currentTime + 0.05;
    this.scheduleLoop();
  }

  public stop() {
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.currentStepIndex = 0;
    this.notifyStep(0, this.currentPattern.stepsCount);
  }

  public toggle(): boolean {
    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  private notifyStep(step: number, total: number) {
    this.stepListeners.forEach((cb) => cb(step, total));
  }

  private scheduleLoop() {
    if (!this.isPlaying) return;
    const ctx = audioEngine.getContext();

    // Lookahead window (schedule notes 100ms in advance)
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      this.scheduleStep(this.currentStepIndex, this.nextStepTime);
      this.advanceStep();
    }

    this.timerId = window.setTimeout(() => this.scheduleLoop(), 25);
  }

  private advanceStep() {
    const totalSteps = this.currentPattern.stepsCount;
    // Step length in seconds (16th note in 4/4 is 60 / (BPM * 4))
    const stepsPerBeat = totalSteps === 12 ? 3 : totalSteps === 4 ? 1 : 4;
    let stepDuration = 60 / (this.bpm * stepsPerBeat);

    // Apply swing on off-beats
    if (this.currentPattern.swing > 0 && this.currentStepIndex % 2 === 0) {
      stepDuration += stepDuration * this.currentPattern.swing;
    } else if (this.currentPattern.swing > 0 && this.currentStepIndex % 2 === 1) {
      stepDuration -= stepDuration * this.currentPattern.swing;
    }

    this.nextStepTime += stepDuration;
    this.currentStepIndex = (this.currentStepIndex + 1) % totalSteps;
  }

  private scheduleStep(stepIndex: number, time: number) {
    const step = this.currentPattern.steps[stepIndex];
    if (!step) return;

    // Trigger visual callback slightly ahead
    setTimeout(() => {
      if (this.isPlaying) {
        this.notifyStep(stepIndex, this.currentPattern.stepsCount);
      }
    }, Math.max(0, (time - audioEngine.getContext().currentTime) * 1000));

    if (step.kick) this.playKick(time);
    if (step.snare) this.playSnare(time);
    if (step.hihatClosed) this.playHiHat(time, false);
    if (step.hihatOpen) this.playHiHat(time, true);
    if (step.crash) this.playCrash(time);
    if (step.ride) this.playRide(time);
    if (step.tom) this.playTom(time);
  }

  // --- Synthesized Drum Instruments ---
  public playKick(time: number) {
    const ctx = audioEngine.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(36, time + 0.08);

    gain.gain.setValueAtTime(1.0 * this.volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

    osc.connect(gain);
    gain.connect(audioEngine.getMasterGain());

    osc.start(time);
    osc.stop(time + 0.35);
  }

  public playSnare(time: number) {
    const ctx = audioEngine.getContext();

    // Noise component (snare wires)
    const bufferSize = ctx.sampleRate * 0.18;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 1000;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.7 * this.volume, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioEngine.getMasterGain());

    // Tone body component
    const osc = ctx.createOscillator();
    const toneGain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(120, time + 0.05);

    toneGain.gain.setValueAtTime(0.6 * this.volume, time);
    toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(toneGain);
    toneGain.connect(audioEngine.getMasterGain());

    noise.start(time);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  public playHiHat(time: number, isOpen: boolean) {
    const ctx = audioEngine.getContext();
    const duration = isOpen ? 0.35 : 0.05;

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, isOpen ? 2 : 5);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 8500;
    filter.Q.value = 3.0;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime((isOpen ? 0.5 : 0.4) * this.volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioEngine.getMasterGain());

    source.start(time);
  }

  public playCrash(time: number) {
    const ctx = audioEngine.getContext();
    const duration = 1.2;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.8);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 5000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55 * this.volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioEngine.getMasterGain());

    source.start(time);
  }

  public playRide(time: number) {
    const ctx = audioEngine.getContext();
    const duration = 0.5;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.value = 2800;
    osc2.frequency.value = 5600;

    gain.gain.setValueAtTime(0.25 * this.volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioEngine.getMasterGain());

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration);
    osc2.stop(time + duration);
  }

  public playTom(time: number) {
    const ctx = audioEngine.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.2);

    gain.gain.setValueAtTime(0.7 * this.volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

    osc.connect(gain);
    gain.connect(audioEngine.getMasterGain());

    osc.start(time);
    osc.stop(time + 0.35);
  }
  public getPresets(): DrumPatternConfig[] {
    return Object.values(PRESET_DRUM_PATTERNS);
  }

  public setMetronomeOnly(enabled: boolean) {
    if (enabled) {
      this.currentPattern = PRESET_DRUM_PATTERNS["Metronome Click"];
    } else {
      this.currentPattern = PRESET_DRUM_PATTERNS["Rock 4/4"];
    }
  }

  public setCustomPattern(pattern: DrumPatternConfig) {
    this.currentPattern = pattern;
  }

  public toggleInstrumentStep(instrument: keyof DrumStep, stepIndex: number) {
    if (this.currentPattern.steps[stepIndex]) {
      this.currentPattern.steps[stepIndex][instrument] = !this.currentPattern.steps[stepIndex][instrument];
    }
  }
}

export const drumEngine = new DrumEngine();

