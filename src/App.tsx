/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Header } from "./components/Header";
import { Navigation, NAV_ITEMS } from "./components/Navigation";
import { TunerPanel } from "./components/TunerPanel";
import { ToneStudio } from "./components/ToneStudio";
import { ChordFinderStudio } from "./components/ChordFinderStudio";
import { FretboardViewer } from "./components/FretboardViewer";
import { ChordDictionary } from "./components/ChordDictionary";
import { LooperStation } from "./components/LooperStation";
import { MultiTrackStudio } from "./components/MultiTrackStudio";
import { DrumMetronome } from "./components/DrumMetronome";
import { PracticeStudio } from "./components/PracticeStudio";
import { PresetsRecordingsModal } from "./components/PresetsRecordingsModal";
import { DeviceSettingsModal } from "./components/DeviceSettingsModal";
import { WorkstationMode, TonePreset } from "./types";

export default function App() {
  const [activeMode, setActiveMode] = useState<WorkstationMode>("chords-ai");
  const [globalBpm, setGlobalBpm] = useState<number>(120);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isPresetsOpen, setIsPresetsOpen] = useState<boolean>(false);

  const handleSelectMode = (mode: WorkstationMode) => {
    if (mode === "presets") {
      setIsPresetsOpen(true);
    } else {
      setActiveMode(mode);
    }
  };

  const handleSelectTonePreset = (preset: TonePreset) => {
    setActiveMode("tone-studio");
  };

  // Keyboard shortcut listener: Pressing 1-9 or 0 switches workstation modules
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing inside input, textarea, or contentEditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const match = NAV_ITEMS.find((item) => item.shortcut === e.key);
      if (match) {
        handleSelectMode(match.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#050505] text-[#e0e0e0] flex flex-col selection:bg-[#a3ff12] selection:text-black relative overflow-x-hidden">
        {/* Ambient Frosted Glass Background Lighting Orbs */}
        <div className="absolute top-[-200px] left-[-100px] w-[500px] h-[500px] bg-[#a3ff12]/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-100px] right-[-100px] w-[400px] h-[400px] bg-purple-600/5 rounded-full blur-[100px] pointer-events-none" />

        {/* Workstation Top Header */}
        <Header
          bpm={globalBpm}
          onBpmChange={setGlobalBpm}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenPresets={() => setIsPresetsOpen(true)}
          activeMode={activeMode}
          onSelectMode={handleSelectMode}
        />

        {/* Module Navigation Tabs */}
        <Navigation
          activeMode={activeMode}
          onSelectMode={handleSelectMode}
        />

        {/* Main Workstation View Area */}
        <main className="flex-1 pb-16 pt-3 px-2 sm:px-4 relative z-10">
          {activeMode === "chords-ai" && <ChordFinderStudio />}
          {activeMode === "tuner" && <TunerPanel />}
          {activeMode === "tone-studio" && <ToneStudio />}
          {activeMode === "fretboard" && <FretboardViewer />}
          {activeMode === "chord-dictionary" && <ChordDictionary />}
          {activeMode === "looper" && <LooperStation />}
          {activeMode === "multi-track" && <MultiTrackStudio />}
          {activeMode === "rhythm" && <DrumMetronome />}
          {activeMode === "practice" && <PracticeStudio />}
        </main>

        {/* Settings Modal */}
        <DeviceSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />

        {/* Presets & Saved Recordings Vault Modal */}
        <PresetsRecordingsModal
          isOpen={isPresetsOpen}
          onClose={() => setIsPresetsOpen(false)}
          onSelectTonePreset={handleSelectTonePreset}
        />
      </div>
    </ErrorBoundary>
  );
}
