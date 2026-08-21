import React, { useState } from "react";
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

        {/* LAVA ME PLAY CONNECTED Pill */}
        <div
          onClick={onOpenDevices}
          className="flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 cursor-pointer hover:border-[#a3ff12]/40 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-[#a3ff12] shadow-[0_0_8px_#a3ff12]" />
          <span className="text-[11px] font-mono font-bold text-zinc-200 uppercase tracking-wider">
            LAVA ME PLAY CONNECTED
          </span>
        </div>

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
