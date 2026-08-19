import { audioEngine } from "./audioContext";
import { PedalConfig } from "../types";

/**
 * Creates soft-clipping polynomial / hyperbolic curve for Tube Screamer overdrive
 */
function makeOverdriveCurve(amount: number, sampleRate: number = 44100): Float32Array {
  const k = typeof amount === "number" ? amount : 50;
  const n_samples = 4096;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;

  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    // Soft overdrive curve with pleasant odd harmonics
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/**
 * Creates aggressive asymmetrical clipping curve for Metal / Fuzz distortion
 */
function makeDistortionCurve(amount: number): Float32Array {
  const k = typeof amount === "number" ? amount : 50;
  const n_samples = 4096;
  const curve = new Float32Array(n_samples);

  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    if (x < -0.08) {
      curve[i] = -0.8 + (x + 0.08) * 0.1;
    } else if (x > 0.08) {
      curve[i] = Math.tanh(x * (k / 10 + 1));
    } else {
      curve[i] = x * (k / 12 + 1);
    }
  }
  return curve;
}

/**
 * Creates synthetic impulse response buffer for cabinet & room reverberation
 */
function createSyntheticReverbImpulse(
  ctx: AudioContext,
  duration: number = 2.5,
  decay: number = 2.0,
  reverse: boolean = false
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const n = reverse ? length - 1 - i : i;
    const factor = Math.pow(1 - n / length, decay);
    // Stereo decorrelated diffusion
    left[i] = (Math.random() * 2 - 1) * factor;
    right[i] = (Math.random() * 2 - 1) * factor;
  }
  return impulse;
}

export class PedalboardDSPChain {
  private ctx: AudioContext | null = null;
  private inputNode: GainNode | null = null;
  private outputNode: GainNode | null = null;

  // Individual Pedal Sub-graphs
  // 1. Noise Gate
  private noiseGateNode: GainNode | null = null;
  private noiseGateParams = { threshold: -45, active: true };

  // 2. Compressor
  private compressorNode: DynamicsCompressorNode | null = null;
  private compMakeupGain: GainNode | null = null;

  // 3. Overdrive
  private odPreFilter: BiquadFilterNode | null = null; // Tube screamer 720Hz mid hump
  private odShaper: WaveShaperNode | null = null;
  private odPostFilter: BiquadFilterNode | null = null;
  private odDryGain: GainNode | null = null;
  private odWetGain: GainNode | null = null;

  // 4. Distortion / Fuzz
  private distShaper: WaveShaperNode | null = null;
  private distToneFilter: BiquadFilterNode | null = null;
  private distDryGain: GainNode | null = null;
  private distWetGain: GainNode | null = null;

  // 5. Amp Head & Tone Stack
  private ampGain: GainNode | null = null;
  private ampShaper: WaveShaperNode | null = null;
  private ampBass: BiquadFilterNode | null = null;
  private ampMid: BiquadFilterNode | null = null;
  private ampTreble: BiquadFilterNode | null = null;
  private ampPresence: BiquadFilterNode | null = null;
  private ampCabinetConvolver: ConvolverNode | null = null;
  private ampCabFilter: BiquadFilterNode | null = null;

  // 6. Stereo Chorus
  private chorusDelayL: DelayNode | null = null;
  private chorusDelayR: DelayNode | null = null;
  private chorusLFO: OscillatorNode | null = null;
  private chorusLFOGainL: GainNode | null = null;
  private chorusLFOGainR: GainNode | null = null;
  private chorusDryGain: GainNode | null = null;
  private chorusWetGain: GainNode | null = null;

  // 7. Delay
  private delayNode: DelayNode | null = null;
  private delayFeedbackGain: GainNode | null = null;
  private delayDampFilter: BiquadFilterNode | null = null;
  private delayDryGain: GainNode | null = null;
  private delayWetGain: GainNode | null = null;

  // 8. Reverb
  private reverbConvolver: ConvolverNode | null = null;
  private reverbDryGain: GainNode | null = null;
  private reverbWetGain: GainNode | null = null;

