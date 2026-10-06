/**
 * JOE Music - Persistent Contextual Song Workspace Navigation Bar
 * 
 * Provides quick 1-click movement across:
 * [CHORDS] [PRACTICE] [STEMS] [LYRICS] [STUDIO]
 * while preserving active song analysis, chord edits, tempo, and capo state.
 */

import React, { useState } from "react";
import {
  Music,
  FileText,
  Target,
  Sliders,
  Layers,
  Sparkles,
  BookOpen,
  Volume2,
  ChevronRight,
  X,
} from "lucide-react";
import { useSongWorkspace } from "../context/SongWorkspaceContext";
import { ChordComplexityMode } from "../types";

interface SongWorkspaceBarProps {
  currentModule: string;
  onNavigateModule: (mode: string) => void;
  onOpenLyrics?: () => void;
  onOpenStems?: () => void;
}

export const SongWorkspaceBar: React.FC<SongWorkspaceBarProps> = ({
  currentModule,
  onNavigateModule,
  onOpenLyrics,
  onOpenStems,
}) => {
  const {
    activeSong,
    complexityMode,
    setComplexityMode,
    userCapo,
    displaySegments,
    sendSongToStudio,
  } = useSongWorkspace();

  const [showStemsModal, setShowStemsModal] = useState(false);
  const [showLyricsModal, setShowLyricsModal] = useState(false);

  if (!activeSong) return null;

  const handleTabClick = (tab: "chords" | "practice" | "stems" | "lyrics" | "studio") => {
    switch (tab) {
      case "chords":
        onNavigateModule("chords-ai");
        break;
      case "practice":
        onNavigateModule("practice");
        break;
      case "studio":
        sendSongToStudio();
        onNavigateModule("studio");
        break;
      case "lyrics":
        if (onOpenLyrics) onOpenLyrics();
        else setShowLyricsModal(true);
        break;
      case "stems":
        if (onOpenStems) onOpenStems();
        else setShowStemsModal(true);
        break;
    }
  };

  const isChordsActive = currentModule === "chords-ai";
  const isPracticeActive = currentModule === "practice";
  const isStudioActive = currentModule === "studio" || currentModule === "multi-track";

  return (
    <>
      <div className="w-full bg-[#12161f]/95 border-b border-white/10 px-3 py-1.5 sm:px-6 sm:py-2 text-white flex flex-col md:flex-row items-center justify-between gap-2 z-30 shadow-md backdrop-blur-md">
        {/* Left: Active Song Mini-Hero */}
        <div className="flex items-center gap-2.5 min-w-0 max-w-full md:max-w-md">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-black/40 border border-white/10 shrink-0 flex items-center justify-center">
            {activeSong.imageUrl ? (
              <img
                src={activeSong.imageUrl}
                alt={activeSong.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Music className="w-4 h-4 text-[#a3ff12]" />
            )}
          </div>

          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#a3ff12] font-mono shrink-0">
                SONG WORKSPACE:
              </span>
              <span className="text-xs font-bold text-white truncate" title={activeSong.title}>
                {activeSong.title}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10.5px] font-mono text-zinc-400 truncate">
              <span>{activeSong.key || "C"}</span>
              <span>•</span>
              <span>{activeSong.tempo || 120} BPM</span>
              <span>•</span>
              <span>{activeSong.timeSignature || "4/4"}</span>
              {userCapo > 0 && (
                <>
                  <span>•</span>
                  <span className="text-sky-400 font-bold">Capo {userCapo}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Center: Contextual Module Tabs */}
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full">
          <button
            onClick={() => handleTabClick("chords")}
            className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              isChordsActive
                ? "bg-[#a3ff12] text-black shadow-sm"
                : "bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/5"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>CHORDS</span>
          </button>

          <button
            onClick={() => handleTabClick("practice")}
            className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              isPracticeActive
                ? "bg-[#a3ff12] text-black shadow-sm"
                : "bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/5"
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>PRACTICE</span>
          </button>

          <button
            onClick={() => handleTabClick("stems")}
            className="px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/5 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            title="Stem separation asset integration"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>STEMS</span>
          </button>

          <button
            onClick={() => handleTabClick("lyrics")}
            className="px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/5 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            title="View Song Lyrics"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>LYRICS</span>
          </button>

          <button
            onClick={() => handleTabClick("studio")}
            className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              isStudioActive
                ? "bg-[#a3ff12] text-black shadow-sm"
                : "bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/5"
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            <span>STUDIO</span>
          </button>
        </div>

        {/* Right: Quick Chord Complexity Selector */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold hidden sm:inline">
            DETAIL:
          </span>
          <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-0.5 text-[10px] font-mono">
            {(["easy", "standard", "detailed"] as ChordComplexityMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setComplexityMode(mode)}
                className={`px-2 py-0.5 rounded-lg capitalize font-bold transition-all cursor-pointer ${
                  complexityMode === mode
                    ? "bg-[#a3ff12] text-black shadow-xs"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stems Preparation Modal */}
      {showStemsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#151922] border border-white/15 rounded-3xl p-5 max-w-md w-full space-y-4 shadow-2xl text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold font-mono">Song Stem Assets</h3>
              </div>
              <button
                onClick={() => setShowStemsModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono text-zinc-300">
              <p>
                Connected to <strong className="text-white">{activeSong.title}</strong>.
              </p>
              <div className="p-3 rounded-2xl bg-black/30 border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span>Full Master Audio</span>
                  <span className="text-[#a3ff12] font-bold">READY</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Isolated Guitar Stem</span>
                  <span className="text-zinc-500">Separation Standby</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Backing (Drums/Bass)</span>
                  <span className="text-zinc-500">Separation Standby</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Vocal Stem</span>
                  <span className="text-zinc-500">Separation Standby</span>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400">
                Tip: You can send this song directly to <strong>JOE Studio</strong> to record your guitar tracks over the full master or generate synchronized Smart Jam MIDI accompaniment.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowStemsModal(false);
                  handleTabClick("studio");
                }}
                className="px-4 py-2 rounded-xl bg-[#a3ff12] hover:bg-[#92eb10] text-black font-mono font-bold text-xs cursor-pointer"
              >
                Open in JOE Studio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lyrics Modal */}
      {showLyricsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#151922] border border-white/15 rounded-3xl p-5 max-w-lg w-full max-h-[80vh] flex flex-col space-y-3 shadow-2xl text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold font-mono">Lyrics & Lead Sheet</h3>
              </div>
              <button
                onClick={() => setShowLyricsModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 text-xs font-mono pr-1">
              <h4 className="text-sm font-bold text-white">{activeSong.title}</h4>
              <p className="text-zinc-400">{activeSong.artist || "Unknown Artist"}</p>

              {activeSong.lyrics ? (
                <div className="whitespace-pre-line text-zinc-200 leading-relaxed bg-black/30 p-4 rounded-2xl border border-white/5">
                  {activeSong.lyrics}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-black/30 border border-white/5 space-y-2 text-zinc-400">
                  <p>Lead Chord Sheet Chords:</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {displaySegments.slice(0, 32).map((seg, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white font-bold text-xs"
                      >
                        {seg.chord}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
