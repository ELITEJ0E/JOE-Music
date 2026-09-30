import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MoreHorizontal,
  X,
  Download,
  Check,
  Sparkles,
} from "lucide-react";
import { WorkstationMode } from "../types";
import { SIDEBAR_ITEMS } from "./SidebarNav";

interface MobileBottomNavProps {
  activeMode: WorkstationMode;
  onSelectMode: (mode: WorkstationMode) => void;
  onInstallApp?: () => void;
  isInstalled?: boolean;
}

export const ALL_NAV_ITEMS = SIDEBAR_ITEMS;

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeMode,
  onSelectMode,
  onInstallApp,
  isInstalled,
}) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Close sheet with Escape key & lock background scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Esc") {
        setIsSheetOpen(false);
      }
    };

    if (isSheetOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isSheetOpen]);

  // Handle browser popstate / back button navigation for the full-screen sheet
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

      {/* Primary Fixed Bottom Nav Bar (Mobile Viewport) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 h-16 bg-[#0d0f12]/95 backdrop-blur-xl border-t border-white/10 px-2.5 flex items-center justify-between z-40 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_25px_rgba(0,0,0,0.8)]"
      >
        {/* Scrollable Left Track containing primary modules */}
        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 pr-2 mr-1.5 border-r border-white/10">
          {ALL_NAV_ITEMS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeMode === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => handleSelect(tab.id)}
                className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? "text-[#a3ff12] font-extrabold bg-[#a3ff12]/15 shadow-[0_0_12px_rgba(163,255,18,0.15)] border border-[#a3ff12]/30"
                    : "text-zinc-400 hover:text-white bg-transparent border border-transparent"
                }`}
                aria-label={`Open ${tab.label}`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[9.5px] font-mono tracking-tight whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Fixed "More" launcher button that slides up full screen sheet */}
        <button
          onClick={() => setIsSheetOpen(true)}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all shrink-0 cursor-pointer border ${
            isSheetOpen
              ? "text-[#a3ff12] font-extrabold bg-[#a3ff12]/15 border-[#a3ff12]/30 shadow-[0_0_10px_rgba(163,255,18,0.2)]"
              : "text-zinc-300 hover:text-white bg-white/5 border-white/10 hover:border-white/20 active:scale-95"
          }`}
          title="Open Full Screen Launcher (Esc to close)"
          aria-label="Open Studio Launcher"
        >
          <MoreHorizontal className="w-4 h-4" />
          <span className="text-[9.5px] font-mono tracking-tight">More</span>
        </button>
      </nav>

      {/* Full Screen Slide-Up Action Sheet Drawer */}
      <AnimatePresence>
        {isSheetOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            {/* Dark background dimming backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsSheetOpen(false)}
              className="fixed inset-0 bg-black/85 backdrop-blur-md z-40"
              aria-hidden="true"
            />

            {/* Full-screen slide-up action sheet */}
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Workstation Modules Launcher"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed inset-0 top-0 bottom-0 left-0 right-0 h-[100dvh] max-h-[100dvh] w-screen bg-[#090b0e] text-white flex flex-col z-50 overflow-hidden shadow-2xl"
            >
              {/* Top Handle and Header with Safe Area Inset */}
              <div className="shrink-0 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] px-5 pb-3 border-b border-white/10 bg-[#0d1015]/90 backdrop-blur-xl">
                {/* Pull down indicator pill */}
                <div
                  onClick={() => setIsSheetOpen(false)}
                  className="w-12 h-1.5 bg-white/20 hover:bg-white/40 rounded-full mx-auto mb-3 cursor-pointer transition-colors"
                  title="Close launcher"
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#a3ff12]/15 border border-[#a3ff12]/30 flex items-center justify-center text-[#a3ff12]">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-extrabold text-white tracking-tight flex items-center gap-1.5">
                        <span>JOE Studio</span>
                        <span className="text-[#a3ff12]">Launcher</span>
                      </h2>
                      <p className="text-[11px] text-zinc-400 font-mono">
                        Select a workstation module ({ALL_NAV_ITEMS.length} Available)
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsSheetOpen(false)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 text-xs font-mono transition-all cursor-pointer active:scale-95"
                    title="Close Launcher (Press Esc)"
                    aria-label="Close Launcher"
                  >
                    <X className="w-4 h-4" />
                    <span className="hidden sm:inline font-bold">Close</span>
                    <kbd className="text-[10px] bg-white/10 px-1 py-0.2 rounded text-zinc-400 font-mono hidden sm:inline">Esc</kbd>
                  </button>
                </div>
              </div>

              {/* Scrollable Grid of All Workstation Modules (Fills entire screen cleanly) */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto">
                  {ALL_NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeMode === item.id;

                    return (
                      <button
                        key={item.id}
                        id={`launcher-module-${item.id}`}
                        onClick={() => handleSelect(item.id)}
                        className={`group relative flex flex-col items-center justify-between p-4 sm:p-5 rounded-2xl border transition-all duration-200 cursor-pointer text-center select-none ${
                          isActive
                            ? "bg-[#a3ff12]/15 text-white border-[#a3ff12] shadow-[0_0_20px_rgba(163,255,18,0.2)] scale-[1.02]"
                            : "bg-[#12151c] hover:bg-[#181d26] text-zinc-300 border-white/10 hover:border-white/20 hover:text-white"
                        }`}
                      >
                        {/* Active Checkmark Badge */}
                        {isActive && (
                          <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#a3ff12] text-black flex items-center justify-center text-[10px] font-black shadow-sm">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                        )}

                        {/* Module Icon Container */}
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-all duration-300 ${
                            isActive
                              ? "bg-[#a3ff12] text-black shadow-[0_0_15px_rgba(163,255,18,0.4)]"
                              : "bg-white/5 text-zinc-400 group-hover:scale-110 group-hover:bg-[#a3ff12]/20 group-hover:text-[#a3ff12]"
                          }`}
                        >
                          <Icon className="w-6 h-6" />
                        </div>

                        {/* Title & Badge */}
                        <div className="w-full min-w-0">
                          <span className="block text-xs sm:text-sm font-mono font-bold tracking-tight text-white group-hover:text-[#a3ff12] transition-colors truncate">
                            {item.label}
                          </span>
                          {item.badge && (
                            <span className="inline-block mt-1 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#a3ff12]/20 text-[#a3ff12] border border-[#a3ff12]/30">
                              {item.badge}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Footer Actions with Safe Area Inset */}
              <div className="shrink-0 p-4 sm:p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] border-t border-white/10 bg-[#0d1015]/95 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-3 max-w-4xl mx-auto w-full">
                <div className="text-xs font-mono text-zinc-400 text-center sm:text-left">
                  <span>Press <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-zinc-300 text-[10px] border border-white/10">Esc</kbd> or tap anywhere to close</span>
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  {!isInstalled && onInstallApp && (
                    <button
                      id="btn-mobile-install-pwa"
                      onClick={() => {
                        setIsSheetOpen(false);
                        onInstallApp();
                      }}
                      className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-[#a3ff12]/15 hover:bg-[#a3ff12]/25 border border-[#a3ff12]/40 text-[#a3ff12] flex items-center justify-center gap-2 text-xs font-mono font-bold cursor-pointer transition-all active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                      <span>Install App</span>
                    </button>
                  )}

                  <button
                    onClick={() => setIsSheetOpen(false)}
                    className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono font-bold text-xs cursor-pointer transition-all text-center"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
