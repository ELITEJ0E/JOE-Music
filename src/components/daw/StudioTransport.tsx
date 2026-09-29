import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  Square,
  Circle,
  SkipBack,
  Clock,
  Repeat,
  Magnet,
  Undo2,
  Redo2,
  FolderOpen,
  Download,
  ChevronLeft,
  ChevronRight,
  Sliders,
} from "lucide-react";
import { GridSnapSetting, CountInSetting } from "../../types";

interface StudioTransportProps {
  isPlaying: boolean;
  isRecording: boolean;
  isMetronomeActive: boolean;
  isLoopActive: boolean;
  bpm: number;
  timeSig: string;
  keySig: string;
  playheadTimeSec: number;
  zoomPxPerSec: number;
  gridSnap: GridSnapSetting;
  countInMode: CountInSetting;
  canUndo: boolean;
  canRedo: boolean;
  autoSaveStatus: "saved" | "saving" | "unsaved";
  projectName: string;
  onTogglePlay: () => void;
  onStop: () => void;
  onRewind: () => void;
  onToggleRecord: () => void;
  onToggleMetronome: () => void;
  onToggleLoop: () => void;
  onBpmChange: (newBpm: number) => void;
  onTimeSigChange: (newSig: string) => void;
  onKeySigChange: (newKey: string) => void;
  onZoomChange: (newZoom: number) => void;
  onGridSnapChange: (newSnap: GridSnapSetting) => void;
  onCountInChange: (newCountIn: CountInSetting) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenProjects: () => void;
  onOpenExport: () => void;
  onRenameProject: (newName: string) => void;
}

