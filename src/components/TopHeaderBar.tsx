import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Sliders,
  AudioWaveform,
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

  // Real active input or hardware detection
  const isConnected = (inputState === "READY" || inputState === "MONITORING" || inputState === "RECORDING") || isReceivingSignal;

  const pillLabel = isConnected ? "CONNECTED" : "NOT CONNECTED";
  const pillDotColor = isConnected ? "bg-[#a3ff12] shadow-[0_0_8px_#a3ff12]" : "bg-red-500/80";
  const pillBorder = isConnected ? "border-[#a3ff12]/40 bg-[#a3ff12]/10" : "border-white/10";
  const pillText = isConnected ? "text-[#a3ff12]" : "text-zinc-400";

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

        {/* Audio DSP Active Monitoring */}
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-[#a3ff12]/40 flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
          title="Audio DSP Engine"
        >
          <AudioWaveform className="w-4 h-4 text-[#a3ff12]" />
        </button>

        {/* Guitarist Profile Avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-500 border border-white/20 flex items-center justify-center text-white text-xs font-bold shadow-sm">
          <User className="w-4 h-4 text-white" />
        </div>
      </div>
    </header>
  );
};
