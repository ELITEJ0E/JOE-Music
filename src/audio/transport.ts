import { audioEngine } from "./audioContext";
import { CountInSetting } from "../types";

export interface TransportState {
  isPlaying: boolean;
  isRecording: boolean;
  isLooping: boolean;
  bpm: number;
  timeSig: string;
  keySig: string;
  playheadTimeSec: number;
  loopLengthSec: number;
  isMetronomeActive: boolean;
  isCountInActive: boolean;
  countInMode: CountInSetting;
}

class TransportClock {
  private isPlaying: boolean = false;
  private isRecording: boolean = false;
  private isLooping: boolean = true;
  private bpm: number = 120;
  private timeSig: string = "4/4";
  private keySig: string = "Am";
  private playheadTimeSec: number = 0;
  private loopLengthSec: number = 32;
  private isMetronomeActive: boolean = false;
  private isCountInActive: boolean = false;
  private countInMode: CountInSetting = "off";

  private startCtxTime: number = 0;
  private startOffsetSec: number = 0;
  private animationFrameId: number | null = null;
  private metronomeTimer: number | null = null;
  private nextBeatTime: number = 0;
  private currentBeatNumber: number = 0;

  private stateListeners: Set<(state: TransportState) => void> = new Set();
  private tickListeners: Set<(timeSec: number) => void> = new Set();
  private beatListeners: Set<(beat: number) => void> = new Set();

  public getState(): TransportState {
    return {
      isPlaying: this.isPlaying,
      isRecording: this.isRecording,
      isLooping: this.isLooping,
      bpm: this.bpm,
      timeSig: this.timeSig,
      keySig: this.keySig,
      playheadTimeSec: this.playheadTimeSec,
      loopLengthSec: this.loopLengthSec,
      isMetronomeActive: this.isMetronomeActive,
      isCountInActive: this.isCountInActive,
      countInMode: this.countInMode,
    };
  }

