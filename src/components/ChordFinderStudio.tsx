import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Upload,
  Link as LinkIcon,
  Mic,
  MicOff,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Sliders,
  Sparkles,
  Music,
  Check,
  Trash2,
  Repeat,
  GripVertical,
} from "lucide-react";
import { findChordByName } from "../data/chordDatabase";
import { resolveGuitarChord, GuitarVoicingResult } from "../audio/guitarChordResolver";
import { parseChordLabel } from "../audio/chordNormalizer";
import { guitarSynth } from "../audio/guitarSynth";
import { analyzeAudioFile } from "../audio/audioAnalyzer";
import { stabilizeChordSegments } from "../audio/harmonicStabilizer";
import { audioEngine } from "../audio/audioContext";
import { SongAnalysis, SavedSong } from "../types";
import { resolveChordFinderState, transposeChordSymbol } from "../music/chordTransposer";
import { PlayabilityMode } from "../music/chordVoicingGenerator";
import { arrangeChordProgression, ProgressionArrangementResult } from "../music/fingerstyleArranger";
import { ChordDiagram } from "./ChordDiagram";
import { CustomConfirmDialog } from "./ui/CustomConfirmDialog";
import { TimelineScrubber } from "./ui/TimelineScrubber";
import {
  saveSongToDB,
  loadSongsFromDB,
  deleteSongFromDB,
  saveLastPlayedSongId,
  getLastPlayedSongId,
} from "../utils/storage";

import { SunoSong } from "./SongsLibraryView";
import { fetchDecryptedAudioFile } from "../utils/sunoAudioResolver";
import { SUNO_CATALOG_MASTER } from "../lib/suno-catalog-data";

interface ChordFinderStudioProps {
  initialSong?: SunoSong | null;
  onClearInitialSong?: () => void;
}

