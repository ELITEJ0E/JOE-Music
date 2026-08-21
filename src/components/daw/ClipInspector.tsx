import React from "react";
import { X, Sliders, Scissors, Copy, Trash2, Download, Volume2, Sparkles } from "lucide-react";
import { AudioClip } from "../../types";
import { audioBufferToWavBlob } from "../../audio/wavEncoder";

interface ClipInspectorProps {
  clip: AudioClip;
  trackName: string;
  trackColor: string;
  playheadTimeSec: number;
  onClose: () => void;
  onUpdateClip: (updated: AudioClip) => void;
  onSplitAtPlayhead: (clipId: string) => void;
  onDuplicateClip: (clipId: string) => void;
  onDeleteClip: (clipId: string) => void;
}

export const ClipInspector: React.FC<ClipInspectorProps> = ({
  clip,
  trackName,
  trackColor,
  playheadTimeSec,
  onClose,
  onUpdateClip,
  onSplitAtPlayhead,
  onDuplicateClip,
  onDeleteClip,
}) => {
  const handleDownloadWav = () => {
    if (!clip.audioBuffer && !clip.audioBlob) return;
    const blob = clip.audioBlob || (clip.audioBuffer ? audioBufferToWavBlob(clip.audioBuffer) : null);
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clip.name.replace(/\s+/g, "_")}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isPlayheadInside =
    playheadTimeSec >= clip.startTime && playheadTimeSec <= clip.startTime + clip.duration;

  return (
    <div
      id="daw-clip-inspector-modal"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#12151e] border border-white/15 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: trackColor }} />
            <div>
              <h3 className="text-sm font-mono font-bold text-white flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-[#a3ff12]" />
                <span>Clip Inspector</span>
              </h3>
              <p className="text-[11px] font-mono text-zinc-400">Track: {trackName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Clip Name */}
        <div>
          <label className="block text-[11px] font-mono text-zinc-400 mb-1">Take / Clip Label</label>
          <input
            type="text"
            value={clip.name}
            onChange={(e) => onUpdateClip({ ...clip, name: e.target.value })}
            className="w-full bg-black/40 border border-white/15 focus:border-[#a3ff12] text-xs font-mono text-white px-3 py-2 rounded-xl outline-none"
          />
        </div>

        {/* Start Time & Duration */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1">Timeline Start (s)</label>
            <input
              type="number"
              step="0.05"
              min="0"
              value={Number(clip.startTime.toFixed(2))}
              onChange={(e) =>
                onUpdateClip({ ...clip, startTime: Math.max(0, parseFloat(e.target.value) || 0) })
              }
              className="w-full bg-black/40 border border-white/15 focus:border-[#a3ff12] text-xs font-mono text-white px-3 py-2 rounded-xl outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1">Active Duration (s)</label>
            <input
              type="number"
              step="0.05"
              min="0.1"
              value={Number(clip.duration.toFixed(2))}
              onChange={(e) =>
                onUpdateClip({ ...clip, duration: Math.max(0.1, parseFloat(e.target.value) || 0.1) })
              }
              className="w-full bg-black/40 border border-white/15 focus:border-[#a3ff12] text-xs font-mono text-white px-3 py-2 rounded-xl outline-none"
            />
          </div>
        </div>

        {/* Fade In / Fade Out */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex justify-between text-[11px] font-mono text-zinc-400 mb-1">
              <span>Fade In</span>
              <span className="text-[#a3ff12]">{(clip.fadeInSec ?? 0.005).toFixed(2)}s</span>
            </div>
            <input
              type="range"
              min="0.001"
              max={Math.min(2.0, clip.duration / 2)}
              step="0.01"
              value={clip.fadeInSec ?? 0.005}
              onChange={(e) => onUpdateClip({ ...clip, fadeInSec: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] font-mono text-zinc-400 mb-1">
              <span>Fade Out</span>
              <span className="text-[#a3ff12]">{(clip.fadeOutSec ?? 0.005).toFixed(2)}s</span>
            </div>
            <input
              type="range"
              min="0.001"
              max={Math.min(2.0, clip.duration / 2)}
              step="0.01"
              value={clip.fadeOutSec ?? 0.005}
              onChange={(e) => onUpdateClip({ ...clip, fadeOutSec: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
            />
          </div>
        </div>

        {/* Clip Gain */}
        <div>
          <div className="flex justify-between text-[11px] font-mono text-zinc-400 mb-1">
            <span>Clip Gain Multiplier</span>
            <span className="text-white font-bold">{Math.round((clip.gain ?? 1.0) * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="2.0"
            step="0.05"
            value={clip.gain ?? 1.0}
            onChange={(e) => onUpdateClip({ ...clip, gain: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#38bdf8]"
          />
        </div>

        {/* Quick Operations Row */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
          <button
            onClick={() => {
              if (isPlayheadInside) {
                onSplitAtPlayhead(clip.id);
                onClose();
              } else {
                alert("Place the playhead inside this clip to split.");
              }
            }}
            disabled={!isPlayheadInside}
            className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-all ${
              isPlayheadInside
                ? "bg-blue-500/20 border-blue-500/40 text-blue-400 hover:bg-blue-500/30"
                : "bg-white/5 border-white/5 text-zinc-600 cursor-not-allowed"
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Split at Playhead</span>
          </button>

          <button
            onClick={() => {
              onDuplicateClip(clip.id);
              onClose();
            }}
            className="py-2 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-mono font-bold text-zinc-200 flex items-center justify-center gap-1.5 transition-all"
          >
            <Copy className="w-3.5 h-3.5 text-amber-400" />
            <span>Duplicate Take</span>
          </button>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={handleDownloadWav}
            className="text-xs font-mono text-zinc-400 hover:text-white flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[#a3ff12]" />
            <span>Export Clip WAV</span>
          </button>

          <button
            onClick={() => {
              if (confirm("Delete this audio clip?")) {
                onDeleteClip(clip.id);
                onClose();
              }
            }}
            className="text-xs font-mono text-rose-400 hover:text-rose-300 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Clip</span>
          </button>
        </div>
      </div>
    </div>
  );
};