  public subscribe(cb: (state: TransportState) => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  public subscribeTick(cb: (timeSec: number) => void): () => void {
    this.tickListeners.add(cb);
    return () => this.tickListeners.delete(cb);
  }

  public subscribeBeat(cb: (beat: number) => void): () => void {
    this.beatListeners.add(cb);
    return () => this.beatListeners.delete(cb);
  }

  private notifyState() {
    const s = this.getState();
    this.stateListeners.forEach((cb) => cb(s));
  }

  public getCurrentTime(): number {
    if (!this.isPlaying && !this.isRecording) {
      return this.playheadTimeSec;
    }
    const ctx = audioEngine.getContext();
    const elapsed = ctx.currentTime - this.startCtxTime;
    let current = this.startOffsetSec + Math.max(0, elapsed);
    if (this.isLooping && this.loopLengthSec > 0 && current >= this.loopLengthSec) {
      current = current % this.loopLengthSec;
    }
    return current;
  }

  public setBpm(val: number) {
    this.bpm = Math.max(30, Math.min(300, Math.round(val)));
    this.notifyState();
  }

  public setKeySig(key: string) {
    this.keySig = key;
    this.notifyState();
  }

  public setTimeSig(sig: string) {
    this.timeSig = sig;
    this.notifyState();
  }

  public setIsLooping(loop: boolean) {
    this.isLooping = loop;
    this.notifyState();
  }

  public setLoopLength(len: number) {
    this.loopLengthSec = Math.max(1, len);
    this.notifyState();
  }

  public toggleMetronome(): boolean {
    this.isMetronomeActive = !this.isMetronomeActive;
    if (this.isMetronomeActive && (this.isPlaying || this.isRecording)) {
      this.startMetronomeScheduler();
    } else if (!this.isMetronomeActive && this.metronomeTimer) {
      clearInterval(this.metronomeTimer);
      this.metronomeTimer = null;
    }
    this.notifyState();
    return this.isMetronomeActive;
  }

  public setCountInMode(mode: CountInSetting) {
    this.countInMode = mode;
    this.isCountInActive = mode !== "off";
    this.notifyState();
  }

  public toggleCountIn(): boolean {
    if (this.countInMode === "off") {
      this.countInMode = "1bar";
      this.isCountInActive = true;
    } else if (this.countInMode === "1bar") {
      this.countInMode = "2bars";
      this.isCountInActive = true;
    } else {
      this.countInMode = "off";
      this.isCountInActive = false;
    }
    this.notifyState();
    return this.isCountInActive;
  }

  /**
   * Runs an audible count-in prior to recording if countInMode is enabled.
   */
  public async runCountIn(onBeat?: (beatNumber: number, totalBeats: number) => void): Promise<void> {
    if (this.countInMode === "off") return;
    const totalBeats = this.countInMode === "2bars" ? 8 : 4;
    const secondsPerBeat = 60.0 / this.bpm;
    const ctx = audioEngine.getContext();
    if (ctx.state === "suspended") await ctx.resume();

    for (let beat = 0; beat < totalBeats; beat++) {
      const isDownbeat = beat % 4 === 0;
      this.playMetronomeClick(ctx.currentTime, isDownbeat);
      if (onBeat) onBeat(beat + 1, totalBeats);
      await new Promise((resolve) => setTimeout(resolve, secondsPerBeat * 1000));
    }
  }

  public seek(seconds: number) {
    const target = Math.max(0, Math.min(this.loopLengthSec > 0 ? this.loopLengthSec : 300, seconds));
    this.playheadTimeSec = target;
    this.startOffsetSec = target;
    const ctx = audioEngine.getContext();
    this.startCtxTime = ctx.currentTime;
    this.tickListeners.forEach((cb) => cb(target));
    this.notifyState();
  }

  public play() {
    if (this.isPlaying) return;
    const ctx = audioEngine.getContext();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    this.isPlaying = true;
    this.startCtxTime = ctx.currentTime;
    this.startOffsetSec = this.playheadTimeSec;
    this.startClockLoop();

    if (this.isMetronomeActive) {
      this.startMetronomeScheduler();
    }

    this.notifyState();
  }

  public pause() {
    if (!this.isPlaying && !this.isRecording) return;
    this.playheadTimeSec = this.getCurrentTime();
    this.startOffsetSec = this.playheadTimeSec;
    this.isPlaying = false;
    this.isRecording = false;
    this.stopClockLoop();
    this.stopMetronomeScheduler();
    this.notifyState();
  }

  public stop() {
    this.isPlaying = false;
    this.isRecording = false;
    this.playheadTimeSec = 0;
    this.startOffsetSec = 0;
    this.stopClockLoop();
    this.stopMetronomeScheduler();
    this.tickListeners.forEach((cb) => cb(0));
    this.notifyState();
  }

  public togglePlay(): boolean {
    if (this.isPlaying || this.isRecording) {
      this.pause();
      return false;
    } else {
      this.play();
      return true;
    }
  }

  public startRecording() {
    const ctx = audioEngine.getContext();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    this.isRecording = true;
    this.isPlaying = true;
    this.startCtxTime = ctx.currentTime;
    this.startOffsetSec = this.playheadTimeSec;
    this.startClockLoop();
    if (this.isMetronomeActive) {
      this.startMetronomeScheduler();
    }
    this.notifyState();
  }

  public stopRecording() {
    this.isRecording = false;
    this.notifyState();
  }

  private startClockLoop() {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

    const tick = () => {
      if (!this.isPlaying && !this.isRecording) return;
      const cur = this.getCurrentTime();
      this.playheadTimeSec = cur;
      this.tickListeners.forEach((cb) => cb(cur));
      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  private stopClockLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private startMetronomeScheduler() {
    this.stopMetronomeScheduler();
    const ctx = audioEngine.getContext();
    const secondsPerBeat = 60.0 / this.bpm;
    this.nextBeatTime = ctx.currentTime + 0.05;
    this.currentBeatNumber = 0;

    const scheduleClick = () => {
      while (this.nextBeatTime < ctx.currentTime + 0.1) {
        this.playMetronomeClick(this.nextBeatTime, this.currentBeatNumber === 0);
        this.beatListeners.forEach((cb) => cb(this.currentBeatNumber));
        this.currentBeatNumber = (this.currentBeatNumber + 1) % 4;
        this.nextBeatTime += secondsPerBeat;
      }
    };

    scheduleClick();
    this.metronomeTimer = window.setInterval(scheduleClick, 25);
  }

  private stopMetronomeScheduler() {
    if (this.metronomeTimer) {
      clearInterval(this.metronomeTimer);
      this.metronomeTimer = null;
    }
  }

  public playMetronomeClick(time: number, isDownbeat: boolean) {
    try {
      const ctx = audioEngine.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = isDownbeat ? "triangle" : "sine";
      osc.frequency.setValueAtTime(isDownbeat ? 1400 : 900, time);

      gain.gain.setValueAtTime(isDownbeat ? 0.35 : 0.2, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + (isDownbeat ? 0.08 : 0.04));

      osc.connect(gain);
      gain.connect(audioEngine.getMasterGain());

      osc.start(time);
      osc.stop(time + 0.08);
    } catch (_) {}
  }
}

export const transport = new TransportClock();