export const ChordFinderStudio: React.FC<ChordFinderStudioProps> = ({ initialSong, onClearInitialSong }) => {
  const [activeSong, setActiveSong] = useState<SongAnalysis | null>(null);
  const [savedSongs, setSavedSongs] = useState<SavedSong[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [songName, setSongName] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState<{ message: string; pct: number } | null>(null);

  const inFlightSongIdRef = useRef<string | null>(null);
  const processedInitialSongIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Analyze or load initial song if provided without duplicate imports
  useEffect(() => {
    const hasAudio = initialSong && (initialSong.id || initialSong.audio_url || initialSong.audioUrl);
    if (!hasAudio || !initialSong) return;

    const sunoId = initialSong.id || "";
    const deterministicId = sunoId
      ? (sunoId.startsWith("suno-") ? sunoId : `suno-${sunoId}`)
      : `suno-${(initialSong.title || "track").toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    const songUniqueKey = sunoId || `${initialSong.title}:::${initialSong.artist || ""}`;

    // Prevent duplicate triggers if already handled or currently analyzing
    if (processedInitialSongIdRef.current === songUniqueKey) return;
    if (inFlightSongIdRef.current === songUniqueKey) return;

    processedInitialSongIdRef.current = songUniqueKey;
    inFlightSongIdRef.current = songUniqueKey;

    const processSunoSong = async () => {
      try {
        setAnalysisProgress({ message: "Checking song library...", pct: 5 });

        // 1. Check if song was already analyzed and saved in DB
        const existingSongs = await loadSongsFromDB();
        const normTitle = (initialSong.title || "").trim().toLowerCase();
        const normArtist = (initialSong.artist || "").trim().toLowerCase();

        const match = existingSongs.find((s) => {
          if (s.id === deterministicId || (sunoId && (s.id === sunoId || s.sunoId === sunoId))) return true;
          if (normTitle && s.title?.trim().toLowerCase() === normTitle) {
            if (!normArtist || !s.artist || s.artist.trim().toLowerCase() === normArtist) {
              return true;
            }
          }
          return false;
        });

        if (match) {
          // Song already analyzed! Directly load without duplicate entry or re-analysis
          const updated: SavedSong = {
            ...match,
            id: deterministicId,
            sunoId: sunoId || match.sunoId,
            lastPlayedAt: Date.now(),
          };
          await saveSongToDB(updated);
          saveLastPlayedSongId(updated.id);
          setActiveSong(updated);
          const freshList = await loadSongsFromDB();
          setSavedSongs(freshList);
          setAnalysisProgress(null);
          inFlightSongIdRef.current = null;
          onClearInitialSong?.();
          return;
        }

        // 2. Not yet analyzed: perform audio extraction & harmonic analysis
        abortControllerRef.current = new AbortController();
        setAnalysisProgress({ message: "Preparing Suno audio stream...", pct: 15 });

        const audioTarget = initialSong.id || initialSong.audio_url || initialSong.audioUrl || "";
        const file = await fetchDecryptedAudioFile(audioTarget, initialSong.title || "Suno Track");

        if (!file || file.size === 0) {
          throw new Error("Unable to retrieve or decrypt Suno audio stream");
        }

        setAnalysisProgress({ message: "Reading audio stream & computing harmonics...", pct: 30 });
        const result = await analyzeAudioFile(
          file,
          (msg, pct) => setAnalysisProgress({ message: msg, pct: 30 + (pct * 0.7) }),
          abortControllerRef.current.signal
        );

        const songWithMeta: SavedSong = {
          ...result,
          id: deterministicId,
          sunoId: sunoId,
          title: initialSong.title || "Suno Track",
          artist: initialSong.artist || "ELITEJOE",
          lastPlayedAt: Date.now(),
          savedAt: Date.now(),
        };

        await saveSongToDB(songWithMeta);
        saveLastPlayedSongId(songWithMeta.id);

        const freshList = await loadSongsFromDB();
        setSavedSongs(freshList);
        setActiveSong(songWithMeta);
        setAnalysisProgress(null);
        inFlightSongIdRef.current = null;
        onClearInitialSong?.();
      } catch (err: any) {
        console.error("Failed to analyze Suno song:", err);
        setAnalysisProgress(null);
        inFlightSongIdRef.current = null;
        if (err.name !== "AbortError" && err.message !== "Analysis cancelled by user.") {
          setDialog({
            isOpen: true,
            title: "Analysis Failed",
            message: `Could not analyze song audio: ${err?.message || "Unable to decode audio data"}. Please select another track or retry.`,
            confirmText: "OK",
            type: "error",
            onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
          });
        }
      }
    };

    processSunoSong();
  }, [initialSong, onClearInitialSong]);

  const [isLiveMic, setIsLiveMic] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [transpose, setTranspose] = useState(0);
  const [capo, setCapo] = useState(0);
  const [loopSection, setLoopSection] = useState(true);
  const [slowDown, setSlowDown] = useState(false);
  const [voicingIndex, setVoicingIndex] = useState(1);
  const [playabilityMode, setPlayabilityMode] = useState<PlayabilityMode>("standard");
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
      const stabilized = stabilizeChordSegments(activeSong.chordSegments, {
        beats: activeSong.beats,
        tempo: activeSong.tempo,
        keyContext: activeSong.key,
        duration: activeSong.duration,
      });
      return stabilized.segments;
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

  // Playhead update loop (when playing audio or simulated playback)
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    if (isPlaying && !isDraggingTimeline) {
      const tick = (now: number) => {
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
          const deltaSeconds = Math.max(0, (now - lastTime) / 1000);
          const step = deltaSeconds * (slowDown ? 0.75 : 1.0);
          setCurrentTime((prev) => {
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
        lastTime = now;
        animationFrameId = requestAnimationFrame(tick);
      };

      animationFrameId = requestAnimationFrame(tick);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
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

  const activeChord = getDisplayChord(activeIdx);

  const LOOKBEHIND_COUNT = 1;
  const LOOKAHEAD_COUNT = 5; // tune-able: how many upcoming chords to show ahead of the active one

  const chordStrip = useMemo(() => {
    const items = [];
    for (let offset = -LOOKBEHIND_COUNT; offset <= LOOKAHEAD_COUNT; offset++) {
      const idx = activeIdx + offset;
      items.push({ idx, offset, ...getDisplayChord(idx) });
    }
    return items;
  }, [activeIdx, segments, transpose, capo, activeSong]);

  const activeChordRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeChordRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeIdx]);

  // Active chord timing calculations
  const currentSegment = segments[activeIdx];
  const nextSegment = segments[activeIdx + 1];

  const currentSegDuration = currentSegment
    ? Math.max(0.1, currentSegment.endTime - currentSegment.startTime)
    : 1;
  const timeRemainingInSegment = currentSegment
    ? Math.max(0, currentSegment.endTime - currentTime)
    : 0;
  const currentChordProgress = currentSegment
    ? Math.min(1, Math.max(0, (currentTime - currentSegment.startTime) / currentSegDuration))
    : 0;

  // Approaching switch threshold: within the last 2 seconds or last 50% of the segment
  const switchThreshold = Math.min(2.0, currentSegDuration * 0.5);
  const isApproachingSwitch =
    timeRemainingInSegment > 0 &&
    timeRemainingInSegment <= switchThreshold &&
    !!nextSegment;



  // Seek helper that syncs currentTime and audio element
  const seekToTime = (newTime: number) => {
    const clamped = Math.max(0, Math.min(newTime, duration));
    setCurrentTime(clamped);
    if (audioRef.current && audioRef.current.src && !isNaN(audioRef.current.duration)) {
      audioRef.current.currentTime = clamped;
    }
  };

  // Draggable timeline interaction handlers with zero-latency 60/120fps tracking and mobile touch-drag
  const audioSeekThrottleRef = useRef<number>(0);

  const handleTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeSong || duration <= 0) return;
    setIsDraggingTimeline(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    const rect = timelineRef.current?.getBoundingClientRect() || e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const targetTime = (x / rect.width) * duration;
    dragTargetTimeRef.current = targetTime;
    setCurrentTime(targetTime);
    if (audioRef.current && audioRef.current.src && !isNaN(audioRef.current.duration)) {
      audioRef.current.currentTime = targetTime;
    }
  };

  const handleTimelinePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeSong || duration <= 0) return;
    const rect = timelineRef.current?.getBoundingClientRect() || e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const targetTime = (x / rect.width) * duration;

    if (isDraggingTimeline) {
      dragTargetTimeRef.current = targetTime;
      // Instant direct visual update for zero-lag mobile finger drag
      setCurrentTime(targetTime);

      // Throttle audio element seek to avoid audio decoding stall
      const now = performance.now();
      if (now - audioSeekThrottleRef.current > 50) {
        audioSeekThrottleRef.current = now;
        if (audioRef.current && audioRef.current.src && !isNaN(audioRef.current.duration)) {
          audioRef.current.currentTime = targetTime;
        }
      }
    } else {
      setHoverTimelineTime(targetTime);
    }
  };

  const handleTimelinePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingTimeline) {
      const rect = timelineRef.current?.getBoundingClientRect() || e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const targetTime = (x / rect.width) * duration;
      dragTargetTimeRef.current = targetTime;
      seekToTime(targetTime);
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
    const ytUrl = youtubeUrl.trim();
    const sName = songName.trim();
    const query = sName || ytUrl;
    if (!query) return;

    // Detect if input is a Suno URL
    const isSunoUrl = (val: string) =>
      val.includes("suno.com/") ||
      val.includes("suno.ai/") ||
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.test(val);

    let targetSunoUrl = "";
    if (isSunoUrl(ytUrl)) {
      targetSunoUrl = ytUrl;
    } else if (isSunoUrl(sName)) {
      targetSunoUrl = sName;
    }

    if (targetSunoUrl) {
      const clipMatch = targetSunoUrl.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      const clipId = clipMatch ? clipMatch[1] : null;

      if (clipId) {
        const deterministicId = `suno-${clipId}`;
        let title = "Suno Track";
        let artist = "ELITEJOE";
        let imageUrl = `https://cdn2.suno.ai/image_large_${clipId}.jpeg`;
        let audioUrl = `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`;
        let lyrics = "";
        let tags: string[] = [];

        try {
          setAnalysisProgress({ message: "Checking song library...", pct: 5 });

          // 1. Check if song was already analyzed and saved in DB
          const existingSongs = await loadSongsFromDB();
          const match = existingSongs.find(
            (s) => s.id === deterministicId || (clipId && (s.id === clipId || s.sunoId === clipId))
          );

          if (match) {
            const updated: SavedSong = {
              ...match,
              id: deterministicId,
              sunoId: clipId,
              sunoUrl: targetSunoUrl,
              lastPlayedAt: Date.now(),
            };
            await saveSongToDB(updated);
            saveLastPlayedSongId(updated.id);
            setActiveSong(updated);
            const freshList = await loadSongsFromDB();
            setSavedSongs(freshList);
            setAnalysisProgress(null);
            setYoutubeUrl("");
            setSongName("");
            return;
          }

          // 2. Resolve metadata from catalog or remote resolver
          abortControllerRef.current = new AbortController();
          setAnalysisProgress({ message: "Connecting to Suno audio stream...", pct: 15 });

          for (const playlist of Object.values(SUNO_CATALOG_MASTER)) {
            const t = playlist.tracks?.find((tr) => tr.id === clipId);
            if (t) {
              title = t.title || title;
              artist = t.artist || artist;
              imageUrl = t.imageUrl || (t as any).image_url || imageUrl;
              audioUrl = t.audioUrl || (t as any).audio_url || audioUrl;
              lyrics = t.lyrics || "";
              tags = t.tags || [];
              break;
            }
          }

          if (title === "Suno Track") {
            try {
              const metaRes = await fetch(`/api/suno-song/${clipId}`);
              if (metaRes.ok) {
                const meta = await metaRes.json();
                if (meta.title && meta.title !== "Suno Track") title = meta.title;
                if (meta.artist) artist = meta.artist;
                if (meta.imageUrl) imageUrl = meta.imageUrl;
                if (meta.audioUrl) audioUrl = meta.audioUrl;
                if (meta.lyrics) lyrics = meta.lyrics;
                if (meta.tags) tags = meta.tags;
              }
            } catch (metaErr) {
              console.warn("Could not query /api/suno-song:", metaErr);
            }
          }

          // 3. Download & decrypt audio
          setAnalysisProgress({ message: "Downloading & preparing audio...", pct: 30 });
          const file = await fetchDecryptedAudioFile(clipId, title);

          if (!file || file.size === 0) {
            throw new Error("Unable to retrieve or decrypt Suno audio stream");
          }

          // 4. Run chord & harmonic analyzer
          setAnalysisProgress({ message: "Reading audio stream & computing harmonics...", pct: 45 });
          const result = await analyzeAudioFile(
            file,
            (msg, pct) => setAnalysisProgress({ message: msg, pct: 45 + pct * 0.5 }),
            abortControllerRef.current.signal
          );

          const songWithMeta: SavedSong = {
            ...result,
            id: deterministicId,
            sunoId: clipId,
            sunoUrl: targetSunoUrl,
            youtubeUrl: targetSunoUrl,
            title,
            artist,
            imageUrl,
            lyrics: lyrics || result.lyrics,
            tags: tags.length ? tags : result.tags,
            lastPlayedAt: Date.now(),
            savedAt: Date.now(),
          };

          await saveSongToDB(songWithMeta);
          saveLastPlayedSongId(songWithMeta.id);

          const freshList = await loadSongsFromDB();
          setSavedSongs(freshList);
          setActiveSong(songWithMeta);
          setCurrentTime(0);
          setIsPlaying(false);
          setAnalysisProgress(null);
          abortControllerRef.current = null;
          setYoutubeUrl("");
          setSongName("");
          return;
        } catch (err: any) {
          console.error("Failed to analyze Suno song:", err);
          if (err.name === "AbortError" || err.message === "Analysis cancelled by user.") {
            setAnalysisProgress(null);
            abortControllerRef.current = null;
            return;
          }

          // Fallback: analyze using AI / text harmonic analysis if audio decoding failed
          try {
            setAnalysisProgress({ message: "Analyzing harmonic progression and chords...", pct: 70 });
            const response = await fetch("/api/analyze-song", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                songQuery: title !== "Suno Track" ? title : targetSunoUrl,
                artist,
                genre: tags.join(", ") || "Original Composition",
              }),
            });

            if (response.ok) {
              const data = await response.json();
              const songResult: SavedSong = {
                id: deterministicId,
                sunoId: clipId,
                sunoUrl: targetSunoUrl,
                youtubeUrl: targetSunoUrl,
                title: title !== "Suno Track" ? title : data.title || "Suno Track",
                artist: artist || data.artist || "ELITEJOE",
                imageUrl,
                key: data.key || "C Maj",
                tempo: data.tempo || 120,
                timeSignature: data.timeSignature || "4/4",
                suggestedCapo: data.suggestedCapo || 0,
                difficulty: data.difficulty || "Intermediate",
                chords: data.chords || [],
                tuning: data.tuning || "E A D G B E (Standard)",
                sections: data.sections || [],
                tips: data.tips || "Extracted from Suno track",
                lyrics: lyrics || data.lyrics,
                tags: tags.length ? tags : data.tags,
                lastPlayedAt: Date.now(),
                savedAt: Date.now(),
              };

              await saveSongToDB(songResult);
              saveLastPlayedSongId(songResult.id);
              const freshList = await loadSongsFromDB();
              setSavedSongs(freshList);
              setActiveSong(songResult);
              setCurrentTime(0);
              setIsPlaying(false);
              setAnalysisProgress(null);
              abortControllerRef.current = null;
              setYoutubeUrl("");
              setSongName("");
              return;
            }
          } catch (fallbackErr) {
            console.warn("Fallback AI analysis failed:", fallbackErr);
          }

          setAnalysisProgress(null);
          abortControllerRef.current = null;
          setDialog({
            isOpen: true,
            title: "Analysis Failed",
            message: `Could not analyze Suno audio: ${err?.message || "Unable to decode audio data"}. Please check the link or retry.`,
            confirmText: "OK",
            type: "error",
            onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
          });
          return;
        }
      }
    }

    const isYtUrl = (val: string) => val.includes("youtube.com") || val.includes("youtu.be");
    
    let targetUrl = "";
    if (isYtUrl(ytUrl)) {
      targetUrl = ytUrl;
    } else if (isYtUrl(sName)) {
      targetUrl = sName;
    }

    if (targetUrl) {
      let extractorUrl = import.meta.env.VITE_AUDIO_EXTRACTOR_URL;
      console.log("[YouTube Diagnostics] Build-time extractorConfigured:", !!extractorUrl);
      
      if (!extractorUrl) {
        try {
          const configRes = await fetch("/api/extractor-url");
          if (configRes.ok) {
            const configData = await configRes.json();
            if (configData.url) {
              extractorUrl = configData.url;
              console.log("[YouTube Diagnostics] Recovered extractorUrl from backend runtime env!");
            }
          }
        } catch (configErr) {
          console.error("[YouTube Diagnostics] Failed to fetch runtime extractor URL:", configErr);
        }
      }

      console.log("[YouTube Diagnostics] extractorConfigured:", !!extractorUrl);
      if (extractorUrl) {
        try {
          const parsedUrl = new URL(extractorUrl);
          console.log("[YouTube Diagnostics] extractorURL origin only:", parsedUrl.origin);
        } catch (e) {
          console.log("[YouTube Diagnostics] extractorURL origin only: invalid URL", extractorUrl);
        }
      }

      if (!extractorUrl) {
        setDialog({
          isOpen: true,
          title: "Configuration Error",
          message: "YouTube audio extractor is not configured.",
          confirmText: "OK",
          type: "error",
          onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
        });
        return;
      }

      abortControllerRef.current = new AbortController();
      setAnalysisProgress({ message: "Fetching audio from YouTube...", pct: 10 });

      console.log("[YouTube Diagnostics] requestStarted: true, URL:", `${extractorUrl}/extract`);

      let response: Response;
      try {
        response = await fetch(`${extractorUrl}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl }),
          signal: abortControllerRef.current.signal,
        });
      } catch (fetchErr: any) {
        if (fetchErr.name === "AbortError") {
          throw fetchErr;
        }
        console.error("[YouTube Diagnostics] Network/CORS failure details:", fetchErr);
        setDialog({
          isOpen: true,
          title: "Connection Failed",
          message: "Unable to reach the YouTube audio extractor.",
          confirmText: "OK",
          type: "error",
          onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
        });
        setAnalysisProgress(null);
        abortControllerRef.current = null;
        return;
      }

      console.log("[YouTube Diagnostics] responseStatus:", response.status);
      const responseContentType = response.headers.get("content-type") || "";
      console.log("[YouTube Diagnostics] responseContentType:", responseContentType);

      if (!response.ok) {
        let errorMsg = "YouTube audio extraction failed.";
        if (response.status === 500) {
          errorMsg = "YouTube audio extraction failed.";
        } else {
          try {
            const errData = await response.json();
            if (errData.error) errorMsg = errData.error;
          } catch (_) {}
        }

        setDialog({
          isOpen: true,
          title: "Extraction Failed",
          message: errorMsg,
          confirmText: "OK",
          type: "error",
          onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
        });
        setAnalysisProgress(null);
        abortControllerRef.current = null;
        return;
      }

      const titleHeader = response.headers.get("X-Video-Title");
      const artistHeader = response.headers.get("X-Video-Artist");
      const title = titleHeader ? decodeURIComponent(titleHeader) : "YouTube Track";
      const artist = artistHeader ? decodeURIComponent(artistHeader) : "";
      console.log("[YouTube Diagnostics] Headers - X-Video-Title:", title, "X-Video-Artist:", artist);

      let blob: Blob;
      try {
        blob = await response.blob();
      } catch (blobErr) {
        console.error("[YouTube Diagnostics] Failed to read blob:", blobErr);
        blob = new Blob([], { type: "audio/mpeg" });
      }

      console.log("[YouTube Diagnostics] blobSize:", blob.size);

      if (!blob || blob.size === 0) {
        setDialog({
          isOpen: true,
          title: "Extraction Error",
          message: "YouTube extractor returned no audio.",
          confirmText: "OK",
          type: "error",
          onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
        });
        setAnalysisProgress(null);
        abortControllerRef.current = null;
        return;
      }

      const file = new File([blob], `${title}.mp3`, { type: "audio/mpeg" });
      console.log("[YouTube Diagnostics] fileSize:", file.size);

      console.log("[YouTube Diagnostics] analyzeAudioFileStarted: true");
      setAnalysisProgress({ message: "Reading audio file...", pct: 30 });

      try {
        const result = await analyzeAudioFile(
          file,
          (msg, pct) => setAnalysisProgress({ message: msg, pct: 30 + (pct * 0.7) }),
          abortControllerRef.current.signal
        );

        const songWithMeta: SavedSong = {
          ...result,
          title,
          artist,
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
        if (err.name !== "AbortError" && err.message !== "Analysis cancelled by user.") {
          setDialog({
            isOpen: true,
            title: "Analysis Failed",
            message: err.message || "An error occurred during YouTube extraction or analysis.",
            confirmText: "OK",
            type: "error",
            onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
          });
        }
      }
      return;
    }

    setAnalysisProgress({ message: "Searching song database...", pct: 50 });

    try {
      const response = await fetch("/api/analyze-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songQuery: query }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.requiresAudioUpload) {
          if (data.title) setSongName(data.title);
          setDialog({
            isOpen: true,
            title: "Audio Upload Required",
            message: data.error,
            confirmText: "Understood",
            type: "alert",
            onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
          });
        } else {
          setDialog({
            isOpen: true,
            title: "Song Search Failed",
            message: data.error || "Failed to search and analyze song. Please check your query or try again.",
            confirmText: "OK",
            type: "alert",
            onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
          });
        }
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
  };

  const loadSavedSong = (song: SavedSong) => {
    saveLastPlayedSongId(song.id);
    setActiveSong(song);
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const handleRewindInChordFinder = () => {
    const rewindAmount = barSeconds > 0 ? barSeconds : 5;
    seekToTime(Math.max(0, currentTime - rewindAmount));
  };

  const handleFastForwardInChordFinder = () => {
    const ffAmount = barSeconds > 0 ? barSeconds : 5;
    seekToTime(Math.min(duration, currentTime + ffAmount));
  };

  // Keyboard shortcut listener for Space / F8 (Play/Pause), F7 (Rewind), F9 (Fast-Forward)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === "Space" || e.key === " " || e.key === "F8") {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.key === "F7") {
        e.preventDefault();
        handleRewindInChordFinder();
      } else if (e.key === "F9") {
        e.preventDefault();
        handleFastForwardInChordFinder();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentTime, duration, barSeconds]);

  // Progression Arranger: optimize fingerstyle voicings across entire progression
  const arrangedProgression: ProgressionArrangementResult | null = React.useMemo(() => {
    if (!activeSong || segments.length === 0) return null;
    const progressionChords = segments.map((s) => s.chord);
    return arrangeChordProgression(progressionChords, {
      capo,
      transpose,
      playabilityMode,
      keyContext: activeSong.key,
    });
  }, [activeSong, segments, capo, transpose, playabilityMode]);

  const activeArrangedStep = playabilityMode === "fingerstyle" && arrangedProgression && arrangedProgression.steps[activeIdx]
    ? arrangedProgression.steps[activeIdx]
    : null;

  const effectiveVoicingIndex = activeArrangedStep ? activeArrangedStep.voicingIndex : voicingIndex;

  // Resolve active guitar voicing based strictly on shapeChord and verified capo sounding
  const activeSegment = segments[activeIdx];
  const activeVoicingResult: GuitarVoicingResult = activeSong && activeChord.isValid
    ? resolveGuitarChord(activeChord.shapeChord, {
        keyContext: activeSong.key,
        detectionConfidence: activeChord.confidence,
        voicingIndex: effectiveVoicingIndex,
        playabilityMode,
        simplifyIfUnavailable: playabilityMode === "easy",
        capo,
        detectedChord: activeChord.detectedChord,
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
        playabilityMode: "standard",
        capo: 0,
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
              Search & YouTube
            </h3>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <input
              type="text"
              placeholder="Song Name & Artist..."
              value={songName}
              onChange={(e) => setSongName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAnalyzeYoutube();
              }}
              className="flex-1 bg-white/5 text-xs font-mono text-white rounded-xl px-3 py-2 border border-white/10 focus:border-[#a3ff12]/50 focus:outline-none placeholder:text-zinc-500"
            />
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Or paste YouTube URL..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAnalyzeYoutube();
                }}
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
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#122204] to-[#070b02] flex items-center justify-center text-[#a3ff12] border border-[#a3ff12]/30 shadow-[0_0_12px_rgba(163,255,18,0.2)] shrink-0 overflow-hidden">
              {activeSong.imageUrl ? (
                <img
                  src={activeSong.imageUrl}
                  alt={activeSong.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Music className="w-6 h-6" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>{activeSong.title}</span>
                {activeSong.sunoUrl ? (
                  <a
                    href={activeSong.sunoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#a3ff12]/10 hover:bg-[#a3ff12]/20 border border-[#a3ff12]/30 rounded-full text-[10px] font-mono text-[#a3ff12] transition-colors"
                  >
                    <LinkIcon className="w-2.5 h-2.5" />
                    <span>Suno</span>
                  </a>
                ) : activeSong.youtubeUrl && !activeSong.youtubeUrl.includes("suno.") ? (
                  <a
                    href={activeSong.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-full text-[10px] font-mono text-red-400 transition-colors"
                  >
                    <LinkIcon className="w-2.5 h-2.5" />
                    <span>YouTube</span>
                  </a>
                ) : null}
              </h2>
              <p className="text-xs font-mono text-zinc-400">
                {activeSong.artist || "Unknown Artist"} • {activeSong.tempo || 120} BPM
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-zinc-300">
            <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full">
              Key: {activeSong.key || "C Maj"}
            </span>
            <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full">
              {activeSong.tuning || "E Standard"}
            </span>
          </div>
        </div>
      ) : null}

      {/* Main Center Area: Side-by-Side Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Chord Progression Canvas (Left/Center Column - 8 cols) */}
        <div className="lg:col-span-8 frosted-card rounded-3xl p-4 sm:p-6 flex flex-col justify-between space-y-4 sm:space-y-5">
          {activeSong ? (
            <>
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                  CHORD PROGRESSION
                </span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-zinc-300">
                    {activeSong.tuning || "E Standard"}
                  </span>
                  <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-zinc-300">
                    Key: {activeSong.key || "C Maj"}
                  </span>
                  {capo > 0 && (
                    <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 bg-sky-500/10 border border-sky-500/30 rounded-full text-xs font-mono text-sky-400 font-bold">
                      Capo {capo}
                    </span>
                  )}
                </div>
              </div>

              {/* Dedicated Sounding / Capo / Play Shape Overview HUD */}
              {activeChord.isValid && (
                <div className="grid grid-cols-3 gap-2 bg-black/40 border border-white/10 rounded-2xl p-2.5 sm:p-3 text-center font-mono select-none">
                  <div className="flex flex-col items-center justify-center border-r border-white/10 pr-2">
                    <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-zinc-400">SOUNDING</span>
                    <span className="text-sm sm:text-base font-extrabold text-zinc-100">{activeChord.transposedChord}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center border-r border-white/10 px-2">
                    <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-zinc-400">CAPO</span>
                    <span className={`text-sm sm:text-base font-extrabold ${capo > 0 ? "text-sky-400" : "text-zinc-300"}`}>
                      {capo > 0 ? `${capo}` : "0"}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center pl-2">
                    <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-zinc-400">PLAY</span>
                    <span className="text-sm sm:text-base font-black text-[#a3ff12]">
                      {capo > 0 ? activeChord.shapeChord : activeChord.transposedChord}
                    </span>
                  </div>
                </div>
              )}

              {/* Horizontally scrolling chord lookahead strip */}
              <div className="py-2 sm:py-3 border-y border-white/5">
                <div
                  className="flex items-center gap-4 sm:gap-6 overflow-x-auto scroll-smooth [&::-webkit-scrollbar]:hidden px-8 select-none"
                  style={{
                    scrollbarWidth: "none",
                    scrollSnapType: "x proximity",
                  }}
                >
                  {chordStrip.map((c) => {
                    const isActive = c.offset === 0;
                    const isPast = c.offset < 0;
                    const distance = Math.abs(c.offset);

                    const scaleClass = isActive
                      ? "scale-100"
                      : distance === 1
                      ? "scale-95"
                      : "scale-90";

                    const opacityStyle = isActive
                      ? { opacity: 1 }
                      : isPast
                      ? { opacity: 0.45 }
                      : { opacity: Math.max(0.3, 0.85 - distance * 0.15) };

                    const chordLabel = capo > 0 && c.isValid ? c.shapeChord : c.transposedChord;

                    return (
                      <div
                        key={c.idx}
                        ref={isActive ? activeChordRef : undefined}
                        onClick={() => {
                          if (c.isValid && segments[c.idx]) {
                            seekToTime(segments[c.idx].startTime);
                          }
                        }}
                        style={{
                          scrollSnapAlign: "center",
                          ...opacityStyle,
                        }}
                        className={`shrink-0 flex flex-col items-center justify-center text-center transition-all duration-200 cursor-pointer ${scaleClass} min-w-[90px] sm:min-w-[120px]`}
                        title={c.isValid ? `Jump to ${chordLabel} at ${c.timeLabel}` : undefined}
                      >
                        {/* Chord Name */}
                        {isActive ? (
                          <div className="text-4xl sm:text-5xl font-black font-mono text-[#a3ff12] tracking-tight drop-shadow-[0_0_20px_rgba(163,255,18,0.4)]">
                            {chordLabel}
                          </div>
                        ) : isPast ? (
                          <div className="text-2xl sm:text-3xl font-bold font-mono text-zinc-500 tracking-tight">
                            {chordLabel}
                          </div>
                        ) : (
                          <div className="text-2xl sm:text-3xl font-bold font-mono text-zinc-300 tracking-tight">
                            {chordLabel}
                          </div>
                        )}

                        {/* Active chord Sounding Pill when Capo > 0 */}
                        {isActive && capo > 0 && c.isValid && (
                          <div className="text-[10px] font-mono font-bold text-sky-400 mt-1 px-2 py-0.5 rounded-full bg-sky-400/10 border border-sky-400/20">
                            Sounding: {c.transposedChord}
                          </div>
                        )}

                        {/* Time label below chord */}
                        <div
                          className={`text-[11px] font-mono mt-1 ${
                            isActive
                              ? "text-zinc-300 font-semibold"
                              : "text-zinc-500"
                          }`}
                        >
                          {c.timeLabel}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Guitar Chord Fretboard Diagram for Current Chord */}
              <div className="flex flex-col items-center justify-center py-2">
                <div className="bg-[#13161a] rounded-2xl p-4 border border-white/10 shadow-2xl relative w-[260px] sm:w-[290px] flex flex-col items-center">
                  {/* Diagram Header */}
                  <div className="flex items-center justify-between w-full pb-2 mb-2 border-b border-white/10 text-xs font-mono">
                    <span className="text-zinc-400 font-bold text-[11px]">
                      {activeVoicingResult.voicing?.cagedShape
                        ? `${activeVoicingResult.voicing.cagedShape}-Shape`
                        : "Fretboard"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {activeVoicingResult.voicingType === "simplified" && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-400/10 text-yellow-400">
                          Playable
                        </span>
                      )}
                      {activeVoicingResult.voicing && (
                        <button
                          onClick={() =>
                            guitarSynth.strumChord(
                              activeVoicingResult.voicing!.frets,
                              "down",
                              24,
                              capo
                            )
                          }
                          className="p-1 rounded bg-[#a3ff12]/10 hover:bg-[#a3ff12]/20 text-[#a3ff12] transition-colors"
                          title="Hear Chord Strum"
                        >
                          <Play className="w-3.5 h-3.5 fill-[#a3ff12]" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Chord Measure Progress Bar - glows orange when switch is approaching */}
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-2.5">
                    <div
                      className={`h-full transition-all duration-75 ${
                        isApproachingSwitch
                          ? "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]"
                          : "bg-[#a3ff12] shadow-[0_0_6px_rgba(163,255,18,0.5)]"
                      }`}
                      style={{ width: `${Math.round(currentChordProgress * 100)}%` }}
                    />
                  </div>

                  {activeVoicingResult.voicing ? (
                    <ChordDiagram
                      frets={activeVoicingResult.voicing.frets}
                      fingers={activeVoicingResult.voicing.fingers}
                      barre={activeVoicingResult.voicing.barre}
                      position={activeVoicingResult.voicing.baseFret}
                      cagedShape={activeVoicingResult.voicing.cagedShape}
                      title={capo > 0 ? `${activeChord.shapeChord} (Capo ${capo})` : activeChord.transposedChord}
                      capo={capo}
                      size="md"
                    />
                  ) : (
                    <div className="h-44 flex flex-col items-center justify-center text-center space-y-1">
                      <span className="text-xs font-mono font-bold text-zinc-300">No guitar voicing</span>
                      <span className="text-[10px] font-mono text-zinc-500 max-w-[200px]">
                        {activeVoicingResult.simplificationReason || `No safe diagram for ${activeChord.shapeChord}`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Fingerstyle Voice leading note (if applicable) */}
                {playabilityMode === "fingerstyle" && activeArrangedStep?.voiceLeadingDescription && (
                  <div className="mt-2.5 px-3 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-[10px] font-mono text-sky-300 text-center max-w-[280px]">
                    {activeArrangedStep.voiceLeadingDescription}
                  </div>
                )}
              </div>

              {/* Draggable Audio Waveform Timeline Scrubber & Transport Controls */}
              <div className="space-y-2.5 bg-black/20 p-3 sm:p-4 rounded-2xl border border-white/5">
                <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-zinc-400">
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <GripVertical className="w-3.5 h-3.5 text-[#a3ff12]" />
                    <span>TIMELINE</span>
                  </span>
                  <span className="text-[#a3ff12] font-bold">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* High-Performance Ultra-Smooth Timeline Scrubber */}
                <TimelineScrubber
                  currentTime={currentTime}
                  duration={duration}
                  step={0.01}
                  formatTime={formatTime}
                  onChange={(val) => {
                    setCurrentTime(val);
                    if (audioRef.current && audioRef.current.src && !isNaN(audioRef.current.duration)) {
                      audioRef.current.currentTime = val;
                    }
                  }}
                  onScrubEnd={(val) => seekToTime(val)}
                  className="h-12 sm:h-14"
                >
                  {/* Waveform vertical bars */}
                  <div className="absolute inset-0 px-2 flex items-center justify-between pointer-events-none z-0">
                    {Array.from({ length: 48 }).map((_, wIdx) => {
                      const progress = duration > 0 ? currentTime / duration : 0;
                      const isPassed = wIdx / 48 <= progress;
                      const h = 25 + ((wIdx * 23) % 65);
                      return (
                        <div
                          key={wIdx}
                          className={`w-1 rounded-full transition-colors pointer-events-none ${
                            isPassed ? "bg-[#a3ff12]" : "bg-zinc-700/80"
                          }`}
                          style={{ height: `${h}%` }}
                        />
                      );
                    })}
                  </div>

                  {/* Chord split markers and labels */}
                  <div className="absolute inset-0 flex pointer-events-none z-10">
                    {segments.map((seg, idx) => {
                      const leftPct = duration > 0 ? (seg.startTime / duration) * 100 : 0;
                      const isCurrentSeg = currentTime >= seg.startTime && currentTime <= seg.endTime;
                      const segState = resolveChordFinderState(seg.chord, transpose, capo, activeSong?.key);
                      const soundingChord = segState.transposedChord;
                      const playShape = segState.shapeChord;
                      return (
                        <div
                          key={seg.id || idx}
                          className={`absolute h-full border-l flex flex-col justify-end pb-0.5 pl-1 text-[9px] font-mono transition-colors ${
                            isCurrentSeg
                              ? "border-[#a3ff12]/60 text-[#a3ff12] font-bold"
                              : "border-white/10 text-zinc-400"
                          }`}
                          style={{ left: `${leftPct}%` }}
                        >
                          <span className="bg-black/70 px-1 py-0.5 rounded backdrop-blur-xs flex items-center gap-1">
                            <span className={isCurrentSeg ? "text-[#a3ff12]" : "text-zinc-200"}>{soundingChord}</span>
                            {capo > 0 && segState.isValid && (
                              <span className="text-[8px] text-sky-400 font-semibold opacity-90">({playShape})</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </TimelineScrubber>

                {/* Transport controls: Repeat, |<<, ▶, >>| */}
                <div className="flex items-center justify-between sm:justify-center sm:gap-6 pt-0.5">
                  <span className="text-xs font-mono text-zinc-400 w-12 text-left sm:text-right">
                    {formatTime(currentTime)}
                  </span>

                  <div className="flex items-center gap-2 sm:gap-3">
                    {/* Repeat Button */}
                    <button
                      onClick={() => setIsRepeating(!isRepeating)}
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                        isRepeating
                          ? "bg-[#a3ff12]/20 border-[#a3ff12] text-[#a3ff12] shadow-[0_0_12px_rgba(163,255,18,0.2)]"
                          : "bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
                      }`}
                      title="Repeat Song"
                    >
                      <Repeat className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>

                    <button
                      onClick={handleRewindInChordFinder}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      title="Rewind (F7)"
                    >
                      <SkipBack className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>

                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#a3ff12] hover:bg-[#92eb10] text-black flex items-center justify-center shadow-[0_0_20px_rgba(163,255,18,0.4)] transition-all cursor-pointer"
                      title={isPlaying ? "Pause (Space / F8)" : "Play (Space / F8)"}
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-black" />
                      ) : (
                        <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-black ml-0.5" />
                      )}
                    </button>

                    <button
                      onClick={handleFastForwardInChordFinder}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      title="Fast-Forward (F9)"
                    >
                      <SkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  </div>

                  <span className="text-xs font-mono text-zinc-400 w-12 text-right sm:text-left">
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
          <div className="frosted-card rounded-3xl p-4 sm:p-5 space-y-3.5 shrink-0">
            {/* Transpose & Capo */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Transpose */}
              <div className="bg-white/5 p-2.5 sm:p-3 rounded-xl space-y-1.5 border border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">Transpose</span>
                  {transpose !== 0 && (
                    <button
                      onClick={() => setTranspose(0)}
                      className="text-[9px] font-mono text-zinc-400 hover:text-white transition-colors underline cursor-pointer"
                      title="Reset Transpose to 0"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setTranspose((t) => Math.max(-12, t - 1))}
                    className="w-6 h-6 rounded bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer"
                  >
                    -
                  </button>
                  <span className={`text-xs font-mono font-bold ${transpose !== 0 ? "text-[#a3ff12]" : "text-white"}`}>
                    {transpose > 0 ? `+${transpose}` : transpose}
                  </span>
                  <button
                    onClick={() => setTranspose((t) => Math.min(12, t + 1))}
                    className="w-6 h-6 rounded bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Capo */}
              <div className="bg-white/5 p-2.5 sm:p-3 rounded-xl space-y-1.5 border border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">Capo</span>
                  {capo !== 0 && (
                    <button
                      onClick={() => setCapo(0)}
                      className="text-[9px] font-mono text-sky-400 hover:text-white transition-colors underline cursor-pointer"
                      title="Remove Capo"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setCapo((c) => Math.max(0, c - 1))}
                    className="w-6 h-6 rounded bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer"
                  >
                    -
                  </button>
                  <span className={`text-xs font-mono font-bold ${capo > 0 ? "text-sky-400" : "text-white"}`}>
                    {capo > 0 ? `Fret ${capo}` : "0"}
                  </span>
                  <button
                    onClick={() => setCapo((c) => Math.min(12, c + 1))}
                    className="w-6 h-6 rounded bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Consolidated Voicing Selector */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>VOICING TYPE</span>
                <span className="text-[#a3ff12] font-bold uppercase text-[10px] bg-[#a3ff12]/10 px-2 py-0.5 rounded border border-[#a3ff12]/20">
                  {playabilityMode}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 text-[10px] font-mono font-bold">
                {[
                  { id: "standard", label: "Best" },
                  { id: "easy", label: "Easy" },
                  { id: "open", label: "Open" },
                  { id: "barre", label: "Barre" },
                  { id: "fingerstyle", label: "Finger" },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setPlayabilityMode(m.id as PlayabilityMode);
                      setVoicingIndex(1);
                    }}
                    className={`py-1.5 rounded-lg transition-all cursor-pointer text-center font-mono ${
                      playabilityMode === m.id
                        ? "bg-[#a3ff12] text-black shadow-md font-extrabold"
                        : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Voicings Selector */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>VOICINGS</span>
                <span className="text-[#a3ff12] font-bold">
                  {activeVoicingResult.voicing?.cagedShape
                    ? `${activeVoicingResult.voicing.cagedShape}-Shape (${voicingIndex}/${Math.max(1, activeVoicingResult.availableVoicingsCount || 1)})`
                    : `${voicingIndex}/${Math.max(1, activeVoicingResult.availableVoicingsCount || 1)}`}
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
                          ? "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5"
                          : "bg-white/[0.02] text-zinc-600 cursor-not-allowed opacity-30 border border-transparent"
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Playback Toggles: Loop Section & Slow Down */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <label className="flex items-center justify-between p-2 bg-[#a3ff12]/5 hover:bg-[#a3ff12]/10 rounded-xl border border-[#a3ff12]/20 cursor-pointer transition-colors">
                <span className="text-white font-bold text-[11px]">Loop Section</span>
                <input
                  type="checkbox"
                  checked={loopSection}
                  onChange={(e) => setLoopSection(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-[#a3ff12]"
                />
              </label>

              <label className="flex items-center justify-between p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 cursor-pointer transition-colors">
                <span className="text-zinc-300 text-[11px]">0.75x Speed</span>
                <input
                  type="checkbox"
                  checked={slowDown}
                  onChange={(e) => setSlowDown(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-[#a3ff12]"
                />
              </label>
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
                        <div className="flex justify-between items-center gap-2 overflow-hidden">
                          <div className="overflow-hidden whitespace-nowrap min-w-0 flex-1 relative">
                            <div
                              className={`inline-flex whitespace-nowrap ${
                                isActive
                                  ? "animate-[marquee-scroll_8s_linear_infinite]"
                                  : "group-hover:animate-[marquee-scroll_8s_linear_infinite]"
                              }`}
                            >
                              <span
                                className={`text-xs font-bold transition-colors pr-6 shrink-0 ${
                                  isActive ? "text-[#a3ff12]" : "text-white group-hover:text-[#a3ff12]"
                                }`}
                              >
                                {song.title}
                              </span>
                              <span
                                className={`text-xs font-bold transition-colors pr-6 shrink-0 ${
                                  isActive
                                    ? "text-[#a3ff12] opacity-100"
                                    : "text-white group-hover:text-[#a3ff12] opacity-0 group-hover:opacity-100"
                                }`}
                              >
                                {song.title}
                              </span>
                            </div>
                          </div>

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

                        <div className="mt-1 text-[11px] font-semibold text-[#a3ff12] truncate">
                          {song.artist || "Unknown Artist"}
                        </div>

                        <div className="flex items-center justify-between mt-2.5 text-[9.5px] font-mono">
                          <span className="px-2 py-0.5 bg-[#a3ff12]/15 border border-[#a3ff12]/30 rounded-md text-[#a3ff12] font-bold">
                            {song.key || "C Maj"}
                          </span>
                          <span className="px-2 py-0.5 bg-[#a3ff12]/10 border border-[#a3ff12]/20 rounded-md text-[#a3ff12] font-bold">
                            {song.tempo || 120} BPM
                          </span>
                          {song.duration && (
                            <span className="text-[#a3ff12]/80 font-medium">
                              {formatTime(song.duration)}
                            </span>
                          )}
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
