/**
 * Unified Guitar Audio Engine Manager
 * Central singleton that manages WebAudio context, low-latency USB/mic input,
 * Tone Studio DSP chain, real-time input/master metering, live monitoring,
 * and isolated clean/processed recording streams.
 */

import { pedalboardDsp } from "./pedalboardDsp";
import { blobToAudioBuffer, extractWaveformPeaks } from "./wavEncoder";

export type AudioInputState =
  | "IDLE"
  | "REQUESTING_PERMISSION"
  | "READY"
  | "MONITORING"
  | "RECORDING";

export interface AudioInputLevel {
  rms: number;
  peak: number;
  db: number;
}

class AudioEngineManager {
  private ctx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private inputGainNode: GainNode | null = null;
  private inputAnalyserNode: AnalyserNode | null = null;
  private monitorGainNode: GainNode | null = null;
  private masterGainNode: GainNode | null = null;
  private masterAnalyserNode: AnalyserNode | null = null;

  private inputDeviceId: string = "default";
  private outputDeviceId: string = "default";

  // State Machine & Shared Input Reference Counting
  private inputState: AudioInputState = "IDLE";
  private activeConsumers: Set<string> = new Set();
  private recordingConsumers: Set<string> = new Set();
  private isMonitoring: boolean = false;
  private isAcquiringPromise: Promise<{
    stream: MediaStream;
    source: MediaStreamAudioSourceNode;
    inputGain: GainNode;
  }> | null = null;

  private stateListeners: Set<(state: AudioInputState, consumers: string[]) => void> = new Set();
  private micListeners: Set<(active: boolean) => void> = new Set();
  private monitorListeners: Set<(monitoring: boolean) => void> = new Set();
  private deviceListeners: Set<(devices: MediaDeviceInfo[]) => void> = new Set();

  private processedRecDest: MediaStreamAudioDestinationNode | null = null;
  private dryRecDest: MediaStreamAudioDestinationNode | null = null;

  public getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass({
        latencyHint: "interactive",
      });

      // Master output gain
      this.masterGainNode = this.ctx.createGain();
      this.masterGainNode.gain.value = 0.85;

      // Master analyzer for global spectrum visualization
      this.masterAnalyserNode = this.ctx.createAnalyser();
      this.masterAnalyserNode.fftSize = 2048;
      this.masterAnalyserNode.smoothingTimeConstant = 0.8;

      this.masterGainNode.connect(this.masterAnalyserNode);
      this.masterAnalyserNode.connect(this.ctx.destination);

      // Input gain & analyser
      this.inputGainNode = this.ctx.createGain();
      this.inputGainNode.gain.value = 1.0;

      this.inputAnalyserNode = this.ctx.createAnalyser();
      this.inputAnalyserNode.fftSize = 512;
      this.inputAnalyserNode.smoothingTimeConstant = 0.3;
      this.inputGainNode.connect(this.inputAnalyserNode);

      // Monitor Gain Node (0 by default to prevent speaker screech)
      this.monitorGainNode = this.ctx.createGain();
      this.monitorGainNode.gain.value = 0.0;
      this.monitorGainNode.connect(this.masterGainNode);

      // Connect input to Tone Studio DSP chain
      this.inputGainNode.connect(pedalboardDsp.getInputNode());

      // Connect DSP output to live monitor node
      pedalboardDsp.getOutputNode().connect(this.monitorGainNode);

      // Create isolated recording taps
      this.processedRecDest = this.ctx.createMediaStreamDestination();
      pedalboardDsp.getOutputNode().connect(this.processedRecDest);

