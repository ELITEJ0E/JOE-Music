import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  FileText,
  Printer,
  Download,
  Copy,
  Trash2,
  Undo2,
  RotateCcw,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Sparkles,
  Check,
  X,
  Eye,
  Sliders,
  ArrowLeft,
  Music,
  Clock,
  Key,
  Flame,
  HelpCircle,
} from "lucide-react";
import { ChordSegment, SavedSong, SongAnalysis } from "../types";
import { ChordDiagram } from "./ChordDiagram";
import { resolveGuitarChord, GuitarVoicingResult } from "../audio/guitarChordResolver";
import { resolveChordFinderState } from "../music/chordTransposer";
import { guitarSynth } from "../audio/guitarSynth";

interface ChordSheetViewProps {
  song: SavedSong | SongAnalysis;
  segments: ChordSegment[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  transpose: number;
  capo: number;
  onTransposeChange: (t: number | ((prev: number) => number)) => void;
  onCapoChange: (c: number | ((prev: number) => number)) => void;
  onClose: () => void;
  onUpdateSongSegments: (newSegments: ChordSegment[]) => Promise<void>;
  onRestoreOriginalChords?: () => void;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
}

export const ChordSheetView: React.FC<ChordSheetViewProps> = ({
  song,
  segments,
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onSeek,
  transpose,
  capo,
  onTransposeChange,
  onCapoChange,
  onClose,
  onUpdateSongSegments,
  onRestoreOriginalChords,
}) => {
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [undoStack, setUndoStack] = useState<{ segments: ChordSegment[]; deletedChord: string; time: string }[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const activeChordRef = useRef<HTMLDivElement | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // Format seconds to mm:ss
  const formatTime = (time: number) => {
    if (isNaN(time) || time < 0) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Find active segment index
  const activeSegmentIdx = useMemo(() => {
    if (!segments || segments.length === 0) return -1;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (currentTime >= seg.startTime && (currentTime < seg.endTime || i === segments.length - 1)) {
        return i;
      }
    }
    return 0;
  }, [currentTime, segments]);

  const activeSegment = segments[activeSegmentIdx];
  const activeResolvedChord = useMemo(() => {
    if (!activeSegment) return null;
    return resolveChordFinderState(activeSegment.chord, transpose, capo, song.key);
  }, [activeSegment, transpose, capo, song.key]);

  // Smooth auto-scroll to the currently active chord
  useEffect(() => {
    if (autoScroll && activeChordRef.current) {
      activeChordRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [activeSegmentIdx, autoScroll]);

  // Unique chords present in the current progression
  const uniqueChordSymbols = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();
    for (const seg of segments) {
      if (seg.chord && !seen.has(seg.chord)) {
        seen.add(seg.chord);
        list.push(seg.chord);
      }
    }
    return list;
  }, [segments]);

  // Resolve voicings for all unique chords
  const uniqueChordVoicings = useMemo(() => {
    return uniqueChordSymbols.map((rawChord) => {
      const state = resolveChordFinderState(rawChord, transpose, capo, song.key);
      const targetShape = capo > 0 && state.isValid ? state.shapeChord : state.transposedChord;
      const voicingResult: GuitarVoicingResult = resolveGuitarChord(targetShape, {
        keyContext: song.key,
        capo,
        detectedChord: rawChord,
      });

      return {
        rawChord,
        shapeChord: state.shapeChord,
        transposedChord: state.transposedChord,
        targetShape,
        voicingResult,
      };
    });
  }, [uniqueChordSymbols, transpose, capo, song.key]);

  // Show a temporary toast
  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Remove a specific chord segment
  const handleRemoveSegment = async (indexToRemove: number) => {
    if (segments.length <= 1) {
      showToast("Cannot remove the last remaining chord in the song.");
      return;
    }

    const removed = segments[indexToRemove];
    const prevSeg = segments[indexToRemove - 1];
    const nextSeg = segments[indexToRemove + 1];

    // Bridge the gap musically: stretch previous chord to cover removed segment,
    // or if the first segment is removed, stretch the next chord backward to 0.
    const newSegments: ChordSegment[] = [];

    for (let i = 0; i < segments.length; i++) {
      if (i === indexToRemove) continue;
      const seg = { ...segments[i] };

      if (i === indexToRemove - 1) {
        // Extend previous chord through the removed segment's end time
        seg.endTime = removed.endTime;
      } else if (indexToRemove === 0 && i === 1) {
        // If first segment was deleted, extend next chord backward to 0
        seg.startTime = 0;
      }
      newSegments.push(seg);
    }

    // Save to undo stack
    setUndoStack((prev) => [
      ...prev,
      {
        segments: [...segments],
        deletedChord: removed.chord,
        time: formatTime(removed.startTime),
      },
    ]);

    await onUpdateSongSegments(newSegments);
    showToast(`Removed chord ${removed.chord} at ${formatTime(removed.startTime)}. Saved.`);
  };

  // Undo the last removal
  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    await onUpdateSongSegments(lastAction.segments);
    showToast(`Restored chord ${lastAction.deletedChord} at ${lastAction.time}.`);
  };

  // Print sheet music
  const handlePrint = () => {
    window.print();
  };

  // Generate plain text / ChordPro sheet format
  const generateTextSheet = () => {
    let text = `${song.title || "Untitled Song"} - ${song.artist || "Unknown Artist"}\n`;
    text += `==========================================================\n`;
    text += `Key: ${song.key || "C"}  |  Tempo: ${song.tempo || 120} BPM  |  Capo: ${capo > 0 ? `Fret ${capo}` : "None"}\n`;
    text += `Tuning: ${song.tuning || "Standard E A D G B E"}  |  Time: ${song.timeSignature || "4/4"}\n`;
    text += `Total Duration: ${formatTime(duration)}\n\n`;

    text += `CHORD VOICINGS USED:\n`;
    uniqueChordVoicings.forEach((v) => {
      const frets = v.voicingResult.voicing?.frets.join(" ") || "N/A";
      text += `  * ${v.targetShape.padEnd(8)} (Frets: ${frets})\n`;
    });
    text += `\nCHORD PROGRESSION TIMELINE:\n`;
    segments.forEach((seg, idx) => {
      const state = resolveChordFinderState(seg.chord, transpose, capo, song.key);
      const chordLabel = capo > 0 && state.isValid ? state.shapeChord : state.transposedChord;
      const sounding = capo > 0 && state.isValid ? `(Sounding: ${state.transposedChord})` : "";
      const dur = (seg.endTime - seg.startTime).toFixed(1);
      text += `  [${formatTime(seg.startTime)}]  ${chordLabel.padEnd(10)} ${sounding.padEnd(20)} [${dur}s]\n`;
    });
    text += `\nGenerated with Guitar Studio AI Chord Finder\n`;
    return text;
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(generateTextSheet());
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
      showToast("Chord sheet copied to clipboard!");
    } catch {
      showToast("Unable to copy to clipboard.");
    }
  };

