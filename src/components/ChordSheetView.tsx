import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  ChevronLeft,
  ChevronRight,
  Tag,
  Edit3,
  Layers,
  ExternalLink,
  FileCode,
  Sun,
  Moon,
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

// Map section names to music icons
export const getSectionIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("chorus") || lower.includes("hook")) return Sparkles;
  if (lower.includes("verse")) return Music;
  if (lower.includes("bridge") || lower.includes("pre-chorus")) return Layers;
  if (lower.includes("intro")) return Play;
  if (lower.includes("outro")) return SkipForward;
  if (lower.includes("solo") || lower.includes("interlude")) return Music;
  return Tag;
};

// Color mapping for common section tags in clean paper lead sheet styling
const getSectionBadgeStyle = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("chorus") || lower.includes("hook")) {
    return {
      badgeBg: "bg-amber-100 text-amber-900 border-amber-300",
      accentBorder: "border-l-amber-500",
      dot: "bg-amber-500",
      iconColor: "text-amber-700",
      headerBg: "bg-amber-50/60",
      hexAccent: "#f59e0b",
      hexBadgeBg: "#fef3c7",
      hexText: "#78350f",
      hexBorder: "#fcd34d",
    };
  }
  if (lower.includes("verse")) {
    return {
      badgeBg: "bg-emerald-100 text-emerald-900 border-emerald-300",
      accentBorder: "border-l-emerald-500",
      dot: "bg-emerald-600",
      iconColor: "text-emerald-700",
      headerBg: "bg-emerald-50/60",
      hexAccent: "#10b981",
      hexBadgeBg: "#d1fae5",
      hexText: "#065f46",
      hexBorder: "#6ee7b7",
    };
  }
  if (lower.includes("bridge") || lower.includes("pre-chorus")) {
    return {
      badgeBg: "bg-purple-100 text-purple-900 border-purple-300",
      accentBorder: "border-l-purple-500",
      dot: "bg-purple-500",
      iconColor: "text-purple-700",
      headerBg: "bg-purple-50/60",
      hexAccent: "#8b5cf6",
      hexBadgeBg: "#ede9fe",
      hexText: "#5b21b6",
      hexBorder: "#c4b5fd",
    };
  }
  if (lower.includes("intro")) {
    return {
      badgeBg: "bg-sky-100 text-sky-900 border-sky-300",
      accentBorder: "border-l-sky-500",
      dot: "bg-sky-500",
      iconColor: "text-sky-700",
      headerBg: "bg-sky-50/60",
      hexAccent: "#0ea5e9",
      hexBadgeBg: "#e0f2fe",
      hexText: "#075985",
      hexBorder: "#7dd3fc",
    };
  }
  if (lower.includes("outro")) {
    return {
      badgeBg: "bg-rose-100 text-rose-900 border-rose-300",
      accentBorder: "border-l-rose-500",
      dot: "bg-rose-500",
      iconColor: "text-rose-700",
      headerBg: "bg-rose-50/60",
      hexAccent: "#f43f5e",
      hexBadgeBg: "#ffe4e6",
      hexText: "#9f1239",
      hexBorder: "#fecdd3",
    };
  }
  if (lower.includes("solo") || lower.includes("interlude")) {
    return {
      badgeBg: "bg-cyan-100 text-cyan-900 border-cyan-300",
      accentBorder: "border-l-cyan-500",
      dot: "bg-cyan-600",
      iconColor: "text-cyan-700",
      headerBg: "bg-cyan-50/60",
      hexAccent: "#06b6d4",
      hexBadgeBg: "#cffafe",
      hexText: "#155e75",
      hexBorder: "#67e8f9",
    };
  }
  return {
    badgeBg: "bg-zinc-100 text-zinc-900 border-zinc-300",
    accentBorder: "border-l-zinc-700",
    dot: "bg-zinc-700",
    iconColor: "text-zinc-700",
    headerBg: "bg-zinc-50/70",
    hexAccent: "#64748b",
    hexBadgeBg: "#f1f5f9",
    hexText: "#1e293b",
    hexBorder: "#cbd5e1",
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
  const [sheetTheme, setSheetTheme] = useState<"light" | "dark">("light");
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
  const externalTabRef = useRef<Window | null>(null);

  // Top navigation sliding / swiping bar state & refs
  const topButtonsContainerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(false);
  const isDraggingTopBarRef = useRef<boolean>(false);
  const topBarStartXRef = useRef<number>(0);
  const topBarScrollLeftRef = useRef<number>(0);

  const updateScrollIndicators = () => {
    if (topButtonsContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = topButtonsContainerRef.current;
      setCanScrollLeft(scrollLeft > 6);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
    }
  };

  useEffect(() => {
    updateScrollIndicators();
    const handleResize = () => updateScrollIndicators();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [undoStack.length]);

  const handleTopBarMouseDown = (e: React.MouseEvent) => {
    if (!topButtonsContainerRef.current) return;
    isDraggingTopBarRef.current = true;
    topBarStartXRef.current = e.pageX - topButtonsContainerRef.current.offsetLeft;
    topBarScrollLeftRef.current = topButtonsContainerRef.current.scrollLeft;
  };

  const handleTopBarMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingTopBarRef.current || !topButtonsContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - topButtonsContainerRef.current.offsetLeft;
    const walk = (x - topBarStartXRef.current) * 1.5;
    topButtonsContainerRef.current.scrollLeft = topBarScrollLeftRef.current - walk;
    updateScrollIndicators();
  };

  const handleTopBarMouseUp = () => {
    isDraggingTopBarRef.current = false;
  };

  const handleScrollNudge = (direction: "left" | "right") => {
    if (topButtonsContainerRef.current) {
      topButtonsContainerRef.current.scrollBy({
        left: direction === "left" ? -140 : 140,
        behavior: "smooth",
      });
      setTimeout(updateScrollIndicators, 200);
    }
  };

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
    if (currentTime < segments[0].startTime) return 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const nextSeg = segments[i + 1];
      const segEnd = nextSeg ? nextSeg.startTime : seg.endTime;
      if (currentTime >= seg.startTime && currentTime < segEnd) {
        return i;
      }
    }
    return segments.length - 1;
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

  const lastScrolledIdxRef = useRef<number>(-1);

  // Smoothly scroll the active chord row to the VERY TOP of the scroll viewport
  const scrollToChord = useCallback((index: number, smooth: boolean = true) => {
    if (index < 0) return;
    const targetEl =
      document.getElementById(`chord-cell-${index}`) ||
      (activeChordRef.current && index === activeSegmentIdx ? activeChordRef.current : null);
    if (!targetEl) return;

    // Detect the true scrollable container: App.tsx's <main> element or parent
    let container: HTMLElement | null = null;
    const mainEl = document.querySelector("main");
    if (
      mainEl &&
      (mainEl.scrollHeight > mainEl.clientHeight || window.getComputedStyle(mainEl).overflowY === "auto")
    ) {
      container = mainEl;
    } else {
      let p = targetEl.parentElement;
      while (p && p !== document.body && p !== document.documentElement) {
        const style = window.getComputedStyle(p);
        if (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          p.scrollHeight > p.clientHeight
        ) {
          container = p;
          break;
        }
        p = p.parentElement;
      }
    }

    const elRect = targetEl.getBoundingClientRect();

    if (container && container.scrollHeight > container.clientHeight) {
      const containerRect = container.getBoundingClientRect();
      const offsetFromTop = elRect.top - containerRect.top;
      // Position active chord row at the VERY TOP of the visible viewport (with 16px breathing room)
      const targetScrollTop = container.scrollTop + offsetFromTop - 16;

      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: smooth ? "smooth" : "auto",
      });
    } else {
      // Window / documentElement scrolling fallback (at the VERY TOP)
      const windowOffset = window.scrollY + elRect.top - 16;
      window.scrollTo({
        top: Math.max(0, windowOffset),
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }, [activeSegmentIdx]);

  // Smooth auto-scroll to show the active chord row at the VERY TOP during playback
  useEffect(() => {
    if (!autoScroll || activeSegmentIdx === -1) return;
    if (lastScrolledIdxRef.current === activeSegmentIdx) return;
    lastScrolledIdxRef.current = activeSegmentIdx;

    const frameId = requestAnimationFrame(() => {
      scrollToChord(activeSegmentIdx, true);
    });
    return () => cancelAnimationFrame(frameId);
  }, [activeSegmentIdx, autoScroll, scrollToChord]);

  // Immediately scroll active chord to top when playback begins or autoScroll is re-enabled
  useEffect(() => {
    if (autoScroll && isPlaying && activeSegmentIdx !== -1) {
      scrollToChord(activeSegmentIdx, true);
    }
  }, [isPlaying, autoScroll, scrollToChord]);

  // Unified seek & follow helper
  const handleSeekAndFollow = (time: number) => {
    onSeek(time);
    if (autoScroll && segments && segments.length > 0) {
      const targetIdx = segments.findIndex(
        (s, i) =>
          time >= s.startTime &&
          (i === segments.length - 1 || time < (segments[i + 1]?.startTime ?? s.endTime))
      );
      if (targetIdx !== -1) {
        lastScrolledIdxRef.current = targetIdx;
        requestAnimationFrame(() => scrollToChord(targetIdx, true));
      }
    }
  };

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

  // Helper to clone and sanitize printable lead sheet for pristine PDF / Print and external HTML rendering
  const preparePrintableClone = (printableArea: HTMLElement): HTMLElement => {
    const clone = printableArea.cloneNode(true) as HTMLElement;

    // 1. Remove interactive UI elements, edit buttons, footer instructions, trash buttons
    clone
      .querySelectorAll(
        "button, .print\\:hidden, .print-hidden, [role='button'], .editor-instruction-footer, [data-footer-instruction]"
      )
      .forEach((el) => el.remove());

    // 1b. Remove the sections helper toolbar ("SONG SECTIONS (X)")
    clone.querySelectorAll('[aria-label="Progression Timeline"] > div').forEach((el) => {
      if (el.textContent?.includes("SONG SECTIONS")) {
        el.remove();
      }
    });

    // 2. Ensure the Unique Chord Diagrams section is always visible
    clone.querySelectorAll(".print-force-show, .print-force-diagrams").forEach((el) => {
      el.classList.remove("hidden");
      (el as HTMLElement).style.display = "block";
    });

    // 3. Prevent empty pages: Strip break-inside-avoid and overflow-hidden from section containers
    // (Only individual chord cards should avoid breaking, while sections must flow naturally across page breaks)
    clone.querySelectorAll(".section-wrapper, [class*='rounded-2xl'][class*='border']").forEach((el) => {
      if (!el.id?.startsWith("chord-cell-") && !el.classList.contains("chord-card")) {
        el.classList.remove("print-break-inside-avoid");
        (el as HTMLElement).style.overflow = "visible";
        (el as HTMLElement).style.breakInside = "auto";
        (el as HTMLElement).style.pageBreakInside = "auto";
        (el as HTMLElement).style.height = "auto";
        (el as HTMLElement).style.minHeight = "0";
      }
    });

    // 4. Normalize sheet colors to crisp high-contrast paper (clean black ink on white paper)
    clone.style.backgroundColor = "#ffffff";
    clone.style.color = "#0f172a";
    clone.querySelectorAll<HTMLElement>(".chord-card, .group, [id^='chord-cell-']").forEach((card) => {
      card.style.backgroundColor = "#ffffff";
      card.style.color = "#0f172a";
      card.style.borderColor = "#cbd5e1";
    });

    // 5. Convert all chord diagram SVGs to high-contrast crisp black ink on white paper
    clone.querySelectorAll<SVGElement>("svg.chord-diagram-svg").forEach((svg) => {
      // Set explicit SVG viewBox dimensions for sharp print rendering
      svg.setAttribute("width", "72");
      svg.setAttribute("height", "80");

      // Strings and Frets
      svg.querySelectorAll("line").forEach((line) => {
        const stroke = line.getAttribute("stroke");
        if (!stroke || stroke === "transparent") return;
        line.setAttribute("stroke", "#1e293b");
        line.style.stroke = "#1e293b";
      });

      // Nut, Barre, and Rectangles
      svg.querySelectorAll("rect").forEach((rect) => {
        const fill = rect.getAttribute("fill");
        if (!fill || fill === "none" || fill === "transparent") return;
        const opacity = rect.getAttribute("fill-opacity");
        if (opacity && parseFloat(opacity) < 0.5) {
          rect.remove(); // Remove soft glow halo
          return;
        }
        rect.setAttribute("fill", "#0f172a");
        rect.style.fill = "#0f172a";
      });

      // Circles (Dots and Open string markers)
      svg.querySelectorAll("circle").forEach((circle) => {
        const opacity = circle.getAttribute("fill-opacity");
        if (opacity && parseFloat(opacity) < 0.5) {
          circle.remove(); // Remove glow halo
          return;
        }
        const fill = circle.getAttribute("fill");
        const stroke = circle.getAttribute("stroke");
        if (fill && fill !== "none" && fill !== "transparent") {
          circle.setAttribute("fill", "#0f172a");
          circle.style.fill = "#0f172a";
        }
        if (stroke && stroke !== "none" && stroke !== "transparent") {
          circle.setAttribute("stroke", "#0f172a");
          circle.style.stroke = "#0f172a";
        }
      });

      // Text labels (fret numbers, finger numbers inside dots, mute ✕)
      svg.querySelectorAll("text").forEach((text) => {
        const content = text.textContent?.trim();
        if (content === "✕") {
          text.setAttribute("fill", "#dc2626");
          text.style.fill = "#dc2626";
        } else if (content && /^[1-4T]$/.test(content)) {
          // Finger numbers inside solid black dots -> crisp white text
          text.setAttribute("fill", "#ffffff");
          text.style.fill = "#ffffff";
        } else {
          // Position labels ("3fr", "Capo 2", etc.)
          text.setAttribute("fill", "#0f172a");
          text.style.fill = "#0f172a";
        }
      });
    });

    return clone;
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

    // Clone and sanitize printable sheet content with crisp black diagrams
    const clone = preparePrintableClone(printableArea);

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>${song.title || "Chord Sheet"} - JOE Guitar Studio Lead Sheet</title>
          <style>
            @page {
              size: auto;
              margin: 12mm 14mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              background: #ffffff !important;
              color: #0f172a !important;
              margin: 0;
              padding: 0;
              font-size: 12px;
              line-height: 1.4;
            }
            h1, h2, h3, h4, p {
              margin: 0;
              color: #0f172a;
            }
            .font-mono {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            }
            .font-bold { font-weight: 700; }
            .font-black { font-weight: 900; }
            .font-extrabold { font-weight: 800; }
            .uppercase { text-transform: uppercase; }

            /* Break rules to prevent breaking elements across page cuts without causing empty pages */
            article,
            #chord-sheet-printable,
            .sheet-wrapper,
            section,
            [aria-label="Progression Timeline"],
            .progression-timeline {
              break-inside: auto !important;
              page-break-inside: auto !important;
              break-before: auto !important;
              page-break-before: auto !important;
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
            }

            [aria-label="Chord Voicings"] {
              break-inside: auto !important;
              page-break-inside: auto !important;
              break-after: auto !important;
              page-break-after: auto !important;
              margin-bottom: 14px !important;
              overflow: visible !important;
            }

            .section-wrapper,
            .section-card,
            [aria-label="Progression Timeline"] > div {
              break-inside: auto !important;
              page-break-inside: auto !important;
              break-before: auto !important;
              page-break-before: auto !important;
              break-after: auto !important;
              page-break-after: auto !important;
              margin-bottom: 12px !important;
              overflow: visible !important;
              height: auto !important;
              min-height: 0 !important;
            }

            .section-header-banner {
              break-after: avoid !important;
              page-break-after: avoid !important;
            }

            /* Flex alignment & icon bounds for clean multi-page document */
            .flex { display: flex !important; align-items: center !important; }
            .items-center { align-items: center !important; }
            .justify-between { justify-content: space-between !important; }
            .gap-1 { gap: 4px !important; }
            .gap-1.5, .gap-1\\.5 { gap: 6px !important; }
            .gap-2 { gap: 8px !important; }
            .gap-3 { gap: 12px !important; }
            .shrink-0 { flex-shrink: 0 !important; }

            /* Section badges and inline icons */
            .section-badge, [class*="rounded-lg"][class*="font-mono"][class*="font-extrabold"] {
              display: inline-flex !important;
              align-items: center !important;
              gap: 6px !important;
              padding: 3px 8px !important;
              border-radius: 6px !important;
              font-size: 11px !important;
              font-weight: 800 !important;
              vertical-align: middle !important;
            }

            /* Inline SVG icons (Music, Tag, Sparkles, etc.) */
            svg:not(.chord-diagram-svg) {
              display: inline-block !important;
              vertical-align: middle !important;
              margin: 0 !important;
              flex-shrink: 0 !important;
            }
            svg.w-4, svg.h-4, .w-4, .h-4 {
              width: 15px !important;
              height: 15px !important;
              min-width: 15px !important;
              min-height: 15px !important;
            }
            svg.w-3.5, svg.h-3.5, svg.w-3\\.5, svg.h-3\\.5, .w-3\\.5, .h-3\\.5 {
              width: 13px !important;
              height: 13px !important;
              min-width: 13px !important;
              min-height: 13px !important;
            }

            /* Strictly constrained chord diagram SVGs for uniform neat display */
            svg.chord-diagram-svg,
            .chord-diagram-svg {
              display: block !important;
              margin: 2px auto !important;
              width: 72px !important;
              height: 80px !important;
              max-width: 100% !important;
            }
            /* High-contrast ink rules for diagram SVGs in print */
            svg.chord-diagram-svg line {
              stroke: #1e293b !important;
            }
            svg.chord-diagram-svg rect:not([fill="none"]):not([fill="transparent"]) {
              fill: #0f172a !important;
            }
            svg.chord-diagram-svg circle[fill]:not([fill="none"]):not([fill="transparent"]) {
              fill: #0f172a !important;
            }
            svg.chord-diagram-svg circle[stroke]:not([stroke="none"]):not([stroke="transparent"]) {
              stroke: #0f172a !important;
            }
            svg.chord-diagram-svg text {
              fill: #0f172a !important;
            }
            svg.chord-diagram-svg text[fill="#ffffff"] {
              fill: #ffffff !important;
            }

            /* Container resets */
            #chord-sheet-printable {
              box-shadow: none !important;
              border: none !important;
              padding: 0 !important;
              margin: 0 !important;
              max-width: 100% !important;
              width: 100% !important;
              background: #ffffff !important;
            }

            /* Chords layout for print - using flex-wrap avoids Chromium grid fragmentation and prevents empty pages */
            .grid {
              display: flex !important;
              flex-wrap: wrap !important;
              gap: 8px !important;
              margin-top: 6px !important;
            }
            .grid > * {
              flex: 0 0 calc(25% - 6px) !important;
              width: calc(25% - 6px) !important;
              max-width: calc(25% - 6px) !important;
              box-sizing: border-box !important;
            }

            /* Top Chord Voicings reference grid */
            [aria-label="Chord Voicings"] .grid {
              display: flex !important;
              flex-wrap: wrap !important;
              gap: 8px !important;
            }
            [aria-label="Chord Voicings"] .grid > * {
              flex: 0 0 calc(16.666% - 7px) !important;
              width: calc(16.666% - 7px) !important;
              max-width: calc(16.666% - 7px) !important;
              box-sizing: border-box !important;
            }

            .group, .chord-card, [id^="chord-cell-"] {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              border: 1px solid #cbd5e1 !important;
              border-radius: 8px !important;
              padding: 7px 9px !important;
              background: #ffffff !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              min-height: 118px !important;
            }

            #chord-sheet-printable button, .print-hidden, .editor-instruction-footer, [data-footer-instruction] {
              display: none !important;
            }
          </style>
        </head>
        <body>
          ${clone.outerHTML}
          <div style="text-align: center; font-size: 11px; color: #64748b; font-family: ui-monospace, monospace; padding-top: 16px; margin-top: 24px; border-top: 1px solid #e2e8f0; letter-spacing: 0.5px;">
            JOE Guitar Studio &bull; ${song.title || "Chord Sheet"} &bull; Full Lead Sheet
          </div>
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

  // Generate full standalone HTML lead sheet with embedded styling & SVG diagrams
  const generateFullHtmlSheet = (): string => {
    const printableArea = document.getElementById("chord-sheet-printable");
    if (!printableArea) return "";

    const clone = preparePrintableClone(printableArea);

    const songTitle = song.title || "Untitled Song";
    const songArtist = song.artist || "Unknown Artist";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${songTitle} - JOE Guitar Studio Lead Sheet</title>
  <style>
    :root {
      --bg: #f8fafc;
      --paper: #ffffff;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --border-card: #cbd5e1;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 0 0 60px 0;
      font-size: 13px;
    }
    .font-mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .font-bold { font-weight: 700; }
    .font-black { font-weight: 900; }
    .font-extrabold { font-weight: 800; }
    .uppercase { text-transform: uppercase; }

    /* Top Floating Navigation Toolbar (Screen Only) */
    .top-toolbar {
      position: sticky;
      top: 0;
      z-index: 1000;
      background: #0f172a;
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
      padding: 10px 24px;
      display: flex !important;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: #ffffff;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    }
    .top-toolbar .logo-group {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .top-toolbar .badge {
      background: #a3ff12;
      color: #000;
      font-weight: 800;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 6px;
      font-family: ui-monospace, monospace;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }
    .top-toolbar .song-heading {
      font-size: 13px;
      font-weight: 600;
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 420px;
    }
    .top-toolbar .actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .top-toolbar button,
    .top-toolbar .btn {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 7px 16px !important;
      border-radius: 8px !important;
      font-size: 12px !important;
      font-weight: 700 !important;
      font-family: ui-monospace, monospace !important;
      cursor: pointer !important;
      border: 1px solid transparent !important;
      transition: all 0.15s ease !important;
      text-decoration: none !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    .btn-primary {
      background: #a3ff12 !important;
      color: #000000 !important;
      box-shadow: 0 2px 8px rgba(163, 255, 18, 0.3) !important;
    }
    .btn-primary:hover {
      background: #8de30c !important;
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.1) !important;
      color: #ffffff !important;
      border-color: rgba(255, 255, 255, 0.2) !important;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.2) !important;
    }

    /* Paper Lead Sheet Container */
    .sheet-wrapper {
      max-width: 960px;
      margin: 28px auto;
      padding: 0 16px;
    }
    #chord-sheet-printable {
      background: var(--paper) !important;
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 32px 36px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.06);
    }

    /* Section Structure & Break Rules - Flow naturally without empty pages */
    article,
    #chord-sheet-printable,
    .sheet-wrapper,
    section,
    [aria-label="Progression Timeline"],
    .progression-timeline {
      break-inside: auto !important;
      page-break-inside: auto !important;
      break-before: auto !important;
      page-break-before: auto !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
    }

    [aria-label="Chord Voicings"] {
      break-inside: auto !important;
      page-break-inside: auto !important;
      break-after: auto !important;
      page-break-after: auto !important;
      margin-bottom: 14px !important;
      overflow: visible !important;
    }

    .section-wrapper,
    .section-card,
    [aria-label="Progression Timeline"] > div {
      break-inside: auto !important;
      page-break-inside: auto !important;
      break-before: auto !important;
      page-break-before: auto !important;
      break-after: auto !important;
      page-break-after: auto !important;
      margin-bottom: 12px !important;
      overflow: visible !important;
      height: auto !important;
      min-height: 0 !important;
    }

    .section-header-banner {
      break-after: avoid !important;
      page-break-after: avoid !important;
    }

    /* Flex alignment utilities */
    .flex { display: flex !important; align-items: center !important; }
    .items-center { align-items: center !important; }
    .justify-between { justify-content: space-between !important; }
    .gap-1 { gap: 4px !important; }
    .gap-1\\.5, .gap-1\\.5 { gap: 6px !important; }
    .gap-2 { gap: 8px !important; }
    .gap-3 { gap: 12px !important; }
    .shrink-0 { flex-shrink: 0 !important; }

    /* SECTION BADGE & ICON PLACEMENT */
    .section-badge, [class*="rounded-lg"][class*="font-mono"][class*="font-extrabold"] {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 4px 10px !important;
      border-radius: 8px !important;
      font-size: 11.5px !important;
      font-weight: 800 !important;
      white-space: nowrap !important;
      vertical-align: middle !important;
    }

    /* Target ALL Lucide icons / inline SVG icons */
    svg:not(.chord-diagram-svg) {
      display: inline-block !important;
      vertical-align: middle !important;
      margin: 0 !important;
      flex-shrink: 0 !important;
    }
    svg.w-3\\.5, svg.h-3\\.5, .w-3\\.5, .h-3\\.5 {
      width: 14px !important;
      height: 14px !important;
      min-width: 14px !important;
      min-height: 14px !important;
    }
    svg.w-4, svg.h-4, .w-4, .h-4 {
      width: 16px !important;
      height: 16px !important;
      min-width: 16px !important;
      min-height: 16px !important;
    }

    /* CHORD DIAGRAM SVGS */
    svg.chord-diagram-svg,
    .chord-diagram-svg {
      display: block !important;
      margin: 2px auto !important;
      width: 74px !important;
      height: 82px !important;
      max-width: 100% !important;
    }

    /* High-contrast ink rules for diagram SVGs in external sheet */
    svg.chord-diagram-svg line {
      stroke: #1e293b !important;
    }
    svg.chord-diagram-svg rect:not([fill="none"]):not([fill="transparent"]) {
      fill: #0f172a !important;
    }
    svg.chord-diagram-svg circle[fill]:not([fill="none"]):not([fill="transparent"]) {
      fill: #0f172a !important;
    }
    svg.chord-diagram-svg circle[stroke]:not([stroke="none"]):not([stroke="transparent"]) {
      stroke: #0f172a !important;
    }
    svg.chord-diagram-svg text {
      fill: #0f172a !important;
    }
    svg.chord-diagram-svg text[fill="#ffffff"] {
      fill: #ffffff !important;
    }

    /* Screen Chords 4-column layout */
    .grid {
      display: grid !important;
      grid-template-columns: repeat(4, 1fr) !important;
      gap: 10px !important;
      margin-top: 6px !important;
    }

    /* Top Chord Voicings reference grid (6 per row on desktop) */
    [aria-label="Chord Voicings"] .grid {
      grid-template-columns: repeat(6, 1fr) !important;
      gap: 10px !important;
    }

    @media (max-width: 640px) {
      .grid {
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 6px !important;
      }
    }

    .group, .chord-card, [id^="chord-cell-"] {
      border: 1px solid #cbd5e1 !important;
      border-radius: 10px !important;
      padding: 8px 10px !important;
      background: #ffffff !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      min-height: 125px !important;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03) !important;
    }

    .clean-footer {
      text-align: center;
      font-size: 11px;
      color: #64748b;
      font-family: ui-monospace, monospace;
      padding-top: 22px;
      margin-top: 30px;
      border-top: 1px solid #e2e8f0;
      letter-spacing: 0.5px;
    }

    /* Hide interactive print buttons only inside the sheet itself */
    #chord-sheet-printable button,
    .print-hidden,
    .editor-instruction-footer,
    [data-footer-instruction] {
      display: none !important;
    }

    /* Print Styles: Flex-wrap avoids Chromium grid fragmentation and prevents empty pages */
    @media print {
      body {
        background: #ffffff !important;
        color: #000000 !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .top-toolbar {
        display: none !important;
      }
      .sheet-wrapper {
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      #chord-sheet-printable {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        margin: 0 !important;
        width: 100% !important;
      }
      @page {
        size: auto;
        margin: 12mm 14mm;
      }
      .grid {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 8px !important;
      }
      .grid > * {
        flex: 0 0 calc(25% - 6px) !important;
        width: calc(25% - 6px) !important;
        max-width: calc(25% - 6px) !important;
        box-sizing: border-box !important;
      }
      [aria-label="Chord Voicings"] .grid > * {
        flex: 0 0 calc(16.666% - 7px) !important;
        width: calc(16.666% - 7px) !important;
        max-width: calc(16.666% - 7px) !important;
        box-sizing: border-box !important;
      }
      .group, .chord-card, [id^="chord-cell-"] {
        border: 1px solid #cbd5e1 !important;
        box-shadow: none !important;
        min-height: 118px !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .section-wrapper,
      .section-card,
      [aria-label="Progression Timeline"] > div {
        break-inside: auto !important;
        page-break-inside: auto !important;
        break-before: auto !important;
        page-break-before: auto !important;
        break-after: auto !important;
        page-break-after: auto !important;
        overflow: visible !important;
        height: auto !important;
        min-height: 0 !important;
      }
      svg.chord-diagram-svg,
      .chord-diagram-svg {
        width: 70px !important;
        height: 78px !important;
      }
      .clean-footer {
        display: block !important;
      }
    }
  </style>
</head>
<body>
  <!-- Screen Navigation Bar with Print & Close controls -->
  <header class="top-toolbar">
    <div class="logo-group">
      <span class="badge">LEAD SHEET</span>
      <span class="song-heading">${songTitle} &bull; ${songArtist}</span>
    </div>
    <div class="actions">
      <button class="btn btn-primary" onclick="window.print()" id="btn-print-sheet" title="Print this chord sheet or save as PDF">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 6 2 18 2 18 9"></polyline>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
          <rect x="6" y="14" width="12" height="8"></rect>
        </svg>
        Print / Save PDF
      </button>
      <button class="btn btn-secondary" onclick="window.close()" title="Close external sheet">
        Close
      </button>
    </div>
  </header>

  <main class="sheet-wrapper">
    ${clone.outerHTML}
    <div class="clean-footer">
      JOE Guitar Studio &bull; ${songTitle} &bull; Full Lead Chord Sheet
    </div>
  </main>

  <script>
    // Enable Ctrl+P / Cmd+P print shortcut
    window.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        window.print();
      }
    });
  </script>
