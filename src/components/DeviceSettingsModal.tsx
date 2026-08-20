import React, { useState, useEffect } from "react";
import { Sliders, Radio, Mic, Zap } from "lucide-react";
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
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [sampleRate, setSampleRate] = useState<number>(48000);
  const [latencyMs, setLatencyMs] = useState<number>(12);

  useEffect(() => {
    if (isOpen) {
      // Query real audio input devices
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
      <div className="frosted-card rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl space-y-5 p-6 border border-white/10">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center space-x-2.5">
            <Sliders className="w-5 h-5 text-[#a3ff12]" />
            <h3 className="font-mono font-bold text-sm text-white tracking-tight">
              AUDIO I/O & HARDWARE MIDI SETTINGS
            </h3>
          </div>

          <button
            onClick={onClose}
            className="text-zinc-300 hover:text-white font-mono text-xs px-3 py-1.5 bg-white/5 rounded-xl border border-white/5 hover:border-[#a3ff12]/40 transition-all cursor-pointer"
          >
            DONE
          </button>
        </div>

        {/* Audio Input Device Selector */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-zinc-400 flex items-center">
            <Mic className="w-3.5 h-3.5 text-[#a3ff12] mr-1.5" />
            Guitar / Microphone Audio Device
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
              <option value="">Default System Audio In</option>
            )}
          </select>
        </div>

        {/* Engine Latency & Sample Rate Stats */}
        <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
          <div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">SAMPLE RATE</div>
            <div className="font-mono font-bold text-sm text-[#a3ff12] mt-0.5">
              {sampleRate} Hz
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">BUFFER LATENCY</div>
            <div className="font-mono font-bold text-sm text-[#a3ff12] mt-0.5">
              ~{latencyMs} ms (Ultra Low)
            </div>
          </div>
        </div>

        {/* Web MIDI Hardware Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono text-zinc-400 flex items-center">
              <Radio className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
              Connected MIDI Foot Controllers / Keyboards
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

        {/* PWA Offline Info */}
        <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between text-xs font-mono text-zinc-300">
          <div>
            <div className="font-bold text-white flex items-center">
              <Zap className="w-3.5 h-3.5 text-[#a3ff12] mr-1.5" />
              PWA Offline Workstation Ready
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              All DSP, Tuner & Audio Engines execute 100% locally in browser
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
