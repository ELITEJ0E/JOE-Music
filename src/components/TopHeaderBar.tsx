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
} from "lucide-react";
import { audioEngine } from "../audio/audioContext";

interface TopHeaderBarProps {
  onOpenSettings: () => void;
  onOpenDevices: () => void;
  onOpenMetronome?: () => void;
}

export const TopHeaderBar: React.FC<TopHeaderBarProps> = ({
  onOpenSettings,
  onOpenDevices,
  onOpenMetronome,
}) => {
  const [searchVal, setSearchVal] = useState("");

  return (
    <header className="h-16 border-b border-[#191d24] bg-[#0a0c0e] px-6 flex items-center justify-between z-20 shrink-0">
      {/* Search Input Bar */}
      <div className="w-72 max-w-sm relative hidden sm:block">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
        <input
          type="text"
          placeholder="Search library..."
          value={searchVal}
          onChange={(e) => setSearchVal(e.target.value)}
          className="w-full bg-[#13161a] text-xs font-mono text-white rounded-xl pl-9 pr-4 py-2 border border-[#1f242b] focus:border-[#00FF66]/50 focus:outline-none placeholder:text-zinc-500"
        />
      </div>

      {/* Right Corner: Device Connected Pill, Icons, Avatar */}
      <div className="flex items-center space-x-3 ml-auto">
        {/* LAVA ME PLAY CONNECTED Pill */}
        <div
          onClick={onOpenDevices}
          className="flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#13161a] border border-[#202630] cursor-pointer hover:border-[#00FF66]/40 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-[#00FF66] shadow-[0_0_8px_#00FF66]" />
          <span className="text-[11px] font-mono font-bold text-zinc-200 uppercase tracking-wider">
            LAVA ME PLAY CONNECTED
          </span>
        </div>

        {/* Metronome / Rhythm Trigger */}
        <button
          onClick={onOpenMetronome}
          className="w-9 h-9 rounded-xl bg-[#13161a] border border-[#1f242b] hover:border-zinc-600 flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
          title="Metronome / Rhythm"
        >
          <Clock className="w-4 h-4" />
        </button>

        {/* Audio DSP Active Monitoring */}
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-xl bg-[#13161a] border border-[#1f242b] hover:border-zinc-600 flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
          title="Audio DSP Engine"
        >
          <AudioWaveform className="w-4 h-4 text-[#00FF66]" />
        </button>

        {/* Broadcast / Wireless */}
        <button
          onClick={onOpenDevices}
          className="w-9 h-9 rounded-xl bg-[#13161a] border border-[#1f242b] hover:border-zinc-600 flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
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