</body>
</html>`;
  };

  // Open full chord sheet in an external web page / new browser tab
  // Guarantees ONLY 1 external tab is opened and reused across clicks
  const handleOpenExternalPage = async () => {
    const html = generateFullHtmlSheet();
    if (!html) {
      showToast("Unable to generate chord sheet HTML.");
      return;
    }

    const EXTERNAL_TAB_TARGET = "JoeGuitarStudio_ExternalLeadSheet";

    // Synchronously open / acquire the single external tab to avoid popup blockers
    let extWin: Window | null = null;
    try {
      extWin = window.open("", EXTERNAL_TAB_TARGET);
      if (extWin && (!extWin.location.href || extWin.location.href === "about:blank")) {
        extWin.document.title = `${song.title || "Chord Sheet"} - Loading...`;
        extWin.document.body.style.backgroundColor = "#0f172a";
        extWin.document.body.style.color = "#ffffff";
        extWin.document.body.style.fontFamily = "ui-monospace, monospace";
        extWin.document.body.style.display = "flex";
        extWin.document.body.style.alignItems = "center";
        extWin.document.body.style.justifyContent = "center";
        extWin.document.body.style.height = "100vh";
        extWin.document.body.style.margin = "0";
        extWin.document.body.innerHTML = `
          <div style="text-align:center;padding:24px;">
            <div style="background:#a3ff12;color:#000;font-weight:900;padding:4px 12px;border-radius:6px;display:inline-block;margin-bottom:12px;font-size:12px;letter-spacing:1px;">JOE GUITAR STUDIO</div>
            <div style="font-size:16px;font-weight:bold;margin-bottom:6px;color:#f8fafc;">Preparing Lead Sheet...</div>
            <div style="font-size:12px;color:#94a3b8;">${song.title || "Song"} (${segments.length} chords)</div>
          </div>
        `;
      }
    } catch {
      extWin = null;
    }

    const songSlug = (song.title || "chords").toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30) || "lead-sheet";
    const sheetId = `sheet-${songSlug}-${Date.now().toString(36)}`;

    try {
      const res = await fetch("/api/external-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html,
          title: `${song.title || "Chord Sheet"} - JOE Guitar Studio Lead Sheet`,
          id: sheetId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          if (extWin && !extWin.closed) {
            extWin.location.href = data.url;
            extWin.focus();
          } else {
            const w = window.open(data.url, EXTERNAL_TAB_TARGET);
            w?.focus();
          }
          showToast("Lead sheet updated in external tab!");
          return;
        }
      }
    } catch {
      // Fallback to Blob URL below
    }

    // Client-side Blob URL fallback
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    if (extWin && !extWin.closed) {
      extWin.location.href = blobUrl;
      extWin.focus();
    } else {
      const w = window.open(blobUrl, EXTERNAL_TAB_TARGET);
      w?.focus();
    }
    showToast("Lead sheet opened in external tab!");
  };

  // Download standalone .html document
  const handleDownloadHtml = () => {
    const html = generateFullHtmlSheet();
    if (!html) {
      showToast("Unable to generate chord sheet HTML.");
      return;
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(song.title || "chord-sheet").toLowerCase().replace(/[^a-z0-9]/g, "-")}-lead-sheet.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Standalone HTML chord sheet downloaded!");
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

    text += `\nGenerated with JOE Guitar Studio Chord Finder\n`;
    return text;
  };

  // Generate Microsoft Word (.doc) formatted document
  const generateWordDocSheet = (): string => {
    const songTitle = song.title || "Untitled Song";
    const songArtist = song.artist || "Unknown Artist";

    let sectionsHtml = "";
    sections.forEach((sec) => {
      const cellsArray = sec.items.map(({ seg }) => {
        const state = resolveChordFinderState(seg.chord, transpose, capo, song.key);
        const chordLabel = capo > 0 && state.isValid ? state.shapeChord : state.transposedChord;
        const sounding = capo > 0 && state.isValid ? `<div style="font-size: 8pt; color: #4b5563;">Sounding: ${state.transposedChord}</div>` : "";
        const dur = (seg.endTime - seg.startTime).toFixed(1);
        return `
          <td style="border: 1pt solid #cbd5e1; padding: 8pt 10pt; vertical-align: top; width: 25%; background: #ffffff;">
            <div style="font-size: 14pt; font-weight: bold; color: #0f172a; font-family: Consolas, monospace;">${chordLabel}</div>
            ${sounding}
            <div style="font-size: 8.5pt; color: #64748b; font-family: Consolas, monospace; margin-top: 3pt;">
              ${formatTime(seg.startTime)} • ${dur}s
            </div>
          </td>
        `;
      });

      let rowsHtml = "";
      for (let i = 0; i < cellsArray.length; i += 4) {
        const chunk = cellsArray.slice(i, i + 4);
        while (chunk.length < 4) {
          chunk.push(`<td style="border: 1pt solid #e2e8f0; padding: 8pt 10pt; width: 25%; background: #f8fafc;">&nbsp;</td>`);
        }
        rowsHtml += `<tr>${chunk.join("")}</tr>`;
      }

      sectionsHtml += `
        <div style="margin-top: 16pt; margin-bottom: 8pt;">
          <div style="font-size: 12pt; font-weight: bold; color: #0f172a; background: #f1f5f9; padding: 6pt 10pt; border-left: 4pt solid #16a34a;">
            ${sec.name.toUpperCase()} <span style="font-size: 9.5pt; font-weight: normal; color: #64748b; margin-left: 8pt;">(${formatTime(sec.startTime)} - ${formatTime(sec.endTime)})</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 6pt; margin-bottom: 12pt;">
            ${rowsHtml}
          </table>
        </div>
      `;
    });

    const voicingsHtml = uniqueChordVoicings.map((v) => `
      <tr>
        <td style="border: 1pt solid #e2e8f0; padding: 6pt 10pt; font-weight: bold; font-family: Consolas, monospace; font-size: 11pt;">${v.targetShape}</td>
        <td style="border: 1pt solid #e2e8f0; padding: 6pt 10pt; font-family: Consolas, monospace; font-size: 10pt;">${v.voicingResult.voicing?.frets.join(" ") || "N/A"}</td>
        <td style="border: 1pt solid #e2e8f0; padding: 6pt 10pt; font-family: Consolas, monospace; font-size: 10pt;">${v.voicingResult.voicing?.fingers?.join(" ") || "-"}</td>
        <td style="border: 1pt solid #e2e8f0; padding: 6pt 10pt; font-size: 9.5pt;">${v.voicingResult.voicing?.barre ? `Fret ${v.voicingResult.voicing.barre}` : "Open"}</td>
      </tr>
    `).join("");

    return `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>${songTitle} - Guitar Lead Sheet</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page {
      size: 8.5in 11.0in;
      margin: 0.8in 0.8in 0.8in 0.8in;
    }
    body {
      font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #0f172a;
      background: #ffffff;
    }
    h1 {
      font-size: 22pt;
      font-weight: bold;
      color: #0f172a;
      margin: 0 0 2pt 0;
    }
    .subtitle {
      font-size: 12pt;
      color: #475569;
      margin: 0 0 14pt 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
  </style>
</head>
<body>
  <div>
    <h1>${songTitle}</h1>
    <div class="subtitle">${songArtist} • Guitar Lead Chord Sheet</div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16pt; background: #f8fafc; border: 1pt solid #cbd5e1;">
      <tr>
        <td style="border: 1pt solid #cbd5e1; padding: 6pt 10pt; font-size: 9.5pt;"><strong>KEY:</strong> ${song.key || "C"}</td>
        <td style="border: 1pt solid #cbd5e1; padding: 6pt 10pt; font-size: 9.5pt;"><strong>TEMPO:</strong> ${song.tempo || 120} BPM</td>
        <td style="border: 1pt solid #cbd5e1; padding: 6pt 10pt; font-size: 9.5pt;"><strong>CAPO:</strong> ${capo > 0 ? `Fret ${capo}` : "None"}</td>
      </tr>
      <tr>
        <td style="border: 1pt solid #cbd5e1; padding: 6pt 10pt; font-size: 9.5pt;"><strong>TUNING:</strong> ${song.tuning || "Standard E A D G B E"}</td>
        <td style="border: 1pt solid #cbd5e1; padding: 6pt 10pt; font-size: 9.5pt;"><strong>TIME:</strong> ${song.timeSignature || "4/4"}</td>
        <td style="border: 1pt solid #cbd5e1; padding: 6pt 10pt; font-size: 9.5pt;"><strong>DURATION:</strong> ${formatTime(duration)}</td>
      </tr>
    </table>

    <div style="font-weight: bold; font-size: 11pt; color: #334155; margin-bottom: 4pt; text-transform: uppercase;">
      Chord Voicings Reference (${uniqueChordVoicings.length} Unique Chords)
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 18pt;">
      <thead>
        <tr style="background: #f1f5f9; font-weight: bold; font-size: 9.5pt;">
          <th style="border: 1pt solid #cbd5e1; padding: 5pt 10pt; text-align: left;">Chord Shape</th>
          <th style="border: 1pt solid #cbd5e1; padding: 5pt 10pt; text-align: left;">Frets (E A D G B e)</th>
          <th style="border: 1pt solid #cbd5e1; padding: 5pt 10pt; text-align: left;">Finger Placement</th>
          <th style="border: 1pt solid #cbd5e1; padding: 5pt 10pt; text-align: left;">Barre Fret</th>
        </tr>
      </thead>
      <tbody>
        ${voicingsHtml}
      </tbody>
    </table>

    <div style="font-weight: bold; font-size: 12pt; color: #0f172a; margin-top: 14pt; margin-bottom: 6pt; text-transform: uppercase;">
      Song Progression
    </div>
    ${sectionsHtml}
  </div>
</body>
</html>`;
  };

  const handleDownloadWordDoc = () => {
    const docHtml = generateWordDocSheet();
    const blob = new Blob([docHtml], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(song.title || "chord-sheet").toLowerCase().replace(/[^a-z0-9]/g, "-")}-lead-sheet.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Word Document (.doc) downloaded!");
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

  const isLightSheet = sheetTheme === "light";

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
      <header className="relative max-w-4xl mx-auto flex items-center justify-between gap-1.5 sm:gap-2 mb-3 bg-[#151922] border border-white/10 rounded-2xl px-2 sm:px-4 py-1.5 sm:py-2.5 text-white shadow-md print:hidden max-w-full overflow-hidden">
        {/* Left: Back button */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 text-xs font-mono font-bold transition-all cursor-pointer shrink-0"
            title="Return to standard studio"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#a3ff12]" />
            <span>Back</span>
          </button>
        </div>

        {/* Right: Actions Carousel (Horizontally swipeable & slidable to show all buttons) */}
        <div className="relative flex items-center min-w-0 flex-1 justify-end overflow-hidden">
          {/* Left scroll / swipe nudge button (visible when scrolled to right) */}
          {canScrollLeft && (
            <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center pr-2 bg-gradient-to-r from-[#151922] via-[#151922]/90 to-transparent">
              <button
                onClick={() => handleScrollNudge("left")}
                className="w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all shadow-sm cursor-pointer"
                title="Scroll buttons left"
                aria-label="Scroll buttons left"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Swipeable / Slidable Track */}
          <div
            ref={topButtonsContainerRef}
            onScroll={updateScrollIndicators}
            onMouseDown={handleTopBarMouseDown}
            onMouseMove={handleTopBarMouseMove}
            onMouseUp={handleTopBarMouseUp}
            onMouseLeave={handleTopBarMouseUp}
            className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x py-0.5 px-0.5 max-w-full shrink min-w-0 [-webkit-overflow-scrolling:touch] cursor-grab active:cursor-grabbing select-none"
          >
            {undoStack.length > 0 && (
              <button
                onClick={handleUndo}
                className="px-2 py-1 sm:px-2.5 sm:py-1 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-[10.5px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                title="Undo last change"
              >
                <Undo2 className="w-3 h-3" />
                <span className="hidden sm:inline">Undo</span>
              </button>
            )}

            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2 py-1 sm:px-2.5 sm:py-1 rounded-xl border text-[10.5px] sm:text-[11px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0 ${
                autoScroll
                  ? "bg-[#a3ff12]/15 border-[#a3ff12]/40 text-[#a3ff12]"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
              }`}
              title="Auto-scroll to currently playing chord"
            >
              <Clock className="w-3 h-3" />
              <span className="hidden md:inline">Follow:</span>
              <span>{autoScroll ? "ON" : "OFF"}</span>
            </button>

            {/* Dark / Light Sheet Theme Toggle */}
            <button
              onClick={() => setSheetTheme((prev) => (prev === "light" ? "dark" : "light"))}
              className={`px-2 py-1 sm:px-2.5 sm:py-1 rounded-xl border text-[10.5px] sm:text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                sheetTheme === "dark"
                  ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/25"
                  : "bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:bg-white/10"
              }`}
              title={`Switch to ${sheetTheme === "light" ? "Dark" : "Light"} sheet view`}
            >
              {sheetTheme === "light" ? (
                <>
                  <Moon className="w-3 h-3 text-indigo-400" />
                  <span>Dark</span>
                </>
              ) : (
                <>
                  <Sun className="w-3 h-3 text-amber-400" />
                  <span>Light</span>
                </>
              )}
            </button>

            {/* External Page button */}
            <button
              onClick={handleOpenExternalPage}
              className="px-2 py-1 sm:px-2.5 sm:py-1 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 text-[10.5px] sm:text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              title="Open full chord sheet in an external web page / new tab"
            >
              <ExternalLink className="w-3 h-3 text-sky-400" />
              <span>External</span>
            </button>

            {/* Export Button (Consolidated prominent button opening export formats: HTML, PDF, Word Doc) */}
            <button
              onClick={() => setShowExportModal(true)}
              className="px-2.5 py-1 sm:px-3 sm:py-1 rounded-xl bg-[#a3ff12] hover:bg-[#92eb10] text-black font-mono font-extrabold text-[10.5px] sm:text-[11px] flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95 shrink-0"
              title="Export sheet in HTML, PDF, or Word Doc formats"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>

          {/* Right scroll / swipe nudge button (visible when more buttons exist on right) */}
          {canScrollRight && (
            <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center pl-2 bg-gradient-to-l from-[#151922] via-[#151922]/90 to-transparent">
              <button
                onClick={() => handleScrollNudge("right")}
                className="w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all shadow-sm cursor-pointer animate-pulse"
                title="Scroll to see more buttons"
                aria-label="Scroll buttons right"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
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
      {/* THE SHEET (Crisp Music Paper Lead Sheet or Sleek Dark Sheet)              */}
      {/* ========================================================================= */}
      <article
        id="chord-sheet-printable"
        className={`max-w-4xl mx-auto rounded-2xl sm:rounded-3xl border shadow-2xl p-3 sm:p-6 md:p-8 space-y-4 sm:space-y-5 transition-colors print:bg-white print:text-black print:shadow-none print:border-none print:p-0 print:m-0 print:rounded-none printable-chord-sheet ${
          isLightSheet
            ? "bg-white text-zinc-900 border-zinc-200/90 shadow-black/30"
            : "bg-[#0d1117] text-zinc-100 border-white/10 shadow-black/80"
        }`}
      >
        {/* Lead Sheet Title Header & Metadata Strip */}
        <section aria-label="Song Header" className={`border-b-2 pb-3 sm:pb-4 transition-colors ${isLightSheet ? "border-zinc-900" : "border-white/20"}`}>
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div className="min-w-0 flex-1 overflow-hidden">
              <div
                className="overflow-hidden whitespace-nowrap min-w-0 max-w-full relative [mask-image:linear-gradient(to_right,white_85%,transparent)]"
                title={song.title}
              >
                <div className="marquee-slow hover:[animation-play-state:paused]">
                  <h1 className={`text-xl sm:text-2xl md:text-3xl font-black tracking-tight font-mono pr-8 shrink-0 ${isLightSheet ? "text-zinc-900" : "text-white"}`}>
                    {song.title || "Untitled Song"}
                  </h1>
                  <h1 className={`text-xl sm:text-2xl md:text-3xl font-black tracking-tight font-mono pr-8 shrink-0 ${isLightSheet ? "text-zinc-900" : "text-white"}`} aria-hidden="true">
                    {song.title || "Untitled Song"}
                  </h1>
                </div>
              </div>
              {song.artist && (
                <p className={`text-xs sm:text-sm font-mono font-medium truncate mt-0.5 ${isLightSheet ? "text-zinc-600" : "text-zinc-400"}`}>
                  {song.artist}
                </p>
              )}
            </div>

            {/* Quick Metadata Badges Strip */}
            <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono">
              <span className={`px-2 py-0.5 rounded-md border font-bold ${isLightSheet ? "bg-zinc-100 border-zinc-300 text-zinc-800" : "bg-white/5 border-white/10 text-zinc-300"}`}>
                Key: <strong className={isLightSheet ? "text-zinc-950" : "text-[#a3ff12]"}>{song.key || "C"}</strong>
              </span>
              <span className={`px-2 py-0.5 rounded-md border font-bold ${isLightSheet ? "bg-zinc-100 border-zinc-300 text-zinc-800" : "bg-white/5 border-white/10 text-zinc-300"}`}>
                {song.tempo || 120} BPM
              </span>
              {capo > 0 && (
                <span className={`px-2 py-0.5 rounded-md border font-extrabold ${isLightSheet ? "bg-sky-50 border-sky-300 text-sky-800" : "bg-sky-500/15 border-sky-500/30 text-sky-300"}`}>
                  Capo {capo}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-md border hidden sm:inline ${isLightSheet ? "bg-zinc-100 border-zinc-200 text-zinc-600" : "bg-white/5 border-white/10 text-zinc-400"}`}>
                {song.timeSignature || "4/4"}
              </span>
              <span className={`px-2 py-0.5 rounded-md border ${isLightSheet ? "bg-zinc-100 border-zinc-200 text-zinc-600" : "bg-white/5 border-white/10 text-zinc-400"}`}>
                {segments.length} Chords • {formatTime(duration)}
              </span>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* CHORD DIAGRAMS SECTION (Crisp Paper Grid or Dark Green Voicings)          */}
        {/* ========================================================================= */}
        <section
          aria-label="Chord Voicings"
          className={`border rounded-2xl p-3 sm:p-4 shadow-xs transition-all print:border-zinc-300 print:bg-white ${
            isLightSheet
              ? "bg-white border-zinc-200/90 text-zinc-900"
              : "bg-[#161b22] border-white/10 text-white"
          }`}
        >
          {/* Header Row: Title & Strum preview hint & Collapse toggle */}
          <div className={`flex items-center justify-between gap-2 pb-2.5 border-b ${isLightSheet ? "border-zinc-100" : "border-white/10"}`}>
            <div
              onClick={() => setShowDiagrams(!showDiagrams)}
              className="flex items-center gap-2 cursor-pointer select-none group"
            >
              <Music className={`w-4 h-4 ${isLightSheet ? "text-zinc-900" : "text-[#a3ff12]"}`} />
              <h2 className={`text-xs sm:text-sm font-mono font-bold tracking-tight transition-colors ${
                isLightSheet
                  ? "text-zinc-900 group-hover:text-black"
                  : "text-white group-hover:text-[#a3ff12]"
              }`}>
                ♫ CHORD DIAGRAMS ({uniqueChordVoicings.length} UNIQUE)
              </h2>
              {showDiagrams ? (
                <ChevronUp className={`w-3.5 h-3.5 ${isLightSheet ? "text-zinc-400 group-hover:text-zinc-600" : "text-zinc-500 group-hover:text-white"}`} />
              ) : (
                <ChevronDown className={`w-3.5 h-3.5 ${isLightSheet ? "text-zinc-400 group-hover:text-zinc-600" : "text-zinc-500 group-hover:text-white"}`} />
              )}
            </div>

            <span className={`text-[10px] sm:text-[11px] font-mono hidden sm:inline ${isLightSheet ? "text-zinc-500" : "text-zinc-400"}`}>
              Click any diagram to hear strum preview
            </span>
          </div>

          {/* Unique Chord Diagram Cards Grid - always rendered for print/PDF */}
          <div className={`pt-3 animate-in fade-in duration-150 ${showDiagrams ? "block" : "hidden print:block print-force-show print-force-diagrams"}`}>
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
                        ? isLightSheet
                          ? "bg-[#ecfdf5] border-2 border-[#10b981] shadow-md ring-2 ring-[#10b981]/30 scale-[1.02]"
                          : "bg-[#10b981]/15 border-2 border-[#10b981] shadow-md ring-2 ring-[#10b981]/40 scale-[1.02]"
                        : isLightSheet
                        ? "bg-white hover:bg-zinc-50 border border-zinc-200/90 text-zinc-900 shadow-xs"
                        : "bg-[#1c2128] hover:bg-[#252c36] border-white/10 text-white shadow-xs"
                    }`}
                    title={`Click to strum ${targetShape}`}
                  >
                    {/* Card Header: Chord Name & "NOW PLAYING" badge */}
                    <div className="flex items-center justify-between w-full mb-1">
                      <span
                        className={`text-sm sm:text-base font-black font-mono tracking-tight ${
                          isCurrentlyPlaying
                            ? "text-[#10b981]"
                            : isLightSheet ? "text-zinc-900" : "text-white"
                        }`}
                      >
                        {targetShape}
                      </span>
                      {isCurrentlyPlaying && (
                        <span className="bg-[#10b981] text-white text-[7.5px] sm:text-[8.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs shrink-0">
                          PLAYING
                        </span>
                      )}
                    </div>

                    {/* Guitar Chord Diagram - Black in Light Mode, Green in Dark Mode */}
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
                          theme={sheetTheme}
                          className="max-h-full max-w-full"
                        />
                      ) : (
                        <div className={`text-[10px] font-mono text-center py-4 ${isLightSheet ? "text-zinc-400" : "text-zinc-500"}`}>
                          No diagram
                        </div>
                      )}
                    </div>

                    {/* Card Footer: Preview button with play icon */}
                    <div
                      className={`mt-1 flex items-center justify-center gap-1 text-[9px] sm:text-[10px] font-mono transition-colors pt-1 border-t print:hidden ${
                        isLightSheet ? "border-zinc-100" : "border-white/5"
                      } ${
                        isCurrentlyPlaying
                          ? "text-[#10b981] font-bold"
                          : isLightSheet ? "text-zinc-500 group-hover:text-zinc-900" : "text-zinc-400 group-hover:text-white"
                      }`}
                    >
                      <Play className={`w-2.5 h-2.5 fill-current ${isCurrentlyPlaying ? "text-[#10b981]" : ""}`} />
                      <span>Preview</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
          <div className="flex items-center justify-between gap-2 px-1 print:hidden print-hidden">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-700 font-bold">
              <Layers className="w-4 h-4 text-emerald-700 shrink-0 inline-block align-middle" />
              <span className="inline-block align-middle">SONG SECTIONS ({sections.length})</span>
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
            const SectionIcon = getSectionIcon(section.name);

            return (
              <div
                key={`section-${sIdx}-${section.name}-${section.startIndex}`}
                className={`section-wrapper rounded-2xl border transition-all duration-200 overflow-visible print:border-zinc-300 print:shadow-none print:bg-white print:overflow-visible ${
                  isSectionActive
                    ? isLightSheet
                      ? "border-2 border-[#10b981] shadow-md ring-2 ring-[#10b981]/20"
                      : "border-2 border-[#10b981] shadow-md ring-2 ring-[#10b981]/30"
                    : isLightSheet ? "border-zinc-200 hover:border-zinc-300" : "border-white/10 hover:border-white/20"
                } ${isLightSheet ? "bg-white" : "bg-[#161b22]"}`}
              >
                {/* SECTION HEADER BANNER (Paper style or Sleek Dark) */}
                <div
                  className={`section-header-banner px-2.5 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-1.5 sm:gap-2 border-b border-l-4 ${style.accentBorder} print:bg-zinc-50 print:border-zinc-300 max-w-full overflow-hidden ${
                    isLightSheet
                      ? `border-zinc-200 ${style.headerBg}`
                      : "border-white/10 bg-[#1c2128]"
                  }`}
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {/* Section Tag Badge with properly placed icon */}
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
                          className={`font-mono font-bold text-xs px-2 py-0.5 rounded border focus:outline-none w-28 sm:w-36 shadow-xs ${
                            isLightSheet ? "bg-white text-zinc-900 border-emerald-500" : "bg-[#0d1117] text-white border-[#a3ff12]"
                          }`}
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
                          className={`px-2.5 py-1 rounded-lg border font-mono font-extrabold text-xs flex items-center gap-1.5 cursor-pointer hover:opacity-85 transition-opacity ${style.badgeBg}`}
                          title="Click to rename this section"
                        >
                          <SectionIcon className={`w-3.5 h-3.5 shrink-0 ${style.iconColor}`} />
                          <span>{section.name}</span>
                          <Edit3 className="w-2.5 h-2.5 opacity-60 ml-0.5 print:hidden" />
                        </span>

                        {isSectionActive && (
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider animate-pulse hidden sm:inline print:hidden ${
                            isLightSheet
                              ? "bg-[#ecfdf5] border border-[#10b981] text-[#10b981]"
                              : "bg-[#10b981]/20 border border-[#10b981] text-[#10b981]"
                          }`}>
                            NOW PLAYING
                          </span>
                        )}
                      </div>
                    )}

                    {/* Section Time Span */}
                    <span className={`text-[10px] font-mono shrink-0 truncate max-w-[125px] sm:max-w-none ${isLightSheet ? "text-zinc-500" : "text-zinc-400"}`}>
                      {formatTime(section.startTime)} - {formatTime(section.endTime)} <span className="hidden sm:inline">({section.items.length} chords)</span>
                    </span>
                  </div>

                  {/* Right: Section Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 print:hidden">
                    {/* Play from section start */}
                    <button
                      onClick={() => {
                        handleSeekAndFollow(section.startTime);
                        if (!isPlaying) onPlayPause();
                      }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs ${
                        isLightSheet
                          ? "bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300"
                          : "bg-white/10 hover:bg-white/20 text-white border border-white/15"
                      }`}
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
                <div className={`p-2 sm:p-3 transition-colors ${isLightSheet ? "bg-white" : "bg-[#0d1117]"}`}>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 sm:gap-2 print:grid print:grid-cols-4">
                    {section.items.map(({ seg, originalIndex }) => {
                      const state = resolveChordFinderState(seg.chord, transpose, capo, song.key);
                      const chordLabel = capo > 0 && state.isValid ? state.shapeChord : state.transposedChord;
                      const isActive = originalIndex === activeSegmentIdx;
                      const segDuration = (seg.endTime - seg.startTime).toFixed(1);
                      const timeInSeg = Math.max(0, currentTime - seg.startTime);
                      const segTotal = Math.max(0.1, seg.endTime - seg.startTime);
                      const segProgressPct = isActive ? Math.min(100, Math.max(0, (timeInSeg / segTotal) * 100)) : 0;

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
                          id={`chord-cell-${originalIndex}`}
                          key={seg.id || `chord-${originalIndex}-${seg.startTime}`}
                          ref={isActive ? activeChordRef : null}
                          data-active-chord={isActive ? "true" : "false"}
                          onClick={() => handleSeekAndFollow(seg.startTime)}
                          className={`group chord-card relative rounded-xl p-1.5 sm:p-2 border transition-all duration-150 cursor-pointer flex flex-col justify-between select-none scroll-mt-24 sm:scroll-mt-28 md:scroll-mt-32 print-break-inside-avoid print:bg-white print:border-zinc-300 overflow-hidden ${
                            isActive
                              ? isLightSheet
                                ? "bg-[#ecfdf5] border-2 border-[#10b981] ring-2 ring-[#10b981]/30 shadow-lg scale-[1.02] text-zinc-950"
                                : "bg-[#10b981]/15 border-2 border-[#a3ff12] ring-2 ring-[#a3ff12]/40 shadow-[0_0_20px_rgba(163,255,18,0.25)] scale-[1.02] text-white"
                              : isLightSheet
                              ? "bg-white hover:bg-zinc-50 border border-zinc-200/90 text-zinc-800 shadow-xs"
                              : "bg-[#1c2128] hover:bg-[#252c36] border border-white/10 text-zinc-200 shadow-xs"
                          }`}
                          title={`Jump to ${chordLabel} at ${formatTime(seg.startTime)}`}
                        >
                          {/* Active Chord Real-time Progress Bar */}
                          {isActive && (
                            <div className="absolute top-0 left-0 right-0 h-1 bg-black/10 overflow-hidden print:hidden">
                              <div
                                className={`h-full transition-all duration-75 ${
                                  isLightSheet ? "bg-[#10b981]" : "bg-[#a3ff12]"
                                }`}
                                style={{ width: `${segProgressPct}%` }}
                              />
                            </div>
                          )}

                          {/* Top: Timestamp & Duration */}
                          <div className={`flex items-center justify-between text-[8.5px] sm:text-[9.5px] font-mono mb-0.5 ${isLightSheet ? "text-zinc-500" : "text-zinc-400"}`}>
                            <span
                              className={`px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded font-bold ${
                                isActive
                                  ? isLightSheet ? "bg-[#10b981] text-white font-extrabold shadow-xs" : "bg-[#a3ff12] text-black font-extrabold shadow-xs"
                                  : isLightSheet ? "bg-zinc-100 text-zinc-700 border border-zinc-200" : "bg-white/5 text-zinc-300 border border-white/10"
                              }`}
                            >
                              {formatTime(seg.startTime)}
                            </span>
                            <span className={`text-[8px] sm:text-[9px] font-mono ${isLightSheet ? "text-zinc-400" : "text-zinc-500"}`}>{segDuration}s</span>
                          </div>

                          {/* Center 1: Chord Symbol */}
                          <div className="text-center pt-0.5">
                            <span
                              className={`text-base sm:text-lg md:text-xl font-mono font-black tracking-tight transition-transform ${
                                isActive
                                  ? isLightSheet ? "text-emerald-700 scale-105 inline-block" : "text-[#a3ff12] scale-105 inline-block"
                                  : isLightSheet ? "text-zinc-900" : "text-white"
                              }`}
                            >
                              {chordLabel}
                            </span>
                            {capo > 0 && state.isValid && state.shapeChord !== state.transposedChord && (
                              <span className={`block text-[8px] sm:text-[8.5px] font-mono font-bold truncate ${isLightSheet ? "text-sky-700" : "text-sky-400"}`}>
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
                                theme={sheetTheme}
                                className="max-h-full max-w-full"
                              />
                            ) : (
                              <div className={`text-[8.5px] font-mono text-center py-1 ${isLightSheet ? "text-zinc-400" : "text-zinc-500"}`}>
                                N/A
                              </div>
                            )}
                          </div>

                          {/* Bottom Row: Actions (Play status, Tag section, Remove) */}
                          <div className={`flex items-center justify-between pt-0.5 border-t mt-0.5 print:hidden ${isLightSheet ? "border-zinc-100" : "border-white/5"}`}>
                            <span
                              className={`text-[8.5px] sm:text-[9px] font-mono flex items-center gap-0.5 sm:gap-1 ${
                                isActive
                                  ? isLightSheet ? "text-emerald-700 font-bold" : "text-[#a3ff12] font-bold"
                                  : isLightSheet ? "text-zinc-400 group-hover:text-zinc-600" : "text-zinc-500 group-hover:text-zinc-300"
                              }`}
                            >
                              {isActive ? (
                                <>
                                  <Play className={`w-2 h-2 fill-current animate-pulse ${isLightSheet ? "text-emerald-700" : "text-[#a3ff12]"}`} />
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
                                className={`p-0.5 rounded transition-colors cursor-pointer ${
                                  isLightSheet
                                    ? "hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
                                    : "hover:bg-white/10 text-zinc-500 hover:text-zinc-300"
                                }`}
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
                                className={`p-0.5 rounded transition-colors cursor-pointer ${
                                  isLightSheet
                                    ? "hover:bg-red-50 text-zinc-400 hover:text-red-600"
                                    : "hover:bg-red-500/10 text-zinc-500 hover:text-red-400"
                                }`}
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

        {/* Lead Sheet Footer Note (Hidden on Print, PDF export, and external sheet) */}
        <div
          data-footer-instruction="true"
          className={`pt-3 border-t flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono gap-1.5 print:hidden print-hidden editor-instruction-footer ${
            isLightSheet ? "border-zinc-200 text-zinc-400" : "border-white/10 text-zinc-500"
          }`}
        >
          <span className="font-bold">JOE Guitar Studio • Lead Chord Sheet</span>
          <span>Click any chord to seek • Tap tag to split sections • Tap trash to remove</span>
        </div>
      </article>

      {/* ========================================================================= */}
      {/* FLOATING PLAYBACK DOCK (Pinned Safely ABOVE Mobile Bottom Navigation)     */}
      {/* ========================================================================= */}
      <aside
        aria-label="Playback Controls"
        className="fixed bottom-[74px] md:bottom-5 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-2xl bg-[#0f121a]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-2 sm:p-3 flex flex-col gap-1.5 sm:gap-2 text-white print:hidden max-w-[calc(100vw-1rem)] overflow-hidden"
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
            onChange={(e) => handleSeekAndFollow(parseFloat(e.target.value))}
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
              onClick={() => handleSeekAndFollow(Math.max(0, currentTime - 4))}
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
              onClick={() => handleSeekAndFollow(Math.min(duration, currentTime + 4))}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Forward 4s"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right: Follow Chords Toggle & Active chord badge */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-right">
            <button
              onClick={() => {
                const next = !autoScroll;
                setAutoScroll(next);
                if (next && activeSegmentIdx !== -1) {
                  scrollToChord(activeSegmentIdx, true);
                }
              }}
              className={`px-2 py-1 rounded-lg border text-[10px] sm:text-[11px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0 ${
                autoScroll
                  ? "bg-[#a3ff12]/20 border-[#a3ff12]/50 text-[#a3ff12] shadow-[0_0_10px_rgba(163,255,18,0.2)]"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
              }`}
              title={autoScroll ? "Following chords during playback (Click to pause)" : "Auto-scroll paused (Click to follow)"}
            >
              <Clock className="w-3 h-3" />
              <span className="hidden sm:inline">Follow:</span>
              <span>{autoScroll ? "ON" : "OFF"}</span>
            </button>

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
              {/* Option 1: HTML Document (.html) */}
              <button
                onClick={() => {
                  setShowExportModal(false);
                  setTimeout(() => handleDownloadHtml(), 100);
                }}
                className="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-400/40 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                    <FileCode className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold font-mono text-white group-hover:text-amber-300">
                        HTML Format
                      </h4>
                      <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold uppercase">
                        .html
                      </span>
                    </div>
                    <p className="text-[10.5px] font-mono text-zinc-400 mt-0.5">
                      Standalone interactive sheet with playable chords & miniature diagrams
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-zinc-400 group-hover:text-amber-400 transition-colors">&rarr;</span>
              </button>

              {/* Option 2: PDF Document (.pdf) */}
              <button
                onClick={() => {
                  setShowExportModal(false);
                  setTimeout(() => handlePrint(), 200);
                }}
                className="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-400/40 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform">
                    <Printer className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold font-mono text-white group-hover:text-purple-300">
                        PDF Format
                      </h4>
                      <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold uppercase">
                        .pdf / print
                      </span>
                    </div>
                    <p className="text-[10.5px] font-mono text-zinc-400 mt-0.5">
                      Clean multi-page printable sheet with chord voicings & diagrams
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-zinc-400 group-hover:text-purple-400 transition-colors">&rarr;</span>
              </button>

              {/* Option 3: Word Document (.doc) */}
              <button
                onClick={() => {
                  setShowExportModal(false);
                  setTimeout(() => handleDownloadWordDoc(), 100);
                }}
                className="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-sky-400/40 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold font-mono text-white group-hover:text-sky-300">
                        Word Doc Format
                      </h4>
                      <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono font-bold uppercase">
                        .doc
                      </span>
                    </div>
                    <p className="text-[10.5px] font-mono text-zinc-400 mt-0.5">
                      Structured chord chart for Microsoft Word, Google Docs & Apple Pages
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-zinc-400 group-hover:text-sky-400 transition-colors">&rarr;</span>
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
