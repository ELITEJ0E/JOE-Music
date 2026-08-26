import React, { useState, useEffect, useRef } from "react";
import {
  Sliders,
  Radio,
  Mic,
  Zap,
  Guitar,
  Wifi,
  BatteryCharging,
  CheckCircle2,
  RefreshCw,
  Speaker,
  Volume2,
  Activity,
  Headphones,
  Info,
  X,
  AlertTriangle
} from "lucide-react";
import { audioEngine } from "../audio/audioContext";
import { midiManager, MidiDevice } from "../audio/midiManager";
import { guitarSynth } from "../audio/guitarSynth";
import { transport } from "../audio/transport";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface DeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeviceSettingsModal: React.FC<DeviceSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"hardware" | "audio" | "midi" | "diagnostics">("hardware");
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>(audioEngine.getInputDeviceId());
  const [selectedOutputId, setSelectedOutputId] = useState<string>(audioEngine.getOutputDeviceId());
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [sampleRate, setSampleRate] = useState<number>(48000);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [inputDb, setInputDb] = useState<number>(-100);
  const [isPlayingTestTone, setIsPlayingTestTone] = useState<boolean>(false);
  const [isMonitoring, setIsMonitoring] = useState<boolean>(audioEngine.getIsMonitoring());
  const [isInputActive, setIsInputActive] = useState<boolean>(false);

  const stopToneRef = useRef<(() => void) | null>(null);
  const meterAnimRef = useRef<number | null>(null);

  const [diagData, setDiagData] = useState<any>(null);

  useEffect(() => {
    if (activeTab === "diagnostics") {
      const interval = setInterval(() => {
        const ctx = audioEngine.getContext();
        setDiagData({
          state: ctx.state,
          sampleRate: ctx.sampleRate,
          consumers: audioEngine.getActiveConsumers(),
          trackCount: audioEngine.getMicStreamTracksCount(),
          monitoring: audioEngine.getIsMonitoring(),
          recording: audioEngine.getInputState() === "RECORDING",
          nodeCount: 9, // Blocks mapped
          bpm: transport.getState().bpm
        });
      }, 500);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Handle ESC key press to close dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Handle browser popstate / back button navigation
  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState({ modal: "lava-me-device-dialog" }, "");

    const handlePopState = () => {
      onClose();
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (window.history.state?.modal === "lava-me-device-dialog") {
        window.history.back();
      }
    };
  }, [isOpen, onClose]);

  const pollDevices = async () => {
    const { inputs, outputs } = await audioEngine.getAudioDevices();
    setAudioInputDevices(inputs);
    setAudioOutputDevices(outputs);
    setSelectedInputId(audioEngine.getInputDeviceId());
    setSelectedOutputId(audioEngine.getOutputDeviceId());
  };

  useEffect(() => {
    if (isOpen) {
      pollDevices();

      const ctx = audioEngine.getContext();
      setSampleRate(ctx.sampleRate);
      const baseLat = (ctx as any).baseLatency || 0.003;
      const outLat = (ctx as any).outputLatency || 0.002;
      setLatencyMs(Number(((baseLat + outLat) * 1000 + 1.2).toFixed(1)));
      setMidiDevices(midiManager.getDevices());
      setIsMonitoring(audioEngine.getIsMonitoring());
      setIsInputActive(audioEngine.getIsMicActive());

      const pollMeter = () => {
        const lvl = audioEngine.getInputLevel();
        setInputDb(lvl.db);
        setIsInputActive(audioEngine.getIsMicActive());
        meterAnimRef.current = requestAnimationFrame(pollMeter);
      };
      meterAnimRef.current = requestAnimationFrame(pollMeter);
    } else {
      if (meterAnimRef.current) cancelAnimationFrame(meterAnimRef.current);
      if (stopToneRef.current) {
        stopToneRef.current();
        setIsPlayingTestTone(false);
      }
    }

    return () => {
      if (meterAnimRef.current) cancelAnimationFrame(meterAnimRef.current);
      if (stopToneRef.current) stopToneRef.current();
    };
  }, [isOpen]);

  const handleInputChange = async (deviceId: string) => {
    setSelectedInputId(deviceId);
    await audioEngine.setInputDevice(deviceId);
  };

  const handleOutputChange = async (deviceId: string) => {
    setSelectedOutputId(deviceId);
    await audioEngine.setOutputDevice(deviceId);
  };

  const handleToggleTestTone = () => {
    if (isPlayingTestTone) {
      if (stopToneRef.current) stopToneRef.current();
      setIsPlayingTestTone(false);
    } else {
      const stopFn = guitarSynth.playReferenceTone(440, 4);
      stopToneRef.current = stopFn;
      setIsPlayingTestTone(true);
      setTimeout(() => setIsPlayingTestTone(false), 4000);
    }
  };

  const handleToggleMonitoring = async () => {
    const nextState = await audioEngine.toggleMonitoring();
    setIsMonitoring(nextState);
  };

  const handleToggleLiveInput = async () => {
    if (audioEngine.getIsMicActive()) {
      audioEngine.releaseInput("device-modal");
      setIsInputActive(false);
    } else {
      try {
        await audioEngine.acquireInput("device-modal");
        setIsInputActive(true);
      } catch (err) {
        console.warn("Input acquire failed:", err);
      }
    }
  };

  if (!isOpen) return null;

  const currentInputDev = audioInputDevices.find(d => d.deviceId === selectedInputId);
  const isLavaDetected = currentInputDev?.label.toLowerCase().includes("lava") || 
    audioInputDevices.some(d => d.label.toLowerCase().includes("lava"));

  // 5 Connection Statuses: Disconnected, Device detected, Audio input available, Receiving guitar signal, Unsupported
  const isBrowserSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
  const isSignalReceived = isInputActive && inputDb > -52;

  let connectionStatus: "UNSUPPORTED" | "DISCONNECTED" | "DEVICE_DETECTED" | "AUDIO_INPUT_AVAILABLE" | "RECEIVING_GUITAR_SIGNAL";
  let statusBadgeColor = "bg-red-500";
  let statusLabel = "Disconnected";

  if (!isBrowserSupported) {
    connectionStatus = "UNSUPPORTED";
    statusBadgeColor = "bg-zinc-600";
    statusLabel = "Unsupported";
  } else if (audioInputDevices.length === 0) {
    connectionStatus = "DISCONNECTED";
    statusBadgeColor = "bg-red-500";
    statusLabel = "Disconnected";
  } else if (isSignalReceived) {
    connectionStatus = "RECEIVING_GUITAR_SIGNAL";
    statusBadgeColor = "bg-[#a3ff12] animate-pulse";
    statusLabel = isLavaDetected ? "LAVA ME PLAY • Receiving Signal" : "Audio Input • Receiving Signal";
  } else if (isInputActive) {
    connectionStatus = "AUDIO_INPUT_AVAILABLE";
    statusBadgeColor = "bg-sky-400";
    statusLabel = isLavaDetected ? "LAVA ME PLAY • Input Active" : "Audio Input Active";
  } else {
    connectionStatus = "DEVICE_DETECTED";
    statusBadgeColor = isLavaDetected ? "bg-amber-400" : "bg-zinc-400";
    statusLabel = isLavaDetected ? "LAVA ME PLAY Detected (Standby)" : "Device Detected (Standby)";
  }

  const meterPercent = isInputActive ? Math.max(0, Math.min(100, ((inputDb + 65) / 65) * 100)) : 0;
  const activeDeviceTitle = isLavaDetected
    ? "LAVA ME PLAY (USB Audio)"
    : currentInputDev
    ? (currentInputDev.label || "USB Audio Input")
    : "No Audio Input Connected";

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center sm:p-5 animate-in fade-in duration-200"
    >
      <div className="bg-[#0b0e14] w-full sm:max-w-3xl overflow-hidden sm:rounded-3xl shadow-2xl flex flex-col h-[95dvh] sm:h-auto sm:max-h-[92dvh] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-b-3xl">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur-lg border-b border-white/10 px-5 pt-6 pb-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
              <Guitar className="w-5 h-5 text-[#a3ff12]" />
            </div>
            <div>
              <h3 className="font-mono font-bold text-sm sm:text-base text-white tracking-tight flex items-center gap-2">
                AUDIO <span className="text-[#a3ff12]">& HARDWARE</span>
              </h3>
              <p className="text-[10px] sm:text-xs text-zinc-400 font-mono hidden sm:block">
                Manage audio interfaces, inputs, and real-time DSP
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-block text-[10px] font-mono text-zinc-500 bg-white/5 px-2 py-1 rounded-md border border-white/5">
              Esc to close
            </span>
            <button
              onClick={onClose}
              className="p-2 sm:px-4 sm:py-2 text-zinc-300 hover:text-white bg-white/5 rounded-full sm:rounded-xl border border-white/5 hover:border-white/20 transition-all cursor-pointer"
            >
              <span className="hidden sm:inline font-mono text-xs font-bold">DONE</span>
              <X className="w-5 h-5 sm:hidden" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-2 shrink-0 border-b border-white/5 px-5 py-3 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("hardware")}
            className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer shrink-0 ${
              activeTab === "hardware"
                ? "bg-[#a3ff12] text-black shadow-[0_0_12px_rgba(163,255,18,0.4)]"
                : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            Smart Devices
          </button>
          <button
            onClick={() => setActiveTab("audio")}
            className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer shrink-0 ${
              activeTab === "audio"
                ? "bg-[#a3ff12] text-black shadow-[0_0_12px_rgba(163,255,18,0.4)]"
                : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            Audio I/O & Latency
          </button>
          <button
            onClick={() => setActiveTab("midi")}
            className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer shrink-0 ${
              activeTab === "midi"
                ? "bg-[#a3ff12] text-black shadow-[0_0_12px_rgba(163,255,18,0.4)]"
                : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            MIDI Controllers
          </button>
          <button
            onClick={() => setActiveTab("diagnostics")}
            className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer shrink-0 ${
              activeTab === "diagnostics"
                ? "bg-[#a3ff12] text-black shadow-[0_0_12px_rgba(163,255,18,0.4)]"
                : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            Diagnostics (Dev)
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-5 pb-8 space-y-6">
          
          {/* LAVA ME PLAY / HARDWARE TAB */}
          {activeTab === "hardware" && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-gradient-to-br from-zinc-900 to-[#0d0f12] border border-white/10 p-5 overflow-hidden flex flex-col md:flex-row items-center gap-6">
                
                {/* Visual Guitar Showcase */}
                <div className="relative w-full max-w-[220px] aspect-[3/4] rounded-2xl bg-[#050608] border border-white/10 flex items-center justify-center p-3 shrink-0 overflow-hidden group mx-auto md:mx-0">
                  <img
                    src="/LAVA_ME_PLAY_Pink_1.webp"
                    alt="LAVA ME PLAY"
                    referrerPolicy="no-referrer"
                    className={`w-full h-full object-contain transition-transform duration-500 ${isLavaDetected ? "opacity-100 scale-105" : "opacity-40 grayscale"}`}
                    onError={(e) => { (e.target as HTMLImageElement).src = "/lava_me_play.jpg"; }}
                  />
                  {!isLavaDetected && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
                      <Info className="w-6 h-6 text-zinc-400 mb-2" />
                      <span className="text-[10px] font-mono text-zinc-400 font-bold">NOT DETECTED</span>
                    </div>
                  )}
                </div>

                {/* Hardware Real Status & Controls */}
                <div className="flex-1 space-y-4 w-full">
                  <div className="border-b border-white/5 pb-3">
                    <h4 className="text-sm font-mono font-bold text-white mb-1">
                      {activeDeviceTitle}
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${statusBadgeColor}`} />
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                        {statusLabel}
                      </span>
                    </div>
                  </div>

                  {/* Live Input Signal Meter */}
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-400 font-bold flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-[#a3ff12]" />
                        LIVE GUITAR INPUT METER
                      </span>
                      <span className="font-bold text-white">
                        {isInputActive ? `${inputDb.toFixed(1)} dBFS` : "OFFLINE"}
                      </span>
                    </div>

                    {/* Meter bar */}
                    <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden p-0.5 border border-white/10 flex">
                      <div
                        className={`h-full rounded-full transition-all duration-75 ${
                          inputDb > -6
                            ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]"
                            : inputDb > -18
                            ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]"
                            : "bg-gradient-to-r from-green-600 to-[#a3ff12] shadow-[0_0_10px_rgba(163,255,18,0.6)]"
                        }`}
                        style={{ width: `${meterPercent}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[9px] font-mono text-zinc-500 px-0.5">
                      <span>-60 dB</span>
                      <span>-36 dB</span>
                      <span>-18 dB</span>
                      <span>-6 dB</span>
                      <span className="text-red-400 font-bold">0 dB</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                      <div className="text-[9px] text-zinc-400 uppercase mb-1">INPUT STATUS</div>
                      <div className={`font-bold ${isInputActive ? "text-[#a3ff12]" : "text-zinc-500"}`}>
                        {isInputActive ? (isSignalReceived ? "RECEIVING SIGNAL" : "INPUT READY") : "STANDBY"}
                      </div>
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                      <div className="text-[9px] text-zinc-400 uppercase mb-1">PROPRIETARY CONTROLS</div>
                      <div className="font-bold text-zinc-500 flex items-center">
                        <AlertTriangle className="w-3 h-3 mr-1 text-amber-500/80" />
                        UNSUPPORTED
                      </div>
                    </div>
                  </div>

                  {/* Browser limitations warning */}
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-3 text-amber-500/90">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="text-[10px] font-mono leading-relaxed">
                      Web Audio API cannot control proprietary HILAVA FreeBoost™ DSP parameters directly. Audio is received post-DSP via standard USB Class Compliant drivers. Ensure your guitar is connected via USB-C and set to USB Audio output mode.
                    </p>
                  </div>

                  {/* Live input test toggle */}
                  <button
                    onClick={handleToggleLiveInput}
                    className={`w-full py-3 rounded-xl border font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      isInputActive
                        ? "bg-[#a3ff12]/20 text-[#a3ff12] border-[#a3ff12] shadow-[0_0_15px_rgba(163,255,18,0.3)]"
                        : "bg-white/5 hover:bg-white/10 text-white border-white/10"
                    }`}
                  >
                    <RefreshCw className={`w-4 h-4 ${isInputActive ? "animate-spin text-[#a3ff12]" : "text-zinc-400"}`} />
                    {isInputActive ? "DISCONNECT LIVE INPUT STREAM" : "ACTIVATE LIVE GUITAR INPUT STREAM"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* AUDIO I/O & LATENCY TAB */}
          {activeTab === "audio" && (
            <div className="space-y-6">
              {/* Device Selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-mono text-zinc-400 flex items-center justify-between">
                    <span className="flex items-center">
                      <Mic className="w-3.5 h-3.5 text-[#a3ff12] mr-1.5" />
                      Input Hardware Source
                    </span>
                  </label>
                  <Select
                    value={selectedInputId || "default"}
                    onValueChange={(val) => handleInputChange(val)}
                  >
                    <SelectTrigger className="h-11 text-xs font-mono px-3 bg-[#12151a] border-white/10 rounded-xl focus:border-[#a3ff12]/50">
                      <SelectValue placeholder="Input Device" />
                    </SelectTrigger>
                    <SelectContent>
                      {audioInputDevices.length > 0 ? (
                        audioInputDevices.map((dev) => (
                          <SelectItem key={dev.deviceId} value={dev.deviceId}>
                            {dev.label || `Audio Input (${dev.deviceId.slice(0, 8)}...)`}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="default">Default System Microphone</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-mono text-zinc-400 flex items-center justify-between">
                    <span className="flex items-center">
                      <Speaker className="w-3.5 h-3.5 text-[#a3ff12] mr-1.5" />
                      Output Destination
                    </span>
                  </label>
                  <Select
                    value={selectedOutputId || "default"}
                    onValueChange={(val) => handleOutputChange(val)}
                  >
                    <SelectTrigger className="h-11 text-xs font-mono px-3 bg-[#12151a] border-white/10 rounded-xl focus:border-[#a3ff12]/50">
                      <SelectValue placeholder="Output Device" />
                    </SelectTrigger>
                    <SelectContent>
                      {audioOutputDevices.length > 0 ? (
                        audioOutputDevices.map((dev) => (
                          <SelectItem key={dev.deviceId} value={dev.deviceId}>
                            {dev.label || `Audio Output (${dev.deviceId.slice(0, 8)}...)`}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="default">Default System Audio Output</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Real-time Hardware Telemetry */}
              <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                <div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">SAMPLE RATE</div>
                  <div className="font-mono font-bold text-sm text-[#a3ff12] mt-1">
                    {sampleRate} Hz
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">LATENCY</div>
                  <div className="font-mono font-bold text-sm text-[#a3ff12] mt-1">
                    ~{latencyMs} ms
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">LEVEL</div>
                  <div className="font-mono font-bold text-sm text-white mt-1">
                    {inputDb > -90 ? `${inputDb.toFixed(1)} dB` : "-- dB"}
                  </div>
                </div>
              </div>

              {/* Audio Test & Monitoring Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleToggleTestTone}
                  className={`p-3 rounded-xl border flex items-center justify-center space-x-2 text-xs font-mono transition-all cursor-pointer ${
                    isPlayingTestTone
                      ? "bg-[#a3ff12] text-black border-[#a3ff12] font-bold"
                      : "bg-[#12151a] hover:bg-white/10 text-white border-white/10"
                  }`}
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{isPlayingTestTone ? "Playing 440Hz..." : "Play 440Hz Tone"}</span>
                </button>
                <button
                  onClick={handleToggleMonitoring}
                  className={`p-3 rounded-xl border flex items-center justify-center space-x-2 text-xs font-mono transition-all cursor-pointer ${
                    isMonitoring
                      ? "bg-[#a3ff12]/20 text-[#a3ff12] border-[#a3ff12] font-bold shadow-[0_0_15px_rgba(163,255,18,0.25)]"
                      : "bg-[#12151a] hover:bg-white/10 text-zinc-300 border-white/10"
                  }`}
                >
                  <Headphones className="w-4 h-4" />
                  <span>{isMonitoring ? "Monitoring: ON" : "Monitoring: OFF"}</span>
                </button>
              </div>
            </div>
          )}

          {/* MIDI TAB */}
          {activeTab === "midi" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono text-zinc-400 flex items-center">
                  <Radio className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
                  Connected MIDI Controllers
                </label>
                <span className="text-[10px] font-mono text-sky-400 font-bold bg-sky-400/10 px-2 py-0.5 rounded">
                  {midiDevices.length} Connected
                </span>
              </div>
              
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
                {midiDevices.length > 0 ? (
                  midiDevices.map((dev) => (
                    <div
                      key={dev.id}
                      className="flex items-center justify-between text-xs font-mono text-zinc-300 bg-black/20 p-2 rounded-lg"
                    >
                      <span className="truncate pr-4">{dev.name}</span>
                      <span className="text-[10px] text-[#a3ff12] font-bold shrink-0">ONLINE</span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs font-mono text-zinc-500 py-4 text-center">
                    No external MIDI hardware detected.<br/>Plug in a USB/Bluetooth MIDI pedal or keyboard to map stomp buttons.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* DIAGNOSTICS TAB */}
          {activeTab === "diagnostics" && diagData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono text-zinc-400 flex items-center">
                  <Activity className="w-3.5 h-3.5 text-[#a3ff12] mr-1.5" />
                  Audio Engine Diagnostics
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="text-[9px] text-zinc-400 uppercase mb-1">AUDIO CONTEXT</div>
                  <div className={`font-bold ${diagData.state === "running" ? "text-[#a3ff12]" : "text-amber-500"}`}>
                    {diagData.state.toUpperCase()}
                  </div>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="text-[9px] text-zinc-400 uppercase mb-1">SAMPLE RATE</div>
                  <div className="font-bold text-white">{diagData.sampleRate} Hz</div>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="text-[9px] text-zinc-400 uppercase mb-1">INPUT CONSUMERS</div>
                  <div className="font-bold text-white">
                    {diagData.consumers.length > 0 ? diagData.consumers.join(", ") : "NONE"}
                  </div>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="text-[9px] text-zinc-400 uppercase mb-1">MEDIA TRACKS</div>
                  <div className="font-bold text-white">{diagData.trackCount} Active</div>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="text-[9px] text-zinc-400 uppercase mb-1">MONITORING</div>
                  <div className={`font-bold ${diagData.monitoring ? "text-[#a3ff12]" : "text-zinc-600"}`}>
                    {diagData.monitoring ? "ENABLED" : "DISABLED"}
                  </div>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="text-[9px] text-zinc-400 uppercase mb-1">RECORDING FLAG</div>
                  <div className={`font-bold ${diagData.recording ? "text-red-500" : "text-zinc-600"}`}>
                    {diagData.recording ? "ACTIVE" : "INACTIVE"}
                  </div>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="text-[9px] text-zinc-400 uppercase mb-1">DSP BLOCKS</div>
                  <div className="font-bold text-white">{diagData.nodeCount} Configured</div>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="text-[9px] text-zinc-400 uppercase mb-1">TRANSPORT BPM</div>
                  <div className="font-bold text-white">{diagData.bpm} BPM</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
