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
  const [activeTab, setActiveTab] = useState<"audio" | "hardware" | "midi">("audio");
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

  const stopToneRef = useRef<(() => void) | null>(null);
  const meterAnimRef = useRef<number | null>(null);

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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="frosted-card rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-5 p-6 border border-white/10 max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4 shrink-0">
          <div className="flex items-center space-x-2.5">
            <Guitar className="w-5 h-5 text-[#a3ff12]" />
            <h3 className="font-mono font-bold text-sm text-white tracking-tight">
              AUDIO DEVICES & HARDWARE WORKFLOW
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
            onClick={() => setActiveTab("audio")}
            className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
              activeTab === "audio"
                ? "bg-[#a3ff12] text-black shadow-[0_0_12px_rgba(163,255,18,0.4)]"
                : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            Audio I/O & Latency
          </button>
          <button
            onClick={() => setActiveTab("hardware")}
            className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
              activeTab === "hardware"
                ? "bg-[#a3ff12] text-black shadow-[0_0_12px_rgba(163,255,18,0.4)]"
                : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            Lava Me Play & USB
          </button>
          <button
            onClick={() => setActiveTab("midi")}
            className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
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
                    <option value="default" className="bg-[#12151a]">Default System Microphone / Interface</option>
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

          {activeTab === "hardware" && (
            <div className="space-y-4">
              <div className="relative rounded-2xl bg-gradient-to-br from-zinc-900 via-[#12151a] to-black border border-white/10 p-5 overflow-hidden shadow-xl">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  {/* Visual Guitar Mockup */}
                  <div className="relative w-48 h-56 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-3 shadow-inner">
                    <div className="relative w-full h-full flex flex-col items-center justify-between py-2">
                      <div className="w-1.5 h-16 bg-gradient-to-b from-amber-700 to-amber-900 rounded-full" />
                      
                      <div className="w-32 h-20 bg-black/90 rounded-xl border border-white/20 p-2 shadow-lg flex flex-col justify-between relative overflow-hidden">
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
                      <span className="text-xs font-mono font-bold text-white">Lava Me Play / USB High-Z Interface</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-400">PREAMP & DSP</span>
                      <span className="text-xs font-mono font-bold text-[#a3ff12]">FreeBoost™ 3.0 Real-Time DSP</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-400">CONNECTION</span>
                      <span className="text-xs font-mono font-bold text-emerald-400 flex items-center">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                        USB Audio Class 2.0 / WebAudio Stream
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-400">ROUNDTRIP LATENCY</span>
                      <span className="text-xs font-mono font-bold text-[#a3ff12]">{latencyMs} ms</span>
                    </div>
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
              JOE Studio Hardware Integration
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
