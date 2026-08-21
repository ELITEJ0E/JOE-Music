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
} from "lucide-react";
import { audioEngine } from "../audio/audioContext";
import { midiManager, MidiDevice } from "../audio/midiManager";
import { guitarSynth } from "../audio/guitarSynth";

interface DeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeviceSettingsModal: React.FC<DeviceSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"hardware" | "audio" | "midi">("hardware");
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>(audioEngine.getInputDeviceId());
  const [selectedOutputId, setSelectedOutputId] = useState<string>(audioEngine.getOutputDeviceId());
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [sampleRate, setSampleRate] = useState<number>(48000);
  const [latencyMs, setLatencyMs] = useState<number>(4.2);
  const [inputDb, setInputDb] = useState<number>(-100);
  const [isPlayingTestTone, setIsPlayingTestTone] = useState<boolean>(false);
  const [isMonitoring, setIsMonitoring] = useState<boolean>(audioEngine.getIsMonitoring());
  const [freeboostEnabled, setFreeboostEnabled] = useState<boolean>(true);
  const [freeboostEffect, setFreeboostEffect] = useState<"Reverb" | "Delay" | "Chorus" | "Overdrive">("Reverb");

  const stopToneRef = useRef<(() => void) | null>(null);
  const meterAnimRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (isOpen) {
      audioEngine.getAudioDevices().then(({ inputs, outputs }) => {
        setAudioInputDevices(inputs);
        setAudioOutputDevices(outputs);
      });

      const ctx = audioEngine.getContext();
      setSampleRate(ctx.sampleRate);
      const baseLat = (ctx as any).baseLatency || 0.003;
      const outLat = (ctx as any).outputLatency || 0.002;
      setLatencyMs(Number(((baseLat + outLat) * 1000 + 1.2).toFixed(1)));
      setMidiDevices(midiManager.getDevices());
      setIsMonitoring(audioEngine.getIsMonitoring());

      const pollMeter = () => {
        const lvl = audioEngine.getInputLevel();
        setInputDb(lvl.db);
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

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
    >
      <div className="frosted-card rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl space-y-4 p-5 sm:p-6 border border-white/10 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4 shrink-0">
          <div className="flex items-center space-x-2.5">
            <Guitar className="w-5 h-5 text-[#a3ff12]" />
            <div>
              <h3 className="font-mono font-bold text-sm sm:text-base text-white tracking-tight flex items-center gap-2">
                LAVA ME PLAY <span className="text-[#a3ff12]">& AUDIO DEVICES</span>
              </h3>
              <p className="text-[10px] sm:text-xs text-zinc-400 font-mono">
                Smart guitar touchscreen link, FreeBoost™ DSP & low-latency USB streaming
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-block text-[10px] font-mono text-zinc-500 bg-white/5 px-2 py-1 rounded-md border border-white/5">
              Esc to close
            </span>
            <button
              onClick={onClose}
              className="text-zinc-300 hover:text-white font-mono text-xs px-3.5 py-1.5 bg-white/5 rounded-xl border border-white/5 hover:border-[#a3ff12]/40 transition-all cursor-pointer"
            >
              DONE
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-2 shrink-0 border-b border-white/5 pb-2.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab("hardware")}
            className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer shrink-0 ${
              activeTab === "hardware"
                ? "bg-[#a3ff12] text-black shadow-[0_0_12px_rgba(163,255,18,0.4)]"
                : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            Lava Me Play Smart Link
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
        </div>

        {/* Tab Content */}
        <div className="overflow-y-auto space-y-4 pr-1">
          {/* LAVA ME PLAY HARDWARE TAB WITH IMAGE */}
          {activeTab === "hardware" && (
            <div className="space-y-4">
              <div className="relative rounded-2xl bg-gradient-to-br from-zinc-900 via-[#12151a] to-[#0d0f12] border border-white/10 p-4 sm:p-6 overflow-hidden shadow-xl">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  {/* Visual Guitar Showcase using user's uploaded/generated LAVA ME PLAY Pink image */}
                  <div className="relative w-44 sm:w-56 h-64 sm:h-72 rounded-2xl bg-[#08090b] border border-white/10 flex items-center justify-center p-3 shadow-2xl shrink-0 overflow-hidden group">
                    <img
                      src="/LAVA_ME_PLAY_Pink_1.webp"
                      alt="LAVA ME PLAY Smart Acoustic Guitar"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        // Fallback to jpg if needed
                        (e.target as HTMLImageElement).src = "/lava_me_play.jpg";
                      }}
                    />
                    
                    {/* Floating Smart Badges */}
                    <div className="absolute top-2.5 left-2.5 bg-black/80 backdrop-blur-md border border-[#a3ff12]/40 rounded-full px-2 py-0.5 flex items-center space-x-1.5 shadow-md">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#a3ff12] animate-pulse" />
                      <span className="text-[9px] font-mono font-bold text-[#a3ff12]">HILAVA 2.0</span>
                    </div>

                    <div className="absolute bottom-2.5 right-2.5 bg-black/80 backdrop-blur-md border border-white/15 rounded-lg px-2 py-0.5 text-[9px] font-mono text-zinc-300">
                      3.5" Touchscreen
                    </div>
                  </div>

                  {/* Hardware Status & Controls */}
                  <div className="flex-1 space-y-3 w-full">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div>
                        <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
                          LAVA ME PLAY (Pastel Blush Pink)
                          <span className="text-[9px] font-mono text-[#a3ff12] bg-[#a3ff12]/10 px-1.5 py-0.5 rounded border border-[#a3ff12]/30 font-bold">
                            LINKED
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
                          High-Pressure Laminate • 4-MASS Acoustic Structure
                        </div>
                      </div>
                      <div className="flex items-center text-xs font-mono text-emerald-400">
                        <Wifi className="w-3.5 h-3.5 mr-1" />
                        <span>Connected</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                        <div className="text-[9px] text-zinc-400 uppercase">PREAMP & ACTUATOR</div>
                        <div className="font-bold text-[#a3ff12] mt-0.5">FreeBoost™ 3.0 DSP</div>
                      </div>
                      <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                        <div className="text-[9px] text-zinc-400 uppercase">USB AUDIO STREAM</div>
                        <div className="font-bold text-white mt-0.5">24-Bit / 48 kHz High-Z</div>
                      </div>
                      <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                        <div className="text-[9px] text-zinc-400 uppercase">INTERNAL EFFECTS</div>
                        <div className="font-bold text-white mt-0.5">Reverb, Delay, Chorus, OD</div>
                      </div>
                      <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                        <div className="text-[9px] text-zinc-400 uppercase">ROUNDTRIP LATENCY</div>
                        <div className="font-bold text-[#a3ff12] mt-0.5">~{latencyMs} ms</div>
                      </div>
                    </div>

                    {/* FreeBoost quick toggle & interactive control */}
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-300 font-bold flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-[#a3ff12]" />
                          FreeBoost™ Acoustic Pickup Actuator
                        </span>
                        <button
                          onClick={() => setFreeboostEnabled(!freeboostEnabled)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer ${
                            freeboostEnabled
                              ? "bg-[#a3ff12] text-black shadow-[0_0_8px_rgba(163,255,18,0.3)]"
                              : "bg-white/10 text-zinc-400 hover:text-white"
                          }`}
                        >
                          {freeboostEnabled ? "ACTIVE (AMPLIFIED BODY)" : "BYPASS"}
                        </button>
                      </div>

                      {/* Effect selector on touchscreen */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {(["Reverb", "Delay", "Chorus", "Overdrive"] as const).map((fx) => (
                          <button
                            key={fx}
                            onClick={() => setFreeboostEffect(fx)}
                            className={`flex-1 py-1 rounded-lg text-[10px] font-mono transition-all cursor-pointer text-center ${
                              freeboostEffect === fx
                                ? "bg-white/15 text-[#a3ff12] border border-[#a3ff12]/40 font-bold"
                                : "bg-white/5 text-zinc-400 hover:text-zinc-200 border border-transparent"
                            }`}
                          >
                            {fx}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AUDIO I/O & LATENCY TAB */}
          {activeTab === "audio" && (
            <div className="space-y-4">
              {/* Input Device Selector */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-400 flex items-center justify-between">
                  <span className="flex items-center">
                    <Mic className="w-3.5 h-3.5 text-[#a3ff12] mr-1.5" />
                    Audio Input Hardware Source
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {audioInputDevices.length} Detected
                  </span>
                </label>
                <select
                  value={selectedInputId}
                  onChange={(e) => handleInputChange(e.target.value)}
                  className="w-full bg-[#0a0c0e]/80 text-xs font-mono text-white border border-white/10 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#a3ff12]/50 cursor-pointer"
                >
                  {audioInputDevices.length > 0 ? (
                    audioInputDevices.map((dev) => (
                      <option key={dev.deviceId} value={dev.deviceId} className="bg-[#12151a]">
                        {dev.label || `Audio Input (${dev.deviceId.slice(0, 8)}...)`}
                      </option>
                    ))
                  ) : (
                    <option value="default" className="bg-[#12151a]">Default System Microphone / Lava USB Interface</option>
                  )}
                </select>
              </div>

              {/* Output Device Selector */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-400 flex items-center justify-between">
                  <span className="flex items-center">
                    <Speaker className="w-3.5 h-3.5 text-[#a3ff12] mr-1.5" />
                    Audio Output Destination
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {audioOutputDevices.length} Detected
                  </span>
                </label>
                <select
                  value={selectedOutputId}
                  onChange={(e) => handleOutputChange(e.target.value)}
                  className="w-full bg-[#0a0c0e]/80 text-xs font-mono text-white border border-white/10 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#a3ff12]/50 cursor-pointer"
                >
                  {audioOutputDevices.length > 0 ? (
                    audioOutputDevices.map((dev) => (
                      <option key={dev.deviceId} value={dev.deviceId} className="bg-[#12151a]">
                        {dev.label || `Audio Output (${dev.deviceId.slice(0, 8)}...)`}
                      </option>
                    ))
                  ) : (
                    <option value="default" className="bg-[#12151a]">Default System Audio Output / Headphones</option>
                  )}
                </select>
              </div>

              {/* Real-time Hardware Telemetry */}
              <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                <div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">SAMPLE RATE</div>
                  <div className="font-mono font-bold text-sm text-[#a3ff12] mt-0.5">
                    {sampleRate} Hz
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">EST. LATENCY</div>
                  <div className="font-mono font-bold text-sm text-[#a3ff12] mt-0.5">
                    ~{latencyMs} ms
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">INPUT LEVEL</div>
                  <div className="font-mono font-bold text-sm text-white mt-0.5">
                    {inputDb > -90 ? `${inputDb.toFixed(1)} dB` : "-- dB"}
                  </div>
                </div>
              </div>

              {/* Audio Test & Monitoring Row */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleToggleTestTone}
                  className={`p-3 rounded-xl border flex items-center justify-center space-x-2 text-xs font-mono transition-all cursor-pointer ${
                    isPlayingTestTone
                      ? "bg-[#a3ff12] text-black border-[#a3ff12] font-bold"
                      : "bg-white/5 hover:bg-white/10 text-white border-white/10"
                  }`}
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{isPlayingTestTone ? "Playing 440Hz Test Tone..." : "Play 440Hz Test Tone"}</span>
                </button>

                <button
                  onClick={handleToggleMonitoring}
                  className={`p-3 rounded-xl border flex items-center justify-center space-x-2 text-xs font-mono transition-all cursor-pointer ${
                    isMonitoring
                      ? "bg-[#a3ff12]/20 text-[#a3ff12] border-[#a3ff12] font-bold shadow-[0_0_15px_rgba(163,255,18,0.25)]"
                      : "bg-white/5 hover:bg-white/10 text-zinc-300 border-white/10"
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono text-zinc-400 flex items-center">
                  <Radio className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
                  Connected MIDI Controllers & Expression Pedals
                </label>
                <span className="text-[10px] font-mono text-sky-400 font-bold">
                  {midiDevices.length} Connected
                </span>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1.5">
                {midiDevices.length > 0 ? (
                  midiDevices.map((dev) => (
                    <div
                      key={dev.id}
                      className="flex items-center justify-between text-xs font-mono text-zinc-300"
                    >
                      <span>{dev.name}</span>
                      <span className="text-[10px] text-[#a3ff12] font-bold">ONLINE</span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs font-mono text-zinc-500 py-1">
                    No external MIDI hardware detected. Plug in any USB/Bluetooth MIDI pedal or keyboard to map stomp buttons.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between text-xs font-mono text-zinc-300 shrink-0">
          <div>
            <div className="font-bold text-white flex items-center">
              <Zap className="w-3.5 h-3.5 text-[#a3ff12] mr-1.5" />
              LAVA & High-Z Studio DSP Integration
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              Zero-latency audio routing & tone processing active
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
