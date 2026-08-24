import { audioEngine } from "./audioContext";
import { DAWProject, DAWTrack, TrackEqConfig, TrackInsertEffectsConfig } from "../types";
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
  private trackEqNodes: Map<string, TrackEqNodes> = new Map();
  private trackCompNodes: Map<string, DynamicsCompressorNode> = new Map();
  private trackReverbSendNodes: Map<string, GainNode> = new Map();
  private busGainNodes: Map<string, GainNode> = new Map();
  private busVolumes: Map<string, number> = new Map();
  private sharedReverbConvolver: ConvolverNode | null = null;
  private sharedReverbReturn: GainNode | null = null;

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
    this.trackEqNodes.clear();
    this.trackCompNodes.clear();
    this.trackReverbSendNodes.clear();
    this.busGainNodes.clear();

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
    this.busVolumes.set(busId, volume);
    this.updateBusGain(busId, volume);
  }

  public getBusVolume(busId: string): number {
    return this.busVolumes.get(busId) ?? 1.0;
  }

  /**
   * Schedules sample-accurate playback for all unmuted & soloed tracks on the timeline
   * with 3-band EQ, Dynamics Compressor insert, parallel Reverb bus send, and Bus routing.
   */
  public startPlayback(project: DAWProject, startTimelineTime: number) {
    this.stopAllNodes();
    const ctx = audioEngine.getContext();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const hasSolo = project.tracks.some((t) => t.soloed);
    const ctxNow = ctx.currentTime;

    // 1. Create SHARED Reverb Bus for this playback session
    this.sharedReverbConvolver = ctx.createConvolver();
    this.sharedReverbConvolver.buffer = createReverbImpulseBuffer(ctx, 2.2, 2.4);

    this.sharedReverbReturn = ctx.createGain();
    this.sharedReverbReturn.gain.setValueAtTime(0.85, ctxNow);

    this.sharedReverbConvolver.connect(this.sharedReverbReturn);
    this.sharedReverbReturn.connect(audioEngine.getMasterGain());

    // 2. Setup Bus Gain Nodes for any non-master buses
    project.tracks.forEach((track) => {
      const bId = track.busId?.trim().toLowerCase();
      if (bId && bId !== "master" && bId !== "none" && !this.busGainNodes.has(bId)) {
        const busGain = ctx.createGain();
        const initialVol = this.busVolumes.get(bId) ?? 1.0;
        busGain.gain.setValueAtTime(initialVol, ctxNow);
        busGain.connect(audioEngine.getMasterGain());
        this.busGainNodes.set(bId, busGain);
      }
    });

    // 3. Build per-track signal chains
    project.tracks.forEach((track) => {
      if (track.muted) return;
      if (hasSolo && !track.soloed) return;

      // A. 3-Band EQ Nodes (lowshelf, peaking, highshelf)
      const eqLow = ctx.createBiquadFilter();
      eqLow.type = "lowshelf";
      eqLow.frequency.setValueAtTime(200, ctxNow);
      eqLow.gain.setValueAtTime(track.eq?.lowGainDb ?? 0, ctxNow);

      const eqMid = ctx.createBiquadFilter();
      eqMid.type = "peaking";
      eqMid.frequency.setValueAtTime(1000, ctxNow);
      eqMid.Q.setValueAtTime(1.0, ctxNow);
      eqMid.gain.setValueAtTime(track.eq?.midGainDb ?? 0, ctxNow);

      const eqHigh = ctx.createBiquadFilter();
      eqHigh.type = "highshelf";
      eqHigh.frequency.setValueAtTime(4000, ctxNow);
      eqHigh.gain.setValueAtTime(track.eq?.highGainDb ?? 0, ctxNow);

      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);
      this.trackEqNodes.set(track.id, { low: eqLow, mid: eqMid, high: eqHigh });

      // B. Dynamics Compressor Node
      const compNode = ctx.createDynamicsCompressor();
      const compEnabled = !!track.insertEffects?.compressorEnabled;
      const compThreshold = track.insertEffects?.compressorThresholdDb ?? -24;
      const compRatio = track.insertEffects?.compressorRatio ?? 4;

      if (compEnabled) {
        compNode.threshold.setValueAtTime(compThreshold, ctxNow);
        compNode.ratio.setValueAtTime(compRatio, ctxNow);
      } else {
        // Transparent bypass
        compNode.threshold.setValueAtTime(0, ctxNow);
        compNode.ratio.setValueAtTime(1, ctxNow);
      }
      compNode.attack.setValueAtTime(0.01, ctxNow);
      compNode.release.setValueAtTime(0.2, ctxNow);

      eqHigh.connect(compNode);
      this.trackCompNodes.set(track.id, compNode);

      // Post-insert split point is compNode
      const postInsertNode = compNode;

      // C. Dry Signal Path: postInsertNode -> trackGain -> trackPanner -> (busGain OR master)
      const trackGain = ctx.createGain();
      trackGain.gain.setValueAtTime(track.volume, ctxNow);
      this.trackGains.set(track.id, trackGain);
      postInsertNode.connect(trackGain);

      let trackPanner: StereoPannerNode | null = null;
      let finalTrackOutputNode: AudioNode = trackGain;

      if (ctx.createStereoPanner) {
        trackPanner = ctx.createStereoPanner();
        trackPanner.pan.setValueAtTime(track.pan, ctxNow);
        trackGain.connect(trackPanner);
        finalTrackOutputNode = trackPanner;
        this.trackPanners.set(track.id, trackPanner);
      }

      // Route dry track output to selected bus or master
      const bId = track.busId?.trim().toLowerCase();
      const targetBusNode = (bId && bId !== "master" && bId !== "none") ? this.busGainNodes.get(bId) : null;
      if (targetBusNode) {
        finalTrackOutputNode.connect(targetBusNode);
      } else {
        finalTrackOutputNode.connect(audioEngine.getMasterGain());
      }

      // D. Parallel Reverb Send Path: postInsertNode -> reverbSendGain -> sharedReverbConvolver
      const reverbSendGain = ctx.createGain();
      const sendLevel = Math.max(0, Math.min(1, track.insertEffects?.reverbSendLevel ?? 0));
      reverbSendGain.gain.setValueAtTime(sendLevel, ctxNow);
      postInsertNode.connect(reverbSendGain);
      if (this.sharedReverbConvolver) {
        reverbSendGain.connect(this.sharedReverbConvolver);
      }
      this.trackReverbSendNodes.set(track.id, reverbSendGain);

      // E. Connect track's clips to the track's input node (eqLow)
      const clips = track.clips || [];
      clips.forEach((clip) => {
        if (!clip.audioBuffer || clip.duration <= 0) return;

        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;

        // Skip clips that have already completed before the playhead
        if (startTimelineTime >= clipEnd) return;

        const source = ctx.createBufferSource();
        source.buffer = clip.audioBuffer;

        // Clip-level envelope gain for fades & clip gain
        const clipGainNode = ctx.createGain();
        const baseGain = clip.gain ?? 1.0;
        const fadeIn = Math.max(0, clip.fadeInSec ?? 0.005);
        const fadeOut = Math.max(0, clip.fadeOutSec ?? 0.005);

        let delayUntilStart = 0;
        let bufferOffset = clip.trimStart ?? 0;
        let playDuration = clip.duration;

        if (startTimelineTime < clipStart) {
          // Scheduled in future relative to playhead
          delayUntilStart = clipStart - startTimelineTime;
          const scheduledStartTime = ctxNow + delayUntilStart;
          const scheduledEndTime = scheduledStartTime + playDuration;

          // Apply Fades
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
          clipGainNode.connect(eqLow);

          source.start(scheduledStartTime, bufferOffset, playDuration);
        } else {
          // Playhead is right in the middle of this clip
          const elapsedInClip = startTimelineTime - clipStart;
          bufferOffset = (clip.trimStart ?? 0) + elapsedInClip;
          playDuration = clip.duration - elapsedInClip;

          const scheduledStartTime = ctxNow;
          const scheduledEndTime = scheduledStartTime + playDuration;

          // Apply partial fades if applicable
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
          clipGainNode.connect(eqLow);

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
    const eqNodes = this.trackEqNodes.get(trackId);
    if (eqNodes && eqNodes[band]) {
      try {
        eqNodes[band].gain.setValueAtTime(gainDb, audioEngine.getContext().currentTime);
      } catch (_) {}
    }
  }

  public updateTrackCompressor(
    trackId: string,
    config: { enabled: boolean; thresholdDb: number; ratio: number }
  ) {
    const comp = this.trackCompNodes.get(trackId);
    if (comp) {
      try {
        const ctxTime = audioEngine.getContext().currentTime;
        if (config.enabled) {
          comp.threshold.setValueAtTime(config.thresholdDb, ctxTime);
          comp.ratio.setValueAtTime(config.ratio, ctxTime);
        } else {
          comp.threshold.setValueAtTime(0, ctxTime);
          comp.ratio.setValueAtTime(1, ctxTime);
        }
      } catch (_) {}
    }
  }

  public updateTrackReverbSend(trackId: string, sendLevel: number) {
    const reverbGain = this.trackReverbSendNodes.get(trackId);
    if (reverbGain) {
      try {
        const clamped = Math.max(0, Math.min(1, sendLevel));
        reverbGain.gain.setValueAtTime(clamped, audioEngine.getContext().currentTime);
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
   * Renders the entire timeline through an OfflineAudioContext with sample accuracy,
   * fades, pan, volume, 3-band EQ, dynamics compression, parallel reverb bus, and bus routing.
   * Returns a high-resolution 16-bit stereo PCM WAV blob.
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

    // Add 1.5s tail for clean reverb and delay decays
    const totalDuration = maxTimelineSec + 1.5;
    const totalFrames = Math.ceil(totalDuration * sampleRate);

    const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);
    const hasSolo = project.tracks.some((t) => t.soloed);

    // 1. Shared Reverb Bus in Offline Context
    const sharedReverb = offlineCtx.createConvolver();
    sharedReverb.buffer = createReverbImpulseBuffer(offlineCtx, 2.2, 2.4);

    const reverbReturn = offlineCtx.createGain();
    reverbReturn.gain.setValueAtTime(0.85, 0);

    sharedReverb.connect(reverbReturn);
    reverbReturn.connect(offlineCtx.destination);

    // 2. Bus Routing Gain Nodes in Offline Context
    const busOfflineGainNodes: Map<string, GainNode> = new Map();
    project.tracks.forEach((track) => {
      const bId = track.busId?.trim().toLowerCase();
      if (bId && bId !== "master" && bId !== "none" && !busOfflineGainNodes.has(bId)) {
        const busGain = offlineCtx.createGain();
        const vol = this.busVolumes.get(bId) ?? 1.0;
        busGain.gain.setValueAtTime(vol, 0);
        busGain.connect(offlineCtx.destination);
        busOfflineGainNodes.set(bId, busGain);
      }
    });

    // 3. Process Each Track
    project.tracks.forEach((track) => {
      if (track.muted) return;
      if (hasSolo && !track.soloed) return;

      // A. 3-Band EQ Nodes
      const eqLow = offlineCtx.createBiquadFilter();
      eqLow.type = "lowshelf";
      eqLow.frequency.setValueAtTime(200, 0);
      eqLow.gain.setValueAtTime(track.eq?.lowGainDb ?? 0, 0);

      const eqMid = offlineCtx.createBiquadFilter();
      eqMid.type = "peaking";
      eqMid.frequency.setValueAtTime(1000, 0);
      eqMid.Q.setValueAtTime(1.0, 0);
      eqMid.gain.setValueAtTime(track.eq?.midGainDb ?? 0, 0);

      const eqHigh = offlineCtx.createBiquadFilter();
      eqHigh.type = "highshelf";
      eqHigh.frequency.setValueAtTime(4000, 0);
      eqHigh.gain.setValueAtTime(track.eq?.highGainDb ?? 0, 0);

      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);

      // B. Dynamics Compressor Node
      let postInsertNode: AudioNode = eqHigh;
      if (track.insertEffects?.compressorEnabled) {
        const compNode = offlineCtx.createDynamicsCompressor();
        compNode.threshold.setValueAtTime(track.insertEffects.compressorThresholdDb ?? -24, 0);
        compNode.ratio.setValueAtTime(track.insertEffects.compressorRatio ?? 4, 0);
        compNode.attack.setValueAtTime(0.01, 0);
        compNode.release.setValueAtTime(0.2, 0);
        eqHigh.connect(compNode);
        postInsertNode = compNode;
      }

      // C. Dry Path: postInsertNode -> trackGain -> trackPanner -> (busGain OR destination)
      const trackGain = offlineCtx.createGain();
      trackGain.gain.setValueAtTime(track.volume, 0);
      postInsertNode.connect(trackGain);

      let finalTrackOutput: AudioNode = trackGain;
      if (offlineCtx.createStereoPanner) {
        const trackPanner = offlineCtx.createStereoPanner();
        trackPanner.pan.setValueAtTime(track.pan, 0);
        trackGain.connect(trackPanner);
        finalTrackOutput = trackPanner;
      }

      const bId = track.busId?.trim().toLowerCase();
      const busNode = (bId && bId !== "master" && bId !== "none") ? busOfflineGainNodes.get(bId) : null;
      if (busNode) {
        finalTrackOutput.connect(busNode);
      } else {
        finalTrackOutput.connect(offlineCtx.destination);
      }

      // D. Parallel Reverb Send Path
      const reverbSendLevel = Math.max(0, Math.min(1, track.insertEffects?.reverbSendLevel ?? 0));
      if (reverbSendLevel > 0) {
        const reverbSendGain = offlineCtx.createGain();
        reverbSendGain.gain.setValueAtTime(reverbSendLevel, 0);
        postInsertNode.connect(reverbSendGain);
        reverbSendGain.connect(sharedReverb);
      }

      // E. Connect Clips to Track EQ Low
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
        clipGain.connect(eqLow);

        source.start(startTime, clip.trimStart ?? 0, clip.duration);
      });
    });

    const renderedBuffer = await offlineCtx.startRendering();
    return audioBufferToWavBlob(renderedBuffer);
  }
}

export const dawEngine = new DAWEngine();
