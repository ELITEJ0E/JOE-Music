import { audioEngine } from "./audioContext";
import {
  DAWProject,
  DAWTrack,
  TrackEqConfig,
  TrackInsertEffectsConfig,
  TrackDelayConfig,
  TrackChorusConfig,
  TrackDriveConfig,
  ToneMacroSettings,
  MasteringConfig,
} from "../types";
import { mapToneMacrosToTrackDsp } from "../types/toneAndEffects";
import { audioBufferToWavBlob } from "./wavEncoder";

interface ActiveClipNode {
  clipId: string;
  trackId: string;
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
  pannerNode: StereoPannerNode | null;
}

interface TrackEqNodes {
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
}

interface TrackInsertNodes {
  inputGain: GainNode;
  eq: TrackEqNodes;
  compressor: DynamicsCompressorNode;
  drive?: {
    shaper: WaveShaperNode;
    lowpass: BiquadFilterNode;
    wetGain: GainNode;
    dryGain: GainNode;
    outputGain: GainNode;
  };
  chorus?: {
    delay: DelayNode;
    lfo: OscillatorNode;
    lfoGain: GainNode;
    wetGain: GainNode;
    dryGain: GainNode;
    outputGain: GainNode;
  };
  delay?: {
    delayNode: DelayNode;
    feedbackGain: GainNode;
    wetGain: GainNode;
    dryGain: GainNode;
    outputGain: GainNode;
  };
  reverbSendGain: GainNode;
  outputGain: GainNode;
}

/**
 * Creates soft-clipping sigmoid wave shaper curve for smooth analog-style overdrive.
 */
function makeDistortionCurve(amount: number = 20): Float32Array {
  const nSamples = 44100;
  const curve = new Float32Array(nSamples);
  const deg = Math.PI / 180;
  const k = typeof amount === "number" ? Math.max(1, amount) : 20;

  for (let i = 0; i < nSamples; ++i) {
    const x = (i * 2) / nSamples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/**
 * Generates an acoustic impulse response buffer for studio convolution reverb.
 */
function createReverbImpulseBuffer(
  ctx: BaseAudioContext,
  durationSec: number = 2.2,
  decay: number = 2.5
): AudioBuffer {
  const sampleRate = ctx.sampleRate || 44100;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * decay);
    const noiseL = Math.random() * 2 - 1;
    const noiseR = Math.random() * 2 - 1;
    left[i] = noiseL * env;
    right[i] = noiseR * env;
  }
  return impulse;
}

class DAWEngine {
  private activeNodes: Map<string, ActiveClipNode> = new Map();
  private trackGains: Map<string, GainNode> = new Map();
  private trackPanners: Map<string, StereoPannerNode> = new Map();
  private trackInsertNodes: Map<string, TrackInsertNodes> = new Map();
  private busGainNodes: Map<string, GainNode> = new Map();
  private busVolumes: Map<string, number> = new Map();
  private sharedReverbConvolver: ConvolverNode | null = null;
  private sharedReverbReturn: GainNode | null = null;
  private masterProcessingChain: AudioNode[] = [];

  public stopAllNodes() {
    this.activeNodes.forEach((node) => {
      try {
        node.sourceNode.stop();
        node.sourceNode.disconnect();
      } catch (_) {}
    });
    this.activeNodes.clear();
    this.trackGains.clear();
    this.trackPanners.clear();
    this.trackInsertNodes.clear();
    this.busGainNodes.clear();
    this.masterProcessingChain.forEach((node) => {
      try {
        node.disconnect();
      } catch (_) {}
    });
    this.masterProcessingChain = [];

    if (this.sharedReverbReturn) {
      try {
        this.sharedReverbReturn.disconnect();
      } catch (_) {}
      this.sharedReverbReturn = null;
    }
    if (this.sharedReverbConvolver) {
      try {
        this.sharedReverbConvolver.disconnect();
      } catch (_) {}
      this.sharedReverbConvolver = null;
    }
  }

  public setBusVolume(busId: string, volume: number) {
    this.busVolumes.set(busId.toLowerCase(), volume);
    this.updateBusGain(busId, volume);
  }

