import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Home,
  Music,
  LayoutGrid,
  SlidersHorizontal,
  BookOpen,
  Grid,
  Sliders,
  Target,
  Mic,
  Layers,
  MoreHorizontal,
  X,
  Download,
} from "lucide-react";
import { WorkstationMode } from "../types";

interface MobileBottomNavProps {
  activeMode: WorkstationMode;
  onSelectMode: (mode: WorkstationMode) => void;
}

interface NavItem {
  id: WorkstationMode;
  label: string;
  icon: React.ElementType;
}

export const ALL_NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "tuner", label: "Tuner", icon: SlidersHorizontal },
  { id: "chords-ai", label: "Chords", icon: LayoutGrid },
  { id: "studio", label: "Studio", icon: Mic },
  { id: "tone-studio", label: "Tone", icon: Sliders },
  { id: "songs", label: "Joel's Songs", icon: Music },
  { id: "chord-dictionary", label: "Chord Library", icon: BookOpen },
  { id: "fretboard", label: "Scales", icon: Grid },
  { id: "practice", label: "Practice", icon: Target },
  { id: "presets", label: "Presets", icon: Layers },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeMode,
  onSelectMode,
}) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Directly displayed items in the main horizontal bar
  const mainBarItems = ALL_NAV_ITEMS.slice(0, 5);

  // Handle browser popstate / back button navigation for the drawer
  useEffect(() => {
    if (!isSheetOpen) return;

    window.history.pushState({ modal: "mobile-launcher-sheet" }, "");

    const handlePopState = () => {
      setIsSheetOpen(false);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (window.history.state?.modal === "mobile-launcher-sheet") {
        window.history.back();
      }
    };
  }, [isSheetOpen]);

  const handleSelect = (id: WorkstationMode) => {
    onSelectMode(id);
    setIsSheetOpen(false);
  };

  return (
    <>
      {/* CSS injection to hide horizontal scrollbar perfectly */}
      <style>{`
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* Primary Fixed Bottom Nav Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-[#0d0f12]/95 backdrop-blur-lg border-t border-white/10 px-3 py-2.5 flex items-center justify-between z-40">
        {/* Scrollable Left Track containing primary modules */}
        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 pr-2 mr-2 border-r border-white/10">
          {ALL_NAV_ITEMS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeMode === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => handleSelect(tab.id)}
                className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3.5 rounded-xl transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? "text-[#a3ff12] font-extrabold bg-[#a3ff12]/15 shadow-[0_0_10px_rgba(163,255,18,0.1)] border border-[#a3ff12]/20"
                    : "text-zinc-500 hover:text-zinc-300 bg-transparent border border-transparent"
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                <span className="text-[10px] font-mono tracking-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Fixed "More" launcher button */}
        <button
          onClick={() => setIsSheetOpen(true)}
          className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3.5 rounded-xl transition-all shrink-0 cursor-pointer border ${
            isSheetOpen
              ? "text-[#a3ff12] font-extrabold bg-[#a3ff12]/15 border-[#a3ff12]/20"
              : "text-zinc-400 hover:text-white bg-white/5 border-white/5 hover:border-white/10"
          }`}
          title="Open Launcher"
        >
          <MoreHorizontal className="w-4.5 h-4.5" />
          <span className="text-[10px] font-mono tracking-tight">More</span>
        </button>
      </nav>

      {/* Smooth slide-up sheet drawer and dimming overlay */}
      <AnimatePresence>
        {isSheetOpen && (
          <>
            {/* Dark background dimming sheet overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSheetOpen(false)}
              className="md:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            />

            {/* Custom slide-up drawer containing workspace module grid */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 240 }}
              className="md:hidden fixed bottom-0 inset-x-0 bg-[#0d0f12] border-t border-white/10 rounded-t-[2rem] max-h-[90vh] overflow-y-auto p-6 pb-12 z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.9)]"
            >
              {/* iOS style Pull tab drag indicator */}
              <div className="w-12 h-1.5 bg-white/15 rounded-full mx-auto mb-6" />

              {/* Header inside drawer */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-extrabold text-white tracking-tight">
                    Studio <span className="text-[#a3ff12]">Launcher</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Quickly swap workstation modules</p>
                </div>
                <button
                  onClick={() => setIsSheetOpen(false)}
                  className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all duration-200 cursor-pointer"
                  title="Close Menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Visual Grid Launcher showing all workspace modules */}
              <div className="grid grid-cols-3 gap-3">
                {ALL_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeMode === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item.id)}
                      className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-200 cursor-pointer text-center group ${
                        isActive
                          ? "bg-[#a3ff12]/15 text-white border-[#a3ff12]/30 shadow-[0_0_15px_rgba(163,255,18,0.15)] font-bold scale-[1.02]"
                          : "bg-white/5 text-zinc-400 border-transparent hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 transition-all duration-300 ${
                          isActive
                            ? "bg-[#a3ff12]/20 text-[#a3ff12]"
                            : "bg-[#1c2026] text-zinc-400 group-hover:scale-105 group-hover:text-white"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-mono tracking-tight leading-tight uppercase font-semibold">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Mobile Launcher PWA download button bottom drawer */}
              <div className="mt-8 pt-6 border-t border-white/5">
                <button
                  onClick={() => alert("Guitar Studio is PWA ready and installed.")}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#a3ff12]/10 to-[#a3ff12]/5 hover:from-[#a3ff12]/15 hover:to-[#a3ff12]/10 border border-[#a3ff12]/30 flex items-center justify-center space-x-2 text-[#a3ff12] font-bold shadow-[0_0_15px_rgba(163,255,18,0.05)] cursor-pointer"
                >
                  <Download className="w-4.5 h-4.5" />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider">Install App on Mobile</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
