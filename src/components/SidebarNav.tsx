import React, { useState } from "react";
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
  Radio,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
  Repeat,
} from "lucide-react";
import { WorkstationMode } from "../types";

interface SidebarNavProps {
  activeMode: WorkstationMode;
  onSelectMode: (mode: WorkstationMode) => void;
  onOpenSettings: () => void;
  onOpenDevices: () => void;
  onInstallApp?: () => void;
  isInstalled?: boolean;
}

export const SIDEBAR_ITEMS: {
  id: WorkstationMode;
  label: string;
  icon: React.ElementType;
  badge?: string;
}[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "songs", label: "Joel's Songs", icon: Music },
  { id: "chords-ai", label: "Chord Finder", icon: LayoutGrid },
  { id: "practice", label: "Practice Studio", icon: Target },
  { id: "tuner", label: "Tuner", icon: SlidersHorizontal },
  { id: "chord-dictionary", label: "Chord Library", icon: BookOpen },
  { id: "fretboard", label: "Scales & Fretboard", icon: Grid },
  { id: "studio", label: "JOE Studio DAW", icon: Mic, badge: "PRO" },
  { id: "looper", label: "Looper Station", icon: Repeat },
  { id: "tone-studio", label: "Tone Studio", icon: Sliders },
  { id: "presets", label: "Presets Vault", icon: Layers },
];

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeMode,
  onSelectMode,
  onOpenSettings,
  onOpenDevices,
  onInstallApp,
  isInstalled,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`bg-[#0d0f12]/80 backdrop-blur-md border-r border-white/10 flex flex-col justify-between p-3.5 shrink-0 select-none min-h-screen transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Brand Top Header */}
      <div className="overflow-y-auto overflow-x-hidden no-scrollbar flex-1">
        <div className="flex items-center h-10 px-2 justify-between mb-4">
          <div
            className={`flex items-center space-x-2 transition-all duration-300 overflow-hidden ${
              isCollapsed ? "w-0 opacity-0" : "w-36 opacity-100"
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[#a3ff12] shadow-[0_0_8px_#a3ff12]" />
            <h1 className="text-lg font-extrabold tracking-tight whitespace-nowrap">
              <span className="text-[#a3ff12]">JOE</span> <span className="text-white">Studio</span>
            </h1>
          </div>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all duration-200 cursor-pointer hover:scale-105"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Items List */}
        <nav className="space-y-1">
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeMode === item.id || (item.id === "studio" && activeMode === "multi-track");

            return (
              <button
                key={item.id}
                id={`sidebar-link-${item.id}`}
                onClick={() => onSelectMode(item.id)}
                className={`w-full flex items-center py-2 rounded-xl text-xs font-medium transition-all duration-200 text-left cursor-pointer relative overflow-hidden group ${
                  isCollapsed ? "justify-center px-0" : "px-3 space-x-2.5"
                } ${
                  isActive
                    ? "bg-[#a3ff12]/15 text-white border border-[#a3ff12]/30 shadow-[0_0_15px_rgba(163,255,18,0.1)] font-bold"
                    : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                    isActive ? "text-[#a3ff12]" : "text-zinc-400 group-hover:text-white"
                  }`}
                />
                <span
                  className={`truncate transition-all duration-200 origin-left flex-1 ${
                    isCollapsed ? "w-0 opacity-0 scale-90" : "w-auto opacity-100 scale-100"
                  }`}
                >
                  {item.label}
                </span>
                {!isCollapsed && item.badge && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#a3ff12]/20 text-[#a3ff12] border border-[#a3ff12]/30">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Controls & Device Connect */}
      <div className="pt-3 border-t border-white/10 space-y-2 shrink-0">
        {/* Connect Device Pill Button */}
        <button
          onClick={onOpenDevices}
          className={`w-full rounded-xl bg-white/5 backdrop-blur-md border border-white/10 text-xs font-mono font-bold text-zinc-300 hover:text-white flex items-center justify-center transition-all duration-200 hover:border-[#a3ff12]/30 cursor-pointer hover:bg-white/10 ${
            isCollapsed ? "p-2" : "py-2 px-3 space-x-2"
          }`}
          title={isCollapsed ? "Connect Device" : undefined}
        >
          <Radio className="w-3.5 h-3.5 text-[#a3ff12]" />
          <span
            className={`transition-all duration-200 whitespace-nowrap overflow-hidden ${
              isCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-auto opacity-100"
            }`}
          >
            Audio Device
          </span>
        </button>

        {/* Utility Icon Links */}
        {!isCollapsed && (
          <button
            id="btn-sidebar-install-pwa"
            onClick={onInstallApp}
            className={`w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl border transition-all cursor-pointer font-bold duration-200 ${
              isInstalled
                ? "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                : "bg-[#a3ff12]/5 hover:bg-[#a3ff12]/15 border-[#a3ff12]/20 hover:border-[#a3ff12]/40 text-[#a3ff12] hover:text-white shadow-[0_0_10px_rgba(163,255,18,0.05)]"
            }`}
            title={isInstalled ? "App Installed (PWA)" : "Install App"}
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider">
              {isInstalled ? "App Installed" : "Install App"}
            </span>
          </button>
        )}
      </div>
    </aside>
  );
};
