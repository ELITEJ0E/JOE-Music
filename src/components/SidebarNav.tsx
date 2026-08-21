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
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`bg-[#0d0f12]/80 backdrop-blur-md border-r border-white/10 flex flex-col justify-between p-4 shrink-0 select-none min-h-screen transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-20" : "w-60"
      }`}
    >
      {/* Brand Top Header */}
      <div>
        <div className="flex items-center h-10 px-2 justify-between">
          <div
            className={`flex items-center space-x-2 transition-all duration-300 overflow-hidden ${
              isCollapsed ? "w-0 opacity-0" : "w-32 opacity-100"
            }`}
          >
            <h1 className="text-xl font-extrabold tracking-tight whitespace-nowrap">
              <span className="text-[#a3ff12]">JOE</span> <span className="text-white">Studio</span>
            </h1>
          </div>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all duration-200 cursor-pointer hover:scale-105"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
        </div>

        {/* Navigation Items List */}
        <nav className="mt-6 space-y-1">
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeMode === item.id;

            return (
              <button
                key={item.id}
                id={`sidebar-link-${item.id}`}
                onClick={() => onSelectMode(item.id)}
                className={`w-full flex items-center py-2.5 rounded-xl text-xs font-medium transition-all duration-300 text-left cursor-pointer relative overflow-hidden group ${
                  isCollapsed ? "justify-center px-0" : "px-3.5 space-x-3"
                } ${
                  isActive
                    ? "bg-[#a3ff12]/15 text-white border border-[#a3ff12]/30 shadow-[0_0_15px_rgba(163,255,18,0.1)] font-bold"
                    : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors duration-300 ${
                    isActive ? "text-[#a3ff12]" : "text-zinc-400 group-hover:text-white"
                  }`}
                />
                <span
                  className={`truncate transition-all duration-300 origin-left ${
                    isCollapsed ? "w-0 opacity-0 scale-90" : "w-auto opacity-100 scale-100"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Controls & Device Connect */}
      <div className="pt-4 border-t border-white/10 space-y-3">
        {/* Connect Device Pill Button */}
        <button
          onClick={onOpenDevices}
          className={`w-full rounded-xl bg-white/5 backdrop-blur-md border border-white/10 text-xs font-mono font-bold text-zinc-300 hover:text-white flex items-center justify-center transition-all duration-300 hover:border-[#a3ff12]/30 cursor-pointer hover:bg-white/10 ${
            isCollapsed ? "p-2.5" : "py-2.5 px-3 space-x-2"
          }`}
          title={isCollapsed ? "Connect Device" : undefined}
        >
          <Radio className="w-4 h-4 text-[#a3ff12]" />
          <span
            className={`transition-all duration-300 whitespace-nowrap overflow-hidden ${
              isCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-auto opacity-100"
            }`}
          >
            Connect Device
          </span>
        </button>

        {/* Utility Icon Links - Hidden when collapsed */}
        <div
          className={`transition-all duration-300 overflow-hidden ${
            isCollapsed ? "h-0 opacity-0 pointer-events-none mt-0" : "h-6 opacity-100 mt-2"
          }`}
        >
          <div className="flex items-center justify-center text-zinc-400 text-xs">
            <button
              onClick={() => alert("Guitar Studio is PWA ready and installed.")}
              className="flex items-center space-x-1.5 hover:text-white transition-colors cursor-pointer"
              title="Install App"
            >
              <Download className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[11px] font-mono font-bold">Install App</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