export const StudioTransport: React.FC<StudioTransportProps> = ({
  isPlaying,
  isRecording,
  isMetronomeActive,
  isLoopActive,
  bpm,
  timeSig,
  keySig,
  playheadTimeSec,
  zoomPxPerSec,
  gridSnap,
  countInMode,
  canUndo,
  canRedo,
  autoSaveStatus,
  projectName,
  onTogglePlay,
  onStop,
  onRewind,
  onToggleRecord,
  onToggleMetronome,
  onToggleLoop,
  onBpmChange,
  onTimeSigChange,
  onKeySigChange,
  onZoomChange,
  onGridSnapChange,
  onCountInChange,
  onUndo,
  onRedo,
  onOpenProjects,
  onOpenExport,
  onRenameProject,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(projectName);
  const tapTimesRef = useRef<number[]>([]);

  // Horizontal scroll / slide state for mobile & compact screens
  const transportScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);

  const checkScroll = () => {
    if (transportScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = transportScrollRef.current;
      setCanScrollLeft(scrollLeft > 6);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
    }
  };

  useEffect(() => {
    checkScroll();
    const handleResize = () => checkScroll();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [projectName]);

  useEffect(() => {
    setTempTitle(projectName);
  }, [projectName]);

  // Tap Tempo Calculation
  const handleTapTempo = () => {
    const now = performance.now();
    const times = tapTimesRef.current.filter((t) => now - t < 3000);
    times.push(now);
    tapTimesRef.current = times;

    if (times.length >= 3) {
      const intervals: number[] = [];
      for (let i = 1; i < times.length; i++) {
        intervals.push(times[i] - times[i - 1]);
      }
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgMs);
      if (calculatedBpm >= 40 && calculatedBpm <= 240) {
        onBpmChange(calculatedBpm);
      }
    }
  };

  // Musical Time Calculation (Bar:Beat:Tick)
  const secondsPerBeat = 60.0 / (bpm || 120);
  const beatsPerBar = parseInt(timeSig.split("/")[0], 10) || 4;
  const currentTotalBeats = playheadTimeSec / secondsPerBeat;
  const currentBar = Math.floor(currentTotalBeats / beatsPerBar) + 1;
  const currentBeat = Math.floor(currentTotalBeats % beatsPerBar) + 1;
  const currentTick = Math.floor(((currentTotalBeats % beatsPerBar) % 1) * 100);

  const formatMinSec = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m}:${s < 10 ? "0" : ""}${s}.${ms}`;
  };

  const handleScrollNudge = (direction: "left" | "right") => {
    if (transportScrollRef.current) {
      transportScrollRef.current.scrollBy({
        left: direction === "left" ? -140 : 140,
        behavior: "smooth",
      });
      setTimeout(checkScroll, 200);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!transportScrollRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - transportScrollRef.current.offsetLeft;
    scrollLeftRef.current = transportScrollRef.current.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !transportScrollRef.current) return;
    const x = e.pageX - transportScrollRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.5;
    transportScrollRef.current.scrollLeft = scrollLeftRef.current - walk;
    checkScroll();
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <div className="relative bg-[#0f121a] border-b border-white/10 select-none font-mono text-xs z-30 shrink-0">
      {/* Left Scroll Indicator Nudge */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 z-20 flex items-center pr-2 bg-gradient-to-r from-[#0f121a] via-[#0f121a]/95 to-transparent">
          <button
            onClick={() => handleScrollNudge("left")}
            className="w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all shadow-sm cursor-pointer ml-1"
            title="Scroll buttons left"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Horizontally Slideable Single-Row Transport Container */}
      <div
        ref={transportScrollRef}
        onScroll={checkScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="flex items-center justify-between gap-3 px-2 sm:px-4 py-2 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x min-h-[48px] cursor-grab active:cursor-grabbing"
      >
        {/* Section 1: Project Title, Badge, Undo/Redo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-[#a3ff12]/15 border border-[#a3ff12]/30 flex items-center justify-center text-[#a3ff12] shrink-0">
            <span className="font-extrabold text-[10px]">DAW</span>
          </div>

          <div className="min-w-0">
            {isEditingTitle ? (
              <input
                type="text"
                value={tempTitle}
                onChange={(e) => setTempTitle(e.target.value)}
                onBlur={() => {
                  setIsEditingTitle(false);
                  if (tempTitle.trim()) onRenameProject(tempTitle.trim());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setIsEditingTitle(false);
                    if (tempTitle.trim()) onRenameProject(tempTitle.trim());
                  }
                }}
                autoFocus
                className="bg-black/60 border border-[#a3ff12]/50 rounded px-2 py-0.5 text-xs text-white font-bold outline-none"
              />
            ) : (
              <div
                onClick={() => setIsEditingTitle(true)}
                className="font-bold text-white hover:text-[#a3ff12] cursor-pointer truncate max-w-[120px] sm:max-w-[180px]"
                title="Click to rename project"
              >
                {projectName}
              </div>
            )}
          </div>

          <span
            className={`text-[8.5px] px-1.5 py-0.2 rounded-full border hidden sm:inline-block ${
              autoSaveStatus === "saving"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse"
                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            }`}
          >
            {autoSaveStatus === "saving" ? "Saving" : "Saved"}
          </span>

          {/* Undo / Redo */}
          <div className="flex items-center gap-1 ml-0.5">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={`p-1.5 rounded-lg bg-white/5 border border-white/5 transition-colors ${
                canUndo ? "text-zinc-200 hover:text-white hover:bg-white/10 cursor-pointer" : "text-zinc-600 cursor-not-allowed"
              }`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={`p-1.5 rounded-lg bg-white/5 border border-white/5 transition-colors ${
                canRedo ? "text-zinc-200 hover:text-white hover:bg-white/10 cursor-pointer" : "text-zinc-600 cursor-not-allowed"
              }`}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Section 2: Transport Playback Controls (Rewind, Stop, Play, Record, Loop, Metronome, Time Readout) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Rewind */}
          <button
            onClick={onRewind}
            className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Rewind to start"
          >
            <SkipBack className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          {/* Stop */}
          <button
            onClick={onStop}
            className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Stop playback"
          >
            <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
          </button>

          {/* Play / Pause */}
          <button
            onClick={onTogglePlay}
            className={`px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer shadow-lg active:scale-95 ${
              isPlaying
                ? "bg-[#a3ff12] text-black shadow-[0_0_15px_rgba(163,255,18,0.4)]"
                : "bg-white/10 hover:bg-white/20 text-white"
            }`}
            title="Play / Pause (Space)"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                <span className="text-xs">PAUSE</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current ml-0.5" />
                <span className="text-xs">PLAY</span>
              </>
            )}
          </button>

          {/* Record */}
          <button
            onClick={onToggleRecord}
            className={`px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 border ${
              isRecording
                ? "bg-rose-600 text-white border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.6)] animate-pulse"
                : "bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-300"
            }`}
            title="Record Guitar (R)"
          >
            <Circle className="w-3.5 h-3.5 fill-current" />
            <span className="text-xs">{isRecording ? "REC" : "REC"}</span>
          </button>

          {/* Loop */}
          <button
            onClick={onToggleLoop}
            className={`p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer border ${
              isLoopActive
                ? "bg-[#a3ff12]/20 text-[#a3ff12] border-[#a3ff12]/40 shadow-[0_0_10px_rgba(163,255,18,0.2)]"
                : "bg-white/5 text-zinc-400 border-transparent hover:text-white"
            }`}
            title="Loop timeline (L)"
          >
            <Repeat className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          {/* Metronome */}
          <button
            onClick={onToggleMetronome}
            className={`p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer border ${
              isMetronomeActive
                ? "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_10px_rgba(163,255,18,0.3)] font-bold"
                : "bg-white/5 text-zinc-400 border-transparent hover:text-white"
            }`}
            title="Metronome click (M)"
          >
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          {/* Time Display */}
          <div className="flex items-center gap-1.5 bg-black/60 border border-white/10 px-2.5 py-1 rounded-xl">
            <span className="text-[#a3ff12] font-bold text-[11px] sm:text-xs">
              {String(currentBar).padStart(2, "0")}:{currentBeat}.{String(currentTick).padStart(2, "0")}
            </span>
            <span className="text-zinc-600">|</span>
            <span className="text-zinc-300 text-[10px] sm:text-[11px]">{formatMinSec(playheadTimeSec)}</span>
          </div>
        </div>

        {/* Section 3: BPM, Grid Snap, Projects, Export */}
        <div className="flex items-center gap-2 shrink-0">
          {/* BPM & Tap */}
          <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-0.5">
            <div className="flex items-center px-1.5 py-0.5 gap-1">
              <span className="text-zinc-500 text-[9px] font-bold">BPM</span>
              <input
                type="number"
                min="40"
                max="240"
                value={bpm}
                onChange={(e) => onBpmChange(parseInt(e.target.value, 10) || 120)}
                className="w-8 bg-transparent text-center text-white font-bold outline-none text-xs"
              />
            </div>
            <button
              onClick={handleTapTempo}
              className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-lg text-[9px] font-bold cursor-pointer transition-colors"
              title="Tap Tempo"
            >
              TAP
            </button>
          </div>

          {/* Grid Snap Selector */}
          <div className="flex items-center bg-black/40 border border-white/10 rounded-xl px-1.5 py-0.5 gap-1">
            <Magnet className="w-3 h-3 text-[#a3ff12]" />
            <select
              value={gridSnap}
              onChange={(e) => onGridSnapChange(e.target.value as GridSnapSetting)}
              className="bg-transparent text-zinc-200 outline-none cursor-pointer text-[10.5px]"
            >
              <option value="1bar" className="bg-[#12151d] text-white">1 Bar</option>
              <option value="1beat" className="bg-[#12151d] text-white">1 Beat</option>
              <option value="1/2" className="bg-[#12151d] text-white">1/2</option>
              <option value="1/8" className="bg-[#12151d] text-white">1/8</option>
              <option value="1/16" className="bg-[#12151d] text-white">1/16</option>
              <option value="off" className="bg-[#12151d] text-white">Off</option>
            </select>
          </div>

          {/* Projects */}
          <button
            onClick={onOpenProjects}
            className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Projects</span>
          </button>

          {/* Export */}
          <button
            onClick={onOpenExport}
            className="px-3 py-1.5 bg-[#a3ff12]/20 hover:bg-[#a3ff12]/30 border border-[#a3ff12]/40 text-[#a3ff12] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_12px_rgba(163,255,18,0.15)]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Right Scroll Indicator Nudge */}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 z-20 flex items-center pl-2 bg-gradient-to-l from-[#0f121a] via-[#0f121a]/95 to-transparent">
          <button
            onClick={() => handleScrollNudge("right")}
            className="w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all shadow-sm cursor-pointer mr-1 animate-pulse"
            title="Scroll buttons right"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
