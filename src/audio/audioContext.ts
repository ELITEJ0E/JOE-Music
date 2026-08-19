/**
 * Singleton AudioContext & MediaStream Manager
 * Provides low-latency audio processing graph for guitar input, DSP pedals, synthesis, and recording.
 */

class AudioEngineManager {
  private ctx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private inputGainNode: GainNode | null = null;
  private masterGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private inputDeviceId: string = "default";
  private isMicActive: boolean = false;
  private listeners: Set<(active: boolean) => void> = new Set();

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
      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.8;

      this.masterGainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.ctx.destination);
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
    return this.analyserNode!;
  }

  public async setMasterVolume(value: number) {
    const ctx = this.getContext();
    if (this.masterGainNode) {
      this.masterGainNode.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), ctx.currentTime, 0.02);
    }
  }

  public async startMicrophone(deviceId?: string): Promise<{ stream: MediaStream; source: MediaStreamAudioSourceNode; inputGain: GainNode }> {
    const ctx = this.getContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    if (deviceId) {
      this.inputDeviceId = deviceId;
    }

    // Stop existing stream if changing device
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: this.inputDeviceId !== "default" ? { exact: this.inputDeviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 1 },
      },
      video: false,
    };

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.micSourceNode = ctx.createMediaStreamSource(this.micStream);
      
      this.inputGainNode = ctx.createGain();
      this.inputGainNode.gain.value = 1.0;
      this.micSourceNode.connect(this.inputGainNode);

      this.isMicActive = true;
      this.notifyListeners();

      return {
        stream: this.micStream,
        source: this.micSourceNode,
        inputGain: this.inputGainNode,
      };
    } catch (err) {
      this.isMicActive = false;
      this.notifyListeners();
      console.error("Microphone access error:", err);
      throw err;
    }
  }

  public stopMicrophone() {
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch (_) {}
      this.micSourceNode = null;
    }
    this.isMicActive = false;
    this.notifyListeners();
  }

  public getIsMicActive(): boolean {
    return this.isMicActive;
  }

  public subscribeMicStatus(cb: (active: boolean) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((cb) => cb(this.isMicActive));
  }

  public async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  }
}

export const audioEngine = new AudioEngineManager();
