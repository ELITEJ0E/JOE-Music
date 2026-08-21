import React, { useState } from "react";
import {
  Volume2,
  VolumeX,
  Radio,
  Headphones,
  Trash2,
  Copy,
  Upload,
  MoreVertical,
  Edit2,
  Download,
  AlertCircle,
} from "lucide-react";
import { DAWTrack } from "../../types";

interface TrackHeaderProps {
  track: DAWTrack;
  isSelected: boolean;
  isArmed: boolean;
  onSelect: (trackId: string) => void;
  onArm: (trackId: string) => void;
  onToggleMute: (trackId: string) => void;
  onToggleSolo: (trackId: string) => void;
  onToggleMonitoring: (trackId: string) => void;
  onVolumeChange: (trackId: string, val: number) => void;
  onPanChange: (trackId: string, val: number) => void;
  onRename: (trackId: string, newName: string) => void;
  onDuplicate: (trackId: string) => void;
  onDelete: (trackId: string) => void;
  onTriggerUpload: (trackId: string) => void;
  onExportStem?: (track: DAWTrack) => void;
  meterPeak: number; // 0 to 1.0
  isClipping?: boolean;
  onResetClipping?: () => void;
}

export const TrackHeader: React.FC<TrackHeaderProps> = ({
  track,
  isSelected,
  isArmed,
  onSelect,
  onArm,
  onToggleMute,
  onToggleSolo,
  onToggleMonitoring,
  onVolumeChange,
  onPanChange,
  onRename,
  onDuplicate,
  onDelete,
  onTriggerUpload,
  onExportStem,
  meterPeak,
  isClipping = false,
  onResetClipping,
}) => {
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [nameVal, setNameVal] = useState<string>(track.name);
  const [showMenu, setShowMenu] = useState<boolean>(false);

  const handleNameSubmit = () => {
    if (nameVal.trim()) {
      onRename(track.id, nameVal.trim());
    } else {
      setNameVal(track.name);
    }
    setIsEditingName(false);
  };

  // Convert linear volume (0..1.5) to approximate dB
  const volumeDb =
    track.volume > 0.001
      ? (20 * Math.log10(track.volume)).toFixed(1)
      : "-∞";

  return (
    <div
      id={`daw-track-header-${track.id}`}
      onClick={() => onSelect(track.id)}
      className={`h-24 px-3 py-2 border-b border-r border-white/10 flex items-center justify-between transition-colors select-none ${
        isSelected
          ? "bg-[#161a24] border-l-4"
          : "bg-[#0d1017] hover:bg-[#121620] border-l-2"
      }`}
      style={{ borderLeftColor: track.color || "#a3ff12" }}
    >
      {/* Left Details */}
      <div className="flex-1 min-w-0 pr-2">
        {/* Name and Action Icons */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: track.color }}
            />
            {isEditingName ? (
              <input
                type="text"
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                onBlur={handleNameSubmit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNameSubmit();
                  if (e.key === "Escape") setIsEditingName(false);
                }}
                autoFocus
                className="bg-black/50 border border-[#a3ff12] text-xs font-mono text-white px-1.5 py-0.5 rounded outline-none w-28"
              />
            ) : (
              <span
                onDoubleClick={() => setIsEditingName(true)}
                className="text-xs font-mono font-bold text-zinc-100 truncate cursor-text"
                title="Double click to rename"
              >
                {track.name}
              </span>
            )}
          </div>

          {/* Quick Menu */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="text-zinc-500 hover:text-white p-0.5 rounded"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {showMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-6 z-40 bg-[#1a1e29] border border-white/15 rounded-xl shadow-2xl py-1 w-40 text-[11px] font-mono text-zinc-300 animate-in fade-in zoom-in-95 duration-100"
              >
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setIsEditingName(true);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center gap-2"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Rename</span>
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onTriggerUpload(track.id);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center gap-2"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-400" />
                  <span>Import Audio</span>
                </button>
                {onExportStem && (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onExportStem(track);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5 text-[#a3ff12]" />
                    <span>Export Stem WAV</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onDuplicate(track.id);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center gap-2"
                >
                  <Copy className="w-3.5 h-3.5 text-amber-400" />
                  <span>Duplicate Track</span>
                </button>
                <div className="my-1 border-t border-white/10" />
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onDelete(track.id);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-rose-500/20 text-rose-400 flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Track</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Buttons Row: ARM / MUTE / SOLO / MONITOR */}
        <div className="flex items-center gap-1 mb-2">
          {/* Arm Record Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onArm(track.id);
            }}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all flex items-center gap-1 ${
              isArmed
                ? "bg-rose-500 text-white shadow-[0_0_10px_rgba(244,63,94,0.6)] animate-pulse"
                : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
            title="Arm Track for Guitar Recording"
          >
            <Radio className="w-2.5 h-2.5" />
            <span>REC</span>
          </button>

          {/* Mute */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute(track.id);
            }}
            className={`w-6 h-5 rounded text-[10px] font-mono font-bold transition-all ${
              track.muted
                ? "bg-rose-500/80 text-white font-bold"
                : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
            title="Mute Track"
          >
            M
          </button>

          {/* Solo */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSolo(track.id);
            }}
            className={`w-6 h-5 rounded text-[10px] font-mono font-bold transition-all ${
              track.soloed
                ? "bg-amber-400 text-black font-bold shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
            title="Solo Track"
          >
            S
          </button>

          {/* Input Monitor */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMonitoring(track.id);
            }}
            className={`w-6 h-5 rounded text-[10px] font-mono font-bold transition-all flex items-center justify-center ${
              track.monitoring
                ? "bg-[#a3ff12] text-black font-bold"
                : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
            title="Live Input Monitor"
          >
            <Headphones className="w-2.5 h-2.5" />
          </button>
        </div>

        {/* Sliders: Volume & Pan */}
        <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-zinc-400">
          <div>
            <div className="flex justify-between items-center mb-0.5">
              <span>VOL</span>
              <span className="text-zinc-300 font-bold">{volumeDb} dB</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.2"
              step="0.01"
              value={track.volume}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onVolumeChange(track.id, parseFloat(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-0.5">
              <span>PAN</span>
              <span className="text-zinc-300 font-bold">
                {track.pan === 0
                  ? "C"
                  : track.pan < 0
                  ? `L${Math.round(Math.abs(track.pan) * 100)}`
                  : `R${Math.round(track.pan * 100)}`}
              </span>
            </div>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              value={track.pan}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onPanChange(track.id, parseFloat(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#38bdf8]"
            />
          </div>
        </div>
      </div>

      {/* Right Vertical VU Level Meter + Clipping Indicator */}
      <div className="w-3.5 h-full flex flex-col items-center justify-between shrink-0 py-1 bg-black/40 rounded border border-white/5">
        {/* Clipping LED */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onResetClipping) onResetClipping();
          }}
          className={`w-2.5 h-2 rounded-xs transition-colors ${
            isClipping ? "bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-pulse" : "bg-zinc-800"
          }`}
          title={isClipping ? "Clip Warning! Click to reset" : "Clipping Indicator"}
        />

        {/* Vertical Meter Bar */}
        <div className="w-1.5 flex-1 mx-auto bg-zinc-900 rounded-xs overflow-hidden flex flex-col-reverse my-1">
          <div
            className="w-full transition-all duration-75"
            style={{
              height: `${Math.min(100, meterPeak * 100)}%`,
              backgroundColor: meterPeak > 0.9 ? "#f43f5e" : meterPeak > 0.7 ? "#fbbf24" : "#a3ff12",
            }}
          />
        </div>

        <span className="text-[7px] font-mono text-zinc-600">VU</span>
      </div>
    </div>
  );
};
