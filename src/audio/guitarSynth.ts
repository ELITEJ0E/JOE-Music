import { audioEngine } from "./audioContext";

// Standard guitar open string MIDI notes: [E2 (40), A2 (45), D3 (50), G3 (55), B3 (59), E4 (64)]
const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64];

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteNameToMidi(noteStr: string): number {
  // e.g. "E2", "C#4", "Ab3"
  const match = noteStr.match(/^([A-Ga-g][#b]?)(-?\d+)$/);
  if (!match) return 60; // Middle C default

  let note = match[1].toUpperCase();
  const octave = parseInt(match[2], 10);

  // Normalize flats
  const flatToSharp: Record<string, string> = {
    Db: "C#",
    Eb: "D#",
    Gb: "F#",
    Ab: "G#",
    Bb: "A#",
  };
  if (flatToSharp[note]) note = flatToSharp[note];

  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const noteIndex = noteNames.indexOf(note);
  if (noteIndex === -1) return 60;

  return (octave + 1) * 12 + noteIndex;
}

export type GuitarToneStyle = "acoustic" | "electricClean" | "vintageWarm" | "nylon";

class GuitarSynthesizer {
  private toneStyle: GuitarToneStyle = "acoustic";

  public setToneStyle(style: GuitarToneStyle) {
    this.toneStyle = style;
  }

  /**
   * Karplus-Strong physical modeling single plucked string
   */
  public playPluckedNote(freq: number, startTime: number, duration: number = 2.5, velocity: number = 0.8, customCtx?: BaseAudioContext, targetNode?: AudioNode) {
    if (!freq || freq < 20) return;
    const ctx = customCtx || audioEngine.getContext();
    const now = startTime || ctx.currentTime;

    // Period of the fundamental frequency in samples
    const periodSamples = Math.round(ctx.sampleRate / freq);
    if (periodSamples <= 0) return;

    // 1. Noise excitation burst buffer
    const burstDuration = Math.min(0.04, periodSamples / ctx.sampleRate);
    const burstLength = Math.max(2, Math.floor(ctx.sampleRate * burstDuration));
    const noiseBuffer = ctx.createBuffer(1, burstLength, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);

    // Damped pink/white noise impulse
    for (let i = 0; i < burstLength; i++) {
      const decay = 1 - i / burstLength;
      noiseData[i] = (Math.random() * 2 - 1) * decay;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    // 2. Harmonic body resonance oscillators (to enhance acoustic timbre richness)
    const fundamentalOsc = ctx.createOscillator();
    const harmonicOsc = ctx.createOscillator();

    fundamentalOsc.type = this.toneStyle === "electricClean" ? "sawtooth" : "triangle";
    harmonicOsc.type = "sine";

    fundamentalOsc.frequency.setValueAtTime(freq, now);
    harmonicOsc.frequency.setValueAtTime(freq * 2.003, now); // slightly detuned 2nd harmonic

    // Body Filter
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";

    if (this.toneStyle === "acoustic") {
      filter.frequency.setValueAtTime(Math.min(7500, freq * 8), now);
      filter.frequency.exponentialRampToValueAtTime(Math.min(2200, freq * 2.5), now + duration);
      filter.Q.value = 3.5;
    } else if (this.toneStyle === "electricClean") {
      filter.frequency.setValueAtTime(Math.min(5000, freq * 6), now);
      filter.frequency.exponentialRampToValueAtTime(Math.min(1800, freq * 1.8), now + duration);
      filter.Q.value = 2.0;
    } else if (this.toneStyle === "nylon") {
      filter.frequency.setValueAtTime(Math.min(3800, freq * 4), now);
      filter.frequency.exponentialRampToValueAtTime(Math.min(1200, freq * 1.5), now + duration);
      filter.Q.value = 1.2;
    } else {
      filter.frequency.setValueAtTime(4500, now);
      filter.frequency.exponentialRampToValueAtTime(1400, now + duration);
      filter.Q.value = 2.2;
    }

    // Acoustic Body Resonance EQ peak (simulates guitar wood cavity ~105Hz and ~210Hz)
    const bodyEQ = ctx.createBiquadFilter();
    bodyEQ.type = "peaking";
    bodyEQ.frequency.value = 195;
    bodyEQ.gain.value = 4.0;
    bodyEQ.Q.value = 2.0;

    // Amplitude Envelope
    const gainNode = ctx.createGain();
    const peakGain = 0.45 * Math.min(1, Math.max(0.1, velocity));

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(peakGain, now + 0.004); // Fast pick attack
    // Dynamic exponential decay
    gainNode.gain.exponentialRampToValueAtTime(peakGain * 0.4, now + 0.15);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    // Connect graph
    noiseSource.connect(filter);
    fundamentalOsc.connect(filter);
    harmonicOsc.connect(filter);

    filter.connect(bodyEQ);
    bodyEQ.connect(gainNode);
    gainNode.connect(targetNode || audioEngine.getMasterGain());

    // Trigger
    noiseSource.start(now);
    noiseSource.stop(now + burstDuration);

    fundamentalOsc.start(now);
    harmonicOsc.start(now);

    fundamentalOsc.stop(now + duration);
    harmonicOsc.stop(now + duration);
  }

  /**
   * Generates a 4-second offline audio buffer with a strummed chord.
   */
  public async generateDemoTrack(): Promise<AudioBuffer> {
    const sampleRate = 44100;
    const duration = 4; // 4 seconds
    const offlineCtx = new window.OfflineAudioContext(1, duration * sampleRate, sampleRate);
    
    // G major chord [3, 2, 0, 0, 3, 3]
    const frets: (number | "x")[] = [3, 2, 0, 0, 3, 3];
    const stringIndices = [0, 1, 2, 3, 4, 5];
    const strumSpeedMs = 24;
    const capo = 0;
    
    let activeStringCounter = 0;
    stringIndices.forEach((strIdx) => {
      const fret = frets[strIdx];
      if (fret !== "x" && typeof fret === "number" && fret >= 0) {
        const baseMidi = OPEN_STRING_MIDI[strIdx];
        const noteMidi = baseMidi + fret + capo;
        const freq = midiToFrequency(noteMidi);

        const stringDelay = (activeStringCounter * strumSpeedMs) / 1000;
        const stringVelocity = 0.85 * (0.85 + (strIdx / 5) * 0.25);

        this.playPluckedNote(freq, stringDelay, 3.2, stringVelocity, offlineCtx, offlineCtx.destination);
        activeStringCounter++;
      }
    });

    return offlineCtx.startRendering();
  }

  /**
   * Plays a single fret note on a specific string with optional Capo
   */
  public playFretNote(
    stringIndex: number, // 0 = 6th string (Low E), 5 = 1st string (High E)
    fret: number,
    capo: number = 0,
    velocity: number = 0.8
  ) {
    if (stringIndex < 0 || stringIndex > 5) return;
    const baseMidi = OPEN_STRING_MIDI[stringIndex];
    const totalFret = fret + capo;
    const noteMidi = baseMidi + totalFret;
    const freq = midiToFrequency(noteMidi);

    const ctx = audioEngine.getContext();
    this.playPluckedNote(freq, ctx.currentTime, 3.0, velocity);
  }

  /**
   * Strums an entire chord (array of 6 frets, e.g. [3, 2, 0, 0, 3, 3] or ["x", 0, 2, 2, 2, 0])
   * direction: "down" (6th string to 1st) or "up" (1st string to 6th)
   */
  public strumChord(
    frets: (number | "x")[],
    direction: "down" | "up" = "down",
    strumSpeedMs: number = 24, // Delay between consecutive strings
    capo: number = 0,
    velocity: number = 0.85
  ) {
    const ctx = audioEngine.getContext();
    const now = ctx.currentTime;

    const stringIndices = direction === "down" ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
    let activeStringCounter = 0;

    stringIndices.forEach((strIdx) => {
      const fret = frets[strIdx];
      if (fret !== "x" && typeof fret === "number" && fret >= 0) {
        const baseMidi = OPEN_STRING_MIDI[strIdx];
        const noteMidi = baseMidi + fret + capo;
        const freq = midiToFrequency(noteMidi);

        const stringDelay = (activeStringCounter * strumSpeedMs) / 1000;
        // Slight velocity curve for down/up dynamics
        const stringVelocity = velocity * (0.85 + (strIdx / 5) * 0.25);

        this.playPluckedNote(freq, now + stringDelay, 3.2, stringVelocity);
        activeStringCounter++;
      }
    });
  }

  /**
   * Arpeggiates a chord sequentially
   */
  public arpeggiateChord(
    frets: (number | "x")[],
    bpm: number = 100,
    pattern: number[] = [0, 1, 2, 3, 4, 5, 4, 3], // string indices
    capo: number = 0
  ) {
    const ctx = audioEngine.getContext();
    const now = ctx.currentTime;
    const stepDuration = (60 / bpm) / 2; // 8th notes

    pattern.forEach((strIdx, step) => {
      const fret = frets[strIdx];
      if (fret !== "x" && typeof fret === "number" && fret >= 0) {
        const baseMidi = OPEN_STRING_MIDI[strIdx];
        const freq = midiToFrequency(baseMidi + fret + capo);
        this.playPluckedNote(freq, now + step * stepDuration, 2.0, 0.75);
      }
    });
  }

  /**
   * Reference Tuner Sine Tone (e.g. 440 Hz standard or string reference)
   */
  public playReferenceTone(frequency: number, duration: number = 2.0): () => void {
    const ctx = audioEngine.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.2, ctx.currentTime + duration - 0.05);
    gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioEngine.getMasterGain());

    osc.start();
    osc.stop(ctx.currentTime + duration);

    return () => {
      try {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.02);
        setTimeout(() => osc.stop(), 30);
      } catch (_) {}
    };
  }
}

export const guitarSynth = new GuitarSynthesizer();
