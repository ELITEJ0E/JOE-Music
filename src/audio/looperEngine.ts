import { audioEngine } from "./audioContext";
import { LooperTrack, DAWTrack } from "../types";
import { audioBufferToWavBlob, extractWaveformPeaks } from "./wavEncoder";

class LooperEngine {
  private tracks: LooperTrack[] = [
    { id: "1", name: "Loop Layer 1 (Base)", buffer: null, volume: 0.9, pan: 0, muted: false, soloed: false, reversed: false, halfSpeed: false, lengthSeconds: 0 },
    { id: "2", name: "Loop Layer 2 (Rhythm)", buffer: null, volume: 0.85, pan: -0.3, muted: false, soloed: false, reversed: false, halfSpeed: false, lengthSeconds: 0 },
    { id: "3", name: "Loop Layer 3 (Lead)", buffer: null, volume: 0.85, pan: 0.3, muted: false, soloed: false, reversed: false, halfSpeed: false, lengthSeconds: 0 },
    { id: "4", name: "Loop Layer 4 (Ambient)", buffer: null, volume: 0.8, pan: 0, muted: false, soloed: false, reversed: false, halfSpeed: false, lengthSeconds: 0 },
  ];

  private activeTrackIndex: number = 0;
  private isRecording: boolean = false;
  private isPlaying: boolean = false;
  private isOverdubbing: boolean = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private masterLoopLength: number = 0; // Duration of base track determines master loop length
  private sourceNodes: Map<string, AudioBufferSourceNode> = new Map();
  private gainNodes: Map<string, GainNode> = new Map();
  private loopStartTime: number = 0;
  private loopTimer: number | null = null;
  private historyStack: Map<string, AudioBuffer[]> = new Map();

  private stateListeners: Set<() => void> = new Set();
  private progressListeners: Set<(progress: number) => void> = new Set();

  public getTracks(): LooperTrack[] {
    return this.tracks;
  }

  public getActiveTrackIndex(): number {
    return this.activeTrackIndex;
  }

  public setActiveTrackIndex(index: number) {
    this.activeTrackIndex = Math.max(0, Math.min(this.tracks.length - 1, index));
    this.notifyState();
  }

  public getStatus() {
    return {
      isRecording: this.isRecording,
      isPlaying: this.isPlaying,
      isOverdubbing: this.isOverdubbing,
      activeTrackIndex: this.activeTrackIndex,
      masterLoopLength: this.masterLoopLength,
    };
  }

  public subscribeState(cb: () => void) {
    this.stateListeners.add(cb);
    return () => {
      this.stateListeners.delete(cb);
    };
  }

  public subscribeProgress(cb: (progress: number) => void) {
    this.progressListeners.add(cb);
    return () => {
      this.progressListeners.delete(cb);
    };
  }

  private notifyState() {
    this.stateListeners.forEach((cb) => cb());
  }

