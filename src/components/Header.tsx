import React, { useEffect, useState, useRef } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  Sliders,
  Maximize2,
  Minimize2,
  Zap,
  Music,
  Activity,
  ChevronDown,
  LayoutGrid,
} from "lucide-react";
import { audioEngine } from "../audio/audioContext";
import { midiManager, MidiDevice } from "../audio/midiManager";
import { WorkstationMode } from "../types";
import { NAV_ITEMS } from "./Navigation";

interface HeaderProps {
  bpm: number;
  onBpmChange: (bpm: number) => void;
  onOpenSettings: () => void;
  onOpenPresets: () => void;
  activeMode: WorkstationMode;
  onSelectMode: (mode: WorkstationMode) => void;
}

export const Header: React.FC<HeaderProps> = ({
  bpm,
  onBpmChange,
  onOpenSettings,
  onOpenPresets,
  activeMode,
  onSelectMode,
}) => {
  const [isMicOn, setIsMicOn] = useState(false);
  const [masterVolume, setMasterVolume] = useState(85);
  const [isMuted, setIsMuted] = useState(false);
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [isTapFlashing, setIsTapFlashing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsubMic = audioEngine.subscribeMicStatus(setIsMicOn);
    midiManager.init().then(() => {
      setMidiDevices(midiManager.getDevices());
    });
    const unsubMidi = midiManager.subscribeConnections(setMidiDevices);

    return () => {
      unsubMic();
      unsubMidi();
    };
  }, []);

  // Close quick switcher menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  // Real-time Mini Spectrum Visualizer in Header
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isMounted = true;
    let lastRenderTime = 0;

    const render = (now: number) => {
      if (!isMounted) return;

      // Throttle header mini spectrum to ~30 FPS to save CPU and maintain fluid performance
      if (now - lastRenderTime >= 33) {
        lastRenderTime = now;
        const analyser = audioEngine.getMasterAnalyser();
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = canvas.width / 20;
        let x = 0;

        for (let i = 0; i < 20; i++) {
          const binIndex = Math.floor(Math.pow(i / 20, 2) * (bufferLength / 4));
          const val = dataArray[binIndex] || 0;
          const barHeight = Math.max(1, (val / 255) * canvas.height);

          const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
          gradient.addColorStop(0, "rgba(163, 255, 18, 0.2)");
          gradient.addColorStop(1, "rgba(163, 255, 18, 0.95)");

          ctx.fillStyle = gradient;
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 1.5, barHeight);
          x += barWidth;
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      isMounted = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const toggleMic = async () => {
    if (isMicOn) {
      audioEngine.stopMicrophone();
    } else {
      try {
        await audioEngine.startMicrophone();
      } catch (err) {
        alert("Please enable microphone permissions in your browser.");
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setMasterVolume(val);
    if (isMuted) setIsMuted(false);
    audioEngine.setMasterVolume(val / 100);
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      audioEngine.setMasterVolume(masterVolume / 100);
    } else {
      setIsMuted(true);
      audioEngine.setMasterVolume(0);
    }
  };

  const handleTapTempo = () => {
    const now = performance.now();
    setIsTapFlashing(true);
    setTimeout(() => setIsTapFlashing(false), 120);

    const newTaps = [...tapTimes.filter((t) => now - t < 3000), now];
    setTapTimes(newTaps);

    if (newTaps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < newTaps.length; i++) {
        intervals.push(newTaps[i] - newTaps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgInterval);
      if (calculatedBpm >= 40 && calculatedBpm <= 280) {
        onBpmChange(calculatedBpm);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <header
      id="guitar-studio-header"
      className="w-full h-16 border-b border-white/5 backdrop-blur-2xl bg-black/40 px-4 sm:px-6 flex items-center justify-between z-40 sticky top-0"
    >
      {/* Brand Identity & Quick Module Switcher */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-[#a3ff12] rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(163,255,18,0.3)] transition-transform hover:scale-105">
          <Zap className="w-5 h-5 text-black fill-black" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-extrabold text-base sm:text-lg tracking-wider text-white font-sans flex items-center">
              GUITAR<span className="text-[#a3ff12] ml-1">STUDIO</span>
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[#a3ff12]/15 text-[#a3ff12] border border-[#a3ff12]/30 tracking-widest uppercase">
              FROSTED PRO
            </span>
          </div>
          <p className="text-[10px] text-white/40 font-mono hidden sm:block">
            48kHz DSP Audio Engine • Zero Latency
          </p>
        </div>

        {/* Quick Module Switcher Dropdown */}
        <div className="relative ml-2" ref={menuRef}>
          <button
            id="btn-header-module-dropdown"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 text-xs font-mono transition-all backdrop-blur-md cursor-pointer"
            title="Switch Workstation Screen / Module"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-[#a3ff12]" />
            <span className="font-bold text-[#a3ff12]">
              {NAV_ITEMS.find((n) => n.id === activeMode)?.shortLabel || "Modules"}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {isMenuOpen && (
            <div className="absolute left-0 mt-2 w-56 bg-[#0c0c0c] border border-white/15 rounded-2xl shadow-2xl p-1.5 z-50 backdrop-blur-2xl animate-in fade-in zoom-in-95">
              <div className="px-2.5 py-1 text-[10px] font-mono text-white/40 uppercase tracking-wider border-b border-white/5 mb-1">
                Select Workstation View
              </div>
              <div className="space-y-0.5 max-h-72 overflow-y-auto no-scrollbar">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isCur = activeMode === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectMode(item.id);
                        setIsMenuOpen(false);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-mono transition-all ${
                        isCur
                          ? "bg-[#a3ff12]/15 text-[#a3ff12] font-bold border border-[#a3ff12]/30"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Icon className={`w-3.5 h-3.5 ${isCur ? "text-[#a3ff12]" : "text-white/50"}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-white/60">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Center Controls: Mic Input & Mini Spectrum & Master Tempo */}
      <div className="flex items-center space-x-3 sm:space-x-5">
        {/* Real Microphone Input Switch */}
        <button
          id="btn-header-mic-toggle"
          onClick={toggleMic}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl border text-xs font-mono font-medium transition-all backdrop-blur-md ${
            isMicOn
              ? "bg-[#a3ff12]/20 text-[#a3ff12] border-[#a3ff12] shadow-[0_0_15px_rgba(163,255,18,0.3)] animate-pulse"
              : "bg-white/5 text-white/60 border-white/10 hover:text-white hover:bg-white/10 hover:border-white/20"
          }`}
          title="Toggle Guitar Audio Input (Mic/Line-in)"
        >
          {isMicOn ? <Mic className="w-3.5 h-3.5 text-[#a3ff12]" /> : <MicOff className="w-3.5 h-3.5" />}
          <span className="hidden md:inline">{isMicOn ? "AUDIO IN ACTIVE" : "ENABLE AUDIO IN"}</span>
        </button>

        {/* Real Spectrum Canvas */}
        <div className="hidden lg:flex items-center space-x-2 bg-white/5 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
          <Activity className="w-3.5 h-3.5 text-white/40" />
          <canvas ref={canvasRef} width={80} height={20} className="w-20 h-5 rounded" />
        </div>

        {/* Global BPM & Tap Tempo */}
        <div className="flex items-center space-x-1.5 bg-white/5 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
          <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">BPM</span>
          <input
            id="input-header-bpm"
            type="number"
            min={40}
            max={280}
            value={bpm}
            onChange={(e) => onBpmChange(parseInt(e.target.value, 10) || 120)}
            className="w-12 bg-transparent text-center font-mono font-bold text-sm text-[#a3ff12] focus:outline-none"
          />
          <button
            id="btn-header-tap-tempo"
            onClick={handleTapTempo}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
              isTapFlashing
                ? "bg-[#a3ff12] text-black shadow-[0_0_10px_#a3ff12]"
                : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
            }`}
          >
            TAP
          </button>
        </div>
      </div>

      {/* Right Controls: Master Volume, MIDI Status, Fullscreen, Settings */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Master Output Volume */}
        <div className="hidden sm:flex items-center space-x-2 bg-white/5 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
          <button onClick={toggleMute} className="text-white/60 hover:text-white transition-colors">
            {isMuted || masterVolume === 0 ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-[#a3ff12]" />
            )}
          </button>
          <input
            id="slider-header-master-volume"
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : masterVolume}
            onChange={handleVolumeChange}
            className="w-16 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
          />
          <span className="text-[11px] font-mono text-white/70 w-7 text-right">
            {isMuted ? "0%" : `${masterVolume}%`}
          </span>
        </div>

        {/* MIDI Hardware Status Indicator */}
        <div
          onClick={onOpenSettings}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border cursor-pointer text-xs font-mono transition-all backdrop-blur-md ${
            midiDevices.length > 0
              ? "bg-[#a3ff12]/15 text-[#a3ff12] border-[#a3ff12]/40 shadow-[0_0_10px_rgba(163,255,18,0.2)]"
              : "bg-white/5 text-white/40 border-white/10 hover:text-white/80"
          }`}
          title="Hardware MIDI devices & audio routing"
        >
          <Radio className={`w-3.5 h-3.5 ${midiDevices.length > 0 ? "text-[#a3ff12] animate-pulse" : ""}`} />
          <span className="hidden xl:inline">
            {midiDevices.length > 0 ? `${midiDevices.length} MIDI IN` : "NO MIDI"}
          </span>
        </div>

        {/* Presets & Vault */}
        <button
          id="btn-header-open-presets"
          onClick={onOpenPresets}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-[#a3ff12] hover:border-[#a3ff12]/40 hover:bg-white/10 transition-colors backdrop-blur-md"
          title="Tone Presets & Saved Recordings Vault"
        >
          <Music className="w-4 h-4" />
        </button>

        {/* Audio I/O Settings */}
        <button
          id="btn-header-open-settings"
          onClick={onOpenSettings}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-[#a3ff12] hover:border-[#a3ff12]/40 hover:bg-white/10 transition-colors backdrop-blur-md"
          title="Audio Hardware & Latency Settings"
        >
          <Sliders className="w-4 h-4" />
        </button>

        {/* Fullscreen Toggle */}
        <button
          id="btn-header-fullscreen"
          onClick={toggleFullscreen}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-colors backdrop-blur-md hidden md:block"
          title="Toggle Fullscreen Mode"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
