import { audioEngine } from "./audioContext";
import { DAWProject, DAWTrack, AudioClip } from "../types";
import { audioBufferToWavBlob } from "./wavEncoder";

interface ActiveClipNode {
  clipId: string;
  trackId: string;
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
  pannerNode: StereoPannerNode | null;
}

class DAWEngine {
  private activeNodes: Map<string, ActiveClipNode> = new Map();
  private trackGains: Map<string, GainNode> = new Map();
  private trackPanners: Map<string, StereoPannerNode> = new Map();

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
  }

  /**
   * Schedules sample-accurate playback for all unmuted & soloed tracks on the timeline.
   */
  public startPlayback(project: DAWProject, startTimelineTime: number) {
    this.stopAllNodes();
    const ctx = audioEngine.getContext();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const hasSolo = project.tracks.some((t) => t.soloed);
    const ctxNow = ctx.currentTime;

    project.tracks.forEach((track) => {
      if (track.muted) return;
      if (hasSolo && !track.soloed) return;

      // Track-level master bus
      const trackGain = ctx.createGain();
      trackGain.gain.setValueAtTime(track.volume, ctxNow);

      let trackPanner: StereoPannerNode | null = null;
      if (ctx.createStereoPanner) {
        trackPanner = ctx.createStereoPanner();
        trackPanner.pan.setValueAtTime(track.pan, ctxNow);
        trackGain.connect(trackPanner);
        trackPanner.connect(audioEngine.getMasterGain());
        this.trackPanners.set(track.id, trackPanner);
      } else {
        trackGain.connect(audioEngine.getMasterGain());
      }
      this.trackGains.set(track.id, trackGain);

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
          clipGainNode.connect(trackGain);

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
          clipGainNode.connect(trackGain);

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

  /**
   * Renders the entire timeline through an OfflineAudioContext with sample accuracy,
   * fades, pan, volume, and returns a high-resolution 16-bit stereo PCM WAV blob.
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

    // Add 0.5s tail for clean decay
    const totalDuration = maxTimelineSec + 0.5;
    const totalFrames = Math.ceil(totalDuration * sampleRate);

    const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);
    const hasSolo = project.tracks.some((t) => t.soloed);

    project.tracks.forEach((track) => {
      if (track.muted) return;
      if (hasSolo && !track.soloed) return;

      const trackGain = offlineCtx.createGain();
      trackGain.gain.setValueAtTime(track.volume, 0);

      let trackPanner: StereoPannerNode | null = null;
      if (offlineCtx.createStereoPanner) {
        trackPanner = offlineCtx.createStereoPanner();
        trackPanner.pan.setValueAtTime(track.pan, 0);
        trackGain.connect(trackPanner);
        trackPanner.connect(offlineCtx.destination);
      } else {
        trackGain.connect(offlineCtx.destination);
      }

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
        clipGain.connect(trackGain);

        source.start(startTime, clip.trimStart ?? 0, clip.duration);
      });
    });

    const renderedBuffer = await offlineCtx.startRendering();
    return audioBufferToWavBlob(renderedBuffer);
  }
}

export const dawEngine = new DAWEngine();