      this.dryRecDest = this.ctx.createMediaStreamDestination();
      this.inputGainNode.connect(this.dryRecDest);
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch((err) => console.warn("AudioContext resume failed:", err));
    }

    return this.ctx;
  }

  public getMasterGain(): GainNode {
    this.getContext();
    return this.masterGainNode!;
  }

  public getMasterAnalyser(): AnalyserNode {
    this.getContext();
    return this.masterAnalyserNode!;
  }

  public getInputAnalyser(): AnalyserNode {
    this.getContext();
    return this.inputAnalyserNode!;
  }

  public getInputGainNode(): GainNode {
    this.getContext();
    return this.inputGainNode!;
  }

  public getMonitorGainNode(): GainNode {
    this.getContext();
    return this.monitorGainNode!;
  }

  public async setMasterVolume(value: number) {
    const ctx = this.getContext();
    if (this.masterGainNode) {
      this.masterGainNode.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), ctx.currentTime, 0.02);
    }
  }

  public setInputGain(value: number) {
    const ctx = this.getContext();
    if (this.inputGainNode) {
      this.inputGainNode.gain.setTargetAtTime(Math.max(0, Math.min(2.5, value)), ctx.currentTime, 0.02);
    }
  }

  public getInputState(): AudioInputState {
    return this.inputState;
  }

  public getActiveConsumers(): string[] {
    return Array.from(this.activeConsumers);
  }

  public getIsMonitoring(): boolean {
    return this.isMonitoring;
  }

  public getIsMicActive(): boolean {
    return this.inputState !== "IDLE" && this.inputState !== "REQUESTING_PERMISSION";
  }

  public getIsInputReady(): boolean {
    return this.inputState === "READY" || this.inputState === "MONITORING" || this.inputState === "RECORDING";
  }
  
  public getMicStreamTracksCount(): number {
    return this.micStream ? this.micStream.getTracks().length : 0;
  }

  /**
   * Acquire shared hardware audio input with reference counting.
   * Only calls getUserMedia once for all consumers.
   */
  public async acquireInput(
    consumerId: string,
    options?: { enableMonitoring?: boolean; isRecording?: boolean }
  ): Promise<{
    stream: MediaStream;
    source: MediaStreamAudioSourceNode;
    inputGain: GainNode;
  }> {
    this.activeConsumers.add(consumerId);
    if (options?.isRecording) {
      this.recordingConsumers.add(consumerId);
    }
    if (options?.enableMonitoring !== undefined) {
      this.isMonitoring = options.enableMonitoring;
    }

    const ctx = this.getContext();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (_) {}
    }

    // If stream is already active and connected, update computed state and return
    if (this.micStream && this.micSourceNode && this.inputGainNode) {
      this.updateComputedState();
      return {
        stream: this.micStream,
        source: this.micSourceNode,
        inputGain: this.inputGainNode,
      };
    }

    // If stream is currently in flight of acquiring, wait for it
    if (this.isAcquiringPromise) {
      const res = await this.isAcquiringPromise;
      this.updateComputedState();
      return res;
    }

    // Begin hardware acquisition
    this.inputState = "REQUESTING_PERMISSION";
    this.notifyAll();

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: this.inputDeviceId !== "default" ? { exact: this.inputDeviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 1 },
        ...( { latency: 0 } as any ),
      },
      video: false,
    };

    this.isAcquiringPromise = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.micStream = stream;

        // Listen for hardware-level termination
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            this.releaseAllInputs();
          };
        });

        this.micSourceNode = ctx.createMediaStreamSource(this.micStream);
        this.micSourceNode.connect(this.inputGainNode!);

        this.updateComputedState();

        return {
          stream: this.micStream,
          source: this.micSourceNode,
          inputGain: this.inputGainNode!,
        };
      } catch (err) {
        this.activeConsumers.delete(consumerId);
        this.recordingConsumers.delete(consumerId);
        this.inputState = "IDLE";
        this.notifyAll();
        console.error("Microphone access error:", err);
        throw err;
      } finally {
        this.isAcquiringPromise = null;
      }
    })();

    return this.isAcquiringPromise;
  }

  /**
   * Release consumer hold on shared microphone stream.
   * If zero consumers remain, completely terminates MediaStream tracks.
   */
  public releaseInput(consumerId: string): void {
    this.activeConsumers.delete(consumerId);
    this.recordingConsumers.delete(consumerId);

    if (this.activeConsumers.size === 0) {
      if (this.micStream) {
        this.micStream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch (_) {}
        });
        this.micStream = null;
      }
      if (this.micSourceNode) {
        try {
          this.micSourceNode.disconnect();
        } catch (_) {}
        this.micSourceNode = null;
      }
      if (this.monitorGainNode && this.ctx) {
        this.monitorGainNode.gain.setValueAtTime(0.0, this.ctx.currentTime);
      }
      this.isMonitoring = false;
      this.inputState = "IDLE";
      this.notifyAll();
    } else {
      this.updateComputedState();
    }
  }

  /**
   * Forcibly release all active input holds and terminate the hardware stream.
   */
  public releaseAllInputs(): void {
    this.activeConsumers.clear();
    this.recordingConsumers.clear();

    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (_) {}
      });
      this.micStream = null;
    }
    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch (_) {}
      this.micSourceNode = null;
    }
    if (this.monitorGainNode && this.ctx) {
      this.monitorGainNode.gain.setValueAtTime(0.0, this.ctx.currentTime);
    }
    this.isMonitoring = false;
    this.inputState = "IDLE";
    this.notifyAll();
  }

  /**
   * Updates state machine based on consumer flags and monitoring state.
   */
  private updateComputedState(): void {
    if (this.activeConsumers.size === 0 || !this.micStream) {
      this.inputState = "IDLE";
    } else if (this.recordingConsumers.size > 0) {
      this.inputState = "RECORDING";
    } else if (this.isMonitoring) {
      this.inputState = "MONITORING";
    } else {
      this.inputState = "READY";
    }

    if (this.monitorGainNode && this.ctx) {
      const now = this.ctx.currentTime;
      // Smooth fade to prevent popping
      const targetGain = this.isMonitoring && this.inputState !== "IDLE" ? 1.0 : 0.0;
      this.monitorGainNode.gain.setTargetAtTime(targetGain, now, 0.015);
    }

    this.notifyAll();
  }

  /**
   * Toggles live audio monitoring through speakers/headphones.
   * When enabled, if input is idle, requests input via 'monitor' consumer.
   */
  public async toggleMonitoring(enable?: boolean): Promise<boolean> {
    this.getContext();
    const targetState = enable !== undefined ? enable : !this.isMonitoring;
    this.isMonitoring = targetState;

    if (this.isMonitoring) {
      await this.acquireInput("monitor", { enableMonitoring: true });
    } else {
      this.releaseInput("monitor");
      this.updateComputedState();
    }

    return this.isMonitoring;
  }

  public subscribeInputState(
    cb: (state: AudioInputState, consumers: string[]) => void
  ): () => void {
    this.stateListeners.add(cb);
    cb(this.inputState, Array.from(this.activeConsumers));
    return () => this.stateListeners.delete(cb);
  }

  public subscribeMonitorStatus(cb: (monitoring: boolean) => void): () => void {
    this.monitorListeners.add(cb);
    cb(this.isMonitoring);
    return () => this.monitorListeners.delete(cb);
  }

  public subscribeMicStatus(cb: (active: boolean) => void): () => void {
    this.micListeners.add(cb);
    cb(this.getIsMicActive());
    return () => this.micListeners.delete(cb);
  }

  private notifyAll() {
    const isMicActive = this.getIsMicActive();
    const consumers = Array.from(this.activeConsumers);

    this.stateListeners.forEach((cb) => cb(this.inputState, consumers));
    this.micListeners.forEach((cb) => cb(isMicActive));
    this.monitorListeners.forEach((cb) => cb(this.isMonitoring));
  }

  /**
   * Backward-compatible startMicrophone for legacy callers.
   */
  public async startMicrophone(deviceId?: string): Promise<{
    stream: MediaStream;
    source: MediaStreamAudioSourceNode;
    inputGain: GainNode;
  }> {
    if (deviceId) {
      this.inputDeviceId = deviceId;
    }
    return this.acquireInput("manual-input");
  }

  /**
   * Backward-compatible stopMicrophone for legacy callers.
   */
  public stopMicrophone() {
    this.releaseInput("manual-input");
  }

  public async setInputDevice(deviceId: string) {
    this.inputDeviceId = deviceId;
    if (this.micStream) {
      const currentConsumers = Array.from(this.activeConsumers);
      const recConsumers = Array.from(this.recordingConsumers);
      const prevMon = this.isMonitoring;

      if (this.micStream) {
        this.micStream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch (_) {}
        });
        this.micStream = null;
      }
      if (this.micSourceNode) {
        try {
          this.micSourceNode.disconnect();
        } catch (_) {}
        this.micSourceNode = null;
      }

      for (const consumer of currentConsumers) {
        await this.acquireInput(consumer, {
          enableMonitoring: prevMon,
          isRecording: recConsumers.includes(consumer),
        });
      }
    }
  }

  public getInputDeviceId(): string {
    return this.inputDeviceId;
  }

  public async setOutputDevice(deviceId: string): Promise<boolean> {
    this.outputDeviceId = deviceId;
    const ctx = this.getContext();
    if (typeof (ctx as any).setSinkId === "function") {
      try {
        await (ctx as any).setSinkId(deviceId);
        return true;
      } catch (err) {
        console.warn("setSinkId failed:", err);
        return false;
      }
    }
    return false;
  }

  public getOutputDeviceId(): string {
    return this.outputDeviceId;
  }

  public async getAudioDevices(): Promise<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return { inputs: [], outputs: [] };
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        inputs: devices.filter((d) => d.kind === "audioinput"),
        outputs: devices.filter((d) => d.kind === "audiooutput"),
      };
    } catch (err) {
      console.warn("enumerateDevices error:", err);
      return { inputs: [], outputs: [] };
    }
  }

  /**
   * Real-time input level meter reading (RMS, Peak, dBFS)
   */
  public getInputLevel(): AudioInputLevel {
    if (!this.inputAnalyserNode || !this.getIsMicActive()) {
      return { rms: 0, peak: 0, db: -100 };
    }

    const bufferLength = this.inputAnalyserNode.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    this.inputAnalyserNode.getFloatTimeDomainData(dataArray);

    let sum = 0;
    let peak = 0;

    for (let i = 0; i < bufferLength; i++) {
      const val = dataArray[i];
      const absVal = Math.abs(val);
      if (absVal > peak) peak = absVal;
      sum += val * val;
    }

    const rms = Math.sqrt(sum / bufferLength);
    const db = rms > 0.00001 ? 20 * Math.log10(rms) : -100;

    return {
      rms: Math.min(1.0, rms),
      peak: Math.min(1.0, peak),
      db: Math.max(-100, Math.min(0, db)),
    };
  }

  /**
   * Returns a live MediaStream containing processed guitar tone (or clean dry)
   * for seamless, feedback-free recording into DAW tracks or Looper.
   */
  public getRecordingStream(source: "processed" | "dry" = "processed"): MediaStream {
    this.getContext();
    if (source === "dry" && this.dryRecDest) {
      return this.dryRecDest.stream;
    }
    if (this.processedRecDest) {
      return this.processedRecDest.stream;
    }
    // Fallback
    const dest = this.ctx!.createMediaStreamDestination();
    pedalboardDsp.getOutputNode().connect(dest);
    return dest.stream;
  }
}

export const audioEngine = new AudioEngineManager();
