import React, { useState, useEffect } from "react";
import { Headphones, Mic, MicOff, Radio, CircleDot } from "lucide-react";
import { audioEngine, AudioInputState } from "../audio/audioContext";

export const BottomStatusBar: React.FC = () => {
  const [inputState, setInputState] = useState<AudioInputState>(audioEngine.getInputState());
  const [isMicActive, setIsMicActive] = useState<boolean>(audioEngine.getIsMicActive());
  const [isMonitoring, setIsMonitoring] = useState<boolean>(audioEngine.getIsMonitoring());
  const [sampleRate, setSampleRate] = useState<number>(44100);

  useEffect(() => {
    try {
      const ctx = audioEngine.getContext();
      setSampleRate(ctx.sampleRate);
    } catch (_) {}

    const unsubMic = audioEngine.subscribeMicStatus(setIsMicActive);
    const unsubMon = audioEngine.subscribeMonitorStatus(setIsMonitoring);
    const unsubState = audioEngine.subscribeInputState(setInputState);

    return () => {
      unsubMic();
      unsubMon();
      unsubState();
    };
  }, []);

  const handleToggleMonitoring = () => {
    audioEngine.toggleMonitoring();
  };

  const getInputBadge = () => {
    switch (inputState) {
      case "RECORDING":
        return {
          dot: "bg-red-500 animate-pulse shadow-sm shadow-red-500/50",
          text: "text-red-400 font-bold",
          label: "RECORDING",
        };
      case "MONITORING":
        return {
          dot: "bg-[#a3ff12] animate-pulse shadow-sm shadow-[#a3ff12]/50",
          text: "text-[#a3ff12] font-bold",
          label: "LIVE MONITOR",
        };
      case "READY":
        return {
          dot: "bg-sky-400",
          text: "text-sky-400 font-semibold",
          label: "INPUT READY",
        };
      case "REQUESTING_PERMISSION":
        return {
          dot: "bg-amber-400 animate-ping",
          text: "text-amber-400 font-medium",
          label: "REQUESTING MIC",
        };
      case "IDLE":
      default:
        return {
          dot: "bg-zinc-600",
          text: "text-zinc-500",
          label: "STANDBY (OFF)",
        };
    }
  };

  const badge = getInputBadge();

  return (
    <footer className="h-8 bg-[#0b0c0e]/85 backdrop-blur border-t border-white/5 px-6 hidden sm:flex items-center justify-between text-[11px] font-mono text-zinc-500 shrink-0 z-20 select-none">
      {/* Left Hardware & Latency Status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1.5" title="Hardware Audio Input Lifecycle State">
          <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
          <span>
            Input: <strong className={badge.text}>{badge.label}</strong>
          </span>
        </div>

        <span>•</span>

        <button
          onClick={handleToggleMonitoring}
          className={`flex items-center space-x-1 transition-colors cursor-pointer ${
            isMonitoring ? "text-[#a3ff12] font-bold" : "text-zinc-400 hover:text-white"
          }`}
          title="Toggle Real-Time Guitar Monitoring"
        >
          <Headphones className="w-3 h-3" />
          <span>Monitor: <strong>{isMonitoring ? "ON" : "MUTED"}</strong></span>
        </button>

        <span>•</span>
        <span>DSP: <strong className="text-[#a3ff12]">64-bit Flow</strong></span>
        <span>•</span>
        <span>Sample Rate: <strong className="text-zinc-300">{(sampleRate / 1000).toFixed(1)} kHz</strong></span>
      </div>

      {/* Right Audio Engine */}
      <div className="flex items-center space-x-4">
        <span>ENGINE: <strong className="text-zinc-300">WebAudio Pro Core</strong></span>
        <span>•</span>
        <span className="text-[#a3ff12] font-bold">BANDLAB-STYLE WORKFLOW</span>
      </div>
    </footer>
  );
};
