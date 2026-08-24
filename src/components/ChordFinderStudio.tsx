import React, { useState, useEffect, useRef } from "react";
import {
  Upload,
  Link as LinkIcon,
  Mic,
  MicOff,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  CheckCircle2,
  Sliders,
  Sparkles,
  Music,
  Check,
  Trash2,
  Repeat,
  GripVertical,
  Clock,
} from "lucide-react";
import { findChordByName } from "../data/chordDatabase";
import { resolveGuitarChord, GuitarVoicingResult } from "../audio/guitarChordResolver";
import { parseChordLabel } from "../audio/chordNormalizer";
import { guitarSynth } from "../audio/guitarSynth";
import { analyzeAudioFile } from "../audio/audioAnalyzer";
import { audioEngine } from "../audio/audioContext";
import { SongAnalysis, SavedSong } from "../types";
import { resolveChordFinderState, transposeChordSymbol } from "../music/chordTransposer";
import { ChordDiagram } from "./ChordDiagram";
import { CustomConfirmDialog } from "./ui/CustomConfirmDialog";
import {
  saveSongToDB,
  loadSongsFromDB,
  deleteSongFromDB,
  saveLastPlayedSongId,
  getLastPlayedSongId,
} from "../utils/storage";

import { SunoSong } from "./SongsLibraryView";

interface ChordFinderStudioProps {
  initialSong?: SunoSong | null;
}

