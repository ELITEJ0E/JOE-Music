import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Download,
  X,
  Share,
  PlusSquare,
  CheckCircle2,
  Sparkles,
  Zap,
  Radio,
  SlidersHorizontal,
  Layers,
  Laptop,
  Smartphone,
  ExternalLink
} from "lucide-react";

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstall: () => void;
  hasPrompt: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  platform: "ios" | "android" | "desktop";
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  onInstall,
  hasPrompt,
  isInstalled,
  isIOS,
  platform,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div id="pwa-install-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            id="pwa-install-modal"
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="relative w-full max-w-md bg-[#13161c] border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden z-10"
          >
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#a3ff12]/10 rounded-full blur-3xl pointer-events-none" />

            {/* Close Button */}
            <button
              id="btn-pwa-close"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
              title="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>

            {/* App Branding & Icon */}
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1c222b] to-[#0c0e12] border border-[#a3ff12]/30 p-2.5 flex items-center justify-center shadow-lg shadow-[#a3ff12]/5 shrink-0">
                <img
                  src="/pwa-icon-192.svg"
                  alt="JOE Studio Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[#a3ff12]/15 text-[#a3ff12] border border-[#a3ff12]/20">
                    PWA STANDALONE
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">v1.0.2</span>
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight mt-0.5 truncate">
                  JOE Guitar Studio
                </h3>
                <p className="text-xs text-zinc-400 truncate">
                  High-Fidelity Audio Workstation & DAW
                </p>
              </div>
            </div>

            {/* Already Installed State */}
            {isInstalled ? (
              <div className="my-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center space-x-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="text-xs text-emerald-300">
                  <p className="font-bold">JOE Studio is already installed!</p>
                  <p className="text-emerald-400/80 text-[11px] mt-0.5">
                    Launch directly from your Home Screen or Applications folder for full-screen low latency DSP.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Feature Highlights */}
                <div className="grid grid-cols-2 gap-2.5 my-5">
                  <div className="p-2.5 rounded-2xl bg-white/5 border border-white/5 flex items-start space-x-2.5">
                    <Zap className="w-4 h-4 text-[#a3ff12] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[11px] font-bold text-white block">Offline DSP Audio</span>
                      <span className="text-[10px] text-zinc-400 leading-tight block">Zero lag tuner & synth</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-white/5 border border-white/5 flex items-start space-x-2.5">
                    <Layers className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[11px] font-bold text-white block">Full Screen DAW</span>
                      <span className="text-[10px] text-zinc-400 leading-tight block">No browser bars</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-white/5 border border-white/5 flex items-start space-x-2.5">
                    <SlidersHorizontal className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[11px] font-bold text-white block">MIDI & Hardware</span>
                      <span className="text-[10px] text-zinc-400 leading-tight block">AudioWorklet support</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-white/5 border border-white/5 flex items-start space-x-2.5">
                    <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[11px] font-bold text-white block">One-Click Launch</span>
                      <span className="text-[10px] text-zinc-400 leading-tight block">Dock & desktop icon</span>
                    </div>
                  </div>
                </div>

                {/* Installation Method depending on Platform / Browser */}
                {isIOS ? (
                  /* iOS Safari Specific Step-by-step instructions */
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                    <div className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-[#a3ff12]" />
                      <span>How to Install on iOS (iPhone / iPad):</span>
                    </div>
                    <ol className="space-y-2.5 text-xs text-zinc-300">
                      <li className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-white/10 text-white font-mono text-[10px] flex items-center justify-center font-bold shrink-0">
                          1
                        </span>
                        <span>
                          Tap the <span className="font-semibold text-white inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/10 rounded"><Share className="w-3 h-3 text-sky-400 inline" /> Share</span> button in Safari
                        </span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-white/10 text-white font-mono text-[10px] flex items-center justify-center font-bold shrink-0">
                          2
                        </span>
                        <span>
                          Scroll down and select <span className="font-semibold text-[#a3ff12] inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/10 rounded"><PlusSquare className="w-3 h-3 text-[#a3ff12] inline" /> Add to Home Screen</span>
                        </span>
                      </li>
                    </ol>
                  </div>
                ) : hasPrompt ? (
                  /* Native BeforeInstallPrompt Available (Chrome, Edge, Brave, Android) */
                  <div className="space-y-3">
                    <button
                      id="btn-pwa-install-action"
                      onClick={onInstall}
                      className="w-full py-3.5 px-4 bg-[#a3ff12] hover:bg-[#b5ff33] text-black font-extrabold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#a3ff12]/20 active:scale-[0.98]"
                    >
                      <Download className="w-4.5 h-4.5 fill-black stroke-[2.5]" />
                      <span>INSTALL JOE STUDIO NOW</span>
                    </button>
                    <p className="text-[11px] text-center text-zinc-400 font-mono">
                      Fast, lightweight & no app store account needed.
                    </p>
                  </div>
                ) : (
                  /* Desktop / Other Browsers (Chrome / Edge / Safari Desktop) */
                  <div className="space-y-3">
                    <button
                      id="btn-pwa-install-action"
                      onClick={onInstall}
                      className="w-full py-3.5 px-4 bg-[#a3ff12] hover:bg-[#b5ff33] text-black font-extrabold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#a3ff12]/20 active:scale-[0.98]"
                    >
                      <Download className="w-4.5 h-4.5 fill-black stroke-[2.5]" />
                      <span>PROMPT APP INSTALLATION</span>
                    </button>
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5 text-[11px] text-zinc-400 space-y-1">
                      <p className="font-medium text-zinc-300">Tip for Desktop Chrome / Edge:</p>
                      <p>You can also click the <strong>Install icon (⊕)</strong> on the right side of your browser's address bar to install immediately.</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Modal Bottom Actions */}
            <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-mono">
                Platform: {platform.toUpperCase()}
              </span>
              <button
                onClick={onClose}
                className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
              >
                {isInstalled ? "Done" : "Maybe Later"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