  // 9. Master Limiter
  private limiterNode: DynamicsCompressorNode | null = null;

  private isInitialized: boolean = false;
  private isProcessingLiveMic: boolean = false;
  private micInputSource: MediaStreamAudioSourceNode | null = null;

  public init() {
    if (this.isInitialized) return;
    this.ctx = audioEngine.getContext();

    // Setup input/output
    this.inputNode = this.ctx.createGain();
    this.outputNode = this.ctx.createGain();

    // 1. Noise Gate
    this.noiseGateNode = this.ctx.createGain();
    this.noiseGateNode.gain.value = 1.0;

    // 2. Compressor
    this.compressorNode = this.ctx.createDynamicsCompressor();
    this.compressorNode.threshold.value = -24;
    this.compressorNode.knee.value = 30;
    this.compressorNode.ratio.value = 4;
    this.compressorNode.attack.value = 0.003;
    this.compressorNode.release.value = 0.25;

    this.compMakeupGain = this.ctx.createGain();
    this.compMakeupGain.gain.value = 1.2;

    // 3. Overdrive
    this.odPreFilter = this.ctx.createBiquadFilter();
    this.odPreFilter.type = "peaking";
    this.odPreFilter.frequency.value = 720;
    this.odPreFilter.Q.value = 1.8;
    this.odPreFilter.gain.value = 6;

    this.odShaper = this.ctx.createWaveShaper();
    this.odShaper.curve = makeOverdriveCurve(35, this.ctx.sampleRate) as any;
    this.odShaper.oversample = "4x";

    this.odPostFilter = this.ctx.createBiquadFilter();
    this.odPostFilter.type = "lowpass";
    this.odPostFilter.frequency.value = 4500;

    this.odDryGain = this.ctx.createGain();
    this.odWetGain = this.ctx.createGain();
    this.odDryGain.gain.value = 0.0;
    this.odWetGain.gain.value = 1.0;

    // 4. Distortion
    this.distShaper = this.ctx.createWaveShaper();
    this.distShaper.curve = makeDistortionCurve(65) as any;
    this.distShaper.oversample = "4x";

    this.distToneFilter = this.ctx.createBiquadFilter();
    this.distToneFilter.type = "lowpass";
    this.distToneFilter.frequency.value = 3800;

    this.distDryGain = this.ctx.createGain();
    this.distWetGain = this.ctx.createGain();
    this.distDryGain.gain.value = 0.0;
    this.distWetGain.gain.value = 1.0;

    // 5. Amp Head & Tone Stack
    this.ampGain = this.ctx.createGain();
    this.ampGain.gain.value = 1.5;

    this.ampShaper = this.ctx.createWaveShaper();
    this.ampShaper.curve = makeOverdriveCurve(18, this.ctx.sampleRate) as any;

    this.ampBass = this.ctx.createBiquadFilter();
    this.ampBass.type = "lowshelf";
    this.ampBass.frequency.value = 120;
    this.ampBass.gain.value = 2;

    this.ampMid = this.ctx.createBiquadFilter();
    this.ampMid.type = "peaking";
    this.ampMid.frequency.value = 650;
    this.ampMid.gain.value = 0;
    this.ampMid.Q.value = 1.4;

    this.ampTreble = this.ctx.createBiquadFilter();
    this.ampTreble.type = "highshelf";
    this.ampTreble.frequency.value = 3200;
    this.ampTreble.gain.value = 1;

    this.ampPresence = this.ctx.createBiquadFilter();
    this.ampPresence.type = "peaking";
    this.ampPresence.frequency.value = 4800;
    this.ampPresence.gain.value = 2;
    this.ampPresence.Q.value = 2.0;

    this.ampCabFilter = this.ctx.createBiquadFilter();
    this.ampCabFilter.type = "lowpass";
    this.ampCabFilter.frequency.value = 5200; // Simulates Celestion 12" speaker roll-off

    // 6. Stereo Chorus
    this.chorusDelayL = this.ctx.createDelay(0.05);
    this.chorusDelayR = this.ctx.createDelay(0.05);
    this.chorusDelayL.delayTime.value = 0.02;
    this.chorusDelayR.delayTime.value = 0.024;

    this.chorusLFO = this.ctx.createOscillator();
    this.chorusLFO.frequency.value = 1.5; // Hz

    this.chorusLFOGainL = this.ctx.createGain();
    this.chorusLFOGainR = this.ctx.createGain();
    this.chorusLFOGainL.gain.value = 0.0035;
    this.chorusLFOGainR.gain.value = -0.0035; // Inverted phase for wide stereo

    this.chorusLFO.connect(this.chorusLFOGainL);
    this.chorusLFO.connect(this.chorusLFOGainR);
    this.chorusLFOGainL.connect(this.chorusDelayL.delayTime);
    this.chorusLFOGainR.connect(this.chorusDelayR.delayTime);
    this.chorusLFO.start();

    this.chorusDryGain = this.ctx.createGain();
    this.chorusWetGain = this.ctx.createGain();
    this.chorusDryGain.gain.value = 0.7;
    this.chorusWetGain.gain.value = 0.5;

    // 7. Delay
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.value = 0.38; // ms

    this.delayFeedbackGain = this.ctx.createGain();
    this.delayFeedbackGain.gain.value = 0.42;

    this.delayDampFilter = this.ctx.createBiquadFilter();
    this.delayDampFilter.type = "lowpass";
    this.delayDampFilter.frequency.value = 2600; // Tape delay high damping

    this.delayNode.connect(this.delayDampFilter);
    this.delayDampFilter.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode);