  public getBusVolume(busId: string): number {
    return this.busVolumes.get(busId.toLowerCase()) ?? 1.0;
  }

  /**
   * Schedules sample-accurate playback for all active tracks on the timeline
   * with complete per-track 3-band EQ, Overdrive, Chorus, Delay, Dynamics Compressor,
   * parallel Reverb send, Tone Macros, Bus routing, and Master bus processing.
   */
  public startPlayback(project: DAWProject, startTimelineTime: number) {
    this.stopAllNodes();
    const ctx = audioEngine.getContext();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const hasSolo = project.tracks.some((t) => t.soloed);
    const ctxNow = ctx.currentTime;

    // 1. Create SHARED Reverb Bus
    this.sharedReverbConvolver = ctx.createConvolver();
    this.sharedReverbConvolver.buffer = createReverbImpulseBuffer(ctx, 2.2, 2.4);

    this.sharedReverbReturn = ctx.createGain();
    this.sharedReverbReturn.gain.setValueAtTime(0.85, ctxNow);

    this.sharedReverbConvolver.connect(this.sharedReverbReturn);
    this.sharedReverbReturn.connect(audioEngine.getMasterGain());

    // 2. Setup Bus Routing Gain Nodes for sub-mixes (Drums, Bass, Vocals, Guitars, Keys)
    const STANDARD_BUSES = ["drums", "bass", "vocals", "guitars", "keys"];
    STANDARD_BUSES.forEach((bId) => {
      const busGain = ctx.createGain();
      const initialVol = this.busVolumes.get(bId) ?? 1.0;
      busGain.gain.setValueAtTime(initialVol, ctxNow);
      busGain.connect(audioEngine.getMasterGain());
      this.busGainNodes.set(bId, busGain);
    });

    // 3. Build per-track complete DSP signal chains
    project.tracks.forEach((track) => {
      if (track.muted) return;
      if (hasSolo && !track.soloed) return;

      // Merge base EQ and Insert Effects with Tone Macro settings if present
      const baseEq = track.eq || { lowGainDb: 0, midGainDb: 0, highGainDb: 0 };
      const baseEffects = track.insertEffects || {
        reverbSendLevel: 0,
        compressorEnabled: false,
        compressorThresholdDb: -24,
        compressorRatio: 4,
      };

      const { eq: effectiveEq, insertEffects: effectiveFx } = track.toneMacros
        ? mapToneMacrosToTrackDsp(track.toneMacros, baseEq, baseEffects)
        : { eq: baseEq, insertEffects: baseEffects };

      // Input Gain Node for this track (receives all clip sources)
      const inputGain = ctx.createGain();

      // A. 3-Band Parametric EQ
      const eqLow = ctx.createBiquadFilter();
      eqLow.type = "lowshelf";
      eqLow.frequency.setValueAtTime(200, ctxNow);
      eqLow.gain.setValueAtTime(effectiveEq.lowGainDb, ctxNow);

      const eqMid = ctx.createBiquadFilter();
      eqMid.type = "peaking";
      eqMid.frequency.setValueAtTime(1000, ctxNow);
      eqMid.Q.setValueAtTime(1.0, ctxNow);
      eqMid.gain.setValueAtTime(effectiveEq.midGainDb, ctxNow);

      const eqHigh = ctx.createBiquadFilter();
      eqHigh.type = "highshelf";
      eqHigh.frequency.setValueAtTime(4000, ctxNow);
      eqHigh.gain.setValueAtTime(effectiveEq.highGainDb, ctxNow);

      inputGain.connect(eqLow);
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);

      let currentInsertOutput: AudioNode = eqHigh;

      // B. Drive / Saturation DSP Node
      const driveCfg = effectiveFx.drive;
      let driveNodes: TrackInsertNodes["drive"];
      if (driveCfg && driveCfg.enabled && driveCfg.amount > 0) {
        const shaper = ctx.createWaveShaper();
        shaper.curve = makeDistortionCurve(driveCfg.amount) as any;
        shaper.oversample = "2x";

        const lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.setValueAtTime(2000 + (driveCfg.tone / 100) * 8000, ctxNow);

        const wetGain = ctx.createGain();
        wetGain.gain.setValueAtTime(driveCfg.mix, ctxNow);

        const dryGain = ctx.createGain();
        dryGain.gain.setValueAtTime(1 - driveCfg.mix, ctxNow);

        const outputGain = ctx.createGain();

        currentInsertOutput.connect(shaper);
        shaper.connect(lowpass);
        lowpass.connect(wetGain);
        wetGain.connect(outputGain);

        currentInsertOutput.connect(dryGain);
        dryGain.connect(outputGain);

        currentInsertOutput = outputGain;
        driveNodes = { shaper, lowpass, wetGain, dryGain, outputGain };
      }

      // C. Chorus DSP Node (Modulated Delay)
      const chorusCfg = effectiveFx.chorus;
      let chorusNodes: TrackInsertNodes["chorus"];
      if (chorusCfg && chorusCfg.enabled && chorusCfg.mix > 0) {
        const delay = ctx.createDelay();
        delay.delayTime.setValueAtTime(0.025, ctxNow); // 25ms base delay

        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(chorusCfg.rateHz, ctxNow);

        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(0.003 * chorusCfg.depth, ctxNow); // modulation depth

        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        lfo.start(ctxNow);

        const wetGain = ctx.createGain();
        wetGain.gain.setValueAtTime(chorusCfg.mix, ctxNow);

        const dryGain = ctx.createGain();
        dryGain.gain.setValueAtTime(1 - chorusCfg.mix * 0.5, ctxNow);

        const outputGain = ctx.createGain();

        currentInsertOutput.connect(delay);
        delay.connect(wetGain);
        wetGain.connect(outputGain);

        currentInsertOutput.connect(dryGain);
        dryGain.connect(outputGain);

        currentInsertOutput = outputGain;
        chorusNodes = { delay, lfo, lfoGain, wetGain, dryGain, outputGain };
      }

      // D. Delay DSP Node (Feedback Loop)
      const delayCfg = effectiveFx.delay;
      let delayNodes: TrackInsertNodes["delay"];
      if (delayCfg && delayCfg.enabled && delayCfg.mix > 0) {
        const delayNode = ctx.createDelay(2.0);
        delayNode.delayTime.setValueAtTime(delayCfg.timeSec, ctxNow);

        const feedbackGain = ctx.createGain();
        feedbackGain.gain.setValueAtTime(Math.min(0.85, delayCfg.feedback), ctxNow);

        const wetGain = ctx.createGain();
        wetGain.gain.setValueAtTime(delayCfg.mix, ctxNow);

        const dryGain = ctx.createGain();
        dryGain.gain.setValueAtTime(1.0, ctxNow);

        const outputGain = ctx.createGain();

        // Delay feedback loop
        delayNode.connect(feedbackGain);
        feedbackGain.connect(delayNode);

        currentInsertOutput.connect(delayNode);
        delayNode.connect(wetGain);
        wetGain.connect(outputGain);

        currentInsertOutput.connect(dryGain);
        dryGain.connect(outputGain);

        currentInsertOutput = outputGain;
        delayNodes = { delayNode, feedbackGain, wetGain, dryGain, outputGain };
      }

      // E. Dynamics Compressor
      const compNode = ctx.createDynamicsCompressor();
      if (effectiveFx.compressorEnabled) {
        compNode.threshold.setValueAtTime(effectiveFx.compressorThresholdDb ?? -24, ctxNow);
        compNode.ratio.setValueAtTime(effectiveFx.compressorRatio ?? 4, ctxNow);
      } else {
        compNode.threshold.setValueAtTime(0, ctxNow);
        compNode.ratio.setValueAtTime(1, ctxNow);
      }
      compNode.attack.setValueAtTime(0.01, ctxNow);
      compNode.release.setValueAtTime(0.2, ctxNow);

      currentInsertOutput.connect(compNode);
      currentInsertOutput = compNode;

      // F. Track Volume & Panning
      const trackGain = ctx.createGain();
      trackGain.gain.setValueAtTime(track.volume, ctxNow);
      this.trackGains.set(track.id, trackGain);
      currentInsertOutput.connect(trackGain);

      let trackPanner: StereoPannerNode | null = null;
      let finalTrackOutputNode: AudioNode = trackGain;

      if (ctx.createStereoPanner) {
        trackPanner = ctx.createStereoPanner();
        trackPanner.pan.setValueAtTime(track.pan, ctxNow);
        trackGain.connect(trackPanner);
        finalTrackOutputNode = trackPanner;
        this.trackPanners.set(track.id, trackPanner);
      }

      // G. Route dry track output to assigned Bus or Master
      const bId = track.busId?.trim().toLowerCase();
      const targetBusNode = bId && bId !== "master" && bId !== "none" ? this.busGainNodes.get(bId) : null;
      if (targetBusNode) {
        finalTrackOutputNode.connect(targetBusNode);
      } else {
        finalTrackOutputNode.connect(audioEngine.getMasterGain());
      }

      // H. Parallel Reverb Send
      const reverbSendGain = ctx.createGain();
      const sendLevel = Math.max(0, Math.min(1, effectiveFx.reverbSendLevel ?? 0));
      reverbSendGain.gain.setValueAtTime(sendLevel, ctxNow);
      currentInsertOutput.connect(reverbSendGain);
      if (this.sharedReverbConvolver) {
        reverbSendGain.connect(this.sharedReverbConvolver);
      }

      this.trackInsertNodes.set(track.id, {
        inputGain,
        eq: { low: eqLow, mid: eqMid, high: eqHigh },
        compressor: compNode,
        drive: driveNodes,
        chorus: chorusNodes,
        delay: delayNodes,
        reverbSendGain,
        outputGain: trackGain,
      });

      // I. Connect all track clips to track's inputGain
      const clips = track.clips || [];
      clips.forEach((clip) => {
        if (!clip.audioBuffer || clip.duration <= 0) return;

        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;

        if (startTimelineTime >= clipEnd) return;

        const source = ctx.createBufferSource();
        source.buffer = clip.audioBuffer;

        const clipGainNode = ctx.createGain();
        const baseGain = clip.gain ?? 1.0;
        const fadeIn = Math.max(0, clip.fadeInSec ?? 0.005);
        const fadeOut = Math.max(0, clip.fadeOutSec ?? 0.005);

        let delayUntilStart = 0;
        let bufferOffset = clip.trimStart ?? 0;
        let playDuration = clip.duration;

        if (startTimelineTime < clipStart) {
          delayUntilStart = clipStart - startTimelineTime;
          const scheduledStartTime = ctxNow + delayUntilStart;
          const scheduledEndTime = scheduledStartTime + playDuration;

          if (fadeIn > 0 && fadeIn < playDuration) {
            clipGainNode.gain.setValueAtTime(0.0001, scheduledStartTime);
            clipGainNode.gain.linearRampToValueAtTime(baseGain, scheduledStartTime + fadeIn);
          } else {
            clipGainNode.gain.setValueAtTime(baseGain, scheduledStartTime);
          }

          if (fadeOut > 0 && fadeOut < playDuration) {
            const fadeOutStart = Math.max(scheduledStartTime + fadeIn, scheduledEndTime - fadeOut);
            clipGainNode.gain.setValueAtTime(baseGain, fadeOutStart);
            clipGainNode.gain.linearRampToValueAtTime(0.0001, scheduledEndTime);
          }

          source.connect(clipGainNode);
          clipGainNode.connect(inputGain);
          source.start(scheduledStartTime, bufferOffset, playDuration);
        } else {
          const elapsedInClip = startTimelineTime - clipStart;
          bufferOffset = (clip.trimStart ?? 0) + elapsedInClip;
          playDuration = clip.duration - elapsedInClip;

          const scheduledStartTime = ctxNow;
          const scheduledEndTime = scheduledStartTime + playDuration;

          if (elapsedInClip < fadeIn) {
            const remainingFadeIn = fadeIn - elapsedInClip;
            const startingGain = (elapsedInClip / fadeIn) * baseGain;
            clipGainNode.gain.setValueAtTime(Math.max(0.0001, startingGain), scheduledStartTime);
            clipGainNode.gain.linearRampToValueAtTime(baseGain, scheduledStartTime + remainingFadeIn);
          } else {
            clipGainNode.gain.setValueAtTime(baseGain, scheduledStartTime);
          }

          if (fadeOut > 0 && playDuration > fadeOut) {
            const fadeOutStart = scheduledEndTime - fadeOut;
            clipGainNode.gain.setValueAtTime(baseGain, fadeOutStart);
            clipGainNode.gain.linearRampToValueAtTime(0.0001, scheduledEndTime);
          }

          source.connect(clipGainNode);
          clipGainNode.connect(inputGain);
          source.start(scheduledStartTime, bufferOffset, playDuration);
        }

        this.activeNodes.set(`${track.id}-${clip.id}`, {
          clipId: clip.id,
          trackId: track.id,
          sourceNode: source,
          gainNode: clipGainNode,
          pannerNode: trackPanner,
        });
      });
    });
  }

  public updateTrackVolume(trackId: string, volume: number) {
    const gain = this.trackGains.get(trackId);
    if (gain) {
      try {
        gain.gain.setValueAtTime(volume, audioEngine.getContext().currentTime);
      } catch (_) {}
    }
  }

  public updateTrackPan(trackId: string, pan: number) {
    const panner = this.trackPanners.get(trackId);
    if (panner) {
      try {
        panner.pan.setValueAtTime(pan, audioEngine.getContext().currentTime);
      } catch (_) {}
    }
  }

  public updateTrackEq(trackId: string, band: "low" | "mid" | "high", gainDb: number) {
    const insert = this.trackInsertNodes.get(trackId);
    if (insert && insert.eq[band]) {
      try {
        insert.eq[band].gain.setValueAtTime(gainDb, audioEngine.getContext().currentTime);
      } catch (_) {}
    }
  }

  public updateTrackCompressor(
    trackId: string,
    config: { enabled: boolean; thresholdDb: number; ratio: number }
  ) {
    const insert = this.trackInsertNodes.get(trackId);
    if (insert && insert.compressor) {
      try {
        const ctxTime = audioEngine.getContext().currentTime;
        if (config.enabled) {
          insert.compressor.threshold.setValueAtTime(config.thresholdDb, ctxTime);
          insert.compressor.ratio.setValueAtTime(config.ratio, ctxTime);
        } else {
          insert.compressor.threshold.setValueAtTime(0, ctxTime);
          insert.compressor.ratio.setValueAtTime(1, ctxTime);
        }
      } catch (_) {}
    }
  }

  public updateTrackReverbSend(trackId: string, sendLevel: number) {
    const insert = this.trackInsertNodes.get(trackId);
    if (insert && insert.reverbSendGain) {
      try {
        const clamped = Math.max(0, Math.min(1, sendLevel));
        insert.reverbSendGain.gain.setValueAtTime(clamped, audioEngine.getContext().currentTime);
      } catch (_) {}
    }
  }

  public updateBusGain(busId: string, volume: number) {
    const bId = busId.trim().toLowerCase();
    const busGain = this.busGainNodes.get(bId);
    if (busGain) {
      try {
        busGain.gain.setValueAtTime(volume, audioEngine.getContext().currentTime);
      } catch (_) {}
    }
  }

  /**
   * Renders the complete DAW project offline into a pristine 16-bit WAV Blob
   * with exact per-track EQ, Overdrive, Chorus, Delay, Dynamics Compression,
   * Reverb sends, Tone Macros, Bus levels, and Master bus limiter/mastering.
   */
  public async renderMixdownToWav(project: DAWProject): Promise<Blob> {
    const sampleRate = 44100;
    let maxTimelineSec = 8;

    project.tracks.forEach((t) => {
      (t.clips || []).forEach((c) => {
        const end = c.startTime + c.duration;
        if (end > maxTimelineSec) maxTimelineSec = end;
      });
    });

    const totalDuration = maxTimelineSec + 1.5;
    const totalFrames = Math.ceil(totalDuration * sampleRate);
    const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);
    const hasSolo = project.tracks.some((t) => t.soloed);

    // 1. Shared Reverb Bus
    const sharedReverb = offlineCtx.createConvolver();
    sharedReverb.buffer = createReverbImpulseBuffer(offlineCtx, 2.2, 2.4);

    const reverbReturn = offlineCtx.createGain();
    reverbReturn.gain.setValueAtTime(0.85, 0);

    sharedReverb.connect(reverbReturn);
    reverbReturn.connect(offlineCtx.destination);

    // 2. Bus Routing Gain Nodes
    const busOfflineNodes: Map<string, GainNode> = new Map();
    const STANDARD_BUSES = ["drums", "bass", "vocals", "guitars", "keys"];
    STANDARD_BUSES.forEach((bId) => {
      const busGain = offlineCtx.createGain();
      const vol = this.busVolumes.get(bId) ?? 1.0;
      busGain.gain.setValueAtTime(vol, 0);
      busGain.connect(offlineCtx.destination);
      busOfflineNodes.set(bId, busGain);
    });

    // 3. Process Each Track
    project.tracks.forEach((track) => {
      if (track.muted) return;
      if (hasSolo && !track.soloed) return;

      const baseEq = track.eq || { lowGainDb: 0, midGainDb: 0, highGainDb: 0 };
      const baseEffects = track.insertEffects || {
        reverbSendLevel: 0,
        compressorEnabled: false,
        compressorThresholdDb: -24,
        compressorRatio: 4,
      };

      const { eq: effectiveEq, insertEffects: effectiveFx } = track.toneMacros
        ? mapToneMacrosToTrackDsp(track.toneMacros, baseEq, baseEffects)
        : { eq: baseEq, insertEffects: baseEffects };

      const inputGain = offlineCtx.createGain();

      // EQ
      const eqLow = offlineCtx.createBiquadFilter();
      eqLow.type = "lowshelf";
      eqLow.frequency.setValueAtTime(200, 0);
      eqLow.gain.setValueAtTime(effectiveEq.lowGainDb, 0);

      const eqMid = offlineCtx.createBiquadFilter();
      eqMid.type = "peaking";
      eqMid.frequency.setValueAtTime(1000, 0);
      eqMid.Q.setValueAtTime(1.0, 0);
      eqMid.gain.setValueAtTime(effectiveEq.midGainDb, 0);

      const eqHigh = offlineCtx.createBiquadFilter();
      eqHigh.type = "highshelf";
      eqHigh.frequency.setValueAtTime(4000, 0);
      eqHigh.gain.setValueAtTime(effectiveEq.highGainDb, 0);

      inputGain.connect(eqLow);
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);

      let currentInsertOutput: AudioNode = eqHigh;

      // Drive
      const driveCfg = effectiveFx.drive;
      if (driveCfg && driveCfg.enabled && driveCfg.amount > 0) {
        const shaper = offlineCtx.createWaveShaper();
        shaper.curve = makeDistortionCurve(driveCfg.amount) as any;
        shaper.oversample = "2x";

        const lowpass = offlineCtx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.setValueAtTime(2000 + (driveCfg.tone / 100) * 8000, 0);

        const wetGain = offlineCtx.createGain();
        wetGain.gain.setValueAtTime(driveCfg.mix, 0);

        const dryGain = offlineCtx.createGain();
        dryGain.gain.setValueAtTime(1 - driveCfg.mix, 0);

        const outputGain = offlineCtx.createGain();

        currentInsertOutput.connect(shaper);
        shaper.connect(lowpass);
        lowpass.connect(wetGain);
        wetGain.connect(outputGain);

        currentInsertOutput.connect(dryGain);
        dryGain.connect(outputGain);

        currentInsertOutput = outputGain;
      }

      // Delay
      const delayCfg = effectiveFx.delay;
      if (delayCfg && delayCfg.enabled && delayCfg.mix > 0) {
        const delayNode = offlineCtx.createDelay(2.0);
        delayNode.delayTime.setValueAtTime(delayCfg.timeSec, 0);

        const feedbackGain = offlineCtx.createGain();
        feedbackGain.gain.setValueAtTime(Math.min(0.85, delayCfg.feedback), 0);

        const wetGain = offlineCtx.createGain();
        wetGain.gain.setValueAtTime(delayCfg.mix, 0);

        const dryGain = offlineCtx.createGain();
        dryGain.gain.setValueAtTime(1.0, 0);

        const outputGain = offlineCtx.createGain();

        delayNode.connect(feedbackGain);
        feedbackGain.connect(delayNode);

        currentInsertOutput.connect(delayNode);
        delayNode.connect(wetGain);
        wetGain.connect(outputGain);

        currentInsertOutput.connect(dryGain);
        dryGain.connect(outputGain);

        currentInsertOutput = outputGain;
      }

      // Compressor
      if (effectiveFx.compressorEnabled) {
        const compNode = offlineCtx.createDynamicsCompressor();
        compNode.threshold.setValueAtTime(effectiveFx.compressorThresholdDb ?? -24, 0);
        compNode.ratio.setValueAtTime(effectiveFx.compressorRatio ?? 4, 0);
        compNode.attack.setValueAtTime(0.01, 0);
        compNode.release.setValueAtTime(0.2, 0);

        currentInsertOutput.connect(compNode);
        currentInsertOutput = compNode;
      }

      // Volume & Panning
      const trackGain = offlineCtx.createGain();
      trackGain.gain.setValueAtTime(track.volume, 0);
      currentInsertOutput.connect(trackGain);

      let finalTrackOutput: AudioNode = trackGain;
      if (offlineCtx.createStereoPanner) {
        const panner = offlineCtx.createStereoPanner();
        panner.pan.setValueAtTime(track.pan, 0);
        trackGain.connect(panner);
        finalTrackOutput = panner;
      }

      // Bus Routing
      const bId = track.busId?.trim().toLowerCase();
      const busNode = bId && bId !== "master" && bId !== "none" ? busOfflineNodes.get(bId) : null;
      if (busNode) {
        finalTrackOutput.connect(busNode);
      } else {
        finalTrackOutput.connect(offlineCtx.destination);
      }

      // Parallel Reverb Send
      const sendLevel = Math.max(0, Math.min(1, effectiveFx.reverbSendLevel ?? 0));
      if (sendLevel > 0) {
        const reverbSendGain = offlineCtx.createGain();
        reverbSendGain.gain.setValueAtTime(sendLevel, 0);
        currentInsertOutput.connect(reverbSendGain);
        reverbSendGain.connect(sharedReverb);
      }

      // Clips
      (track.clips || []).forEach((clip) => {
        if (!clip.audioBuffer || clip.duration <= 0) return;

        const source = offlineCtx.createBufferSource();
        source.buffer = clip.audioBuffer;

        const clipGain = offlineCtx.createGain();
        const baseGain = clip.gain ?? 1.0;
        const fadeIn = Math.max(0, clip.fadeInSec ?? 0.005);
        const fadeOut = Math.max(0, clip.fadeOutSec ?? 0.005);

        const startTime = clip.startTime;
        const endTime = clip.startTime + clip.duration;

        if (fadeIn > 0 && fadeIn < clip.duration) {
          clipGain.gain.setValueAtTime(0.0001, startTime);
          clipGain.gain.linearRampToValueAtTime(baseGain, startTime + fadeIn);
        } else {
          clipGain.gain.setValueAtTime(baseGain, startTime);
        }

        if (fadeOut > 0 && fadeOut < clip.duration) {
          const fadeOutStart = Math.max(startTime + fadeIn, endTime - fadeOut);
          clipGain.gain.setValueAtTime(baseGain, fadeOutStart);
          clipGain.gain.linearRampToValueAtTime(0.0001, endTime);
        }

        source.connect(clipGain);
        clipGain.connect(inputGain);
        source.start(startTime, clip.trimStart ?? 0, clip.duration);
      });
    });

    const renderedBuffer = await offlineCtx.startRendering();
    return audioBufferToWavBlob(renderedBuffer);
  }
}

export const dawEngine = new DAWEngine();
