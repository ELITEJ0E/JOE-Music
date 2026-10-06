/**
 * JOE Music - Shared Song Workspace Context
 * 
 * Provides unified, persistent song state across JOE Music, Chord Finder, Practice,
 * Looper, and Studio. Preserves user chord edits, capo, practice history, complexity modes,
 * and seamless handoffs without re-analyzing or discarding state.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import {
  SongAnalysis,
  ChordSegment,
  SongSection,
  ChordComplexityMode,
  PracticePerformance,
  StemAsset,
  DAWProject,
} from "../types";
import { transformSegmentsForComplexity } from "../music/chordComplexity";

export type WorkspaceModuleTab = "chords" | "practice" | "stems" | "lyrics" | "studio";

export interface SongWorkspaceState {
  activeSong: SongAnalysis | null;
  activeTab: WorkspaceModuleTab;
  complexityMode: ChordComplexityMode;
  userCapo: number;
  userTranspose: number;
  practiceSpeed: number;
  loopRange: [number, number] | null;
  activeSectionIdx: number;
  userChordEdits: Record<number, string>; // segmentIndex -> correctedChord
  stems: StemAsset[];
  studioProjectId?: string;
  practiceHistory: PracticePerformance[];
  // Computed / Displayed segments reflecting complexity mode and user edits
  displaySegments: ChordSegment[];
}

export interface SongWorkspaceContextType extends SongWorkspaceState {
  setActiveSong: (song: SongAnalysis | null) => void;
  setActiveTab: (tab: WorkspaceModuleTab) => void;
  setComplexityMode: (mode: ChordComplexityMode) => void;
  setUserCapo: (capo: number) => void;
  setUserTranspose: (transpose: number) => void;
  setPracticeSpeed: (speed: number) => void;
  setLoopRange: (range: [number, number] | null) => void;
  setActiveSectionIdx: (idx: number) => void;
  applyChordEdit: (segmentIndex: number, newChord: string) => void;
  restoreOriginalChord: (segmentIndex: number) => void;
  restoreAllOriginalChords: () => void;
  recordPracticeSession: (perf: PracticePerformance) => void;
  sendSongToStudio: () => string;
}

const SongWorkspaceContext = createContext<SongWorkspaceContextType | null>(null);

const STORAGE_KEY_PREFIX = "joe_song_workspace_";

export const SongWorkspaceProvider: React.FC<{
  children: React.ReactNode;
  onNavigateMode?: (mode: string) => void;
}> = ({ children, onNavigateMode }) => {
  const [activeSong, setActiveSongState] = useState<SongAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceModuleTab>("chords");
  const [complexityMode, setComplexityMode] = useState<ChordComplexityMode>("standard");
  const [userCapo, setUserCapo] = useState<number>(0);
  const [userTranspose, setUserTranspose] = useState<number>(0);
  const [practiceSpeed, setPracticeSpeed] = useState<number>(1.0);
  const [loopRange, setLoopRange] = useState<[number, number] | null>(null);
  const [activeSectionIdx, setActiveSectionIdx] = useState<number>(0);
  const [userChordEdits, setUserChordEdits] = useState<Record<number, string>>({});
  const [stems, setStems] = useState<StemAsset[]>([]);
  const [studioProjectId, setStudioProjectId] = useState<string | undefined>();
  const [practiceHistory, setPracticeHistory] = useState<PracticePerformance[]>([]);

  // Load saved song state when activeSong changes
  const setActiveSong = useCallback((song: SongAnalysis | null) => {
    setActiveSongState(song);
    if (!song) {
      setUserChordEdits({});
      setUserCapo(0);
      setUserTranspose(0);
      setLoopRange(null);
      return;
    }

    try {
      const savedRaw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${song.id}`);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        setUserChordEdits(saved.userChordEdits || {});
        setUserCapo(saved.userCapo || song.suggestedCapo || 0);
        setUserTranspose(saved.userTranspose || 0);
        setComplexityMode(saved.complexityMode || "standard");
        setPracticeSpeed(saved.practiceSpeed || 1.0);
        setStudioProjectId(saved.studioProjectId);
      } else {
        setUserChordEdits({});
        setUserCapo(song.suggestedCapo || 0);
        setUserTranspose(0);
      }
    } catch {
      setUserChordEdits({});
      setUserCapo(song.suggestedCapo || 0);
    }
  }, []);

  // Persist workspace changes
  useEffect(() => {
    if (!activeSong?.id) return;
    try {
      const payload = {
        userChordEdits,
        userCapo,
        userTranspose,
        complexityMode,
        practiceSpeed,
        studioProjectId,
      };
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${activeSong.id}`, JSON.stringify(payload));
    } catch {
      // localStorage quota safety
    }
  }, [activeSong?.id, userChordEdits, userCapo, userTranspose, complexityMode, practiceSpeed, studioProjectId]);

  // Compute display segments considering user edits and complexity mode
  const displaySegments = useMemo<ChordSegment[]>(() => {
    if (!activeSong?.chordSegments) return [];

    const baseSegments = activeSong.chordSegments.map((seg, idx) => {
      const userChord = userChordEdits[idx];
      return userChord ? { ...seg, chord: userChord } : seg;
    });

    return transformSegmentsForComplexity(baseSegments, complexityMode);
  }, [activeSong, userChordEdits, complexityMode]);

  const applyChordEdit = useCallback((segmentIndex: number, newChord: string) => {
    setUserChordEdits((prev) => ({
      ...prev,
      [segmentIndex]: newChord,
    }));
  }, []);

  const restoreOriginalChord = useCallback((segmentIndex: number) => {
    setUserChordEdits((prev) => {
      const next = { ...prev };
      delete next[segmentIndex];
      return next;
    });
  }, []);

  const restoreAllOriginalChords = useCallback(() => {
    setUserChordEdits({});
  }, []);

  const recordPracticeSession = useCallback((perf: PracticePerformance) => {
    setPracticeHistory((prev) => [perf, ...prev].slice(0, 50));
  }, []);

  const sendSongToStudio = useCallback((): string => {
    const projId = studioProjectId || `project-song-${activeSong?.id || Date.now()}`;
    setStudioProjectId(projId);
    if (onNavigateMode) {
      onNavigateMode("studio");
    }
    return projId;
  }, [activeSong?.id, studioProjectId, onNavigateMode]);

  const value = useMemo<SongWorkspaceContextType>(
    () => ({
      activeSong,
      activeTab,
      complexityMode,
      userCapo,
      userTranspose,
      practiceSpeed,
      loopRange,
      activeSectionIdx,
      userChordEdits,
      stems,
      studioProjectId,
      practiceHistory,
      displaySegments,
      setActiveSong,
      setActiveTab,
      setComplexityMode,
      setUserCapo,
      setUserTranspose,
      setPracticeSpeed,
      setLoopRange,
      setActiveSectionIdx,
      applyChordEdit,
      restoreOriginalChord,
      restoreAllOriginalChords,
      recordPracticeSession,
      sendSongToStudio,
    }),
    [
      activeSong,
      activeTab,
      complexityMode,
      userCapo,
      userTranspose,
      practiceSpeed,
      loopRange,
      activeSectionIdx,
      userChordEdits,
      stems,
      studioProjectId,
      practiceHistory,
      displaySegments,
      setActiveSong,
      applyChordEdit,
      restoreOriginalChord,
      restoreAllOriginalChords,
      recordPracticeSession,
      sendSongToStudio,
    ]
  );

  return (
    <SongWorkspaceContext.Provider value={value}>
      {children}
    </SongWorkspaceContext.Provider>
  );
};

export const useSongWorkspace = (): SongWorkspaceContextType => {
  const context = useContext(SongWorkspaceContext);
  if (!context) {
    throw new Error("useSongWorkspace must be used within a SongWorkspaceProvider");
  }
  return context;
};