    this.delayDryGain = this.ctx.createGain();
    this.delayWetGain = this.ctx.createGain();
    this.delayDryGain.gain.value = 1.0;
    this.delayWetGain.gain.value = 0.35;

    // 8. Reverb
    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbConvolver.buffer = createSyntheticReverbImpulse(this.ctx, 2.8, 2.2);

    this.reverbDryGain = this.ctx.createGain();
    this.reverbWetGain = this.ctx.createGain();
    this.reverbDryGain.gain.value = 1.0;
    this.reverbWetGain.gain.value = 0.28;

    // 9. Master Output Limiter
    this.limiterNode = this.ctx.createDynamicsCompressor();
    this.limiterNode.threshold.value = -1.0; // dBFS
    this.limiterNode.ratio.value = 20;
    this.limiterNode.attack.value = 0.001;
    this.limiterNode.release.value = 0.05;

    // Chain topology
    // Input -> NoiseGate -> Compressor -> OD -> Distortion -> Amp -> Chorus -> Delay -> Reverb -> Limiter -> Output
    this.inputNode.connect(this.noiseGateNode);
    this.noiseGateNode.connect(this.compressorNode);
    this.compressorNode.connect(this.compMakeupGain);

    // Overdrive block
    this.compMakeupGain.connect(this.odPreFilter);
    this.odPreFilter.connect(this.odShaper);
    this.odShaper.connect(this.odPostFilter);
    this.odPostFilter.connect(this.odWetGain);
    this.compMakeupGain.connect(this.odDryGain);

    const odSum = this.ctx.createGain();
    this.odWetGain.connect(odSum);
    this.odDryGain.connect(odSum);

    // Amp block
    odSum.connect(this.ampGain);
    this.ampGain.connect(this.ampShaper);
    this.ampShaper.connect(this.ampBass);
    this.ampBass.connect(this.ampMid);
    this.ampMid.connect(this.ampTreble);
    this.ampTreble.connect(this.ampPresence);
    this.ampPresence.connect(this.ampCabFilter);

    // Chorus block
    const ampOut = this.ampCabFilter;
    ampOut.connect(this.chorusDryGain);
    ampOut.connect(this.chorusDelayL);
    ampOut.connect(this.chorusDelayR);

    const chorusSum = this.ctx.createGain();
    this.chorusDryGain.connect(chorusSum);
    this.chorusDelayL.connect(this.chorusWetGain);
    this.chorusDelayR.connect(this.chorusWetGain);
    this.chorusWetGain.connect(chorusSum);

