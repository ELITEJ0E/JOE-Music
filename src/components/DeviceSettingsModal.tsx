import React, { useState, useEffect } from "react";
import { Sliders, Radio, Mic, Cpu, Zap, Download } from "lucide-react";
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#101016] border border-[#2c2c3e] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl space-y-5 p-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#20202c] pb-4">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-[#2ae500]" />
            <h3 className="font-mono font-bold text-base text-white">
              AUDIO I/O & HARDWARE MIDI SETTINGS
            </h3>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white font-mono text-xs px-2.5 py-1 bg-[#181824] rounded-lg border border-[#2a2a3c]"
          >
            DONE
          </button>
        </div>

        {/* Audio Input Device Selector */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-gray-400 flex items-center">
            <Mic className="w-3.5 h-3.5 text-[#2ae500] mr-1.5" />
            Guitar / Microphone Audio Device
          </label>
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="w-full bg-[#161622] text-xs font-mono text-white border border-[#2e2e42] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#2ae500]"
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
        <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-[#0b0b10] border border-[#20202c]">
          <div>
            <div className="text-[10px] font-mono text-gray-500 uppercase">SAMPLE RATE</div>
            <div className="font-mono font-bold text-sm text-[#2ae500]">
              {sampleRate} Hz
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono text-gray-500 uppercase">BUFFER LATENCY</div>
            <div className="font-mono font-bold text-sm text-[#2ae500]">
              ~{latencyMs} ms (Ultra Low)
            </div>
          </div>
        </div>

        {/* Web MIDI Hardware Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono text-gray-400 flex items-center">
              <Radio className="w-3.5 h-3.5 text-[#00e5ff] mr-1.5" />
              Connected MIDI Foot Controllers / Keyboards
            </label>
            <span className="text-[10px] font-mono text-[#00e5ff]">
              {midiDevices.length} Connected
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#14141e] border border-[#242436] space-y-1.5">
            {midiDevices.length > 0 ? (
              midiDevices.map((dev) => (
                <div
                  key={dev.id}
                  className="flex items-center justify-between text-xs font-mono text-gray-300"
                >
                  <span>{dev.name}</span>
                  <span className="text-[10px] text-[#2ae500] font-bold">ONLINE</span>
                </div>
              ))
            ) : (
              <div className="text-xs font-mono text-gray-500 py-1">
                No external MIDI hardware detected. Plug in any USB/Bluetooth MIDI pedal or keyboard.
              </div>
            )}
          </div>
        </div>

        {/* PWA Offline Info */}
        <div className="p-3.5 rounded-xl bg-[#141420] border border-[#28283c] flex items-center justify-between text-xs font-mono text-gray-300">
          <div>
            <div className="font-bold text-white flex items-center">
              <Zap className="w-3.5 h-3.5 text-[#2ae500] mr-1.5" />
              PWA Offline Workstation Ready
            </div>
            <div className="text-[10px] text-gray-400">
              All DSP, Tuner & Audio Engines execute 100% locally in browser
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
