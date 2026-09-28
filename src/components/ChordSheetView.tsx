import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  FileText,
  Printer,
  Download,
  Copy,
  Trash2,
  Undo2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Sparkles,
  Check,
  X,
  Clock,
  Music,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Tag,
  Edit3,
  Layers,
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

// Preset section tags
const PRESET_SECTION_TAGS = [
  "Intro",
  "Verse 1",
  "Verse 2",
  "Pre-Chorus",
  "Chorus",
  "Bridge",
  "Solo",
  "Outro",
  "Interlude",
  "Hook",
];

// Color mapping for common section tags in clean paper lead sheet styling
const getSectionBadgeStyle = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("chorus") || lower.includes("hook")) {
    return {
      badgeBg: "bg-amber-100 text-amber-900 border-amber-300",
      accentBorder: "border-l-amber-500",
      dot: "bg-amber-500",
      headerBg: "bg-amber-50/60",
    };
  }
  if (lower.includes("verse")) {
    return {
      badgeBg: "bg-emerald-100 text-emerald-900 border-emerald-300",
      accentBorder: "border-l-emerald-500",
      dot: "bg-emerald-600",
      headerBg: "bg-emerald-50/60",
    };
  }
  if (lower.includes("bridge")) {
    return {
      badgeBg: "bg-purple-100 text-purple-900 border-purple-300",
      accentBorder: "border-l-purple-500",
      dot: "bg-purple-500",
      headerBg: "bg-purple-50/60",
    };
  }
  if (lower.includes("intro")) {
    return {
      badgeBg: "bg-sky-100 text-sky-900 border-sky-300",
      accentBorder: "border-l-sky-500",
      dot: "bg-sky-500",
      headerBg: "bg-sky-50/60",
    };
  }
  if (lower.includes("outro")) {
    return {
      badgeBg: "bg-rose-100 text-rose-900 border-rose-300",
      accentBorder: "border-l-rose-500",
      dot: "bg-rose-500",
      headerBg: "bg-rose-50/60",
    };
  }
  if (lower.includes("solo") || lower.includes("interlude")) {
    return {
      badgeBg: "bg-cyan-100 text-cyan-900 border-cyan-300",
      accentBorder: "border-l-cyan-500",
      dot: "bg-cyan-600",
      headerBg: "bg-cyan-50/60",
    };
  }
  return {
    badgeBg: "bg-zinc-100 text-zinc-900 border-zinc-300",
    accentBorder: "border-l-zinc-700",
    dot: "bg-zinc-700",
    headerBg: "bg-zinc-50/70",
  };
};

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
}) => {
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showDiagrams, setShowDiagrams] = useState<boolean>(true);
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [undoStack, setUndoStack] = useState<{
    segments: ChordSegment[];
    description: string;
  }[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Tag modal & inline prompt state
  const [tagModalChordIdx, setTagModalChordIdx] = useState<number | null>(null);
  const [customTagName, setCustomTagName] = useState<string>("");
  const [editingSectionIdx, setEditingSectionIdx] = useState<number | null>(null);
  const [editSectionNameInput, setEditSectionNameInput] = useState<string>("");

  const activeChordRef = useRef<HTMLDivElement | null>(null);
  const activeDiagramCardRef = useRef<HTMLDivElement | null>(null);
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

  // Map for fast O(1) lookup of resolved voicings by raw chord string
  const chordVoicingMap = useMemo(() => {
    const map = new Map<string, GuitarVoicingResult>();
    uniqueChordVoicings.forEach((v) => {
      map.set(v.rawChord, v.voicingResult);
    });
    return map;
  }, [uniqueChordVoicings]);

  // Smooth auto-scroll to the currently active chord
  useEffect(() => {
    if (!autoScroll) return;

    // Smoothly scroll active chord into view near the top of the screen
    if (activeChordRef.current) {
      activeChordRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [activeSegmentIdx, autoScroll]);

  // Group segments into sections based on `seg.section`
  interface SectionGroup {
    name: string;
    startIndex: number;
    endIndex: number;
    startTime: number;
    endTime: number;
    items: { seg: ChordSegment; originalIndex: number }[];
  }

  const sections: SectionGroup[] = useMemo(() => {
    if (!segments || segments.length === 0) return [];

    const groups: SectionGroup[] = [];
    let currentGroup: SectionGroup = {
      name: segments[0].section || "Verse 1",
      startIndex: 0,
      endIndex: 0,
      startTime: segments[0].startTime,
      endTime: segments[0].endTime,
      items: [{ seg: segments[0], originalIndex: 0 }],
    };

    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.section) {
        groups.push(currentGroup);
        currentGroup = {
          name: seg.section,
          startIndex: i,
          endIndex: i,
          startTime: seg.startTime,
          endTime: seg.endTime,
          items: [{ seg, originalIndex: i }],
        };
      } else {
        currentGroup.endIndex = i;
        currentGroup.endTime = seg.endTime;
        currentGroup.items.push({ seg, originalIndex: i });
      }
    }
    groups.push(currentGroup);
    return groups;
  }, [segments]);

  // Determine which section is currently playing
  const activeSectionIdx = useMemo(() => {
    if (activeSegmentIdx === -1) return -1;
    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];
      if (activeSegmentIdx >= sec.startIndex && activeSegmentIdx <= sec.endIndex) {
        return s;
      }
    }
    return 0;
  }, [activeSegmentIdx, sections]);

  // Show a temporary toast
  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Remove a specific chord segment
  const handleRemoveSegment = async (indexToRemove: number) => {
    if (segments.length <= 1) {
      showToast("Cannot remove the last remaining chord in the song.");
      return;
    }

    const removed = segments[indexToRemove];
    const newSegments: ChordSegment[] = [];

    for (let i = 0; i < segments.length; i++) {
      if (i === indexToRemove) continue;
      const seg = { ...segments[i] };

      if (i === indexToRemove - 1) {
        seg.endTime = removed.endTime;
      } else if (indexToRemove === 0 && i === 1) {
        seg.startTime = 0;
        if (removed.section && !seg.section) {
          seg.section = removed.section;
        }
      }
      newSegments.push(seg);
    }

    setUndoStack((prev) => [
      ...prev,
      {
        segments: [...segments],
        description: `Removed chord ${removed.chord}`,
      },
    ]);

    await onUpdateSongSegments(newSegments);
    showToast(`Removed chord ${removed.chord} at ${formatTime(removed.startTime)}.`);
  };

  // Add / Change section tag for a specific chord index
  const handleSetSectionTag = async (chordIndex: number, tagName: string) => {
    const cleanName = tagName.trim();
    if (!cleanName) return;

    const newSegments = segments.map((seg, idx) => {
      if (idx === chordIndex) {
        return { ...seg, section: cleanName };
      }
      return seg;
    });

    setUndoStack((prev) => [
      ...prev,
      {
        segments: [...segments],
        description: `Tagged section "${cleanName}"`,
      },
    ]);

    await onUpdateSongSegments(newSegments);
    setTagModalChordIdx(null);
    setCustomTagName("");
    showToast(`Added section tag "${cleanName}" at ${formatTime(segments[chordIndex].startTime)}.`);
  };

  // Remove section tag (merge section into previous)
  const handleRemoveSectionTag = async (sectionIndex: number) => {
    const targetSection = sections[sectionIndex];
    if (!targetSection) return;

    const chordIdx = targetSection.startIndex;
    const newSegments = segments.map((seg, idx) => {
      if (idx === chordIdx) {
        const { section, ...rest } = seg;
        return rest as ChordSegment;
      }
      return seg;
    });

    setUndoStack((prev) => [
      ...prev,
      {
        segments: [...segments],
        description: `Removed section tag "${targetSection.name}"`,
      },
    ]);

    await onUpdateSongSegments(newSegments);
    showToast(`Merged section "${targetSection.name}".`);
  };

  // Rename a section
  const handleRenameSection = async (sectionIndex: number, newName: string) => {
    const targetSection = sections[sectionIndex];
    if (!targetSection) return;
    const cleanName = newName.trim();
    if (!cleanName) return;

    const chordIdx = targetSection.startIndex;
    const newSegments = segments.map((seg, idx) => {
      if (idx === chordIdx) {
        return { ...seg, section: cleanName };
      }
      return seg;
    });

    await onUpdateSongSegments(newSegments);
    setEditingSectionIdx(null);
    showToast(`Renamed section to "${cleanName}".`);
  };

  // Auto-template sections (Verse 1, Chorus, Verse 2, Bridge)
  const handleApplyPresetSections = async () => {
    if (segments.length < 4) {
      showToast("Song is too short for auto-template sections.");
      return;
    }

    const count = segments.length;
    const newSegments = [...segments];

    newSegments[0] = { ...newSegments[0], section: "Verse 1" };

    if (count >= 16) {
      const q1 = Math.floor(count * 0.25);
      const q2 = Math.floor(count * 0.5);
      const q3 = Math.floor(count * 0.75);

      newSegments[q1] = { ...newSegments[q1], section: "Chorus" };
      newSegments[q2] = { ...newSegments[q2], section: "Verse 2" };
      newSegments[q3] = { ...newSegments[q3], section: "Bridge" };
    } else if (count >= 8) {
      const mid = Math.floor(count * 0.5);
      newSegments[mid] = { ...newSegments[mid], section: "Chorus" };
    }

    setUndoStack((prev) => [
      ...prev,
      {
        segments: [...segments],
        description: "Applied section template",
      },
    ]);

    await onUpdateSongSegments(newSegments);
    showToast("Template sections added! You can rename or customize tags anytime.");
  };

  // Undo the last removal or section change
  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    await onUpdateSongSegments(lastAction.segments);
    showToast(`Undone: ${lastAction.description}.`);
  };

  // Print pristine lead sheet across multiple pages without webpage UI
  const handlePrint = () => {
    const printableArea = document.getElementById("chord-sheet-printable");
    if (!printableArea) {
      window.print();
      return;
    }

    // Create an isolated hidden iframe for printing clean multi-page document
    const iframe = document.createElement("iframe");
    iframe.setAttribute("id", "print-lead-sheet-iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) {
      window.print();
      return;
    }

    // Clone the printable sheet content and strip interactive UI buttons
    const clone = printableArea.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("button").forEach((b) => b.remove());
    clone.querySelectorAll(".print\\:hidden, .print-hidden, [role='button']").forEach((el) => el.remove());

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>${song.title || "Chord Sheet"} - Guitar Lead Sheet</title>
          <style>
            @page {
              size: auto;
              margin: 14mm 16mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              background: #ffffff !important;
              color: #111827 !important;
              margin: 0;
              padding: 0;
              font-size: 12px;
            }
            h1, h2, h3, p {
              margin: 0;
              color: #000000;
            }
            .font-mono {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            }
            .font-bold { font-weight: 700; }
            .font-black { font-weight: 900; }
            .uppercase { text-transform: uppercase; }

            /* Break rules to prevent breaking elements across page cuts */
            section, .section-block, [aria-label="Chord Voicings"] {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin-bottom: 20px;
            }

            /* Container resets */
            #chord-sheet-printable {
              box-shadow: none !important;
              border: none !important;
              padding: 0 !important;
              margin: 0 !important;
              max-width: 100% !important;
              width: 100% !important;
            }

            /* Chords layout for print */
            .grid {
              display: grid !important;
              grid-template-columns: repeat(4, 1fr) !important;
              gap: 10px !important;
            }

            .group {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              border: 1px solid #d1d5db !important;
              border-radius: 8px !important;
              padding: 8px !important;
              background: #ffffff !important;
            }

            /* Diagrams sizing */
            svg {
              max-width: 100% !important;
              height: auto !important;
            }

            button, .print-hidden {
              display: none !important;
            }
          </style>
        </head>
        <body>
          ${clone.outerHTML}
        </body>
      </html>
    `);
    iframeDoc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.print();
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 3000);
      }
    }, 250);
  };

  // Generate plain text / ChordPro sheet format with section tags
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
    text += `\nCHORD PROGRESSION & SECTIONS:\n`;

    sections.forEach((sec) => {
      text += `\n[${sec.name.toUpperCase()}] (${formatTime(sec.startTime)} - ${formatTime(sec.endTime)})\n`;
      sec.items.forEach(({ seg }) => {
        const state = resolveChordFinderState(seg.chord, transpose, capo, song.key);
        const chordLabel = capo > 0 && state.isValid ? state.shapeChord : state.transposedChord;
        const sounding = capo > 0 && state.isValid ? `(Sounding: ${state.transposedChord})` : "";
        const dur = (seg.endTime - seg.startTime).toFixed(1);
        text += `  [${formatTime(seg.startTime)}]  ${chordLabel.padEnd(8)} ${sounding.padEnd(18)} [${dur}s]\n`;
      });
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
      sections: sections.map((sec) => ({
        name: sec.name,
        startTime: sec.startTime,
        endTime: sec.endTime,
        chords: sec.items.map((i) => i.seg.chord),
      })),
      progression: segments.map((s) => ({
        chord: s.chord,
        section: s.section,
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
    <div className="min-h-screen bg-[#0c0e12] pb-52 sm:pb-40 pt-1 px-1 sm:px-4 md:px-6 relative print:bg-white print:p-0 print:m-0 print:text-black">
      {/* ========================================================================= */}
      {/* TOP SECTION BAR (AT TOP & NO LONGER STICKY FOR BOTH DESKTOP AND MOBILE)   */}
      {/* ========================================================================= */}
      {/*
        Per user request:
        "make it like previous and like current mobile view, where its at the top no longer sticky"
        It sits at the top in normal/relative flow so it scrolls off naturally as the user scrolls down!
      */}
      <header className="relative max-w-4xl mx-auto flex items-center justify-between gap-1.5 sm:gap-2 mb-3 bg-[#151922] border border-white/10 rounded-2xl px-2.5 py-1.5 sm:px-4 sm:py-2.5 text-white shadow-md print:hidden">
        {/* Left: Back to Studio & Sheet View badge */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 text-xs font-mono font-bold transition-all cursor-pointer shrink-0"
            title="Return to standard studio"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#a3ff12]" />
            <span>Back to Studio</span>
          </button>

          <div className="h-4 w-px bg-white/10 shrink-0 hidden sm:block" />

          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-zinc-300 font-mono text-[10.5px] sm:text-xs font-bold shrink-0 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#a3ff12]" />
              <span>Sheet View</span>
            </span>
          </div>
        </div>

        {/* Right: Actions (Undo, Follow Music, Export, Print Sheet) */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {undoStack.length > 0 && (
            <button
              onClick={handleUndo}
              className="px-2 py-1 sm:px-2.5 sm:py-1 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-[10.5px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer"
              title="Undo last change"
            >
              <Undo2 className="w-3 h-3" />
              <span className="hidden sm:inline">Undo</span>
            </button>
          )}

          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2 py-1 sm:px-2.5 sm:py-1 rounded-xl border text-[10.5px] sm:text-[11px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
              autoScroll
                ? "bg-[#a3ff12]/15 border-[#a3ff12]/40 text-[#a3ff12]"
                : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
            }`}
            title="Auto-scroll to currently playing chord"
          >
            <Clock className="w-3 h-3" />
            <span className="hidden md:inline">Follow Music:</span>
            <span>{autoScroll ? "ON" : "OFF"}</span>
          </button>

          {/* Export button */}
          <button
            onClick={() => setShowExportModal(true)}
            className="px-2 py-1 sm:px-2.5 sm:py-1 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 text-[10.5px] sm:text-[11px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer"
            title="Export / Share Chords"
          >
            <Download className="w-3 h-3 text-sky-400" />
            <span>Export</span>
          </button>

          {/* Print Sheet Button (Vibrant neon green matching user image) */}
          <button
            onClick={handlePrint}
            className="px-2.5 py-1 sm:px-3 sm:py-1 rounded-xl bg-[#a3ff12] hover:bg-[#92eb10] text-black font-mono font-extrabold text-[10.5px] sm:text-[11px] flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
            title="Print multi-page lead sheet or save as PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet</span>
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 right-3 sm:right-6 z-50 bg-[#161a22] text-white border border-[#a3ff12]/40 shadow-2xl rounded-2xl px-3.5 py-2 flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200 text-xs font-mono max-w-xs sm:max-w-sm">
          <Sparkles className="w-3.5 h-3.5 text-[#a3ff12] shrink-0" />
          <span className="truncate flex-1">{toastMessage}</span>
          {undoStack.length > 0 && (
            <button
              onClick={handleUndo}
              className="text-[#a3ff12] underline font-bold hover:text-white shrink-0 cursor-pointer text-[11px]"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* THE WHITE SHEET (Crisp Music Paper Lead Sheet with Grid Layout)           */}
      {/* ========================================================================= */}
      <main
        id="chord-sheet-printable"
        className="max-w-4xl mx-auto bg-white rounded-2xl sm:rounded-3xl border border-zinc-200/90 shadow-2xl shadow-black/40 p-3 sm:p-6 md:p-8 space-y-4 sm:space-y-5 text-zinc-900 print:shadow-none print:border-none print:p-0 print:m-0 print:rounded-none printable-chord-sheet"
      >
        {/* Lead Sheet Title Header & Metadata Strip */}
        <section aria-label="Song Header" className="border-b-2 border-zinc-900 pb-3 sm:pb-4">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-zinc-900 tracking-tight font-mono truncate">
                {song.title || "Untitled Song"}
              </h1>
              {song.artist && (
                <p className="text-xs sm:text-sm font-mono text-zinc-600 font-medium truncate mt-0.5">
                  {song.artist}
                </p>
              )}
            </div>

            {/* Quick Metadata Badges Strip */}
            <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono">
              <span className="px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-300 text-zinc-800 font-bold">
                Key: <strong className="text-zinc-950">{song.key || "C"}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-300 text-zinc-800 font-bold">
                {song.tempo || 120} BPM
              </span>
              {capo > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-300 text-sky-800 font-extrabold">
                  Capo {capo}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-200 text-zinc-600 hidden sm:inline">
                {song.timeSignature || "4/4"}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-200 text-zinc-600">
                {segments.length} Chords • {formatTime(duration)}
              </span>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* CHORD DIAGRAMS SECTION (Matches user screenshot, clean paper grid)        */}
        {/* ========================================================================= */}
        <section
          aria-label="Chord Voicings"
          className="bg-white border border-zinc-200/90 rounded-2xl p-3 sm:p-4 shadow-xs transition-all print:border-zinc-300"
        >
          {/* Header Row: Title & Strum preview hint & Collapse toggle */}
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-zinc-100">
            <div
              onClick={() => setShowDiagrams(!showDiagrams)}
              className="flex items-center gap-2 cursor-pointer select-none group"
            >
              <Music className="w-4 h-4 text-emerald-700" />
              <h2 className="text-xs sm:text-sm font-mono font-bold tracking-tight text-zinc-900 group-hover:text-emerald-700 transition-colors">
                ♫ CHORD DIAGRAMS ({uniqueChordVoicings.length} UNIQUE)
              </h2>
              {showDiagrams ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600" />
              )}
            </div>

            <span className="text-[10px] sm:text-[11px] font-mono text-zinc-500 hidden sm:inline">
              Click any diagram to hear strum preview
            </span>
          </div>

          {/* Unique Chord Diagram Cards Grid (Wrapping naturally like song sections, no inline scroll) */}
          {showDiagrams && (
            <div className="pt-3 animate-in fade-in duration-150">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-2.5">
                {uniqueChordVoicings.map(({ rawChord, targetShape, voicingResult }) => {
                  const isCurrentlyPlaying =
                    activeResolvedChord?.isValid &&
                    (capo > 0
                      ? activeResolvedChord.shapeChord === targetShape
                      : activeResolvedChord.transposedChord === targetShape);

                  return (
                    <div
                      key={rawChord}
                      ref={isCurrentlyPlaying ? activeDiagramCardRef : null}
                      onClick={() => {
                        if (voicingResult.voicing) {
                          guitarSynth.strumChord(voicingResult.voicing.frets, "down", 24, capo);
                        }
                      }}
                      className={`group relative rounded-2xl p-2 sm:p-2.5 transition-all duration-150 cursor-pointer flex flex-col justify-between border ${
                        isCurrentlyPlaying
                          ? "bg-[#f0fdf4] border-2 border-[#10b981] shadow-md ring-1 ring-[#10b981]/30 scale-[1.02]"
                          : "bg-white hover:bg-zinc-50 border border-zinc-200/90 shadow-xs"
                      }`}
                      title={`Click to strum ${targetShape}`}
                    >
                      {/* Card Header: Chord Name & "NOW PLAYING" badge */}
                      <div className="flex items-center justify-between w-full mb-1">
                        <span
                          className={`text-sm sm:text-base font-black font-mono tracking-tight ${
                            isCurrentlyPlaying ? "text-[#059669]" : "text-zinc-900"
                          }`}
                        >
                          {targetShape}
                        </span>
                        {isCurrentlyPlaying && (
                          <span className="bg-[#10b981] text-white text-[7.5px] sm:text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full shadow-xs shrink-0">
                            PLAYING
                          </span>
                        )}
                      </div>

                      {/* Light Theme Guitar Chord Diagram */}
                      <div className="w-full flex items-center justify-center h-[90px] sm:h-[105px] my-0.5">
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
                          <div className="text-[10px] font-mono text-zinc-400 text-center py-4">
                            No diagram
                          </div>
                        )}
                      </div>

                      {/* Card Footer: Preview button with play icon */}
                      <div
                        className={`mt-1 flex items-center justify-center gap-1 text-[9px] sm:text-[10px] font-mono ${
                          isCurrentlyPlaying
                            ? "text-[#059669] font-bold"
                            : "text-zinc-500 group-hover:text-zinc-900"
                        } transition-colors pt-1 border-t border-zinc-100 print:hidden`}
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>Preview</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* =================================================================== */}
        {/* SECTIONS & CHORDS PROGRESSION VIEW (GRID ON BOTH MOBILE & DESKTOP)  */}
        {/* =================================================================== */}
        {/*
          Per user request:
          "no need the Inline Sliding (Right to Left), just show like how its shown
          on desktop view but maybe can be smaller to fit more chords"
          Both desktop & mobile now render the clean, responsive grid layout
          with compact chord blocks to fit significantly more chords per row!
        */}
        <section aria-label="Progression Timeline" className="space-y-4">
          {/* Section Toolbar / Helper */}
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-700 font-bold">
              <Layers className="w-4 h-4 text-emerald-700" />
              <span>SONG SECTIONS ({sections.length})</span>
            </div>

            <div className="flex items-center gap-1.5">
              {sections.length === 1 && (
                <button
                  onClick={handleApplyPresetSections}
                  className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300 text-[10px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer"
                  title="Auto-detect and divide into Verse/Chorus template"
                >
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span className="hidden sm:inline">Auto-Template Sections</span>
                  <span className="sm:hidden">Template</span>
                </button>
              )}
            </div>
          </div>

          {/* Render Song Sections on the Sheet */}
          {sections.map((section, sIdx) => {
            const isSectionActive = sIdx === activeSectionIdx;
            const style = getSectionBadgeStyle(section.name);

            return (
              <div
                key={`section-${sIdx}-${section.name}-${section.startIndex}`}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden print-break-inside-avoid ${
                  isSectionActive
                    ? "border-emerald-400 shadow-md ring-1 ring-emerald-200"
                    : "border-zinc-200 hover:border-zinc-300"
                } bg-white`}
              >
                {/* SECTION HEADER BANNER (Paper style) */}
                <div
                  className={`px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2 border-b border-zinc-200 ${style.headerBg} border-l-4 ${style.accentBorder}`}
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {/* Section Tag Badge / Editable input */}
                    {editingSectionIdx === sIdx ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editSectionNameInput}
                          onChange={(e) => setEditSectionNameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameSection(sIdx, editSectionNameInput);
                            if (e.key === "Escape") setEditingSectionIdx(null);
                          }}
                          className="bg-white text-zinc-900 font-mono font-bold text-xs px-2 py-0.5 rounded border border-emerald-500 focus:outline-none w-28 sm:w-36 shadow-xs"
                          autoFocus
                        />
                        <button
                          onClick={() => handleRenameSection(sIdx, editSectionNameInput)}
                          className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] font-bold"
                          title="Save section name"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setEditingSectionIdx(null)}
                          className="p-1 rounded bg-zinc-200 text-zinc-600 hover:text-zinc-900 text-[10px]"
                          title="Cancel"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span
                          onClick={() => {
                            setEditingSectionIdx(sIdx);
                            setEditSectionNameInput(section.name);
                          }}
                          className={`px-2.5 py-0.5 rounded-lg border font-mono font-extrabold text-xs flex items-center gap-1.5 cursor-pointer hover:opacity-85 transition-opacity ${style.badgeBg}`}
                          title="Click to rename this section"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          <span>{section.name}</span>
                          <Edit3 className="w-2.5 h-2.5 opacity-60 ml-0.5 print:hidden" />
                        </span>

                        {isSectionActive && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-800 text-[9px] font-mono font-bold tracking-wider animate-pulse hidden sm:inline print:hidden">
                            NOW PLAYING
                          </span>
                        )}
                      </div>
                    )}

                    {/* Section Time Span */}
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                      {formatTime(section.startTime)} - {formatTime(section.endTime)} ({section.items.length} chords)
                    </span>
                  </div>

                  {/* Right: Section Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 print:hidden">
                    {/* Play from section start */}
                    <button
                      onClick={() => {
                        onSeek(section.startTime);
                        if (!isPlaying) onPlayPause();
                      }}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 text-[10px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                      title={`Play from beginning of ${section.name}`}
                    >
                      <Play className="w-2.5 h-2.5 text-emerald-600 fill-current" />
                      <span className="hidden sm:inline">Play</span>
                    </button>

                    {/* Remove section tag if more than 1 section */}
                    {sections.length > 1 && sIdx > 0 && (
                      <button
                        onClick={() => handleRemoveSectionTag(sIdx)}
                        className="p-1 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"
                        title="Merge this section into previous section"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* COMPACT CHORDS GRID (Fits more chords across mobile & desktop) */}
                {/* 3 cols on mobile, 4 on sm, 5 on md, 6 on lg */}
                <div className="p-2 sm:p-3 bg-white">
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 sm:gap-2 print:grid print:grid-cols-4">
                    {section.items.map(({ seg, originalIndex }) => {
                      const state = resolveChordFinderState(seg.chord, transpose, capo, song.key);
                      const chordLabel = capo > 0 && state.isValid ? state.shapeChord : state.transposedChord;
                      const isActive = originalIndex === activeSegmentIdx;
                      const segDuration = (seg.endTime - seg.startTime).toFixed(1);

                      // Resolve miniature voicing for this specific chord
                      const resolved = chordVoicingMap.get(seg.chord);
                      const targetShape = capo > 0 && state.isValid ? state.shapeChord : state.transposedChord;
                      const voicing = resolved?.voicing || resolveGuitarChord(targetShape, {
                        keyContext: song.key,
                        capo,
                        detectedChord: seg.chord,
                      }).voicing;

                      return (
                        <div
                          key={seg.id || `chord-${originalIndex}-${seg.startTime}`}
                          ref={isActive ? activeChordRef : null}
                          onClick={() => onSeek(seg.startTime)}
                          className={`group relative rounded-xl p-1.5 sm:p-2 border transition-all duration-150 cursor-pointer flex flex-col justify-between select-none scroll-mt-14 sm:scroll-mt-16 print-break-inside-avoid ${
                            isActive
                              ? "bg-[#ecfccb] border-2 border-[#84cc16] ring-2 ring-[#84cc16]/40 shadow-md scale-[1.02] text-zinc-950"
                              : "bg-white hover:bg-zinc-50 border border-zinc-200/90 text-zinc-800 shadow-xs"
                          }`}
                          title={`Jump to ${chordLabel} at ${formatTime(seg.startTime)}`}
                        >
                          {/* Top: Timestamp & Duration */}
                          <div className="flex items-center justify-between text-[8.5px] sm:text-[9.5px] font-mono text-zinc-500 mb-0.5">
                            <span
                              className={`px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded font-bold ${
                                isActive
                                  ? "bg-[#84cc16] text-black font-extrabold"
                                  : "bg-zinc-100 text-zinc-700 border border-zinc-200"
                              }`}
                            >
                              {formatTime(seg.startTime)}
                            </span>
                            <span className="text-[8px] sm:text-[9px] font-mono text-zinc-400">{segDuration}s</span>
                          </div>

                          {/* Center 1: Chord Symbol */}
                          <div className="text-center pt-0.5">
                            <span
                              className={`text-base sm:text-lg md:text-xl font-mono font-black tracking-tight transition-transform ${
                                isActive ? "text-[#365314] scale-105 inline-block" : "text-zinc-900"
                              }`}
                            >
                              {chordLabel}
                            </span>
                            {capo > 0 && state.isValid && state.shapeChord !== state.transposedChord && (
                              <span className="block text-[8px] sm:text-[8.5px] font-mono font-bold text-sky-700 truncate">
                                Sounding: {state.transposedChord}
                              </span>
                            )}
                          </div>

                          {/* Miniature Chord Diagram (Compact & Scaled to fit more chords) */}
                          <div className="w-full flex items-center justify-center my-0.5 h-[58px] sm:h-[68px] md:h-[72px]">
                            {voicing ? (
                              <ChordDiagram
                                frets={voicing.frets}
                                fingers={voicing.fingers}
                                barre={voicing.barre}
                                position={voicing.baseFret}
                                cagedShape={voicing.cagedShape}
                                capo={capo}
                                size="xxs"
                                theme="light"
                                className="max-h-full max-w-full"
                              />
                            ) : (
                              <div className="text-[8.5px] font-mono text-zinc-400 text-center py-1">
                                N/A
                              </div>
                            )}
                          </div>

                          {/* Bottom Row: Actions (Play status, Tag section, Remove) */}
                          <div className="flex items-center justify-between pt-0.5 border-t border-zinc-100 mt-0.5 print:hidden">
                            <span
                              className={`text-[8.5px] sm:text-[9px] font-mono flex items-center gap-0.5 sm:gap-1 ${
                                isActive ? "text-[#365314] font-bold" : "text-zinc-400 group-hover:text-zinc-600"
                              }`}
                            >
                              {isActive ? (
                                <>
                                  <Play className="w-2 h-2 fill-current text-[#4d7c0f] animate-pulse" />
                                  <span className="hidden sm:inline">PLAY</span>
                                </>
                              ) : (
                                <span>Seek</span>
                              )}
                            </span>

                            <div className="flex items-center gap-0.5">
                              {/* Add / Split section tag button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTagModalChordIdx(originalIndex);
                                  setCustomTagName("");
                                }}
                                className="p-0.5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-emerald-700 transition-colors cursor-pointer"
                                title="Split and start a new section tag here"
                              >
                                <Tag className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                              </button>

                              {/* Remove Chord Segment */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveSegment(originalIndex);
                                }}
                                className="p-0.5 rounded hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"
                                title="Remove chord segment"
                              >
                                <Trash2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* Lead Sheet Footer Note */}
        <div className="pt-3 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-zinc-500 gap-1.5 print:text-zinc-400">
          <span>Guitar Studio AI • Lead Chord Sheet</span>
          <span>Click any chord to seek • Tap tag to split sections • Tap trash to remove</span>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* FLOATING PLAYBACK DOCK (Pinned Safely ABOVE Mobile Bottom Navigation)     */}
      {/* ========================================================================= */}
      <aside
        aria-label="Playback Controls"
        className="fixed bottom-[74px] md:bottom-5 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-2xl bg-[#0f121a]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-2.5 sm:p-3 flex flex-col gap-2 text-white print:hidden"
      >
        {/* Scrubber track */}
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-[10px] sm:text-[11px] font-mono text-zinc-400 w-9 text-right shrink-0">
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
            aria-label="Seek timeline"
          />
          <span className="text-[10px] sm:text-[11px] font-mono text-zinc-400 w-9 text-left shrink-0">
            {formatTime(duration)}
          </span>
        </div>

        {/* Playback Controls & Transpose/Capo Quick Controls */}
        <div className="flex items-center justify-between gap-1.5">
          {/* Left: Quick Transpose & Capo */}
          <div className="flex items-center gap-1 sm:gap-1.5 text-xs font-mono">
            {/* Transpose button */}
            <div className="flex items-center bg-white/5 border border-white/10 rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-1 gap-1">
              <span className="text-[9.5px] sm:text-[10px] text-zinc-400 font-bold uppercase">T:</span>
              <button
                onClick={() => onTransposeChange((t) => Math.max(-12, t - 1))}
                className="w-4 h-4 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-[10px] cursor-pointer"
                title="Transpose down"
              >
                -
              </button>
              <span className={`font-bold text-[11px] ${transpose !== 0 ? "text-[#a3ff12]" : "text-white"}`}>
                {transpose > 0 ? `+${transpose}` : transpose}
              </span>
              <button
                onClick={() => onTransposeChange((t) => Math.min(12, t + 1))}
                className="w-4 h-4 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-[10px] cursor-pointer"
                title="Transpose up"
              >
                +
              </button>
            </div>

            {/* Capo button */}
            <div className="flex items-center bg-white/5 border border-white/10 rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-1 gap-1">
              <span className="text-[9.5px] sm:text-[10px] text-zinc-400 font-bold uppercase">C:</span>
              <button
                onClick={() => onCapoChange((c) => Math.max(0, c - 1))}
                className="w-4 h-4 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-[10px] cursor-pointer"
                title="Capo down"
              >
                -
              </button>
              <span className={`font-bold text-[11px] ${capo > 0 ? "text-sky-400" : "text-white"}`}>
                {capo > 0 ? capo : 0}
              </span>
              <button
                onClick={() => onCapoChange((c) => Math.min(12, c + 1))}
                className="w-4 h-4 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-[10px] cursor-pointer"
                title="Capo up"
              >
                +
              </button>
            </div>
          </div>

          {/* Center: Transport Play/Pause, Rewind, Fast-Forward */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => onSeek(Math.max(0, currentTime - 4))}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Rewind 4s"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onPlayPause}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#a3ff12] hover:bg-[#92eb10] text-black flex items-center justify-center shadow-[0_0_15px_rgba(163,255,18,0.4)] transition-all cursor-pointer"
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-black" />
              ) : (
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-black ml-0.5" />
              )}
            </button>

            <button
              onClick={() => onSeek(Math.min(duration, currentTime + 4))}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Forward 4s"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right: Active chord badge */}
          <div className="text-right">
            {activeResolvedChord && activeResolvedChord.isValid ? (
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-[#a3ff12] text-black font-mono font-black text-xs shadow-sm">
                {capo > 0 ? activeResolvedChord.shapeChord : activeResolvedChord.transposedChord}
              </span>
            ) : (
              <span className="text-[10px] font-mono text-zinc-500">Ready</span>
            )}
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* SECTION TAGGING MODAL / PICKER                                            */}
      {/* ========================================================================= */}
      {tagModalChordIdx !== null && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 print:hidden">
          <div className="bg-[#14171e] border border-white/15 rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#a3ff12]" />
                <h3 className="text-sm font-bold font-mono text-white">Tag Section Here</h3>
              </div>
              <button
                onClick={() => setTagModalChordIdx(null)}
                className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs font-mono text-zinc-400">
              Split the chord progression at chord{" "}
              <strong className="text-white">{segments[tagModalChordIdx]?.chord}</strong> (
              {formatTime(segments[tagModalChordIdx]?.startTime)}) into a labeled section:
            </p>

            {/* Common Preset Tags */}
            <div className="flex flex-wrap gap-1.5">
              {PRESET_SECTION_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleSetSectionTag(tagModalChordIdx, tag)}
                  className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-[#a3ff12]/20 hover:border-[#a3ff12]/40 hover:text-[#a3ff12] border border-white/10 text-xs font-mono font-bold text-zinc-300 transition-all cursor-pointer"
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Custom Tag Input */}
            <div className="pt-2 border-t border-white/10 space-y-2">
              <label className="text-[11px] font-mono text-zinc-400 block font-bold">
                Or custom tag name:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. Acoustic Break, Drop..."
                  value={customTagName}
                  onChange={(e) => setCustomTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSetSectionTag(tagModalChordIdx, customTagName);
                  }}
                  className="flex-1 bg-white/5 text-xs font-mono text-white rounded-xl px-3 py-2 border border-white/10 focus:border-[#a3ff12]/50 focus:outline-none"
                />
                <button
                  onClick={() => handleSetSectionTag(tagModalChordIdx, customTagName)}
                  disabled={!customTagName.trim()}
                  className="px-3 py-2 bg-[#a3ff12] hover:bg-[#92eb10] disabled:opacity-40 text-black font-extrabold text-xs rounded-xl font-mono cursor-pointer transition-all"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EXPORT MODAL                                                             */}
      {/* ========================================================================= */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 print:hidden">
          <div className="bg-[#14171e] border border-white/15 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-[#a3ff12]" />
                <h3 className="text-sm sm:text-base font-bold font-mono text-white">Export Chords & Sheet</h3>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs font-mono text-zinc-400">
              Export your customized chord progression and tagged sections for{" "}
              <strong>{song.title}</strong>:
            </p>

            <div className="space-y-2.5">
              {/* Option 1: Print / PDF Document (Pure Multi-Page Lead Sheet) */}
              <button
                onClick={() => {
                  setShowExportModal(false);
                  setTimeout(() => handlePrint(), 200);
                }}
                className="w-full p-2.5 sm:p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    <Printer className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold font-mono text-white group-hover:text-purple-300">
                      Print / PDF Multi-Page Document
                    </h4>
                    <p className="text-[10px] font-mono text-zinc-400">
                      Clean lead sheet with all playable chords & diagrams across pages
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-zinc-400">&rarr;</span>
              </button>

              {/* Option 2: Copy to Clipboard */}
              <button
                onClick={handleCopyText}
                className="w-full p-2.5 sm:p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Copy className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold font-mono text-white group-hover:text-emerald-300">
                      {copiedText ? "Copied!" : "Copy Formatted Text"}
                    </h4>
                    <p className="text-[10px] font-mono text-zinc-400">
                      Copy structured sections & timestamps to clipboard
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-[#a3ff12]">
                  {copiedText ? <Check className="w-4 h-4 text-[#a3ff12]" /> : "&rarr;"}
                </span>
              </button>

              {/* Option 3: Download .txt */}
              <button
                onClick={handleDownloadText}
                className="w-full p-2.5 sm:p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold font-mono text-white group-hover:text-sky-300">
                      Download Plain Text (.txt)
                    </h4>
                    <p className="text-[10px] font-mono text-zinc-400">
                      Standard text chord chart format for guitarists
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-zinc-400">&rarr;</span>
              </button>

              {/* Option 4: Download JSON */}
              <button
                onClick={handleDownloadJSON}
                className="w-full p-2.5 sm:p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold font-mono text-white group-hover:text-amber-300">
                      Download JSON Data (.json)
                    </h4>
                    <p className="text-[10px] font-mono text-zinc-400">
                      Full structured timestamps, chords, and section tags
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-zinc-400">&rarr;</span>
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono text-xs font-bold cursor-pointer"
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
