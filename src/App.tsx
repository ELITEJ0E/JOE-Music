/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SidebarNav } from "./components/SidebarNav";
import { TopHeaderBar } from "./components/TopHeaderBar";
import { BottomStatusBar } from "./components/BottomStatusBar";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { HomeDashboard } from "./components/HomeDashboard";
import { TunerPanel } from "./components/TunerPanel";
import { ToneStudio } from "./components/ToneStudio";
import { ChordFinderStudio } from "./components/ChordFinderStudio";
import { FretboardViewer } from "./components/FretboardViewer";
import { ChordDictionary } from "./components/ChordDictionary";
import { LooperStation } from "./components/LooperStation";
import { MultiTrackStudio } from "./components/MultiTrackStudio";
import { DrumMetronome } from "./components/DrumMetronome";
import { PracticeStudio } from "./components/PracticeStudio";
import { PresetsLibraryView } from "./components/PresetsLibraryView";
import { MobileRecordingsView } from "./components/MobileRecordingsView";
import { DeviceSettingsModal } from "./components/DeviceSettingsModal";
import { WorkstationMode, TonePreset } from "./types";
import { Radio, Settings, User } from "lucide-react";

export default function App() {
  const [activeMode, setActiveMode] = useState<WorkstationMode>("home");
  const [globalBpm, setGlobalBpm] = useState<number>(120);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isDevicesOpen, setIsDevicesOpen] = useState<boolean>(false);

  const handleSelectMode = (mode: WorkstationMode) => {
    setActiveMode(mode);
  };

  const handleSelectTonePreset = (preset: TonePreset) => {
    setActiveMode("tone-studio");
  };

  return (
    <ErrorBoundary>
      <div className="h-screen w-screen bg-[#0a0c0e] text-[#e5e7eb] flex flex-col selection:bg-[#00FF66] selection:text-black overflow-hidden font-sans">
        {/* Mobile Top Header */}
        <div className="md:hidden h-14 bg-[#0d0f12] border-b border-[#191d24] px-4 flex items-center justify-between shrink-0 z-30">
          <div className="flex items-center space-x-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#00FF66] shadow-[0_0_8px_#00FF66]" />
            <span className="font-extrabold text-sm tracking-tight text-[#00FF66]">
              Obsidian Sonic
            </span>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => setIsDevicesOpen(true)}
              className="p-1.5 rounded-lg bg-[#14171c] text-zinc-300"
            >
              <Radio className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 rounded-lg bg-[#14171c] text-zinc-300"
            >
              <Settings className="w-4 h-4" />
            </button>
            <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-white text-xs">
              <User className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Main Desktop Container (Sidebar + Workstation) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Desktop Left Persistent Sidebar */}
          <div className="hidden md:flex h-full">
            <SidebarNav
              activeMode={activeMode}
              onSelectMode={handleSelectMode}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenDevices={() => setIsDevicesOpen(true)}
            />
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0c0e]">
            {/* Desktop Top Header Bar */}
            <div className="hidden md:block">
              <TopHeaderBar
                onOpenSettings={() => setIsSettingsOpen(true)}
                onOpenDevices={() => setIsDevicesOpen(true)}
                onOpenMetronome={() => handleSelectMode("rhythm")}
              />
            </div>

            {/* Scrollable Workstation Module Page */}
            <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 relative z-10">
              {activeMode === "home" && <HomeDashboard onSelectMode={handleSelectMode} />}
              {activeMode === "songs" && <ChordFinderStudio />}
              {activeMode === "chords-ai" && <ChordFinderStudio />}
              {activeMode === "tuner" && <TunerPanel />}
              {activeMode === "chord-dictionary" && <ChordDictionary />}
              {activeMode === "fretboard" && <FretboardViewer />}
              {activeMode === "scales" && <FretboardViewer />}
              {activeMode === "tone-studio" && <ToneStudio />}
              {activeMode === "looper" && <LooperStation />}
              {activeMode === "multi-track" && <MultiTrackStudio />}
              {activeMode === "rhythm" && <DrumMetronome />}
              {activeMode === "practice" && <PracticeStudio />}
              {activeMode === "recordings" && (
                <div className="md:hidden">
                  <MobileRecordingsView onSelectMode={handleSelectMode} />
                </div>
              )}
              {activeMode === "recordings" && (
                <div className="hidden md:block">
                  <MultiTrackStudio />
                </div>
              )}
              {activeMode === "presets" && (
                <PresetsLibraryView
                  onSelectTonePreset={handleSelectTonePreset}
                  onOpenToneStudio={() => handleSelectMode("tone-studio")}
                />
              )}
            </main>

            {/* Desktop Persistent Bottom Status Bar */}
            <BottomStatusBar />
          </div>
        </div>

        {/* Mobile Bottom Fixed Navigation */}
        <MobileBottomNav activeMode={activeMode} onSelectMode={handleSelectMode} />

        {/* Device Settings Modal */}
        <DeviceSettingsModal
          isOpen={isSettingsOpen || isDevicesOpen}
          onClose={() => {
            setIsSettingsOpen(false);
            setIsDevicesOpen(false);
          }}
        />
      </div>
    </ErrorBoundary>
  );
}
