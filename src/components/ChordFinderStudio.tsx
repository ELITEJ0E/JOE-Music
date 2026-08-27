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
  Youtube,
  Radio,
  Volume2,
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
import { YouTubeSyncPlayer } from "./YouTubeSyncPlayer";
import { liveChordDetector, LiveChordDetection } from "../audio/liveChordDetector";
import { extractYoutubeVideoId, getYoutubeThumbnail } from "../utils/youtubeHelper";
import { resolveYouTubeAudio, YouTubeAcquisitionState } from "../utils/youtubeAudioProvider";
import {
  saveSongToDB,
  loadSongsFromDB,
  deleteSongFromDB,
  saveLastPlayedSongId,
  getLastPlayedSongId,
} from "../utils/storage";

import { SunoSong } from "./SongsLibraryView";
import { SAMPLE_SONGS } from "../data/sampleSongs";

interface ChordFinderStudioProps {
  initialSong?: SunoSong | null;
}

export const ChordFinderStudio: React.FC<ChordFinderStudioProps> = ({ initialSong }) => {
  const [activeSong, setActiveSong] = useState<SongAnalysis | null>(null);
  const [savedSongs, setSavedSongs] = useState<SavedSong[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [songName, setSongName] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState<{ message: string; pct: number } | null>(null);
  const [liveDetection, setLiveDetection] = useState<LiveChordDetection | null>(null);
  const [showYouTubePlayer, setShowYouTubePlayer] = useState(true);
  const [seekTrigger, setSeekTrigger] = useState<{ time: number; ts: number } | null>(null);

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
    loadSongsFromDB().then(async (songs) => {
      let songList = songs;
      if (songs.length === 0) {
        for (const sample of SAMPLE_SONGS) {
          await saveSongToDB(sample as SavedSong);
        }
        songList = await loadSongsFromDB();
      }
      setSavedSongs(songList);
      const lastId = getLastPlayedSongId();
      if (lastId) {
        const found = songList.find((s) => s.id === lastId);
        if (found) {
          setActiveSong(found);
          return;
        }
      }
      if (songList.length > 0) {
        setActiveSong(songList[0]);
        saveLastPlayedSongId(songList[0].id);
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

  // Playhead update interval (when playing audio or simulated playback)
  useEffect(() => {
    let interval: number;
    if (isPlaying && !isDraggingTimeline) {
      // If it's a YouTube track, YouTubeSyncPlayer handles real-time currentTime updates
      if (activeSong?.youtubeVideoId) {
        return;
      }
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
  }, [isPlaying, duration, isRepeating, slowDown, isDraggingTimeline, activeSong?.youtubeVideoId]);

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

  // REAL TIMING CHECK Diagnostic computation (Phase 6F)
  const realTimingCheck = React.useMemo(() => {
    if (!activeSong) return null;
    const bpm = activeSong.tempo || 120;
    const beatInterval = 60 / bpm;
    const beat1 = activeSong.beats && activeSong.beats.length > 0 ? activeSong.beats[0] : 0;
    
    // Current beat and subdivision at currentTime
    const elapsedFromBeat1 = Math.max(0, currentTime - beat1);
    const totalBeatsElapsed = elapsedFromBeat1 / beatInterval;
    const currentBeatNum = Math.floor(totalBeatsElapsed) + 1;
    const barNum = Math.floor((currentBeatNum - 1) / 4) + 1;
    const beatInBar = ((currentBeatNum - 1) % 4) + 1;
    const fraction = totalBeatsElapsed - Math.floor(totalBeatsElapsed);
    const isEighth = fraction >= 0.35 && fraction <= 0.65;
    const currentSubdivision = isEighth ? `${beatInBar}&` : `${beatInBar}`;

    // Active chord info
    const activeSeg = segments[activeIdx] || segments[0];
    const chordStart = activeSeg ? activeSeg.startTime : 0;

    // Nearest beat to chord start
    let nearestBeat = beat1;
    let minDiff = Infinity;
    if (activeSong.beats && activeSong.beats.length > 0) {
      for (const b of activeSong.beats) {
        const diff = Math.abs(b - chordStart);
        if (diff < minDiff) {
          minDiff = diff;
          nearestBeat = b;
        }
      }
    } else {
      const beatIdx = Math.round((chordStart - beat1) / beatInterval);
      nearestBeat = beat1 + beatIdx * beatInterval;
    }

    const offsetMs = Math.round((chordStart - nearestBeat) * 1000);

    // Nearest subdivision for chord start (1, 1&, 2, 2&, 3, 3&, 4, 4&)
    const eighthNote = beatInterval / 2;
    const eighthIndex = Math.round((chordStart - beat1) / eighthNote);
    const subBar = Math.floor(eighthIndex / 8) + 1;
    const subBeat = Math.floor((eighthIndex % 8) / 2) + 1;
    const subOffbeat = eighthIndex % 2 !== 0;
    const subdivisionLabel = `Bar ${subBar}, Beat ${subOffbeat ? `${subBeat}&` : `${subBeat}`}`;

    return {
      bpm,
      beat1: `${beat1.toFixed(3)}s`,
      currentBeat: `Beat ${currentBeatNum} (Bar ${barNum}, ${currentSubdivision})`,
      chordStart: `${chordStart.toFixed(3)}s`,
      nearestBeat: `${nearestBeat.toFixed(3)}s (${subdivisionLabel})`,
      offsetMs,
      offsetDisplay: `${offsetMs >= 0 ? "+" : ""}${offsetMs} ms`,
      activeChord: activeSeg ? activeSeg.chord : "N/A"
    };
  }, [activeSong, currentTime, segments, activeIdx]);

  // Seek helper that syncs currentTime and audio element
  const seekToTime = (newTime: number) => {
    const clamped = Math.max(0, Math.min(newTime, duration));
    setCurrentTime(clamped);
    setSeekTrigger({ time: clamped, ts: Date.now() });
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
    const query = songName.trim() || youtubeUrl.trim();
    if (!query) return;

    // Check if it matches a sample song first
    const lowerQuery = query.toLowerCase();
    const sampleMatch = SAMPLE_SONGS.find(
      (s) => s.title.toLowerCase().includes(lowerQuery) || s.artist?.toLowerCase().includes(lowerQuery)
    );

    if (sampleMatch) {
      await saveSongToDB(sampleMatch as SavedSong);
      saveLastPlayedSongId(sampleMatch.id);
      setActiveSong(sampleMatch as SavedSong);
      loadSongsFromDB().then(setSavedSongs);
      setCurrentTime(0);
      setIsPlaying(false);
      setYoutubeUrl("");
      setSongName("");
      return;
    }

    // Detect if direct YouTube URL was pasted or requested
    const extractedId = extractYoutubeVideoId(query);

    if (extractedId) {
      // 1. Fetch metadata first
      setAnalysisProgress({
        message: "Retrieving YouTube video metadata...",
        pct: 20,
      });

      let metaTitle = query;
      let metaArtist = "YouTube";
      let metaThumb = getYoutubeThumbnail(extractedId, "hq");

      try {
        const infoRes = await fetch(`/api/youtube-info?url=${encodeURIComponent(extractedId)}`);
        if (infoRes.ok) {
          const info = await infoRes.json();
          if (info.title) metaTitle = info.title;
          if (info.author_name) metaArtist = info.author_name;
          if (info.thumbnail_url) metaThumb = info.thumbnail_url;
        }
      } catch (e) {
        console.warn("YouTube metadata fetch fallback:", e);
      }

      // 2. Attempt real audio extraction backend via yt-dlp endpoint
      setAnalysisProgress({
        message: "Acquiring YouTube audio stream (yt-dlp)...",
        pct: 40,
      });

      try {
        const ytRes = await resolveYouTubeAudio(extractedId);
        
        setAnalysisProgress({
          message: "Analyzing acquired YouTube audio with MIR engine...",
          pct: 60,
        });

        const audioFile = new File([ytRes.audioBlob], `${extractedId}.mp3`, { type: "audio/mpeg" });
        abortControllerRef.current = new AbortController();
        const analysisResult = await analyzeAudioFile(
          audioFile,
          (msg, pct) => setAnalysisProgress({ message: msg, pct: 60 + pct * 0.4 }),
          abortControllerRef.current.signal
        );

        const songWithMeta: SavedSong = {
          ...analysisResult,
          title: ytRes.title || metaTitle,
          artist: ytRes.artist || metaArtist,
          youtubeVideoId: extractedId,
          youtubeUrl: `https://www.youtube.com/watch?v=${extractedId}`,
          thumbnailUrl: metaThumb,
          isYoutubeTrack: true,
          audioBlob: ytRes.audioBlob,
          lastPlayedAt: Date.now(),
          savedAt: Date.now(),
          id: `yt-${extractedId}`,
        };

        await saveSongToDB(songWithMeta);
        saveLastPlayedSongId(songWithMeta.id);
        setActiveSong(songWithMeta);
        loadSongsFromDB().then(setSavedSongs);

        setCurrentTime(0);
        setIsPlaying(false);
        setYoutubeUrl("");
        setSongName("");
        setAnalysisProgress(null);
        return;
      } catch (err: any) {
        console.warn("YouTube audio extraction unavailable:", err?.message);

        // If backend audio extraction is unavailable, prepare PLAYBACK_ONLY track
        const playbackOnlySong: SavedSong = {
          id: `yt-playback-${extractedId}`,
          title: metaTitle,
          artist: metaArtist,
          duration: 180,
          tempo: 120,
          timeSignature: "4/4",
          key: "C",
          scale: "major",
          sections: [
            {
              id: "sec-yt-play",
              name: "Full Video Playback",
              start: 0,
              end: 180,
              bars: 45,
              chords: [],
            },
          ],
          chordSegments: [],
          beats: [],
          youtubeVideoId: extractedId,
          youtubeUrl: `https://www.youtube.com/watch?v=${extractedId}`,
          thumbnailUrl: metaThumb,
          isYoutubeTrack: true,
          lastPlayedAt: Date.now(),
          savedAt: Date.now(),
        };

        await saveSongToDB(playbackOnlySong);
        saveLastPlayedSongId(playbackOnlySong.id);
        setActiveSong(playbackOnlySong);
        loadSongsFromDB().then(setSavedSongs);

        setCurrentTime(0);
        setIsPlaying(false);
        setYoutubeUrl("");
        setSongName("");
        setAnalysisProgress(null);

        setDialog({
          isOpen: true,
          title: "YouTube Video Synchronized",
          message:
            "Playback is available via the synchronized player. Note: Direct server-side audio acquisition (yt-dlp) is unavailable in this cloud environment, so automated chord analysis is paused. You can play along with the video or upload a local MP3/WAV file for full MIR chord extraction.",
          confirmText: "Got It",
          type: "alert",
          onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
        });
        return;
      }
    }

    setAnalysisProgress({
      message: "Searching song database & analyzing chords...",
      pct: 35,
    });

    try {
      const response = await fetch("/api/analyze-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songQuery: query, youtubeUrl: youtubeUrl.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setDialog({
          isOpen: true,
          title: "Analysis Notice",
          message:
            data.error ||
            "Unable to retrieve chords for this query. Please verify the URL or try searching by Song Name and Artist.",
          confirmText: "OK",
          type: "alert",
          onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
        });
      } else {
        const videoId = data.youtubeVideoId || extractedId || "";
        const songWithMeta: SavedSong = {
          ...data,
          youtubeVideoId: videoId,
          youtubeUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : query,
          thumbnailUrl: data.thumbnailUrl || (videoId ? getYoutubeThumbnail(videoId, "hq") : undefined),
          isYoutubeTrack: !!videoId,
          lastPlayedAt: Date.now(),
          savedAt: Date.now(),
          id: data.id || `yt-${videoId || Date.now()}`,
        };

        // Map legacy format to new format if needed
        if (!songWithMeta.chordSegments || songWithMeta.chordSegments.length === 0) {
          let t = 0;
          songWithMeta.chordSegments = (songWithMeta.sections || []).flatMap((sec: any) =>
            (sec.chords || []).map((c: string) => {
              const seg = { chord: c, startTime: t, endTime: t + 2, confidence: 92 };
              t += 2;
              return seg;
            })
          );
        }

        await saveSongToDB(songWithMeta);
        saveLastPlayedSongId(songWithMeta.id);
        setActiveSong(songWithMeta);
        loadSongsFromDB().then(setSavedSongs);

        setCurrentTime(0);
        setIsPlaying(false);
        setYoutubeUrl("");
        setSongName("");
      }
    } catch (err) {
      console.error(err);
      setDialog({
        isOpen: true,
        title: "Connection Notice",
        message:
          "A network timeout or error occurred while contacting the AI chord engine. Please check your connection and try again.",
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
      liveChordDetector.stop();
    };
  }, []);

  const toggleLiveMic = async () => {
    if (isLiveMic) {
      liveChordDetector.stop();
      audioEngine.releaseInput("chord-finder");
      setIsLiveMic(false);
      setLiveDetection(null);
    } else {
      try {
        await audioEngine.acquireInput("chord-finder");
        const started = await liveChordDetector.start((detection) => {
          setLiveDetection(detection);
        });
        if (started) {
          setIsLiveMic(true);
        }
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
        <div className="frosted-card rounded-3xl p-4 flex flex-col justify-between min-h-[140px] border border-white/10 hover:border-red-500/30 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 rounded-lg bg-red-600/20 text-red-500 flex items-center justify-center border border-red-500/30">
                <Youtube className="w-3 h-3" />
              </div>
              <h3 className="text-xs font-bold font-mono text-zinc-200 uppercase tracking-wider">
                YouTube & Song Chords
              </h3>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-bold">
              SYNCED PLAYER
            </span>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Paste YouTube Link or Song Title..."
                value={youtubeUrl || songName}
                onChange={(e) => {
                  const val = e.target.value;
                  setYoutubeUrl(val);
                  setSongName(val);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !analysisProgress) {
                    handleAnalyzeYoutube();
                  }
                }}
                className="flex-1 bg-white/5 text-xs font-mono text-white rounded-xl px-3 py-2 border border-white/10 focus:border-[#a3ff12]/50 focus:outline-none placeholder:text-zinc-500"
              />
              <button
                onClick={handleAnalyzeYoutube}
                disabled={!!analysisProgress || (!youtubeUrl.trim() && !songName.trim())}
                className="px-3.5 py-2 bg-[#a3ff12] hover:bg-[#92eb10] disabled:opacity-40 disabled:cursor-not-allowed text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer font-mono shrink-0 shadow-[0_0_12px_rgba(163,255,18,0.2)]"
              >
                {analysisProgress ? "..." : "TRANSCRIBE"}
              </button>
            </div>
            <p className="text-[10px] font-mono text-zinc-400">
              Paste YouTube video link or title to transcribe chords & sync video
            </p>
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

      {/* Live Acoustic Mic Listening HUD (Chord AI Listening Mode) */}
      {isLiveMic && (
        <div className="frosted-card rounded-3xl p-4 sm:p-5 border border-emerald-500/40 bg-[#061208]/90 shadow-[0_0_30px_rgba(16,185,129,0.15)] animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-emerald-500/20">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40 animate-pulse">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
                    LIVE ACOUSTIC LISTENING (CHORD AI MODE)
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                </div>
                <p className="text-xs text-zinc-400">
                  Listening to guitar / external YouTube audio via microphone in real-time
                </p>
              </div>
            </div>

            {liveDetection && (
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded-lg">
                  BASS: {liveDetection.bassNote}
                </span>
                <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40 rounded-lg">
                  {liveDetection.confidence}% CONFIDENCE
                </span>
              </div>
            )}
          </div>

          {/* Live Detected Chord Display & Chromagram Spectrum */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="bg-black/50 p-3 rounded-2xl border border-emerald-500/20 text-center">
              <span className="text-[10px] font-mono uppercase text-zinc-400">DETECTED CHORD</span>
              <div className="text-3xl sm:text-4xl font-black font-mono text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]">
                {liveDetection?.chord || "Listening..."}
              </div>
            </div>

            <div className="md:col-span-2 bg-black/40 p-3 rounded-2xl border border-white/5">
              <span className="text-[10px] font-mono uppercase text-zinc-400 block mb-1.5">
                12-SEMITONE HARMONIC CHROMAGRAM (C → B)
              </span>
              <div className="grid grid-cols-12 gap-1 h-12 items-end">
                {["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].map((note, idx) => {
                  const energy = liveDetection?.chroma ? liveDetection.chroma[idx] : 0;
                  const isHigh = energy > 0.6;
                  return (
                    <div key={note} className="flex flex-col items-center h-full justify-end">
                      <div
                        className={`w-full rounded-t transition-all duration-75 ${
                          isHigh ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-emerald-950/60"
                        }`}
                        style={{ height: `${Math.max(8, energy * 100)}%` }}
                      />
                      <span className="text-[8px] font-mono text-zinc-400 mt-1">{note}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Synchronized YouTube Video Player for YouTube Tracks */}
      {activeSong?.youtubeVideoId && showYouTubePlayer && (
        <YouTubeSyncPlayer
          videoId={activeSong.youtubeVideoId}
          title={activeSong.title}
          artist={activeSong.artist}
          currentTime={currentTime}
          isPlaying={isPlaying}
          seekTrigger={seekTrigger}
          onTimeUpdate={(t) => setCurrentTime(t)}
          onPlayStateChange={(p) => setIsPlaying(p)}
          onSeek={(t) => seekToTime(t)}
          playbackRate={slowDown ? 0.75 : 1.0}
          onPlaybackRateChange={(rate) => setSlowDown(rate < 1.0)}
        />
      )}

      {/* Main Center Area: Side-by-Side Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Chord Progression Canvas (Left/Center Column - 8 cols) */}
        <div className="lg:col-span-8 frosted-card rounded-3xl p-4 sm:p-6 flex flex-col justify-between space-y-4 sm:space-y-5">
          {activeSong ? (
            <>
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                  CURRENT PROGRESSION
                </span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-zinc-300">
                    {activeSong.tuning || "E Standard"}
                  </span>
                  <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-zinc-300">
                    Key: {activeSong.key || "C Maj"}
                  </span>
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

              {/* Large Chord Triad Display */}
              <div className="flex flex-col items-center justify-center py-2 sm:py-3 border-y border-white/5">
                <div className="flex items-center justify-around w-full">
                  {/* Previous Chord */}
                  <div className="text-center opacity-40">
                    <div className="text-xl sm:text-3xl font-bold font-mono text-zinc-300">
                      {capo > 0 && prevChord.isValid ? prevChord.shapeChord : prevChord.transposedChord}
                    </div>
                    {capo > 0 && prevChord.isValid && (
                      <div className="text-[8px] sm:text-[9px] font-mono text-zinc-400">
                        {prevChord.transposedChord}
                      </div>
                    )}
                    <span className="text-[9px] sm:text-[10px] font-mono text-zinc-500">{prevChord.timeLabel}</span>
                  </div>

                  {/* Active Main Chord */}
                  <div className="text-center transform scale-105 sm:scale-120">
                    <div className="text-3xl sm:text-5xl font-black font-mono text-[#a3ff12] drop-shadow-[0_0_20px_rgba(163,255,18,0.4)]">
                      {capo > 0 && activeChord.isValid ? activeChord.shapeChord : activeChord.transposedChord}
                    </div>
                    {capo > 0 && activeChord.isValid && (
                      <div className="mt-0.5 flex items-center justify-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                          Sounding: {activeChord.transposedChord}
                        </span>
                      </div>
                    )}
                    {transpose !== 0 && activeChord.isValid && capo === 0 && (
                      <div className="text-[9px] font-mono text-zinc-400 mt-0.5">
                        Sounding (Original: {activeChord.detectedChord})
                      </div>
                    )}
                    <span className="text-[10px] sm:text-[11px] font-mono font-bold text-zinc-300 mt-0.5 block">
                      {activeChord.timeLabel}
                    </span>
                  </div>

                  {/* Next Chord */}
                  <div className="text-center opacity-40">
                    <div className="text-xl sm:text-3xl font-bold font-mono text-zinc-300">
                      {capo > 0 && nextChord.isValid ? nextChord.shapeChord : nextChord.transposedChord}
                    </div>
                    {capo > 0 && nextChord.isValid && (
                      <div className="text-[8px] sm:text-[9px] font-mono text-zinc-400">
                        {nextChord.transposedChord}
                      </div>
                    )}
                    <span className="text-[9px] sm:text-[10px] font-mono text-zinc-500">{nextChord.timeLabel}</span>
                  </div>
                </div>
              </div>

              {/* Guitar Chord Fretboard Diagram */}
              <div className="flex flex-col items-center justify-center pt-1">
                {activeVoicingResult.voicing ? (
                  <div className="flex flex-col items-center w-full">
                    <div className="bg-[#13161a] rounded-2xl p-3 sm:p-4 border border-white/10 shadow-2xl relative w-full max-w-[260px] sm:max-w-[280px]">
                      {/* Simple compact header */}
                      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-white/10 text-xs font-mono">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-[#a3ff12] font-black text-sm sm:text-base">
                            {capo > 0 && activeChord.isValid ? activeChord.shapeChord : activeChord.transposedChord}
                          </span>
                          <span className="text-[9px] text-zinc-400 font-semibold uppercase">
                            {capo > 0 ? "Play Shape" : "Shape"}
                          </span>
                          {capo > 0 && (
                            <span className="text-[9px] sm:text-[10px] text-sky-400 font-semibold px-1.5 py-0.5 rounded bg-sky-400/10 border border-sky-400/20">
                              Capo {capo}
                            </span>
                          )}
                          {activeVoicingResult.voicing?.cagedShape && !capo && (
                            <span className="text-[10px] text-zinc-400">
                              ({activeVoicingResult.voicing.cagedShape}-Shape)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {activeVoicingResult.voicingType === "exact" && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#a3ff12]/10 text-[#a3ff12]">
                              Exact
                            </span>
                          )}
                          {activeVoicingResult.voicingType === "simplified" && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-400/10 text-yellow-400">
                              Playable
                            </span>
                          )}
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
                      <span className="text-[10px] font-mono text-zinc-400 mt-1.5 text-center max-w-[240px]">
                        {activeVoicingResult.simplificationReason}
                      </span>
                    )}

                    {/* Fingerstyle Progression arrangement flow feedback */}
                    {playabilityMode === "fingerstyle" && activeArrangedStep?.voiceLeadingDescription && (
                      <div className="mt-2 px-3 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-[10px] font-mono text-sky-300 flex items-center gap-2">
                        <span className="font-bold">Step {activeIdx + 1}/{segments.length}:</span>
                        <span>{activeArrangedStep.voiceLeadingDescription}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-[#13161a] rounded-2xl p-4 border border-white/10 shadow-xl flex flex-col items-center justify-center h-40 w-64 text-center space-y-2">
                    <span className="text-xs font-mono font-bold text-zinc-300">
                      No guitar voicing available
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500 max-w-[200px]">
                      {activeVoicingResult.simplificationReason || `No safe diagram for ${activeChord.shapeChord}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Draggable Audio Waveform Timeline Scrubber & Transport Controls (Placed below chord diagram, above confidence) */}
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

              {/* Detection & Voicing Confidence Badges */}
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-[10px] sm:text-[11px] font-mono pt-1">
                <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-xl border border-white/5">
                  <span className="text-zinc-400">Detection Confidence:</span>
                  <span className="text-[#a3ff12] font-bold">{activeVoicingResult.detectionConfidence}%</span>
                </div>
                <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-xl border border-white/5">
                  <span className="text-zinc-400">Voicing Confidence:</span>
                  <span className="text-white font-bold">{activeVoicingResult.voicingConfidence}%</span>
                </div>
                {activeSong?.diagnostics && (
                  <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-xl border border-white/5">
                    <span className="text-zinc-400">Segments:</span>
                    <span className="text-zinc-300">
                      {activeSong.diagnostics.rawSegmentCount ?? activeSong.diagnostics.rawChordSegmentCount ?? segments.length} raw →{" "}
                      <span className="text-[#a3ff12] font-bold">
                        {activeSong.diagnostics.stabilizedSegmentCount ?? activeSong.diagnostics.finalChordSegmentCount ?? segments.length} stabilized
                      </span>
                    </span>
                    {(activeSong.diagnostics.rejectedTransientSlashSegments ?? 0) > 0 && (
                      <span className="text-amber-400 text-[10px] ml-1">
                        ({activeSong.diagnostics.rejectedTransientSlashSegments} transient slashes filtered)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* REAL TIMING CHECK Diagnostic Panel (Phase 6F) */}
              {realTimingCheck && (
                <div className="w-full max-w-2xl mx-auto mt-2 bg-black/40 border border-white/10 rounded-2xl p-3 backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#a3ff12] animate-pulse" />
                      <span className="text-[11px] font-mono font-bold text-white uppercase tracking-wider">REAL TIMING CHECK</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">
                      Active Chord: <span className="text-[#a3ff12] font-bold">{realTimingCheck.activeChord}</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] sm:text-[11px] font-mono">
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-zinc-400 block text-[9px] uppercase">BPM</span>
                      <span className="text-[#a3ff12] font-bold text-xs">{realTimingCheck.bpm} BPM</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-zinc-400 block text-[9px] uppercase">Beat 1 (First Beat)</span>
                      <span className="text-white font-bold text-xs">{realTimingCheck.beat1}</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-zinc-400 block text-[9px] uppercase">Current Beat</span>
                      <span className="text-white font-bold text-xs">{realTimingCheck.currentBeat}</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-zinc-400 block text-[9px] uppercase">Chord Start</span>
                      <span className="text-white font-bold text-xs">{realTimingCheck.chordStart}</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-zinc-400 block text-[9px] uppercase">Nearest Beat</span>
                      <span className="text-white font-bold text-xs">{realTimingCheck.nearestBeat}</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-zinc-400 block text-[9px] uppercase">Offset in ms</span>
                      <span className={`font-bold text-xs ${Math.abs(realTimingCheck.offsetMs) <= 30 ? "text-[#a3ff12]" : Math.abs(realTimingCheck.offsetMs) <= 75 ? "text-amber-400" : "text-rose-400"}`}>
                        {realTimingCheck.offsetDisplay}
                      </span>
                    </div>
                  </div>
                </div>
              )}
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