  /**
   * Start recording or overdubbing on the active track using the processed guitar stream
   */
  public async startRecord() {
    const ctx = audioEngine.getContext();
    if (ctx.state === "suspended") await ctx.resume();

    try {
      // Ensure microphone stream is acquired with recording state
      await audioEngine.acquireInput("looper-recording", { isRecording: true });

      // Tap the processed Tone Studio guitar output
      const stream = audioEngine.getRecordingStream("processed");

      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });
        const arrayBuffer = await audioBlob.arrayBuffer();
        try {
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          this.saveTrackBuffer(this.activeTrackIndex, audioBuffer, audioBlob);
        } catch (err) {
          console.error("Looper audio decode error:", err);
        }
      };

      this.isRecording = true;
      this.mediaRecorder.start(50); // Slice every 50ms

      // If other tracks exist and we're not playing yet, start synchronized playback
      if (!this.isPlaying && this.masterLoopLength > 0) {
        this.playAll();
      }

      this.notifyState();
    } catch (err) {
      console.error("Failed to start looper recording:", err);
      alert("Microphone/Audio Input required for guitar looper recording.");
    }
  }

  /**
   * Stop recording, process buffer, and start seamless loop playback
   */
  public async stopRecord() {
    if (!this.isRecording || !this.mediaRecorder) return;
    this.isRecording = false;
    this.mediaRecorder.stop();
    audioEngine.releaseInput("looper-recording");
    this.notifyState();

    // Auto trigger playback after short decode
    setTimeout(() => {
      if (!this.isPlaying) {
        this.playAll();
      }
    }, 150);
  }

  private saveTrackBuffer(trackIdx: number, newBuffer: AudioBuffer, blob?: Blob) {
    const track = this.tracks[trackIdx];
    if (!track) return;

    // Save previous buffer in undo stack
    if (track.buffer) {
      const history = this.historyStack.get(track.id) || [];
      history.push(track.buffer);
      this.historyStack.set(track.id, history);
    }

    track.buffer = newBuffer;
    track.blob = blob || audioBufferToWavBlob(newBuffer);
    track.lengthSeconds = newBuffer.duration;

    // If this is the base loop, set master length
    if (trackIdx === 0 || this.masterLoopLength === 0) {
      this.masterLoopLength = newBuffer.duration;
    }

    // Auto-advance active track to next layer if available
    if (trackIdx < this.tracks.length - 1 && trackIdx === this.activeTrackIndex) {
      this.activeTrackIndex = trackIdx + 1;
    }

    this.notifyState();
    if (this.isPlaying) {
      this.restartPlayback();
    }
  }

  private getTrack(trackIdOrIdx: number | string): LooperTrack | undefined {
    if (typeof trackIdOrIdx === "number") {
      return this.tracks[trackIdOrIdx];
    }
    return this.tracks.find((t) => t.id === trackIdOrIdx);
  }

  public undo(trackIdx: number | string) {
    const track = this.getTrack(trackIdx);
    if (!track) return;
    const history = this.historyStack.get(track.id);
    if (history && history.length > 0) {
      track.buffer = history.pop() || null;
      track.blob = track.buffer ? audioBufferToWavBlob(track.buffer) : undefined;
      track.lengthSeconds = track.buffer ? track.buffer.duration : 0;
      this.notifyState();
      if (this.isPlaying) this.restartPlayback();
    }
  }

  public clearTrack(trackIdx: number | string) {
    const track = this.getTrack(trackIdx);
    if (!track) return;
    this.stopTrackNode(track.id);
    track.buffer = null;
    track.blob = undefined;
    track.lengthSeconds = 0;

    // If all empty, reset master loop length
    if (this.tracks.every((t) => !t.buffer)) {
      this.masterLoopLength = 0;
      this.stopAll();
    }

    this.notifyState();
  }

  public clearAll() {
    this.stopAll();
    this.tracks.forEach((t) => {
      t.buffer = null;
      t.blob = undefined;
      t.lengthSeconds = 0;
    });
    this.masterLoopLength = 0;
    this.activeTrackIndex = 0;
    this.notifyState();
  }

  public playAll() {
    const ctx = audioEngine.getContext();
    this.stopAllNodes();

    const hasAnyBuffer = this.tracks.some((t) => t.buffer !== null);
    if (!hasAnyBuffer) return;

    this.isPlaying = true;
    this.loopStartTime = ctx.currentTime;

    const hasSolo = this.tracks.some((t) => t.soloed);

    this.tracks.forEach((track) => {
      if (!track.buffer) return;
      if (track.muted) return;
      if (hasSolo && !track.soloed) return;

      this.playTrackNode(track, this.loopStartTime);
    });

    this.startProgressTracker();
    this.notifyState();
  }

  public stopAll() {
    this.isPlaying = false;
    this.stopAllNodes();
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    this.progressListeners.forEach((cb) => cb(0));
    this.notifyState();
  }

  public togglePlay(): boolean {
    if (this.isPlaying) {
      this.stopAll();
      return false;
    } else {
      this.playAll();
      return true;
    }
  }

  private playTrackNode(track: LooperTrack, startTime: number) {
    if (!track.buffer) return;
    const ctx = audioEngine.getContext();

    let bufferToPlay = track.buffer;
    if (track.reversed) {
      bufferToPlay = this.createReversedBuffer(track.buffer);
    }

    const source = ctx.createBufferSource();
    source.buffer = bufferToPlay;
    source.loop = true;
    source.playbackRate.value = track.halfSpeed ? 0.5 : 1.0;

    // Gain and Pan
    const gain = ctx.createGain();
    gain.gain.value = track.volume;

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = track.pan;
      source.connect(panner);
      panner.connect(gain);
    } else {
      source.connect(gain);
    }

    gain.connect(audioEngine.getMasterGain());
    source.start(startTime);

    this.sourceNodes.set(track.id, source);
    this.gainNodes.set(track.id, gain);
  }

  private createReversedBuffer(buffer: AudioBuffer): AudioBuffer {
    const ctx = audioEngine.getContext();
    const rev = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const src = buffer.getChannelData(c);
      const dst = rev.getChannelData(c);
      for (let i = 0; i < buffer.length; i++) {
        dst[i] = src[buffer.length - 1 - i];
      }
    }
    return rev;
  }

  private stopTrackNode(trackId: string) {
    const src = this.sourceNodes.get(trackId);
    if (src) {
      try {
        src.stop();
        src.disconnect();
      } catch (_) {}
      this.sourceNodes.delete(trackId);
    }
  }

  private stopAllNodes() {
    this.sourceNodes.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch (_) {}
    });
    this.sourceNodes.clear();
    this.gainNodes.clear();
  }

  private restartPlayback() {
    if (this.isPlaying) {
      this.playAll();
    }
  }

  public setTrackVolume(trackIdx: number | string, vol: number) {
    const track = this.getTrack(trackIdx);
    if (!track) return;
    track.volume = Math.max(0, Math.min(1, vol));
    const gain = this.gainNodes.get(track.id);
    if (gain) {
      gain.gain.setValueAtTime(track.volume, audioEngine.getContext().currentTime);
    }
    this.notifyState();
  }

  public setTrackPan(trackIdx: number | string, pan: number) {
    const track = this.getTrack(trackIdx);
    if (!track) return;
    track.pan = Math.max(-1, Math.min(1, pan));
    this.restartPlayback();
    this.notifyState();
  }

  public toggleMute(trackIdx: number | string) {
    const track = this.getTrack(trackIdx);
    if (!track) return;
    track.muted = !track.muted;
    this.restartPlayback();
    this.notifyState();
  }

  public toggleTrackMute(trackIdx: number | string) {
    this.toggleMute(trackIdx);
  }

  public toggleTrackSolo(trackIdx: number | string) {
    const track = this.getTrack(trackIdx);
    if (!track) return;
    track.soloed = !track.soloed;
    this.restartPlayback();
    this.notifyState();
  }

  public toggleReverse(trackIdx: number | string) {
    const track = this.getTrack(trackIdx);
    if (!track) return;
    track.reversed = !track.reversed;
    this.restartPlayback();
    this.notifyState();
  }

  public toggleTrackReverse(trackIdx: number | string) {
    this.toggleReverse(trackIdx);
  }

  public toggleHalfSpeed(trackIdx: number | string) {
    const track = this.getTrack(trackIdx);
    if (!track) return;
    track.halfSpeed = !track.halfSpeed;
    this.restartPlayback();
    this.notifyState();
  }

  public toggleTrackHalfSpeed(trackIdx: number | string) {
    this.toggleHalfSpeed(trackIdx);
  }

  private startProgressTracker() {
    if (this.loopTimer) clearInterval(this.loopTimer);
    const loopDuration = this.masterLoopLength || 4;

    this.loopTimer = window.setInterval(() => {
      if (!this.isPlaying) return;
      const ctx = audioEngine.getContext();
      const elapsed = ctx.currentTime - this.loopStartTime;
      const progress = (elapsed % loopDuration) / loopDuration;
      this.progressListeners.forEach((cb) => cb(progress));
    }, 30);
  }

  /**
   * Converts a recorded looper layer into a DAW track with complete audio data
   */
  public exportTrackAsDAWTrack(trackIdx: number | string, customName?: string): DAWTrack | null {
    const track = this.getTrack(trackIdx);
    if (!track || !track.buffer) return null;

    const blob = track.blob || audioBufferToWavBlob(track.buffer);
    const peaks = extractWaveformPeaks(track.buffer, 64);

    const colors = ["#a3ff12", "#38bdf8", "#f59e0b", "#ec4899"];
    const color = typeof trackIdx === "number" ? colors[trackIdx % colors.length] : "#a3ff12";

    const clipId = `clip-loop-${Date.now()}-${track.id}`;

    return {
      id: `daw-trk-loop-${Date.now()}-${track.id}`,
      name: customName || `Loop: ${track.name}`,
      color,
      volume: track.volume,
      pan: track.pan,
      muted: track.muted,
      soloed: track.soloed,
      clips: [
        {
          id: clipId,
          name: `${track.name} Layer`,
          startTime: 0,
          duration: track.buffer.duration,
          trimStart: 0,
          audioBuffer: track.buffer,
          audioBlob: blob,
          waveformPeaks: peaks,
          fadeInSec: 0.005,
          fadeOutSec: 0.005,
          gain: 1.0,
          color,
        },
      ],
      audioBuffer: track.buffer,
      audioBlob: blob,
      recording: false,
      waveformPeaks: peaks,
      startTime: 0,
      duration: track.buffer.duration,
      inputSource: "processed",
    };
  }

  /**
   * Converts all active looper layers into DAW tracks
   */
  public exportAllTracksAsDAWTracks(): DAWTrack[] {
    const exported: DAWTrack[] = [];
    this.tracks.forEach((t, i) => {
      if (t.buffer) {
        const dawTrack = this.exportTrackAsDAWTrack(i);
        if (dawTrack) exported.push(dawTrack);
      }
    });
    return exported;
  }
}

export const looperEngine = new LooperEngine();
