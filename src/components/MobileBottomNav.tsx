import React from "react";
import {
  SlidersHorizontal,
  FolderOpen,
  Sliders,
  Repeat,
  MoreHorizontal,
} from "lucide-react";
import { WorkstationMode } from "../types";

interface MobileBottomNavProps {
  activeMode: WorkstationMode;
  onSelectMode: (mode: WorkstationMode) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeMode,
  onSelectMode,
}) => {
  const tabs = [
    { id: "tuner" as WorkstationMode, label: "Tuner", icon: SlidersHorizontal },
    { id: "studio" as WorkstationMode, label: "Studio", icon: Sliders },
    { id: "chords-ai" as WorkstationMode, label: "Chords", icon: FolderOpen },
    { id: "tone-studio" as WorkstationMode, label: "Tones", icon: Repeat },
    { id: "home" as WorkstationMode, label: "More", icon: MoreHorizontal },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-[#0d0f12]/80 backdrop-blur-md border-t border-white/10 px-4 py-2 flex items-center justify-around z-40">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeMode === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onSelectMode(tab.id)}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all ${
              isActive ? "text-[#a3ff12] font-bold bg-[#a3ff12]/10" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-mono">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