    // Delay block
    chorusSum.connect(this.delayDryGain);
    chorusSum.connect(this.delayNode);
    this.delayNode.connect(this.delayWetGain);

    const delaySum = this.ctx.createGain();
    this.delayDryGain.connect(delaySum);
    this.delayWetGain.connect(delaySum);

    // Reverb block
    delaySum.connect(this.reverbDryGain);
    delaySum.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbWetGain);

    const reverbSum = this.ctx.createGain();
    this.reverbDryGain.connect(reverbSum);
    this.reverbWetGain.connect(reverbSum);

    // Limiter -> Master Output
    reverbSum.connect(this.limiterNode);
    this.limiterNode.connect(this.outputNode);
    this.outputNode.connect(audioEngine.getMasterGain());

    this.isInitialized = true;
  }

  public getInputNode(): GainNode {
    this.init();
    return this.inputNode!;
  }

  /**
   * Applies complete pedal configuration parameters from preset
   */
  public applyPedalConfig(pedals: PedalConfig[]) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    pedals.forEach((pedal) => {
      const p = pedal.params;
      const isEnabled = pedal.enabled;

      switch (pedal.type) {
        case "noiseGate":
          this.noiseGateParams.threshold = (p.threshold as number) ?? -45;
          this.noiseGateParams.active = isEnabled;
          if (this.noiseGateNode) {
            this.noiseGateNode.gain.setValueAtTime(isEnabled ? 1.0 : 1.0, now);
          }
          break;

        case "compressor":
          if (this.compressorNode && this.compMakeupGain) {
            if (isEnabled) {
              this.compressorNode.threshold.setValueAtTime((p.threshold as number) ?? -24, now);
              this.compressorNode.ratio.setValueAtTime((p.ratio as number) ?? 4, now);
              this.compressorNode.attack.setValueAtTime(((p.attack as number) ?? 15) / 1000, now);
              this.compressorNode.release.setValueAtTime(((p.release as number) ?? 200) / 1000, now);
              this.compMakeupGain.gain.setValueAtTime(1 + ((p.gain as number) ?? 0) / 10, now);
            } else {
              this.compressorNode.threshold.setValueAtTime(0, now);
              this.compressorNode.ratio.setValueAtTime(1, now);
              this.compMakeupGain.gain.setValueAtTime(1.0, now);
            }
          }
          break;

        case "overdrive":
          if (this.odShaper && this.odPreFilter && this.odPostFilter && this.odWetGain && this.odDryGain) {
            if (isEnabled) {
              const drive = (p.drive as number) ?? 45;
              const tone = (p.tone as number) ?? 50;
              const level = (p.level as number) ?? 75;

              this.odShaper.curve = makeOverdriveCurve(drive, this.ctx.sampleRate) as any;
              this.odPostFilter.frequency.setValueAtTime(1500 + tone * 60, now);
              this.odWetGain.gain.setValueAtTime(level / 100, now);
              this.odDryGain.gain.setValueAtTime(0.0, now);
            } else {
              this.odWetGain.gain.setValueAtTime(0.0, now);
              this.odDryGain.gain.setValueAtTime(1.0, now);
            }
          }
          break;

        case "ampHead":
          if (this.ampGain && this.ampBass && this.ampMid && this.ampTreble && this.ampPresence && this.ampCabFilter) {
            if (isEnabled) {
              const gain = (p.gain as number) ?? 60;
              const bass = (p.bass as number) ?? 50;
              const mid = (p.mid as number) ?? 50;
              const treble = (p.treble as number) ?? 50;
              const presence = (p.presence as number) ?? 50;
              const master = (p.master as number) ?? 70;

              this.ampGain.gain.setValueAtTime(0.5 + (gain / 100) * 2.5, now);
              this.ampBass.gain.setValueAtTime((bass - 50) / 4, now);
              this.ampMid.gain.setValueAtTime((mid - 50) / 4, now);
              this.ampTreble.gain.setValueAtTime((treble - 50) / 4, now);
              this.ampPresence.gain.setValueAtTime((presence - 50) / 4, now);

              // Cabinet selection
              const cab = (p.cabinet as string) || "4x12 Vintage";
              if (cab === "2x12 Open Back") {
                this.ampCabFilter.frequency.setValueAtTime(6200, now);
              } else if (cab === "1x12 Tweed") {
                this.ampCabFilter.frequency.setValueAtTime(4600, now);
              } else {
                this.ampCabFilter.frequency.setValueAtTime(5100, now);
              }
            } else {
              this.ampGain.gain.setValueAtTime(1.0, now);
              this.ampBass.gain.setValueAtTime(0, now);
              this.ampMid.gain.setValueAtTime(0, now);
              this.ampTreble.gain.setValueAtTime(0, now);
              this.ampPresence.gain.setValueAtTime(0, now);
              this.ampCabFilter.frequency.setValueAtTime(20000, now);
            }
          }
          break;

        case "chorus":
          if (this.chorusLFO && this.chorusLFOGainL && this.chorusWetGain && this.chorusDryGain) {
            if (isEnabled) {
              const rate = (p.rate as number) ?? 1.5;
              const depth = (p.depth as number) ?? 60;
              const mix = (p.mix as number) ?? 50;

              this.chorusLFO.frequency.setValueAtTime(0.2 + (rate / 100) * 4.8, now);
              this.chorusLFOGainL.gain.setValueAtTime((depth / 100) * 0.006, now);
              this.chorusWetGain.gain.setValueAtTime(mix / 100, now);
              this.chorusDryGain.gain.setValueAtTime(1 - (mix / 100) * 0.5, now);
            } else {
              this.chorusWetGain.gain.setValueAtTime(0.0, now);
              this.chorusDryGain.gain.setValueAtTime(1.0, now);
            }
          }
          break;

        case "delay":
          if (this.delayNode && this.delayFeedbackGain && this.delayWetGain && this.delayDryGain) {
            if (isEnabled) {
              const time = (p.time as number) ?? 350; // ms
              const feedback = (p.feedback as number) ?? 40;
              const mix = (p.mix as number) ?? 35;

              this.delayNode.delayTime.setValueAtTime(time / 1000, now);
              this.delayFeedbackGain.gain.setValueAtTime(Math.min(0.88, feedback / 100), now);
              this.delayWetGain.gain.setValueAtTime(mix / 100, now);
              this.delayDryGain.gain.setValueAtTime(1.0, now);
            } else {
              this.delayWetGain.gain.setValueAtTime(0.0, now);
              this.delayDryGain.gain.setValueAtTime(1.0, now);
            }
          }
          break;

        case "reverb":
          if (this.reverbWetGain && this.reverbDryGain) {
            if (isEnabled) {
              const mix = (p.mix as number) ?? 30;
              this.reverbWetGain.gain.setValueAtTime(mix / 100, now);
              this.reverbDryGain.gain.setValueAtTime(1.0, now);
            } else {
              this.reverbWetGain.gain.setValueAtTime(0.0, now);
              this.reverbDryGain.gain.setValueAtTime(1.0, now);
            }
          }
          break;
      }
    });
  }

  /**
   * Connects live physical guitar microphone input directly through the DSP effects pedal chain!
   */
  public async toggleLiveMicMonitoring(enable: boolean): Promise<boolean> {
    this.init();
    if (enable) {
      try {
        const { source } = await audioEngine.startMicrophone();
        this.micInputSource = source;
        this.micInputSource.connect(this.inputNode!);
        this.isProcessingLiveMic = true;
        return true;
      } catch (err) {
        console.error("Live monitoring activation failed:", err);
        this.isProcessingLiveMic = false;
        return false;
      }
    } else {
      if (this.micInputSource && this.inputNode) {
        try {
          this.micInputSource.disconnect(this.inputNode);
        } catch (_) {}
      }
      this.isProcessingLiveMic = false;
      return false;
    }
  }

  public getIsLiveMonitoring(): boolean {
    return this.isProcessingLiveMic;
  }
}

export const pedalboardDsp = new PedalboardDSPChain();
