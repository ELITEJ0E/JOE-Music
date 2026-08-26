import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Sliders,
  AudioWaveform,
  Radio,
  Clock,
  User,
  Settings,
  Volume2,
  Mic,
  Download,
  CheckCircle2,
  Guitar,
  AlertCircle,
} from "lucide-react";
import { audioEngine } from "../audio/audioContext";

interface TopHeaderBarProps {
  onOpenSettings: () => void;
  onOpenDevices: () => void;
  onOpenMetronome?: () => void;
  onInstallApp?: () => void;
  isInstalled?: boolean;
}

export const TopHeaderBar: React.FC<TopHeaderBarProps> = ({
  onOpenSettings,
  onOpenDevices,
  onOpenMetronome,
  onInstallApp,
  isInstalled,
}) => {
  const [searchVal, setSearchVal] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputState, setInputState] = useState(audioEngine.getInputState());
  const [isReceivingSignal, setIsReceivingSignal] = useState(false);
  const animFrameRef = useRef<number | null>(null);

  // Sync real-time device and audio signal state
  useEffect(() => {
    let mounted = true;

    const updateDevices = async () => {
      try {
        const { inputs } = await audioEngine.getAudioDevices();
        if (mounted) setDevices(inputs);
      } catch (_) {}
    };

    updateDevices();

    // Listen to device changes
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", updateDevices);
    }

    // Listen to input state changes
    const removeListener = audioEngine.subscribeInputState((state) => {
      if (mounted) setInputState(state);
    });

    // Poll signal level when input is active
    const pollSignal = () => {
      if (!mounted) return;
      if (audioEngine.getIsMicActive()) {
        const lvl = audioEngine.getInputLevel();
        setIsReceivingSignal(lvl.db > -52);
      } else {
        setIsReceivingSignal(false);
      }
      animFrameRef.current = requestAnimationFrame(pollSignal);
    };
    animFrameRef.current = requestAnimationFrame(pollSignal);

    return () => {
      mounted = false;
      if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
        navigator.mediaDevices.removeEventListener("devicechange", updateDevices);
      }
      removeListener();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Determine actual connection status
  const isMicActive = inputState === "READY" || inputState === "MONITORING" || inputState === "RECORDING";
  const isLavaDetected = devices.some((d) => d.label.toLowerCase().includes("lava"));

  let pillLabel = "NO GUITAR CONNECTED";
  let pillDotColor = "bg-zinc-600";
  let pillBorder = "border-white/10";
  let pillText = "text-zinc-400";

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    pillLabel = "AUDIO UNSUPPORTED";
    pillDotColor = "bg-zinc-600";
  } else if (devices.length === 0) {
    pillLabel = "NO INPUT CONNECTED";
    pillDotColor = "bg-red-500/80";
    pillBorder = "border-red-500/20";
    pillText = "text-zinc-400";
  } else if (isLavaDetected) {
    if (isReceivingSignal) {
      pillLabel = "LAVA ME PLAY • RECEIVING";
      pillDotColor = "bg-[#a3ff12] shadow-[0_0_8px_#a3ff12] animate-pulse";
      pillBorder = "border-[#a3ff12]/40 bg-[#a3ff12]/10";
      pillText = "text-white";
    } else if (isMicActive) {
      pillLabel = "LAVA ME PLAY • ACTIVE";
      pillDotColor = "bg-[#a3ff12] shadow-[0_0_6px_#a3ff12]";
      pillBorder = "border-[#a3ff12]/30";
      pillText = "text-zinc-200";
    } else {
      pillLabel = "LAVA ME PLAY • DETECTED";
      pillDotColor = "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]";
      pillBorder = "border-amber-400/30";
      pillText = "text-zinc-300";
    }
  } else {
    // Non-LAVA audio input device
    if (isReceivingSignal) {
      pillLabel = "GUITAR IN • RECEIVING";
      pillDotColor = "bg-[#a3ff12] shadow-[0_0_8px_#a3ff12] animate-pulse";
      pillBorder = "border-[#a3ff12]/40 bg-[#a3ff12]/10";
      pillText = "text-white";
    } else if (isMicActive) {
      pillLabel = "AUDIO IN • ACTIVE";
      pillDotColor = "bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.5)]";
      pillBorder = "border-sky-400/30";
      pillText = "text-zinc-200";
    } else {
      pillLabel = "GUITAR NOT CONNECTED";
      pillDotColor = "bg-red-500/70";
      pillBorder = "border-white/10";
      pillText = "text-zinc-400";
    }
  }

  return (
    <header className="h-16 border-b border-white/10 bg-[#0a0c0e]/80 backdrop-blur-md px-6 flex items-center justify-between z-20 shrink-0">
      {/* Search Input Bar */}
      <div className="w-72 max-w-sm relative hidden sm:block">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
        <input
          type="text"
          placeholder="Search library..."
          value={searchVal}
          onChange={(e) => setSearchVal(e.target.value)}
          className="w-full bg-white/5 text-xs font-mono text-white rounded-xl pl-9 pr-4 py-2 border border-white/10 focus:border-[#a3ff12]/50 focus:outline-none placeholder:text-zinc-500"
        />
      </div>

      {/* Right Corner: Device Connected Pill, Icons, Avatar */}
      <div className="flex items-center space-x-3 ml-auto">
        {/* PWA Install Button */}
        {onInstallApp && (
          <button
            id="btn-header-install-pwa"
            onClick={onInstallApp}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
              isInstalled
                ? "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                : "bg-[#a3ff12]/10 hover:bg-[#a3ff12]/20 border-[#a3ff12]/30 text-[#a3ff12] hover:text-white shadow-[0_0_12px_rgba(163,255,18,0.1)]"
            }`}
            title={isInstalled ? "JOE Studio Installed as Standalone App" : "Install JOE Studio as Desktop App"}
          >
            {isInstalled ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span className="hidden lg:inline uppercase tracking-wider">
              {isInstalled ? "App Active" : "Install App"}
            </span>
          </button>
        )}

        {/* Real Dynamic Device Status Pill */}
        <button
          onClick={onOpenDevices}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-white/5 border ${pillBorder} cursor-pointer hover:border-[#a3ff12]/50 transition-all`}
          title="Click to configure audio input & guitar hardware"
        >
          <div className={`w-2 h-2 rounded-full ${pillDotColor}`} />
          <span className={`text-[11px] font-mono font-bold ${pillText} uppercase tracking-wider`}>
            {pillLabel}
          </span>
        </button>

        {/* Metronome / Rhythm Trigger */}
        <button
          onClick={onOpenMetronome}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-[#a3ff12]/40 flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
          title="Metronome / Rhythm"
        >
          <Clock className="w-4 h-4" />
        </button>

        {/* Audio DSP Active Monitoring */}
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-[#a3ff12]/40 flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
          title="Audio DSP Engine"
        >
          <AudioWaveform className="w-4 h-4 text-[#a3ff12]" />
        </button>

        {/* Broadcast / Wireless */}
        <button
          onClick={onOpenDevices}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-[#a3ff12]/40 flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
          title="Wireless & MIDI"
        >
          <Radio className="w-4 h-4" />
        </button>

        {/* Guitarist Profile Avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-500 border border-white/20 flex items-center justify-center text-white text-xs font-bold shadow-sm">
          <User className="w-4 h-4 text-white" />
        </div>
      </div>
    </header>
  );
};