  const handleDownloadText = () => {
    const text = generateTextSheet();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(song.title || "chord-sheet").toLowerCase().replace(/[^a-z0-9]/g, "-")}-chords.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Chord sheet text file downloaded!");
  };

  const handleDownloadJSON = () => {
    const data = {
      title: song.title,
      artist: song.artist,
      key: song.key,
      tempo: song.tempo,
      capo,
      transpose,
      tuning: song.tuning,
      duration,
      uniqueChords: uniqueChordSymbols,
      progression: segments.map((s) => ({
        chord: s.chord,
        startTime: s.startTime,
        endTime: s.endTime,
        duration: +(s.endTime - s.startTime).toFixed(2),
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(song.title || "chord-sheet").toLowerCase().replace(/[^a-z0-9]/g, "-")}-data.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Chord data JSON downloaded!");
  };

  return (
    <div className="min-h-screen bg-[#090b0e] text-white pb-28 pt-2 px-2 sm:px-6 relative print:bg-white print:p-0 print:m-0 print:text-black">
      {/* Top Navigation & Toolbar (hidden during print) */}
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3 mb-6 bg-[#13161c]/90 border border-white/10 rounded-2xl p-3 sm:p-4 backdrop-blur-md sticky top-2 z-30 shadow-xl print:hidden">
        {/* Left: Back button & Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 text-xs font-mono font-bold transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#a3ff12]" />
            <span>Back to Studio</span>
          </button>

          <div className="h-4 w-px bg-white/10 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3 h-3 text-[#a3ff12]" />
              White Sheet View
            </span>
            {undoStack.length > 0 && (
              <button
                onClick={handleUndo}
                className="px-2 py-0.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-[10px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer"
                title="Undo last removed chord"
              >
                <Undo2 className="w-3 h-3" />
                <span>Undo ({undoStack.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Actions (Auto-scroll, Export, Print) */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              autoScroll
                ? "bg-[#a3ff12]/15 border-[#a3ff12]/40 text-[#a3ff12]"
                : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
            }`}
            title="Auto-scroll to currently playing chord"
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Follow Music:</span>
            <span className="font-bold">{autoScroll ? "ON" : "OFF"}</span>
          </button>

          {/* Export button */}
          <button
            onClick={() => setShowExportModal(true)}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Export</span>
          </button>

          {/* Print button */}
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 rounded-xl bg-[#a3ff12] hover:bg-[#92eb10] text-black font-mono font-bold text-xs flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(163,255,18,0.25)] cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-[#181c24] text-white border border-[#a3ff12]/40 shadow-2xl rounded-2xl px-4 py-2.5 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200 text-xs font-mono">
          <Sparkles className="w-4 h-4 text-[#a3ff12] shrink-0" />
          <span>{toastMessage}</span>
          {undoStack.length > 0 && (
            <button
              onClick={handleUndo}
              className="text-[#a3ff12] underline font-bold hover:text-white ml-1 cursor-pointer"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* THE WHITE SHEET OF PAPER (Real Music Lead Sheet / Songbook Presentation) */}
      {/* ========================================================================= */}
      <div className="max-w-4xl mx-auto bg-white text-zinc-900 rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] border border-zinc-200/90 p-6 sm:p-10 my-4 print:shadow-none print:border-none print:p-0 print:m-0 print:rounded-none">
        {/* Paper Header */}
        <div className="border-b-2 border-zinc-900 pb-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-zinc-950 tracking-tight font-serif">
                {song.title || "Untitled Lead Sheet"}
              </h1>
              <p className="text-sm sm:text-base font-semibold text-zinc-600 mt-1">
                {song.artist ? `Arranged for Guitar • ${song.artist}` : "Guitar Chord Lead Sheet"}
              </p>
            </div>
            <div className="text-left sm:text-right shrink-0">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-bold block">
                Standard Lead Sheet
              </span>
              <span className="text-xs font-mono font-bold text-zinc-700">
                {segments.length} Chords • {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Song Metadata Specs Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4 pt-3 border-t border-zinc-200 text-xs font-mono">
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-2">
              <span className="text-[10px] text-zinc-400 block font-bold uppercase">Key</span>
              <span className="text-sm font-extrabold text-zinc-900">{song.key || "C Major"}</span>
            </div>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-2">
              <span className="text-[10px] text-zinc-400 block font-bold uppercase">Tempo</span>
              <span className="text-sm font-extrabold text-zinc-900">{song.tempo || 120} BPM</span>
            </div>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-2">
              <span className="text-[10px] text-zinc-400 block font-bold uppercase">Capo</span>
              <span className={`text-sm font-extrabold ${capo > 0 ? "text-sky-600" : "text-zinc-900"}`}>
                {capo > 0 ? `Fret ${capo}` : "No Capo"}
              </span>
            </div>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-2">
              <span className="text-[10px] text-zinc-400 block font-bold uppercase">Tuning</span>
              <span className="text-sm font-extrabold text-zinc-900">{song.tuning || "Standard"}</span>
            </div>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-2 col-span-2 sm:col-span-1">
              <span className="text-[10px] text-zinc-400 block font-bold uppercase">Time Sig</span>
              <span className="text-sm font-extrabold text-zinc-900">{song.timeSignature || "4/4"}</span>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* CHORD DIAGRAMS ABOVE: Unique Chord Voicings Gallery on the White Page */}
        {/* =================================================================== */}
        <div className="mb-8 bg-zinc-50/80 border border-zinc-200 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3 border-b border-zinc-200 pb-2">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-zinc-800" />
              <h2 className="text-xs font-mono font-black uppercase tracking-wider text-zinc-900">
                Chord Diagrams ({uniqueChordVoicings.length} Unique)
              </h2>
            </div>
            <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
              Click any diagram to hear strum preview
            </span>
          </div>

          {/* Chord Diagrams Row */}
          <div className="flex flex-wrap items-stretch gap-3 sm:gap-4 overflow-x-auto pb-1">
            {uniqueChordVoicings.map(({ rawChord, targetShape, transposedChord, voicingResult }) => {
              const isCurrentlyPlaying =
                activeResolvedChord?.isValid &&
                (capo > 0
                  ? activeResolvedChord.shapeChord === targetShape
                  : activeResolvedChord.transposedChord === targetShape);

              return (
                <div
                  key={rawChord}
                  onClick={() => {
                    if (voicingResult.voicing) {
                      guitarSynth.strumChord(voicingResult.voicing.frets, "down", 24, capo);
                    }
                  }}
                  className={`group relative rounded-xl p-2.5 sm:p-3 transition-all duration-200 cursor-pointer flex flex-col items-center justify-between border ${
                    isCurrentlyPlaying
                      ? "bg-emerald-50 border-emerald-500 shadow-md ring-2 ring-emerald-500/20 scale-[1.03]"
                      : "bg-white hover:bg-zinc-100/80 border-zinc-200 shadow-sm"
                  } min-w-[125px] sm:min-w-[140px]`}
                  title={`Click to hear ${targetShape} strum`}
                >
                  {/* Top Badge: Chord Name */}
                  <div className="flex items-center justify-between w-full mb-1 text-center">
                    <span
                      className={`text-base sm:text-lg font-black font-mono transition-colors ${
                        isCurrentlyPlaying ? "text-emerald-700" : "text-zinc-900 group-hover:text-zinc-950"
                      }`}
                    >
                      {targetShape}
                    </span>
                    {isCurrentlyPlaying && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[8px] font-mono font-bold tracking-wider animate-pulse">
                        NOW PLAYING
                      </span>
                    )}
                  </div>

                  {/* Sounding pitch if capo */}
                  {capo > 0 && transposedChord !== targetShape && (
                    <span className="text-[9px] font-mono font-medium text-sky-700 mb-1">
                      Sounding: {transposedChord}
                    </span>
                  )}

                  {/* Chord Diagram with theme="light" */}
                  <div className="w-full flex items-center justify-center h-[130px] sm:h-[145px]">
                    {voicingResult.voicing ? (
                      <ChordDiagram
                        frets={voicingResult.voicing.frets}
                        fingers={voicingResult.voicing.fingers}
                        barre={voicingResult.voicing.barre}
                        position={voicingResult.voicing.baseFret}
                        cagedShape={voicingResult.voicing.cagedShape}
                        capo={capo}
                        size="xs"
                        theme="light"
                        className="max-h-full max-w-full"
                      />
                    ) : (
                      <div className="text-[10px] font-mono text-zinc-400 text-center py-6">
                        No diagram
                      </div>
                    )}
                  </div>

                  {/* Subtle strum icon hint */}
                  <div className="mt-1 flex items-center gap-1 text-[9px] font-mono text-zinc-500 group-hover:text-zinc-900 transition-colors">
                    <Play className="w-2.5 h-2.5 fill-current" />
                    <span>Preview</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* =================================================================== */}
        {/* CHORD PROGRESSION & TIMESTAMPS: Real-time Synchronized Lead Sheet   */}
        {/* =================================================================== */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-800" />
              <h2 className="text-xs font-mono font-black uppercase tracking-wider text-zinc-900">
                Timeline Progression ({segments.length} chord segments)
              </h2>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">
              Click any chord to seek audio • Hover to remove
            </span>
          </div>

          {/* Grid of Chord Tiles with Timestamps */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
            {segments.map((seg, idx) => {
              const state = resolveChordFinderState(seg.chord, transpose, capo, song.key);
              const chordLabel = capo > 0 && state.isValid ? state.shapeChord : state.transposedChord;
              const isActive = idx === activeSegmentIdx;
              const segDuration = (seg.endTime - seg.startTime).toFixed(1);

              return (
                <div
                  key={seg.id || `chord-${idx}-${seg.startTime}`}
                  ref={isActive ? activeChordRef : null}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => onSeek(seg.startTime)}
                  className={`group relative rounded-xl p-3 border transition-all duration-150 cursor-pointer flex flex-col justify-between ${
                    isActive
                      ? "bg-amber-100/90 border-amber-600 shadow-md ring-2 ring-amber-500/30 scale-[1.02] text-zinc-950 font-black"
                      : "bg-zinc-50/70 hover:bg-zinc-100/90 border-zinc-200/90 text-zinc-800"
                  }`}
                  title={`Jump to ${chordLabel} at ${formatTime(seg.startTime)}`}
                >
                  {/* Top Bar: Timestamp and Duration */}
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mb-1">
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold ${
                        isActive
                          ? "bg-amber-600 text-white font-mono"
                          : "bg-zinc-200 text-zinc-700"
                      }`}
                    >
                      {formatTime(seg.startTime)}
                    </span>
                    <span className="text-[9.5px] font-mono font-medium">{segDuration}s</span>
                  </div>

                  {/* Center: Bold Chord Symbol */}
                  <div className="py-1 text-center">
                    <span
                      className={`text-2xl sm:text-3xl font-mono font-black tracking-tight transition-transform ${
                        isActive ? "text-amber-950 scale-105 inline-block" : "text-zinc-900"
                      }`}
                    >
                      {chordLabel}
                    </span>
                    {capo > 0 && state.isValid && state.shapeChord !== state.transposedChord && (
                      <span className="block text-[9.5px] font-mono font-semibold text-sky-700 truncate">
                        Sounding: {state.transposedChord}
                      </span>
                    )}
                  </div>

                  {/* Bottom: Play Indicator or Remove Button */}
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60 mt-1">
                    <span
                      className={`text-[9.5px] font-mono flex items-center gap-1 ${
                        isActive ? "text-amber-800 font-bold" : "text-zinc-400 group-hover:text-zinc-600"
                      }`}
                    >
                      {isActive ? (
                        <>
                          <Play className="w-2.5 h-2.5 fill-current text-amber-800 animate-pulse" />
                          <span>PLAYING</span>
                        </>
                      ) : (
                        <span>Seek</span>
                      )}
                    </span>

                    {/* Remove Chord Button (visible on hover or print:hidden) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSegment(idx);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-all cursor-pointer print:hidden"
                      title="Remove this chord from song (saves automatically)"
                      aria-label="Remove chord"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Paper Footer Note */}
        <div className="mt-10 pt-4 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-zinc-500 gap-2">
          <span>Generated with Guitar Studio • Real-Time AI Chord Recognition</span>
          <span>Press Space to Play/Pause • Click any chord to seek</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FLOATING PLAYBACK DOCK (Pinned at Bottom, hidden on print)               */}
      {/* ========================================================================= */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-2xl bg-[#0d1015]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-3 flex flex-col gap-2 text-white print:hidden">
        {/* Scrubber track */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-zinc-400 w-10 text-right shrink-0">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.05}
            value={Math.min(duration || 1, Math.max(0, currentTime))}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="flex-1 accent-[#a3ff12] h-1.5 bg-white/10 rounded-lg cursor-pointer"
          />
          <span className="text-[11px] font-mono text-zinc-400 w-10 text-left shrink-0">
            {formatTime(duration)}
          </span>
        </div>

        {/* Playback Controls & Transpose/Capo Quick Controls */}
        <div className="flex items-center justify-between">
          {/* Left: Quick Transpose & Capo */}
          <div className="flex items-center gap-2 text-xs font-mono">
            {/* Transpose button */}
            <div className="flex items-center bg-white/5 border border-white/10 rounded-lg px-2 py-1 gap-1.5">
              <span className="text-[10px] text-zinc-400 font-bold uppercase">Trans:</span>
              <button
                onClick={() => onTransposeChange((t) => Math.max(-12, t - 1))}
                className="w-4 h-4 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-[11px] cursor-pointer"
              >
                -
              </button>
              <span className={`font-bold ${transpose !== 0 ? "text-[#a3ff12]" : "text-white"}`}>
                {transpose > 0 ? `+${transpose}` : transpose}
              </span>
              <button
                onClick={() => onTransposeChange((t) => Math.min(12, t + 1))}
                className="w-4 h-4 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-[11px] cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Capo button */}
            <div className="flex items-center bg-white/5 border border-white/10 rounded-lg px-2 py-1 gap-1.5">
              <span className="text-[10px] text-zinc-400 font-bold uppercase">Capo:</span>
              <button
                onClick={() => onCapoChange((c) => Math.max(0, c - 1))}
                className="w-4 h-4 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-[11px] cursor-pointer"
              >
                -
              </button>
              <span className={`font-bold ${capo > 0 ? "text-sky-400" : "text-white"}`}>
                {capo > 0 ? capo : 0}
              </span>
              <button
                onClick={() => onCapoChange((c) => Math.min(12, c + 1))}
                className="w-4 h-4 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-[11px] cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {/* Center: Transport Play/Pause, Rewind, Fast-Forward */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSeek(Math.max(0, currentTime - 4))}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Rewind 4s"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={onPlayPause}
              className="w-10 h-10 rounded-xl bg-[#a3ff12] hover:bg-[#92eb10] text-black flex items-center justify-center shadow-[0_0_15px_rgba(163,255,18,0.4)] transition-all cursor-pointer"
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
            </button>

            <button
              onClick={() => onSeek(Math.min(duration, currentTime + 4))}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Forward 4s"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Right: Active chord badge */}
          <div className="text-right">
            {activeResolvedChord && activeResolvedChord.isValid ? (
              <span className="px-2.5 py-1 rounded-lg bg-[#a3ff12]/20 border border-[#a3ff12]/30 text-[#a3ff12] font-mono font-bold text-xs">
                {capo > 0 ? activeResolvedChord.shapeChord : activeResolvedChord.transposedChord}
              </span>
            ) : (
              <span className="text-[10px] font-mono text-zinc-500">Ready</span>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* EXPORT MODAL                                                             */}
      {/* ========================================================================= */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#13161c] border border-white/15 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-[#a3ff12]" />
                <h3 className="text-base font-bold font-mono text-white">Export Chords & Sheet</h3>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs font-mono text-zinc-400">
              Export your custom chord progression for <strong>{song.title}</strong> in print-ready, text, or data formats.
            </p>

            <div className="space-y-3">
              {/* Option 1: Print / PDF */}
              <button
                onClick={() => {
                  setShowExportModal(false);
                  setTimeout(() => window.print(), 200);
                }}
                className="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    <Printer className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold font-mono text-white group-hover:text-purple-300">
                      Print / Save as PDF
                    </h4>
                    <p className="text-[10px] font-mono text-zinc-400">
                      Print the crisp white sheet or save as a digital PDF
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-zinc-400">Print &rarr;</span>
              </button>

              {/* Option 2: Copy to Clipboard */}
              <button
                onClick={handleCopyText}
                className="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Copy className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold font-mono text-white group-hover:text-emerald-300">
                      {copiedText ? "Copied!" : "Copy as Text Sheet"}
                    </h4>
                    <p className="text-[10px] font-mono text-zinc-400">
                      Copy formatted timestamps and chord chart to clipboard
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-[#a3ff12]">
                  {copiedText ? <Check className="w-4 h-4 text-[#a3ff12]" /> : "Copy &rarr;"}
                </span>
              </button>

              {/* Option 3: Download .txt */}
              <button
                onClick={handleDownloadText}
                className="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold font-mono text-white group-hover:text-sky-300">
                      Download Plain Text (.txt)
                    </h4>
                    <p className="text-[10px] font-mono text-zinc-400">
                      Standard ChordPro style text file for guitarists
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-zinc-400">.txt &rarr;</span>
              </button>

              {/* Option 4: Download JSON */}
              <button
                onClick={handleDownloadJSON}
                className="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold font-mono text-white group-hover:text-amber-300">
                      Download JSON Data (.json)
                    </h4>
                    <p className="text-[10px] font-mono text-zinc-400">
                      Structured timestamps and musical chords dataset
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-zinc-400">.json &rarr;</span>
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
