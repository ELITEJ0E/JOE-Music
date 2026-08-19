import React, { useRef } from "react";
import {
  Sparkles,
  Compass,
  SlidersHorizontal,
  Grid,
  BookOpen,
  Repeat,
  Layers,
  Clock,
  Target,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { WorkstationMode } from "../types";

interface NavigationProps {
  activeMode: WorkstationMode;
  onSelectMode: (mode: WorkstationMode) => void;
}

export interface NavItem {
  id: WorkstationMode;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  badge?: string;
  shortcut: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "chords-ai", label: "AI Chord Finder", shortLabel: "AI Chords", icon: Sparkles, badge: "AI", shortcut: "1" },
  { id: "tuner", label: "Precision Tuner", shortLabel: "Tuner", icon: Compass, shortcut: "2" },
  { id: "tone-studio", label: "Tone & Pedals", shortLabel: "Tone DSP", icon: SlidersHorizontal, badge: "DSP", shortcut: "3" },
  { id: "fretboard", label: "Fretboard & Scales", shortLabel: "Fretboard", icon: Grid, shortcut: "4" },
  { id: "chord-dictionary", label: "Chord Dictionary", shortLabel: "Dictionary", icon: BookOpen, shortcut: "5" },
  { id: "looper", label: "Live Looper", shortLabel: "Looper", icon: Repeat, badge: "4-Track", shortcut: "6" },
  { id: "multi-track", label: "DAW Multi-Track", shortLabel: "DAW Studio", icon: Layers, shortcut: "7" },
  { id: "rhythm", label: "Drums & Metronome", shortLabel: "Rhythm", icon: Clock, shortcut: "8" },
  { id: "practice", label: "Practice & Ear Coach", shortLabel: "Practice", icon: Target, shortcut: "9" },
  { id: "presets", label: "Presets & Recordings", shortLabel: "Vault", icon: FolderOpen, shortcut: "0" },
];

export const Navigation: React.FC<NavigationProps> = ({ activeMode, onSelectMode }) => {
  const navContainerRef = useRef<HTMLDivElement | null>(null);

  const scrollNav = (direction: "left" | "right") => {
    if (navContainerRef.current) {
      const amount = direction === "left" ? -240 : 240;
      navContainerRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  return (
    <nav
      id="guitar-studio-nav"
      className="w-full bg-black/60 backdrop-blur-2xl border-b border-white/10 px-2 sm:px-4 py-2 flex items-center sticky top-16 z-30 shadow-lg relative"
    >
      {/* Left Scroll Button */}
      <button
        onClick={() => scrollNav("left")}
        className="hidden md:flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 text-white/60 hover:text-white border border-white/10 transition-all mr-1.5 shrink-0"
        title="Scroll navigation left"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* Main Tabs Container */}
      <div
        ref={navContainerRef}
        className="flex items-center space-x-1.5 sm:space-x-2 overflow-x-auto no-scrollbar scroll-smooth w-full justify-start md:justify-center py-0.5"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeMode === item.id;

          return (
            <button
              key={item.id}
              id={`nav-tab-${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                onSelectMode(item.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-xl text-xs font-mono font-medium transition-all whitespace-nowrap relative group backdrop-blur-md cursor-pointer select-none active:scale-95 ${
                isActive
                  ? "bg-white/15 text-[#a3ff12] border border-[#a3ff12]/50 shadow-[0_0_20px_rgba(163,255,18,0.2)] font-bold ring-1 ring-[#a3ff12]/30"
                  : "text-white/60 hover:text-white hover:bg-white/10 border border-white/5 hover:border-white/20"
              }`}
            >
              <Icon
                className={`w-4 h-4 transition-transform group-hover:scale-110 shrink-0 ${
                  isActive ? "text-[#a3ff12]" : "text-white/50 group-hover:text-white"
                }`}
              />
              <span className="hidden sm:inline">{item.label}</span>
              <span className="inline sm:hidden">{item.shortLabel}</span>

              {item.badge && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold uppercase tracking-tight ${
                    isActive
                      ? "bg-[#a3ff12] text-black shadow-[0_0_8px_#a3ff12]"
                      : "bg-white/10 text-white/60 group-hover:text-white"
                  }`}
                >
                  {item.badge}
                </span>
              )}

              {/* Active neon bottom glow */}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#a3ff12] shadow-[0_0_10px_#a3ff12] rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Right Scroll Button */}
      <button
        onClick={() => scrollNav("right")}
        className="hidden md:flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 text-white/60 hover:text-white border border-white/10 transition-all ml-1.5 shrink-0"
        title="Scroll navigation right"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
};