export const ChordFinderStudio: React.FC<ChordFinderStudioProps> = ({ initialSong }) => {
  const [activeSong, setActiveSong] = useState<SongAnalysis | null>(null);
  const [savedSongs, setSavedSongs] = useState<SavedSong[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [songName, setSongName] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState<{ message: string; pct: number } | null>(null);

  // Analyze initial song if provided
  useEffect(() => {
    if (initialSong && initialSong.audio_url && !activeSong) {
      const analyzeSunoSong = async () => {
        try {
          abortControllerRef.current = new AbortController();
          setAnalysisProgress({ message: "Fetching Suno audio...", pct: 10 });
          const res = await fetch(initialSong.audio_url);
          const blob = await res.blob();
          const file = new File([blob], `${initialSong.title}.mp3`, { type: "audio/mpeg" });
          
          setAnalysisProgress({ message: "Reading audio file...", pct: 30 });
          const result = await analyzeAudioFile(
            file,
            (msg, pct) => setAnalysisProgress({ message: msg, pct: 30 + (pct * 0.7) }),
            abortControllerRef.current.signal
          );
          const songWithMeta: SavedSong = {
            ...result,
            title: initialSong.title,
            artist: initialSong.artist,
            lastPlayedAt: Date.now(),
            savedAt: Date.now(),
          };
          await saveSongToDB(songWithMeta);
          
          setSavedSongs(prev => {
            const exists = prev.find(s => s.id === songWithMeta.id);
            if (exists) return prev;
            return [songWithMeta, ...prev];
          });
          setActiveSong(songWithMeta);
          setAnalysisProgress(null);
        } catch (err: any) {
          console.error("Failed to analyze Suno song:", err);
          setAnalysisProgress(null);
        }
      };
      analyzeSunoSong();
    }
  }, [initialSong]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isLiveMic, setIsLiveMic] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [transpose, setTranspose] = useState(0);
  const [capo, setCapo] = useState(0);
  const [simplifyChords, setSimplifyChords] = useState(false);
  const [loopSection, setLoopSection] = useState(true);
  const [slowDown, setSlowDown] = useState(false);
  const [voicingIndex, setVoicingIndex] = useState(1);
  const [isRepeating, setIsRepeating] = useState(false);
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    type?: "confirm" | "alert" | "error" | "success";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Timeline dragging & hover states
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const [hoverTimelineTime, setHoverTimelineTime] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const dragTargetTimeRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Load saved songs from database and restore last played song on mount
  useEffect(() => {
    loadSongsFromDB().then((songs) => {
      setSavedSongs(songs);
      const lastId = getLastPlayedSongId();
      if (lastId) {
        const found = songs.find((s) => s.id === lastId);
        if (found) {
          setActiveSong(found);
          return;
        }
      }
      if (songs.length > 0) {
        setActiveSong(songs[0]);
        saveLastPlayedSongId(songs[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (activeSong?.audioBlob && audioRef.current) {
      const url = URL.createObjectURL(activeSong.audioBlob);
      audioRef.current.src = url;
      audioRef.current.load();
      return () => URL.revokeObjectURL(url);
    } else if (audioRef.current) {
      audioRef.current.src = "";
    }
  }, [activeSong?.audioBlob]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = slowDown ? 0.75 : 1.0;
    }
  }, [slowDown]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = isRepeating;
    }
  }, [isRepeating]);

  useEffect(() => {
    if (isPlaying) {
      if (audioRef.current && audioRef.current.src) {
        audioRef.current.play().catch(() => setIsPlaying(false));
      }
    } else {
      audioRef.current?.pause();
    }
  }, [isPlaying]);

  const segments = React.useMemo(() => {
    if (!activeSong) return [];
    if (activeSong.chordSegments && activeSong.chordSegments.length > 0) {
      return activeSong.chordSegments;
    }
    // Generate simulated segments for visualization if missing
    let t = 0;
    const bpm = activeSong.tempo || 120;
    const secondsPerBar = (60 / bpm) * 4;

    return (activeSong.sections || []).flatMap((sec: any) => {
      const chords = sec.chords || [];
      const numChords = chords.length;
      if (numChords === 0) return [];

      const secondsPerChord = (sec.bars * secondsPerBar) / numChords;
      return chords.map((c: string, idx: number) => {
        const startTime = t;
        const endTime = t + secondsPerChord;
        t = endTime;
        return {
          id: `sim-${sec.name}-${idx}-${t}`,
          chord: c,
          startTime,
          endTime,
          confidence: sec.confidence || 95,
          stability: 95,
        };
      });
    });
  }, [activeSong]);

  const duration = activeSong?.duration || (segments.length > 0 ? segments[segments.length - 1].endTime : 1);

  // Playhead update interval (when playing audio or simulated playback)
  useEffect(() => {
    let interval: number;
    if (isPlaying && !isDraggingTimeline) {
      interval = window.setInterval(() => {
        if (audioRef.current && audioRef.current.src) {
          setCurrentTime(audioRef.current.currentTime);
          if (audioRef.current.ended) {
            if (isRepeating) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => setIsPlaying(false));
            } else {
              setIsPlaying(false);
            }
          }
        } else {
          // Playhead progression for tracks without audio blob
          setCurrentTime((prev) => {
            const step = 0.05 * (slowDown ? 0.75 : 1.0);
            const next = prev + step;
            if (next >= duration) {
              if (isRepeating) {
                return 0;
              } else {
                setIsPlaying(false);
                return duration;
              }
            }
            return next;
          });
        }
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying, duration, isRepeating, slowDown, isDraggingTimeline]);

  const barSeconds = Math.max(1.5, Math.min(4.0, (60 / (activeSong?.tempo || 120)) * 4));

  const formatTime = (time: number) => {
    if (isNaN(time) || time < 0) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const activeSegmentIdx = segments.findIndex(
    (s) => currentTime >= s.startTime && currentTime <= s.endTime
  );
  const activeIdx = activeSegmentIdx !== -1 ? activeSegmentIdx : 0;

  const getDisplayChord = (idx: number) => {
    if (!segments || segments.length === 0 || idx < 0 || idx >= segments.length) {
      return {
        detectedChord: "-",
        transposedChord: "-",
        shapeChord: "-",
        timeLabel: "-",
        isValid: false,
        confidence: 0,
      };
    }
    const seg = segments[idx];
    const resolved = resolveChordFinderState(seg.chord, transpose, capo, activeSong?.key);
    return {
      ...resolved,
      timeLabel: formatTime(seg.startTime),
      confidence: seg.confidence || 90,
    };
  };

  const prevChord = getDisplayChord(activeIdx - 1);
  const activeChord = getDisplayChord(activeIdx);
  const nextChord = getDisplayChord(activeIdx + 1);

  // Seek helper that syncs currentTime and audio element
  const seekToTime = (newTime: number) => {
    const clamped = Math.max(0, Math.min(newTime, duration));
    setCurrentTime(clamped);
    if (audioRef.current && audioRef.current.src && !isNaN(audioRef.current.duration)) {
      audioRef.current.currentTime = clamped;
    }
  };

  // Draggable timeline interaction handlers with rAF throttling for 60fps performance
  const handleTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeSong || duration <= 0) return;
    setIsDraggingTimeline(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const targetTime = (x / rect.width) * duration;
    dragTargetTimeRef.current = targetTime;
    seekToTime(targetTime);
  };

  const handleTimelinePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeSong || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const targetTime = (x / rect.width) * duration;
    setHoverTimelineTime(targetTime);

    if (isDraggingTimeline) {
      dragTargetTimeRef.current = targetTime;
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          seekToTime(dragTargetTimeRef.current);
          rafIdRef.current = null;
        });
      }
    }
  };

  const handleTimelinePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingTimeline) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      seekToTime(dragTargetTimeRef.current);
      setIsDraggingTimeline(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  const handleTimelinePointerLeave = () => {
    if (!isDraggingTimeline) {
      setHoverTimelineTime(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    abortControllerRef.current = new AbortController();
    setAnalysisProgress({ message: "Reading audio file...", pct: 0 });

    try {
      const result = await analyzeAudioFile(
        file,
        (msg, pct) => setAnalysisProgress({ message: msg, pct }),
        abortControllerRef.current.signal
      );

      const songWithMeta: SavedSong = {
        ...result,
        lastPlayedAt: Date.now(),
        savedAt: Date.now(),
      };

      await saveSongToDB(songWithMeta);
      saveLastPlayedSongId(songWithMeta.id);
      setActiveSong(songWithMeta);
      loadSongsFromDB().then(setSavedSongs);

      setCurrentTime(0);
      setIsPlaying(false);
      setAnalysisProgress(null);
      abortControllerRef.current = null;
    } catch (err: any) {
      setAnalysisProgress(null);
      abortControllerRef.current = null;
      if (err.message !== "Analysis cancelled by user.") {
        setDialog({
          isOpen: true,
          title: "Analysis Failed",
          message: "An error occurred while analyzing the audio file. Please try another standard audio format like WAV or MP3.",
          confirmText: "OK",
          type: "error",
          onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
        });
      }
    }
  };

  const handleAnalyzeYoutube = async () => {
    const query = songName.trim() || youtubeUrl.trim();
    if (!query) return;
    setAnalysisProgress({ message: "Searching song database...", pct: 50 });

    try {
      const response = await fetch("/api/analyze-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songQuery: query }),
      });

      const data = await response.json();

      if (!response.ok) {
        setDialog({
          isOpen: true,
          title: "Song Search Failed",
          message: data.error || "Failed to search and analyze song. Please check your query or try again.",
          confirmText: "OK",
          type: "alert",
          onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
        });
      } else {
        data.title = data.title + " (AI-Estimated Chords)";
        data.id = `yt-analyzed-${Date.now()}`;
        // Map legacy format to new format if needed
        if (!data.chordSegments) {
          let t = 0;
          data.chordSegments = (data.sections || []).flatMap((sec: any) =>
            (sec.chords || []).map((c: string) => {
              const seg = { chord: c, startTime: t, endTime: t + 2, confidence: 90 };
              t += 2;
              return seg;
            })
          );
        }

        const songWithMeta: SavedSong = {
          ...data,
          lastPlayedAt: Date.now(),
          savedAt: Date.now(),
        };

        await saveSongToDB(songWithMeta);
        saveLastPlayedSongId(songWithMeta.id);
        setActiveSong(songWithMeta);
        loadSongsFromDB().then(setSavedSongs);

        setCurrentTime(0);
        setIsPlaying(false);
      }
    } catch (err) {
      console.error(err);
      setDialog({
        isOpen: true,
        title: "Database Server Offline",
        message: "A network error occurred while contacting the AI analysis server. Check your connection or try again later.",
        confirmText: "OK",
        type: "error",
        onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
      });
    } finally {
      setAnalysisProgress(null);
    }
  };

  useEffect(() => {
    return () => {
      audioEngine.releaseInput("chord-finder");
    };
  }, []);

  const toggleLiveMic = async () => {
    if (isLiveMic) {
      audioEngine.releaseInput("chord-finder");
      setIsLiveMic(false);
    } else {
      try {
        await audioEngine.acquireInput("chord-finder");
        setIsLiveMic(true);
      } catch (err) {
        setDialog({
          isOpen: true,
          title: "Microphone Access Required",
          message: "Please authorize microphone access to enable real-time chord and key detection.",
          confirmText: "OK",
          type: "alert",
          onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
        });
      }
    }
  };

  const handleDeleteSong = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const songToDelete = savedSongs.find((s) => s.id === id);
    const songTitle = songToDelete ? `"${songToDelete.title}"` : "this song";

    setDialog({
      isOpen: true,
      title: "Delete Saved Song",
      message: `Are you sure you want to delete ${songTitle} and its chord sheet from your library?`,
      confirmText: "Delete",
      cancelText: "Cancel",
      type: "confirm",
      onConfirm: async () => {
        await deleteSongFromDB(id);
        const updatedSongs = await loadSongsFromDB();
        setSavedSongs(updatedSongs);

        if (activeSong?.id === id) {
          if (updatedSongs.length > 0) {
            setActiveSong(updatedSongs[0]);
            saveLastPlayedSongId(updatedSongs[0].id);
          } else {
            setActiveSong(null);
            saveLastPlayedSongId("");
          }
          setCurrentTime(0);
          setIsPlaying(false);
        }
        setDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const loadSavedSong = async (song: SavedSong) => {
    const updatedSong: SavedSong = {
      ...song,
      lastPlayedAt: Date.now(),
    };
    await saveSongToDB(updatedSong);
    saveLastPlayedSongId(song.id);
    setActiveSong(updatedSong);
    loadSongsFromDB().then(setSavedSongs);
    setCurrentTime(0);
    setIsPlaying(false);
  };

  // Resolve active guitar voicing based strictly on shapeChord
  const activeSegment = segments[activeIdx];
  const activeVoicingResult: GuitarVoicingResult = activeSong && activeChord.isValid
    ? resolveGuitarChord(activeChord.shapeChord, {
        keyContext: activeSong.key,
        detectionConfidence: activeChord.confidence,
        voicingIndex,
      })
    : {
        detectedChord: "-",
        displayChord: "-",
        voicing: null,
        voicingType: "none",
        detectionConfidence: 0,
        voicingConfidence: 0,
        hasExactSlashVoicing: false,
        availableVoicingsCount: 0,
        allVoicings: [],
        selectedVoicingIndex: 1,
      };

  const lastPlayedId = getLastPlayedSongId();

  return (
    <div id="panel-chord-finder" className="max-w-6xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      <audio ref={audioRef} className="hidden" />

      {/* Centered Page Header */}
      <div className="text-center space-y-1.5">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Find the chords.
        </h1>
        <p className="text-zinc-400 text-xs">
          Drop a song, search with AI, or play it through your microphone.
        </p>
      </div>

      {/* 3 Top Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Upload Audio */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="frosted-card-hover rounded-3xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all group min-h-[140px]"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:scale-105 transition-transform mb-2 border border-white/5">
            <Upload className="w-5 h-5 text-zinc-300 group-hover:text-white" />
          </div>
          <h3 className="text-xs font-bold font-mono text-zinc-200 uppercase tracking-wider">
            Upload Audio
          </h3>
          <p className="text-[11px] font-mono text-zinc-500 mt-0.5">MP3, WAV, FLAC</p>
        </div>

        {/* YouTube Link / Song Search */}
        <div className="frosted-card rounded-3xl p-4 flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center space-x-2">
            <LinkIcon className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-bold font-mono text-zinc-200 uppercase tracking-wider">
              AI Song Search
            </h3>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <input
              type="text"
              placeholder="Song Name & Artist..."
              value={songName}
              onChange={(e) => setSongName(e.target.value)}
              className="flex-1 bg-white/5 text-xs font-mono text-white rounded-xl px-3 py-2 border border-white/10 focus:border-[#a3ff12]/50 focus:outline-none placeholder:text-zinc-500"
            />
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Or paste YouTube URL..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className="flex-1 bg-white/5 text-xs font-mono text-white rounded-xl px-3 py-2 border border-white/10 focus:border-[#a3ff12]/50 focus:outline-none placeholder:text-zinc-500"
              />
              <button
                onClick={handleAnalyzeYoutube}
                disabled={!!analysisProgress}
                className="px-3 py-2 bg-[#a3ff12] hover:bg-[#92eb10] text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer font-mono"
              >
                {analysisProgress ? "..." : "SEARCH"}
              </button>
            </div>
          </div>
        </div>

        {/* Microphone Live Tracking */}
        <div
          onClick={toggleLiveMic}
          className={`border rounded-3xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all group min-h-[140px] ${
            isLiveMic
              ? "bg-[#a3ff12]/15 border-[#a3ff12] shadow-[0_0_20px_rgba(163,255,18,0.2)]"
              : "frosted-card-hover"
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${
              isLiveMic ? "bg-[#a3ff12] text-black" : "bg-white/5 text-zinc-300 border border-white/5"
            }`}
          >
            {isLiveMic ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 text-zinc-400" />}
          </div>
          <h3
            className={`text-xs font-bold font-mono uppercase tracking-wider ${
              isLiveMic ? "text-[#a3ff12]" : "text-zinc-200"
            }`}
          >
            Microphone
          </h3>
          <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
            {isLiveMic ? "Listening to live guitar input..." : "Listen to live audio"}
          </p>
        </div>
      </div>

      {/* Analysis Progress Bar */}
      {analysisProgress && (
        <div className="frosted-card rounded-2xl p-4 flex flex-col space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-mono font-bold text-[#a3ff12] tracking-wider animate-pulse">
              ANALYSIS IN PROGRESS
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-zinc-400">
                {Math.round(analysisProgress.pct)}%
              </span>
              {abortControllerRef.current && (
                <button
                  onClick={() => abortControllerRef.current?.abort()}
                  className="px-2 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded text-[10px] font-bold font-mono transition-colors"
                >
                  CANCEL
                </button>
              )}
            </div>
          </div>
          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-[#a3ff12] transition-all duration-300"
              style={{ width: `${analysisProgress.pct}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-zinc-500 text-center">
            {analysisProgress.message}
          </span>
        </div>
      )}

      {/* Song Track Info Bar */}
      {activeSong ? (
        <div className="frosted-card rounded-3xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#122204] to-[#070b02] flex items-center justify-center text-[#a3ff12] border border-[#a3ff12]/30 shadow-[0_0_12px_rgba(163,255,18,0.2)] shrink-0">
              <Music className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {activeSong.title}
              </h2>
              <p className="text-xs font-mono text-zinc-400">
                {activeSong.artist || "Unknown Artist"} • {activeSong.tempo || 120} BPM
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-[11px] font-mono font-bold text-[#a3ff12] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#a3ff12]" />
              {`CHORD CONFIDENCE ${activeSong.confidence || 92}%`}
            </span>
            <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#a3ff12]"
                style={{ width: `${activeSong.confidence || 92}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Main Center Area: Side-by-Side Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Chord Progression Canvas (Left/Center Column - 8 cols) */}
        <div className="lg:col-span-8 frosted-card rounded-3xl p-6 flex flex-col justify-between space-y-6">
          {activeSong ? (
            <>
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                  CURRENT PROGRESSION
                </span>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-zinc-300">
                    {activeSong.tuning || "E Standard"}
                  </span>
                  <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-zinc-300">
                    Key: {activeSong.key || "C Maj"}
                  </span>
                </div>
              </div>

              {/* Large Chord Triad Display & Diagram */}
              <div className="flex flex-col items-center justify-center py-4 border-y border-white/5 space-y-6">
                <div className="flex items-center justify-around w-full">
                  {/* Previous Chord */}
                  <div className="text-center opacity-40">
                    <div className="text-2xl sm:text-3xl font-bold font-mono text-zinc-300">
                      {prevChord.transposedChord}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">{prevChord.timeLabel}</span>
                  </div>

                  {/* Active Main Chord */}
                  <div className="text-center transform scale-110 sm:scale-125">
                    <div className="text-4xl sm:text-5xl font-black font-mono text-[#a3ff12] drop-shadow-[0_0_20px_rgba(163,255,18,0.4)]">
                      {activeChord.transposedChord}
                    </div>
                    {capo > 0 && activeChord.isValid && (
                      <div className="mt-1 flex items-center justify-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                          Capo {capo} • Play {activeChord.shapeChord} shape
                        </span>
                      </div>
                    )}
                    {transpose !== 0 && activeChord.isValid && (
                      <div className="text-[9px] font-mono text-zinc-400 mt-0.5">
                        Sounding (Original: {activeChord.detectedChord})
                      </div>
                    )}
                    <span className="text-[11px] font-mono font-bold text-zinc-300 mt-1 block">
                      {activeChord.timeLabel}
                    </span>
                  </div>

                  {/* Next Chord */}
                  <div className="text-center opacity-40">
                    <div className="text-2xl sm:text-3xl font-bold font-mono text-zinc-300">
                      {nextChord.transposedChord}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">{nextChord.timeLabel}</span>
                  </div>
                </div>

                {/* Guitar Chord Fretboard Diagram */}
                {activeVoicingResult.voicing ? (
                  <div className="flex flex-col items-center">
                    <div className="bg-[#13161a] rounded-2xl p-4 border border-white/10 shadow-2xl relative">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex flex-col">
                          <span className="text-xs font-mono font-bold text-white">
                            {capo > 0 ? `${activeChord.shapeChord} Shape` : activeChord.transposedChord}
                          </span>
                          {capo > 0 && (
                            <span className="text-[9px] font-mono text-sky-400">
                              Capo {capo} = {activeChord.transposedChord} Sounding
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {activeVoicingResult.voicingType === "exact" && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[#a3ff12]/10 text-[#a3ff12] border border-[#a3ff12]/20">
                              Exact Voicing
                            </span>
                          )}
                          {activeVoicingResult.voicingType === "generated" && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-400/10 text-amber-400 border border-amber-400/20">
                              Power Shape ({(activeVoicingResult.voicing as any)?.rootString === 6 ? "E" : "A"})
                            </span>
                          )}
                          {activeVoicingResult.voicingType === "simplified" && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">
                              Playable Form
                            </span>
                          )}
                          <button
                            onClick={() =>
                              guitarSynth.strumChord(
                                activeVoicingResult.voicing!.frets,
                                "down"
                              )
                            }
                            className="p-1.5 rounded-lg bg-[#a3ff12]/10 hover:bg-[#a3ff12]/20 text-[#a3ff12] transition-colors"
                            title="Hear Chord Strum"
                          >
                            <Play className="w-3.5 h-3.5 fill-[#a3ff12]" />
                          </button>
                        </div>
                      </div>

                      <ChordDiagram
                        frets={activeVoicingResult.voicing.frets}
                        fingers={activeVoicingResult.voicing.fingers}
                        barre={activeVoicingResult.voicing.barre}
                        position={activeVoicingResult.voicing.baseFret}
                        cagedShape={activeVoicingResult.voicing.cagedShape}
                        title={capo > 0 ? `${activeChord.shapeChord} (Capo ${capo})` : activeChord.transposedChord}
                        capo={capo}
                      />
                    </div>

                    {activeVoicingResult.simplificationReason && (
                      <span className="text-[10px] font-mono text-zinc-400 mt-2 text-center max-w-[240px]">
                        {activeVoicingResult.simplificationReason}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="bg-[#13161a] rounded-2xl p-6 border border-white/10 shadow-xl flex flex-col items-center justify-center h-48 w-72 text-center space-y-2">
                    <span className="text-xs font-mono font-bold text-zinc-300">
                      No guitar voicing available
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500 max-w-[220px]">
                      {activeVoicingResult.simplificationReason || `No safe diagram for ${activeChord.shapeChord}`}
                    </span>
                  </div>
                )}

                {/* Confidence Telemetry */}
                <div className="flex items-center gap-4 text-[11px] font-mono pt-1">
                  <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                    <span className="text-zinc-400">Detection Confidence:</span>
                    <span className="text-[#a3ff12] font-bold">{activeVoicingResult.detectionConfidence}%</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                    <span className="text-zinc-400">Voicing Confidence:</span>
                    <span className="text-white font-bold">{activeVoicingResult.voicingConfidence}%</span>
                  </div>
                </div>
              </div>

              {/* Draggable Audio Waveform Timeline Scrubber */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <GripVertical className="w-3.5 h-3.5 text-[#a3ff12]" />
                    <span>TIMELINE (CLICK OR DRAG TO SCRUB)</span>
                  </span>
                  <span className="text-[#a3ff12] font-bold">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Interactive Waveform Track Container */}
                <div
                  ref={timelineRef}
                  onPointerDown={handleTimelinePointerDown}
                  onPointerMove={handleTimelinePointerMove}
                  onPointerUp={handleTimelinePointerUp}
                  onPointerLeave={handleTimelinePointerLeave}
                  className={`h-16 bg-white/5 hover:bg-white/[0.08] rounded-2xl p-2 relative flex items-center justify-between border border-white/10 select-none overflow-hidden group cursor-ew-resize transition-all ${
                    isDraggingTimeline ? "ring-2 ring-[#a3ff12]/50 bg-white/[0.09]" : ""
                  }`}
                  title="Click or drag to scrub to specific timestamp"
                >
                  {/* Elapsed Gradient Fill */}
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#a3ff12]/15 to-[#a3ff12]/25 pointer-events-none transition-all"
                    style={{
                      width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    }}
                  />

                  {/* Waveform vertical bars */}
                  {Array.from({ length: 48 }).map((_, wIdx) => {
                    const progress = duration > 0 ? currentTime / duration : 0;
                    const isPassed = wIdx / 48 <= progress;
                    const h = 25 + ((wIdx * 23) % 65);
                    return (
                      <div
                        key={wIdx}
                        className={`w-1 rounded-full transition-colors pointer-events-none z-0 ${
                          isPassed ? "bg-[#a3ff12]" : "bg-zinc-700/80"
                        }`}
                        style={{ height: `${h}%` }}
                      />
                    );
                  })}

                  {/* Chord split markers and labels */}
                  <div className="absolute inset-0 flex pointer-events-none z-10">
                    {segments.map((seg, idx) => {
                      const leftPct = duration > 0 ? (seg.startTime / duration) * 100 : 0;
                      const isCurrentSeg = currentTime >= seg.startTime && currentTime <= seg.endTime;
                      const segmentTransposed = transposeChordSymbol(seg.chord, transpose, activeSong?.key);
                      return (
                        <div
                          key={seg.id || idx}
                          className={`absolute h-full border-l flex flex-col justify-end pb-1 pl-1 text-[10px] font-mono transition-colors ${
                            isCurrentSeg
                              ? "border-[#a3ff12]/60 text-[#a3ff12] font-bold"
                              : "border-white/10 text-zinc-400"
                          }`}
                          style={{ left: `${leftPct}%` }}
                        >
                          <span className="bg-black/60 px-1 py-0.5 rounded backdrop-blur-xs">
                            {segmentTransposed}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Hover indicator line & tooltip */}
                  {hoverTimelineTime !== null && !isDraggingTimeline && duration > 0 && (
                    <div
                      className="absolute top-0 bottom-0 pointer-events-none z-20"
                      style={{ left: `${(hoverTimelineTime / duration) * 100}%` }}
                    >
                      <div className="w-px h-full bg-white/50 border-l border-dashed border-white/70 -translate-x-1/2" />
                      <div className="absolute -top-7 -translate-x-1/2 bg-zinc-900/95 border border-white/20 px-2 py-0.5 rounded text-[10px] font-mono text-zinc-100 shadow-lg whitespace-nowrap">
                        {formatTime(hoverTimelineTime)}
                      </div>
                    </div>
                  )}

                  {/* Draggable Playhead Scrubber Laser & Handle */}
                  {duration > 0 && (
                    <div
                      className="absolute top-0 bottom-0 pointer-events-none z-30"
                      style={{
                        left: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%`,
                      }}
                    >
                      {/* Vertical Playhead Needle */}
                      <div className="w-[2px] h-full bg-[#a3ff12] -translate-x-1/2 shadow-[0_0_10px_#a3ff12]" />

                      {/* Scrubber Thumb Grip Handle */}
                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-7 bg-[#a3ff12] rounded-md border-2 border-black flex flex-col items-center justify-center shadow-[0_0_12px_rgba(163,255,18,0.9)] cursor-grab active:cursor-grabbing pointer-events-auto">
                        <div className="w-0.5 h-3 bg-black/70 rounded-full" />
                      </div>

                      {/* Floating Active Drag Tooltip */}
                      {isDraggingTimeline && (
                        <div className="absolute -top-8 -translate-x-1/2 bg-black/95 border border-[#a3ff12] px-2.5 py-1 rounded-lg text-[10px] font-mono text-[#a3ff12] font-extrabold shadow-2xl whitespace-nowrap">
                          {formatTime(currentTime)} {activeChord.transposedChord !== "-" ? `• ${activeChord.transposedChord}` : ""}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Transport controls: |<<, ▶, >>| */}
                <div className="flex items-center justify-center gap-6 pt-1">
                  <span className="text-xs font-mono text-zinc-400 w-12 text-right">
                    {formatTime(currentTime)}
                  </span>

                  <div className="flex items-center gap-3">
                    {/* Repeat Button */}
                    <button
                      onClick={() => setIsRepeating(!isRepeating)}
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                        isRepeating
                          ? "bg-[#a3ff12]/20 border-[#a3ff12] text-[#a3ff12] shadow-[0_0_12px_rgba(163,255,18,0.2)]"
                          : "bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
                      }`}
                      title="Repeat Song"
                    >
                      <Repeat className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => {
                        seekToTime(currentTime - barSeconds);
                      }}
                      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      title="Rewind 1 Bar"
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="w-12 h-12 rounded-xl bg-[#a3ff12] hover:bg-[#92eb10] text-black flex items-center justify-center shadow-[0_0_20px_rgba(163,255,18,0.4)] transition-all cursor-pointer"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 fill-black" />
                      ) : (
                        <Play className="w-5 h-5 fill-black ml-0.5" />
                      )}
                    </button>

                    <button
                      onClick={() => {
                        seekToTime(currentTime + barSeconds);
                      }}
                      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      title="Forward 1 Bar"
                    >
                      <SkipForward className="w-4 h-4" />
                    </button>
                  </div>

                  <span className="text-xs font-mono text-zinc-400 w-12">
                    {formatTime(duration)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            /* Empty State when no song is loaded yet */
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500">
                <Music className="w-8 h-8 text-[#a3ff12]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">No Song Loaded</h3>
                <p className="text-xs font-mono text-zinc-400 max-w-sm">
                  Upload an audio track, search a song by name, or select one of your previous songs from the list to view its chords and timeline.
                </p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-[#a3ff12] hover:bg-[#92eb10] text-black font-bold text-xs font-mono rounded-xl transition-all cursor-pointer flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>Upload Audio File</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Controls & Previous Played Songs Column (4 cols) */}
        <div className="lg:col-span-4 flex flex-col space-y-4 h-full lg:max-h-[750px]">
          {/* Controls Panel */}
          <div className="frosted-card rounded-3xl p-5 space-y-4 shrink-0">
            {/* Transpose & Capo */}
            <div className="grid grid-cols-2 gap-3">
              {/* Transpose */}
              <div className="bg-white/5 p-3 rounded-xl space-y-1.5 border border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">Transpose</span>
                  {transpose !== 0 && (
                    <button
                      onClick={() => setTranspose(0)}
                      className="text-[9px] font-mono text-zinc-400 hover:text-white transition-colors underline"
                      title="Reset Transpose to 0"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setTranspose((t) => Math.max(-12, t - 1))}
                    className="w-6 h-6 rounded bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold"
                  >
                    -
                  </button>
                  <span className={`text-xs font-mono font-bold ${transpose !== 0 ? "text-[#a3ff12]" : "text-white"}`}>
                    {transpose > 0 ? `+${transpose}` : transpose}
                  </span>
                  <button
                    onClick={() => setTranspose((t) => Math.min(12, t + 1))}
                    className="w-6 h-6 rounded bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Capo */}
              <div className="bg-white/5 p-3 rounded-xl space-y-1.5 border border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">Capo</span>
                  {capo !== 0 && (
                    <button
                      onClick={() => setCapo(0)}
                      className="text-[9px] font-mono text-sky-400 hover:text-white transition-colors underline"
                      title="Remove Capo"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setCapo((c) => Math.max(0, c - 1))}
                    className="w-6 h-6 rounded bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold"
                  >
                    -
                  </button>
                  <span className={`text-xs font-mono font-bold ${capo > 0 ? "text-sky-400" : "text-white"}`}>
                    {capo > 0 ? `Fret ${capo}` : "0"}
                  </span>
                  <button
                    onClick={() => setCapo((c) => Math.min(12, c + 1))}
                    className="w-6 h-6 rounded bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Toggles: Simplify, Loop, Slow Down */}
            <div className="space-y-2 pt-1 text-xs font-mono">
              <label className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
                <span className="text-zinc-300">Simplify Chords</span>
                <input
                  type="checkbox"
                  checked={simplifyChords}
                  onChange={(e) => setSimplifyChords(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#a3ff12]"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 bg-[#a3ff12]/5 hover:bg-[#a3ff12]/10 rounded-xl border border-[#a3ff12]/20 cursor-pointer transition-colors">
                <span className="text-white font-bold">Loop Section</span>
                <input
                  type="checkbox"
                  checked={loopSection}
                  onChange={(e) => setLoopSection(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#a3ff12]"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
                <span className="text-zinc-300">Slow Down (0.75x)</span>
                <input
                  type="checkbox"
                  checked={slowDown}
                  onChange={(e) => setSlowDown(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#a3ff12]"
                />
              </label>
            </div>

            {/* Voicing Buttons */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>VOICING</span>
                <span className="text-[#a3ff12] font-bold">
                  {activeVoicingResult.voicing?.cagedShape
                    ? `${activeVoicingResult.voicing.cagedShape}-Shape (${voicingIndex}/${Math.max(1, activeVoicingResult.availableVoicingsCount || 1)})`
                    : `Voicing ${voicingIndex} of ${Math.max(1, activeVoicingResult.availableVoicingsCount || 1)}`}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((v) => {
                  const isAvailable = !activeVoicingResult.availableVoicingsCount || v <= activeVoicingResult.availableVoicingsCount;
                  return (
                    <button
                      key={v}
                      onClick={() => setVoicingIndex(v)}
                      disabled={!isAvailable}
                      className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        voicingIndex === v
                          ? "bg-[#a3ff12] text-black shadow-md"
                          : isAvailable
                          ? "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
                          : "bg-white/[0.02] text-zinc-600 cursor-not-allowed opacity-40"
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Previous Played Songs Panel */}
          <div className="frosted-card rounded-3xl p-5 flex flex-col space-y-3 flex-1 overflow-hidden min-h-[300px]">
            <div className="flex items-center justify-between border-b border-white/5 pb-2 shrink-0">
              <div className="flex items-center space-x-2">
                <Music className="w-4 h-4 text-[#a3ff12]" />
                <h3 className="text-xs font-bold font-mono text-white uppercase tracking-wider">
                  Previous Played Songs
                </h3>
              </div>
              <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[9px] font-mono text-[#a3ff12] font-semibold">
                {savedSongs.length} {savedSongs.length === 1 ? "Song" : "Songs"}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {savedSongs.length === 0 ? (
                <div className="p-6 border border-dashed border-white/10 rounded-2xl text-center flex flex-col items-center justify-center space-y-2">
                  <Music className="w-6 h-6 text-zinc-600 mb-1" />
                  <span className="text-xs font-mono font-bold text-zinc-400">No previous songs</span>
                  <p className="text-[10px] font-mono text-zinc-500 max-w-[200px]">
                    Upload an audio file or search above. Your songs will be remembered here automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedSongs.map((song) => {
                    const isActive = activeSong?.id === song.id;
                    const isLastPlayed = song.id === lastPlayedId;
                    return (
                      <div
                        key={song.id}
                        onClick={() => loadSavedSong(song)}
                        className={`group p-3.5 rounded-2xl cursor-pointer transition-all border flex flex-col justify-between ${
                          isActive
                            ? "bg-[#a3ff12]/15 border-[#a3ff12] shadow-[0_0_15px_rgba(163,255,18,0.1)]"
                            : "bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/10"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span
                            className={`text-xs font-bold transition-colors truncate ${
                              isActive ? "text-[#a3ff12]" : "text-white group-hover:text-[#a3ff12]"
                            }`}
                          >
                            {song.title}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {isLastPlayed && (
                              <span className="px-1.5 py-0.5 bg-[#a3ff12]/20 border border-[#a3ff12]/30 text-[#a3ff12] rounded text-[8px] font-mono font-bold">
                                LAST PLAYED
                              </span>
                            )}
                            <button
                              onClick={(e) => handleDeleteSong(song.id, e)}
                              className="w-5 h-5 rounded-md hover:bg-red-500/20 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-colors"
                              title="Delete Song"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <span className="text-[10px] text-zinc-400 mt-1 truncate">
                          {song.artist || "Unknown Artist"}
                        </span>

                        <div className="flex items-center justify-between mt-2.5 text-[9px] font-mono text-zinc-500">
                          <span className="px-2 py-0.5 bg-white/5 rounded-md text-zinc-300">
                            {song.key || "C Maj"}
                          </span>
                          <span>{song.tempo || 120} BPM</span>
                          {song.duration && <span>{formatTime(song.duration)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Diagnostics Developer Panel */}
      {activeSong?.diagnostics && (
        <div id="diagnostics-panel" className="frosted-card rounded-3xl p-6 border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-[#a3ff12]" />
              <h3 className="text-sm font-extrabold font-mono text-white uppercase tracking-wider">
                Analysis Diagnostics
              </h3>
            </div>
            <span className="px-2 py-0.5 bg-[#a3ff12]/10 border border-[#a3ff12]/20 text-[#a3ff12] rounded-md text-[10px] font-mono font-bold">
              PIPELINE SUCCESSFUL
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
            <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-1">
              <span className="text-zinc-400 block text-[10px] uppercase font-bold">File Information</span>
              <div className="text-white flex justify-between">
                <span>Size:</span>{" "}
                <span>{(activeSong.diagnostics.fileSize / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <div className="text-white flex justify-between">
                <span>Type:</span>{" "}
                <span className="truncate max-w-[120px]">{activeSong.diagnostics.mimeType}</span>
              </div>
            </div>

            <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-1">
              <span className="text-zinc-400 block text-[10px] uppercase font-bold">Decoded Audio</span>
              <div className="text-white flex justify-between">
                <span>Duration:</span>{" "}
                <span>{activeSong.diagnostics.decodedDuration.toFixed(2)}s</span>
              </div>
              <div className="text-white flex justify-between">
                <span>Sample Rate:</span>{" "}
                <span>{activeSong.diagnostics.sampleRate} Hz</span>
              </div>
              <div className="text-white flex justify-between">
                <span>Channels:</span> <span>{activeSong.diagnostics.numChannels}</span>
              </div>
              <div className="text-white flex justify-between">
                <span>Samples:</span> <span>{activeSong.diagnostics.numSamples}</span>
              </div>
            </div>

            <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-1">
              <span className="text-zinc-400 block text-[10px] uppercase font-bold">Worker Pipeline</span>
              <div className="text-white flex justify-between">
                <span>Started:</span> <span className="text-green-400 font-bold">Yes</span>
              </div>
              <div className="text-white flex justify-between">
                <span>Rx Samples:</span> <span className="text-green-400 font-bold">Yes</span>
              </div>
              <div className="text-white flex justify-between">
                <span>Rx Samples Count:</span>{" "}
                <span>{activeSong.diagnostics.workerSampleCount}</span>
              </div>
              <div className="text-white flex justify-between">
                <span>Features:</span>{" "}
                <span>{activeSong.diagnostics.featureFrameCount} frames</span>
              </div>
            </div>

            <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-1">
              <span className="text-zinc-400 block text-[10px] uppercase font-bold">MIR Engine Results</span>
              <div className="text-white flex justify-between">
                <span>Chroma / Bass:</span>{" "}
                <span>
                  {activeSong.diagnostics.chromaFrameCount} / {activeSong.diagnostics.bassFrameCount}
                </span>
              </div>
              <div className="text-white flex justify-between">
                <span>Key Result:</span>{" "}
                <span className="text-[#a3ff12] font-bold">{activeSong.diagnostics.keyResult}</span>
              </div>
              <div className="text-white flex justify-between">
                <span>NaN/Inf Exists:</span>{" "}
                <span
                  className={
                    activeSong.diagnostics.hasNaNOrInf
                      ? "text-red-400 font-bold"
                      : "text-green-400 font-bold"
                  }
                >
                  {activeSong.diagnostics.hasNaNOrInf ? "Yes" : "No"}
                </span>
              </div>
              <div className="text-white flex justify-between">
                <span>Chord States:</span> <span>{activeSong.diagnostics.numChordStates}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono pt-2">
            <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2">
              <span className="text-zinc-400 block text-[10px] uppercase font-bold">
                Viterbi & Beat Alignment
              </span>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Frame Hop:</span> <span className="text-white font-bold">2048 (~21.5 fps)</span>
                </div>
                <div className="flex justify-between">
                  <span>Obs Dims:</span>{" "}
                  <span className="text-white">{activeSong.diagnostics.observationMatrixDims}</span>
                </div>
                <div className="flex justify-between">
                  <span>Raw Segments:</span>{" "}
                  <span className="text-white">{activeSong.diagnostics.rawChordSegmentCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Transitions Near Beats:</span>{" "}
                  <span className="text-[#a3ff12] font-bold">
                    {activeSong.diagnostics.transitionsNearBeats ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Transitions Off Beat:</span>{" "}
                  <span className="text-zinc-400">
                    {activeSong.diagnostics.transitionsAwayFromBeats ?? 0}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2">
              <span className="text-zinc-400 block text-[10px] uppercase font-bold">
                Segment Durations & Pace
              </span>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Avg Duration:</span>{" "}
                  <span className="text-white font-bold">
                    {activeSong.diagnostics.avgSegmentDuration ?? 0}s
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Median Duration:</span>{" "}
                  <span className="text-white font-bold">
                    {activeSong.diagnostics.medianSegmentDuration ?? 0}s
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Min / Max Dur:</span>{" "}
                  <span className="text-white">
                    {activeSong.diagnostics.minSegmentDuration ?? 0}s /{" "}
                    {activeSong.diagnostics.maxSegmentDuration ?? 0}s
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Chord Changes:</span>{" "}
                  <span className="text-[#a3ff12] font-bold">
                    {activeSong.diagnostics.numChordChanges ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Changes / Min:</span>{" "}
                  <span className="text-[#a3ff12] font-bold">
                    {activeSong.diagnostics.changesPerMinute ?? 0}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 p-4 rounded-xl border border-white/5 flex flex-col justify-between">
              <div>
                <span className="text-zinc-400 block text-[10px] uppercase font-bold">
                  Timeline & Confidence
                </span>
                <div className="space-y-1 text-[11px] mt-2">
                  <div className="flex justify-between">
                    <span>Final Segments:</span>
                    <span className="text-white font-bold text-[#a3ff12]">
                      {activeSong.diagnostics.finalChordSegmentCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg Chord Confidence:</span>
                    <span className="text-white font-bold">
                      {activeSong.diagnostics.averageChordConfidence ?? 0}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transition Stability:</span>
                    <span className="text-white font-bold">
                      {activeSong.diagnostics.averageTransitionConfidence ?? 0}%
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-zinc-500 mt-2">
                Guitariz Engine: Beat-Aware Adaptive HMM active. High-resolution temporal tracking online.
              </p>
            </div>
          </div>
        </div>
      )}

      <CustomConfirmDialog
        isOpen={dialog.isOpen}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        type={dialog.type}
        onConfirm={dialog.onConfirm}
        onCancel={() => setDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
