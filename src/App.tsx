/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SidebarNav } from "./components/SidebarNav";
import { TopHeaderBar } from "./components/TopHeaderBar";
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
import { SongsLibraryView, SunoSong } from "./components/SongsLibraryView";
import { PWAInstallModal } from "./components/PWAInstallModal";
import { usePWAInstall } from "./hooks/usePWAInstall";
import { SongWorkspaceProvider, useSongWorkspace } from "./context/SongWorkspaceContext";
import { SongWorkspaceBar } from "./components/SongWorkspaceBar";
import { WorkstationMode, TonePreset, SongAnalysis } from "./types";
import { Settings, User, Download } from "lucide-react";

function AppContent() {
  const [activeMode, setActiveMode] = useState<WorkstationMode>("home");
  const [globalBpm, setGlobalBpm] = useState<number>(120);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isDevicesOpen, setIsDevicesOpen] = useState<boolean>(false);
  const [importedSong, setImportedSong] = useState<SunoSong | null>(null);

  const { activeSong, setActiveSong } = useSongWorkspace();

  const {
    isInstalled,
    isIOS,
    platform,
    hasPrompt,
    isInstallModalOpen,
    openInstallModal,
    closeInstallModal,
    promptInstall,
  } = usePWAInstall();

  // Read URL search params on initial mount for PWA shortcuts (e.g. ?mode=tuner)
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const modeParam = urlParams.get("mode") as WorkstationMode;
      const validModes: WorkstationMode[] = [
        "home", "songs", "chords-ai", "tuner", "chord-dictionary",
        "fretboard", "scales", "tone-studio", "looper", "multi-track",
        "rhythm", "practice", "studio", "presets"
      ];
      if (modeParam && validModes.includes(modeParam)) {
        setActiveMode(modeParam);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSelectMode = (mode: WorkstationMode) => {
    setActiveMode(mode);
  };

  const handleAnalyzeSong = (song: SunoSong) => {
    const chordSegments = (song as any).chordSegments || [];
    const songAnalysis: SongAnalysis = {
      id: song.id,
      title: song.title,
      artist: song.artist || "Joel's Collection",
      audioUrl: song.audioUrl,
      streamUrl: song.streamUrl,
      imageUrl: song.imageUrl,
      duration: song.duration,
      key: (song as any).key || "C",
      tempo: (song as any).tempo || 120,
      timeSignature: (song as any).timeSignature || "4/4",
      sunoId: song.id,
      chords: (song as any).chords || chordSegments.map((s: any) => s.chord) || [],
      chordSegments: chordSegments,
      sections: (song as any).sections || [],
      lyrics: (song as any).lyrics || (song as any).prompt,
    };
    setActiveSong(songAnalysis);
    setImportedSong(song);
    setActiveMode("chords-ai");
  };

  const handleOpenInStudio = (song: SunoSong) => {
    const chordSegments = (song as any).chordSegments || [];
    const songAnalysis: SongAnalysis = {
      id: song.id,
      title: song.title,
      artist: song.artist || "Joel's Collection",
      audioUrl: song.audioUrl,
      streamUrl: song.streamUrl,
      imageUrl: song.imageUrl,
      duration: song.duration,
      key: (song as any).key || "C",
      tempo: (song as any).tempo || 120,
      timeSignature: (song as any).timeSignature || "4/4",
      sunoId: song.id,
      chords: (song as any).chords || chordSegments.map((s: any) => s.chord) || [],
      chordSegments: chordSegments,
      sections: (song as any).sections || [],
      lyrics: (song as any).lyrics || (song as any).prompt,
    };
    setActiveSong(songAnalysis);
    setImportedSong(song);
    setActiveMode("studio");
  };

  const handleUseAsPractice = (song: SunoSong) => {
    const chordSegments = (song as any).chordSegments || [];
    const songAnalysis: SongAnalysis = {
      id: song.id,
      title: song.title,
      artist: song.artist || "Joel's Collection",
      audioUrl: song.audioUrl,
      streamUrl: song.streamUrl,
      imageUrl: song.imageUrl,
      duration: song.duration,
      key: (song as any).key || "C",
      tempo: (song as any).tempo || 120,
      timeSignature: (song as any).timeSignature || "4/4",
      sunoId: song.id,
      chords: (song as any).chords || chordSegments.map((s: any) => s.chord) || [],
      chordSegments: chordSegments,
      sections: (song as any).sections || [],
      lyrics: (song as any).lyrics || (song as any).prompt,
    };
    setActiveSong(songAnalysis);
    setImportedSong(song);
    setActiveMode("practice");
  };

  const handleSelectTonePreset = (preset: TonePreset) => {
    setActiveMode("tone-studio");
  };

  const isWorkspaceModule = ["chords-ai", "practice", "studio", "multi-track", "looper", "songs"].includes(activeMode);

  return (
    <div className="h-screen w-screen bg-[#0a0c0e] text-[#e5e7eb] flex flex-col selection:bg-[#a3ff12] selection:text-black overflow-hidden font-sans">
      {/* Mobile Top Header */}
      <div className="md:hidden h-14 bg-[#0d0f12]/80 backdrop-blur-md border-b border-white/5 px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#a3ff12] shadow-[0_0_8px_#a3ff12]" />
          <span className="font-extrabold text-sm tracking-tight">
            <span className="text-[#a3ff12]">JOE</span> <span className="text-white">Studio</span>
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {!isInstalled && (
            <button
              id="btn-mobile-header-pwa"
              onClick={promptInstall}
              className="px-2.5 py-1 rounded-lg bg-[#a3ff12]/15 border border-[#a3ff12]/30 text-[#a3ff12] flex items-center gap-1 text-xs font-mono font-bold"
              title="Install App"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install</span>
            </button>
          )}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 rounded-lg bg-[#14171c] text-zinc-300"
            title="Settings"
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
            onInstallApp={promptInstall}
            isInstalled={isInstalled}
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
              onInstallApp={promptInstall}
              isInstalled={isInstalled}
            />
          </div>

          {/* Contextual Persistent Song Workspace Bar */}
          {activeSong && isWorkspaceModule && (
            <SongWorkspaceBar
              currentModule={activeMode}
              onNavigateModule={handleSelectMode}
            />
          )}

          {/* Scrollable Workstation Module Page */}
          <main className={`flex-1 overflow-y-auto relative z-10 ${activeMode === "studio" || activeMode === "multi-track" ? "p-0 overflow-hidden" : "px-4 sm:px-8 py-6 pb-24 md:pb-6"}`}>
            {activeMode === "home" && (
              <HomeDashboard
                onSelectMode={handleSelectMode}
                onAnalyzeSong={handleAnalyzeSong}
                onOpenInStudio={handleOpenInStudio}
                onUseAsPractice={handleUseAsPractice}
              />
            )}
            {activeMode === "songs" && <SongsLibraryView onAnalyzeSong={handleAnalyzeSong} onOpenInStudio={handleOpenInStudio} onUseAsPractice={handleUseAsPractice} />}
            {activeMode === "chords-ai" && (
              <ChordFinderStudio
                initialSong={importedSong}
                onClearInitialSong={() => setImportedSong(null)}
              />
            )}
            {activeMode === "tuner" && <TunerPanel />}
            {activeMode === "chord-dictionary" && <ChordDictionary />}
            {activeMode === "fretboard" && <FretboardViewer mode="fretboard" />}
            {activeMode === "scales" && <FretboardViewer mode="scales" />}
            {activeMode === "tone-studio" && <ToneStudio />}
            {activeMode === "looper" && <LooperStation onSelectMode={handleSelectMode} />}
            {activeMode === "multi-track" && <MultiTrackStudio initialSong={importedSong} />}
            {activeMode === "rhythm" && <DrumMetronome />}
            {activeMode === "practice" && <PracticeStudio initialSong={importedSong} />}
            {activeMode === "studio" && <MultiTrackStudio initialSong={importedSong} />}
            {activeMode === "presets" && (
              <PresetsLibraryView
                onSelectTonePreset={handleSelectTonePreset}
                onOpenToneStudio={() => handleSelectMode("tone-studio")}
              />
            )}
          </main>
        </div>
      </div>

      {/* Mobile Bottom Fixed Navigation */}
      <MobileBottomNav
        activeMode={activeMode}
        onSelectMode={handleSelectMode}
        onInstallApp={promptInstall}
        isInstalled={isInstalled}
      />

      {/* Device Settings Modal */}
      <DeviceSettingsModal
        isOpen={isSettingsOpen || isDevicesOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          setIsDevicesOpen(false);
        }}
      />

      {/* PWA Install Modal */}
      <PWAInstallModal
        isOpen={isInstallModalOpen}
        onClose={closeInstallModal}
        onInstall={promptInstall}
        hasPrompt={hasPrompt}
        isInstalled={isInstalled}
        isIOS={isIOS}
        platform={platform}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SongWorkspaceProvider>
        <AppContent />
      </SongWorkspaceProvider>
    </ErrorBoundary>
  );
}
