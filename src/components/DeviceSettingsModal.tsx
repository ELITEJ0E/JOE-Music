import React, { useState, useEffect } from "react";
import { Sliders, Radio, Mic, Zap, Guitar, Wifi, BatteryCharging, CheckCircle2, RefreshCw } from "lucide-react";
import { audioEngine } from "../audio/audioContext";
import { midiManager, MidiDevice } from "../audio/midiManager";

interface DeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeviceSettingsModal: React.FC<DeviceSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"hardware" | "audio" | "midi">("hardware");
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [sampleRate, setSampleRate] = useState<number>(48000);
  const [latencyMs, setLatencyMs] = useState<number>(4.2);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isTestingStream, setIsTestingStream] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices().then((devices) => {
          const inputs = devices.filter((d) => d.kind === "audioinput");
          setAudioDevices(inputs);
          if (inputs.length > 0) setSelectedDeviceId(inputs[0].deviceId);
        });
      }

      setSampleRate(audioEngine.getContext().sampleRate);
      setMidiDevices(midiManager.getDevices());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="frosted-card rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-5 p-6 border border-white/10 max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4 shrink-0">
          <div className="flex items-center space-x-2.5">
            <Guitar className="w-5 h-5 text-[#a3ff12]" />
            <h3 className="font-mono font-bold text-sm text-white tracking-tight">
              JOE STUDIO & LAVA ME PLAY HARDWARE LINK
            </h3>
          </div>

          <button
            onClick={onClose}
            className="text-zinc-300 hover:text-white font-mono text-xs px-3.5 py-1.5 bg-white/5 rounded-xl border border-white/5 hover:border-[#a3ff12]/40 transition-all cursor-pointer"
          >
            DONE
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-2 shrink-0 border-b border-white/5 pb-3">
          <button
            onClick={() => setActiveTab("hardware")}
            className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all ${
              activeTab === "hardware"
                ? "bg-[#a3ff12] text-black shadow-[0_0_12px_rgba(163,255,18,0.4)]"
                : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            Lava Me Play Hardware
          </button>
          <button
            onClick={() => setActiveTab("audio")}
            className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all ${
              activeTab === "audio"
                ? "bg-[#a3ff12] text-black shadow-[0_0_12px_rgba(163,255,18,0.4)]"
                : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            Audio I/O & DSP
          </button>
          <button
            onClick={() => setActiveTab("midi")}
            className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all ${
              activeTab === "midi"
                ? "bg-[#a3ff12] text-black shadow-[0_0_12px_rgba(163,255,18,0.4)]"
                : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            MIDI Controllers
          </button>
        </div>

        {/* Tab Content */}
        <div className="overflow-y-auto space-y-5 pr-1">
          {activeTab === "hardware" && (
            <div className="space-y-4">
              {/* Visual Hardware Preview Card mirroring user photo */}
              <div className="relative rounded-2xl bg-gradient-to-br from-zinc-900 via-[#12151a] to-black border border-white/10 p-5 overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#a3ff12]/10 rounded-full blur-3xl pointer-events-none" />
                
                <div className="flex flex-col md:flex-row items-center gap-6">
                  {/* Visual Guitar Mockup representing the Lava Me Play photo */}
                  <div className="relative w-48 h-56 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-3 shadow-inner group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent rounded-2xl" />
                    
                    {/* Guitar Body Silhouette & Touchscreen Mockup */}
                    <div className="relative w-full h-full flex flex-col items-center justify-between py-2">
                      <div className="w-1.5 h-16 bg-gradient-to-b from-amber-700 to-amber-900 rounded-full" />
                      
                      {/* Embedded Touchscreen Representation matching image */}
                      <div className="w-32 h-20 bg-black/90 rounded-xl border border-white/20 p-2 shadow-lg flex flex-col justify-between relative overflow-hidden">
                        <div className="absolute inset-0 bg-[#a3ff12]/5 pointer-events-none" />
                        <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400">
                          <span className="text-[#a3ff12] font-bold">LAVA FREEBOOST</span>
                          <span className="flex items-center"><Wifi className="w-2.5 h-2.5 text-[#a3ff12] mr-0.5" /> 100%</span>
                        </div>
                        <div className="flex items-center justify-around py-1">
                          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-mono text-white">TUNER</div>
                          <div className="w-7 h-7 rounded-lg bg-[#a3ff12] text-black font-bold flex items-center justify-center text-[10px]">72</div>
                          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-mono text-white">FX</div>
                        </div>
                        <div className="text-[8px] font-mono text-zinc-500 text-center tracking-wider">
                          JOE STUDIO LINKED
                        </div>
                      </div>

                      <div className="w-8 h-4 rounded-full bg-white/10 border border-white/20" />
                    </div>
                  </div>

                  {/* Hardware Status Details */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-400">DEVICE MODEL</span>
                      <span className="text-xs font-mono font-bold text-white">Lava Me Play (Smart Acoustic)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-400">PREAMP & DSP</span>
                      <span className="text-xs font-mono font-bold text-[#a3ff12]">FreeBoost™ 3.0 Active</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-400">CONNECTION</span>
                      <span className="text-xs font-mono font-bold text-emerald-400 flex items-center">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                        Wireless 2.4GHz / USB Audio I/O
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-400">ROUNDTRIP LATENCY</span>
                      <span className="text-xs font-mono font-bold text-[#a3ff12]">{latencyMs} ms (Studio Grade)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-400">GUITAR BATTERY</span>
                      <span className="text-xs font-mono font-bold text-white flex items-center">
                        <BatteryCharging className="w-3.5 h-3.5 mr-1 text-[#a3ff12]" />
                        100% (Charging via USB-C)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hardware Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setIsTestingStream(true);
                    setTimeout(() => setIsTestingStream(false), 2000);
                  }}
                  className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center space-x-2 text-xs font-mono text-white transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 text-[#a3ff12] ${isTestingStream ? "animate-spin" : ""}`} />
                  <span>{isTestingStream ? "Calibrating Audio..." : "Test Audio Stream & Sync"}</span>
                </button>
                <button
                  onClick={() => alert("Lava Me Play Touchscreen Mirrored to JOE Studio Session!")}
                  className="p-3.5 rounded-xl bg-[#a3ff12]/10 hover:bg-[#a3ff12]/20 border border-[#a3ff12]/30 flex items-center justify-center space-x-2 text-xs font-mono text-[#a3ff12] font-bold transition-all cursor-pointer"
                >
                  <Zap className="w-4 h-4" />
                  <span>Mirror Touchscreen UI</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === "audio" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-400 flex items-center">
                  <Mic className="w-3.5 h-3.5 text-[#a3ff12] mr-1.5" />
                  Audio Input Hardware Source
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="w-full bg-[#0a0c0e]/80 text-xs font-mono text-white border border-white/10 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#a3ff12]/50"
                >
                  {audioDevices.length > 0 ? (
                    audioDevices.map((dev) => (
                      <option key={dev.deviceId} value={dev.deviceId}>
                        {dev.label || `Audio Input (${dev.deviceId.slice(0, 8)}...)`}
                      </option>
                    ))
                  ) : (
                    <option value="">Lava Me Play Built-in Audio Interface</option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                <div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">SAMPLE RATE</div>
                  <div className="font-mono font-bold text-sm text-[#a3ff12] mt-0.5">
                    {sampleRate} Hz (24-bit)
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">BUFFER LATENCY</div>
                  <div className="font-mono font-bold text-sm text-[#a3ff12] mt-0.5">
                    ~{latencyMs} ms
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "midi" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono text-zinc-400 flex items-center">
                  <Radio className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
                  Connected MIDI Controllers & Pedals
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
                    No external MIDI hardware detected. Plug in any USB/Bluetooth MIDI pedal or keyboard.
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
              JOE Studio Hardware Integration
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              Zero-latency audio routing & FreeBoost 3.0 effects sync enabled
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

