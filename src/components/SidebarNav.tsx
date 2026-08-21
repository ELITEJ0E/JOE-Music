import React from "react";
import {
  Home,
  Music,
  LayoutGrid,
  SlidersHorizontal,
  BookOpen,
  Grid,
  Sliders,
  Repeat,
  Target,
  Mic,
  Layers,
  Settings,
  Radio,
  Download,
  Plus,
} from "lucide-react";
import { WorkstationMode } from "../types";

interface SidebarNavProps {
  activeMode: WorkstationMode;
  onSelectMode: (mode: WorkstationMode) => void;
  onOpenSettings: () => void;
  onOpenDevices: () => void;
}

export const SIDEBAR_ITEMS: {
  id: WorkstationMode;
  label: string;
  icon: React.ElementType;
}[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "songs", label: "Songs", icon: Music },
  { id: "chords-ai", label: "Chord Finder", icon: LayoutGrid },
  { id: "tuner", label: "Tuner", icon: SlidersHorizontal },
  { id: "chord-dictionary", label: "Chord Library", icon: BookOpen },
  { id: "fretboard", label: "Scales", icon: Grid },
  { id: "tone-studio", label: "Tone Studio", icon: Sliders },
  { id: "practice", label: "Practice Studio", icon: Target },
  { id: "studio", label: "Studio", icon: Mic },
  { id: "presets", label: "Presets", icon: Layers },
];

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeMode,
  onSelectMode,
  onOpenSettings,
  onOpenDevices,
}) => {
  return (
    <aside className="w-60 bg-[#0d0f12]/80 backdrop-blur-md border-r border-white/10 flex flex-col justify-between p-4 shrink-0 select-none min-h-screen">
      {/* Brand Top Header */}
      <div>
        <div className="px-3 py-2">
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-extrabold tracking-tight">
              <span className="text-[#a3ff12]">JOE</span> <span className="text-white">Studio</span>
            </h1>
          </div>
        </div>

        {/* Navigation Items List */}
        <nav className="mt-5 space-y-1">
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeMode === item.id;

            return (
              <button
                key={item.id}
                id={`sidebar-link-${item.id}`}
                onClick={() => onSelectMode(item.id)}
                className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all text-left cursor-pointer ${
                  isActive
                    ? "bg-[#a3ff12]/15 backdrop-blur-md text-white border border-[#a3ff12]/40 shadow-[0_0_15px_rgba(163,255,18,0.15)] font-bold ring-1 ring-[#a3ff12]/20"
                    : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? "text-[#a3ff12]" : "text-zinc-400 group-hover:text-white"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Controls & Device Connect */}
      <div className="pt-4 border-t border-white/10 space-y-2.5">
        {/* Connect Device Pill Button */}
        <button
          onClick={onOpenDevices}
          className="w-full py-2.5 px-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 text-xs font-mono font-bold text-zinc-300 hover:text-white flex items-center justify-center gap-2 transition-all hover:border-[#a3ff12]/40 cursor-pointer"
        >
          <Radio className="w-3.5 h-3.5 text-[#a3ff12]" />
          <span>Connect Device</span>
        </button>

        {/* Utility Icon Links */}
        <div className="flex items-center justify-between px-2 pt-1 text-zinc-400 text-xs">
          <button
            onClick={onOpenSettings}
            className="flex items-center space-x-1.5 hover:text-white transition-colors"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="text-[11px] font-mono">Settings</span>
          </button>

          <button
            onClick={onOpenDevices}
            className="flex items-center space-x-1.5 hover:text-white transition-colors"
            title="Connection"
          >
            <Radio className="w-3.5 h-3.5" />
            <span className="text-[11px] font-mono">Connection</span>
          </button>

          <button
            onClick={() => alert("Guitar Studio is PWA ready and installed.")}
            className="hover:text-white transition-colors"
            title="Install App"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
