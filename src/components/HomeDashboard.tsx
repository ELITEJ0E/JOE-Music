import React, { useState, useEffect, useRef } from "react";
import {
  SlidersHorizontal,
  LayoutGrid,
  Play,
  Pause,
  Circle,
  Repeat,
  Music,
  Mic,
  ChevronRight,
  AudioWaveform,
  Volume2,
  VolumeX,
  Radio,
  Clock,
  Sparkles,
  ArrowRight,
  Disc,
  Flame,
  Check,
  FolderOpen
} from "lucide-react";
import { WorkstationMode, TonePreset, SavedRecording } from "../types";
import { SunoTrack } from "../lib/suno-playlists";
import {
  RecentSongItem,
  getRecentSongs,
  recordRecentSongPlay,
  formatTimeAgo
} from "../utils/recentSongs";
import { loadRecordingsFromDB } from "../utils/storage";
import { guitarSynth } from "../audio/guitarSynth";
import { getSunoStreamUrl, resolveClientDecryptedAudioBlob } from "../utils/sunoAudioResolver";

interface HomeDashboardProps {
  onSelectMode: (mode: WorkstationMode) => void;
  onAnalyzeSong?: (song: SunoTrack) => void;
  onOpenInStudio?: (song: SunoTrack) => void;
  onUseAsPractice?: (song: SunoTrack) => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  onSelectMode,
  onAnalyzeSong,
  onOpenInStudio,
  onUseAsPractice,
}) => {
  // Recent songs state
  const [recentSongs, setRecentSongs] = useState<RecentSongItem[]>(() => getRecentSongs());
  const [activeSong, setActiveSong] = useState<RecentSongItem>(() => {
    const list = getRecentSongs();
    return list[0];
  });

  // Audio Playback Engine for Continue Playing
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(() => activeSong?.duration || 185);
  const [volume, setVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playingRecordingId, setPlayingRecordingId] = useState<string | null>(null);
  const [playingToneId, setPlayingToneId] = useState<string | null>(null);
  const [savedRecordings, setSavedRecordings] = useState<SavedRecording[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync recent songs on storage/custom events
  useEffect(() => {
    const handleUpdate = (e: any) => {
      const updated = e.detail || getRecentSongs();
      setRecentSongs(updated);
      if (updated.length > 0 && (!activeSong || !updated.some((s: RecentSongItem) => s.id === activeSong.id))) {
        setActiveSong(updated[0]);
      }
    };

    window.addEventListener("recent_songs_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);

    // Load recent recordings
    loadRecordingsFromDB().then((recs) => {
      if (recs && recs.length > 0) {
        setSavedRecordings(recs.slice(0, 4));
      }
    });

    return () => {
      window.removeEventListener("recent_songs_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [activeSong]);

  // Audio element event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(audio.duration || activeSong?.duration || 180);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handleError = async () => {
      console.warn("Audio stream error for:", activeSong?.title);
      const audio = audioRef.current;
      if (audio && activeSong?.id) {
        // Fast-failover to in-browser client decryption if serverless proxy failed
        const blobUrl = await resolveClientDecryptedAudioBlob(activeSong.id);
        if (blobUrl) {
          audio.src = blobUrl;
          audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          return;
        }
      }
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [activeSong]);

  const resolveSongUrl = (song: RecentSongItem | null) => {
    if (!song) return "";
    if (song.id) return getSunoStreamUrl(song.id);
    if (song.audioUrl && !song.audioUrl.includes("cdn1.suno.ai") && !song.audioUrl.includes("forbidden")) {
      return getSunoStreamUrl(song.audioUrl);
    }
    return song.id ? getSunoStreamUrl(song.id) : "";
  };

  // Handle Play/Pause toggle
  const handleTogglePlay = (songToPlay?: RecentSongItem) => {
    const audio = audioRef.current;
    const targetSong = songToPlay || activeSong;

    if (!audio || !targetSong) return;

    const targetUrl = resolveSongUrl(targetSong);

    // If switching song
    if (songToPlay && songToPlay.id !== activeSong?.id) {
      setActiveSong(songToPlay);
      audio.src = targetUrl;
      audio.currentTime = 0;
      audio.volume = isMuted ? 0 : volume;
      audio.play().then(() => {
        setIsPlaying(true);
        recordRecentSongPlay(songToPlay);
      }).catch((err) => {
        console.warn("Play error:", err);
      });
      return;
    }

    // Toggle current
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (!audio.src || audio.src === "" || !audio.src.includes(targetSong.id)) {
        audio.src = targetUrl;
      }
      audio.volume = isMuted ? 0 : volume;
      audio.play().then(() => {
        setIsPlaying(true);
        recordRecentSongPlay(targetSong);
      }).catch((err) => {
        console.warn("Play error:", err);
      });
    }
  };

  const handleNextSongInHome = () => {
    if (!recentSongs || recentSongs.length === 0) return;
    const currIdx = recentSongs.findIndex((s) => s.id === activeSong?.id);
    const nextIdx = currIdx >= 0 && currIdx < recentSongs.length - 1 ? currIdx + 1 : 0;
    handleTogglePlay(recentSongs[nextIdx]);
  };

  const handlePrevSongInHome = () => {
    if (!recentSongs || recentSongs.length === 0) return;
    const currIdx = recentSongs.findIndex((s) => s.id === activeSong?.id);
    const prevIdx = currIdx > 0 ? currIdx - 1 : recentSongs.length - 1;
    handleTogglePlay(recentSongs[prevIdx]);
  };

  // Keyboard shortcut listener for Space / F8 (Play/Pause), F7 (Prev), F9 (Next)
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
        handleTogglePlay();
      } else if (e.key === "F7") {
        e.preventDefault();
        handlePrevSongInHome();
      } else if (e.key === "F9") {
        e.preventDefault();
        handleNextSongInHome();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [recentSongs, activeSong, isPlaying]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Greeting based on local hour
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? "Good morning" : currentHour < 18 ? "Good afternoon" : "Good evening";

  // Play audio sample for recordings
  const handlePlayRecording = (recId: string, url?: string) => {
    if (playingRecordingId === recId) {
      setPlayingRecordingId(null);
    } else {
      setPlayingRecordingId(recId);
      // Play guitar synth chord progression if no audio url
      guitarSynth.strumChord([null, 0, 2, 2, 1, 0], "down", 25, 0, 0.7);
      setTimeout(() => {
        guitarSynth.strumChord([3, 2, 0, 0, 3, 3], "down", 25, 0, 0.7);
      }, 700);
      setTimeout(() => {
        setPlayingRecordingId(null);
      }, 2000);
    }
  };

  // Play Tone Preset Synth Preview
  const handlePreviewTone = (toneId: string, name: string) => {
    if (playingToneId === toneId) {
      setPlayingToneId(null);
      return;
    }
    setPlayingToneId(toneId);
    if (toneId === "tone-clean") {
      guitarSynth.strumChord([null, 0, 2, 2, 2, 0], "down", 35, 0, 0.8);
      setTimeout(() => guitarSynth.strumChord([null, 2, 4, 4, 4, 2], "down", 35, 0, 0.8), 700);
    } else if (toneId === "tone-high-gain") {
      guitarSynth.strumChord([0, 2, 2, null, null, null], "down", 15, 0, 0.9);
      setTimeout(() => guitarSynth.strumChord([3, 5, 5, null, null, null], "down", 15, 0, 0.9), 500);
      setTimeout(() => guitarSynth.strumChord([5, 7, 7, null, null, null], "down", 15, 0, 0.9), 1000);
    } else {
      guitarSynth.strumChord([0, 2, 2, 1, 0, 0], "down", 45, 0, 0.75);
      setTimeout(() => guitarSynth.strumChord([null, 0, 2, 2, 1, 0], "down", 45, 0, 0.75), 800);
    }
    setTimeout(() => setPlayingToneId(null), 2000);
  };

  return (
    <div id="home-dashboard" className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Hidden Global Audio Element for Home Playback */}
      <audio ref={audioRef} preload="metadata" />

      {/* Top Header & Studio Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-[#14181f]/80 via-[#10141a]/90 to-[#0d1015]/80 p-5 rounded-3xl border border-white/5 backdrop-blur-md">
        <div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#a3ff12]/10 text-[#a3ff12] border border-[#a3ff12]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#a3ff12] animate-pulse" />
              STUDIO ONLINE
            </span>
            <span className="text-xs text-zinc-500 font-mono">48 kHz • 24-bit DSP</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mt-1.5">
            {greeting}, <span className="text-[#a3ff12]">Joel</span>
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-0.5">
            Your workstation is tuned and ready. What are we playing today?
          </p>
        </div>

        {/* Quick Access Badges */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={() => onSelectMode("tuner")}
            className="px-3.5 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-2 transition-all hover:scale-105"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#a3ff12]" />
            <span>Tuner Ready</span>
          </button>
          <button
            onClick={() => onSelectMode("studio")}
            className="px-3.5 py-2 rounded-2xl bg-[#a3ff12]/10 hover:bg-[#a3ff12]/20 border border-[#a3ff12]/30 text-xs font-bold text-[#a3ff12] flex items-center gap-2 transition-all hover:scale-105"
          >
            <Mic className="w-3.5 h-3.5 text-[#a3ff12]" />
            <span>New DAW Project</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Quick Action Tiles (Left) + Enhanced Continue Playing Card (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Quick Action Tiles (6 dynamic workstation tiles) */}
        <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-3 gap-3.5">
          {/* TUNE */}
          <button
            id="home-action-tune"
            onClick={() => onSelectMode("tuner")}
            className="h-32 bg-[#12151a]/90 hover:bg-[#181d24] border border-white/5 hover:border-[#a3ff12]/30 rounded-3xl p-4 flex flex-col justify-between transition-all group hover:scale-[1.02] shadow-sm text-left"
          >
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-[#a3ff12]/10 group-hover:border-[#a3ff12]/20 transition-all">
              <SlidersHorizontal className="w-4 h-4 text-zinc-300 group-hover:text-[#a3ff12] transition-colors" />
            </div>
            <div>
              <span className="text-[11px] font-mono font-bold tracking-wider text-zinc-400 group-hover:text-white uppercase block">
                TUNER
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">Standard / Drop D</span>
            </div>
          </button>

          {/* FIND CHORDS */}
          <button
            id="home-action-find-chords"
            onClick={() => onSelectMode("chords-ai")}
            className="h-32 bg-[#12151a]/90 hover:bg-[#181d24] border border-white/5 hover:border-[#a3ff12]/30 rounded-3xl p-4 flex flex-col justify-between transition-all group hover:scale-[1.02] shadow-sm text-left"
          >
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-[#a3ff12]/10 group-hover:border-[#a3ff12]/20 transition-all">
              <LayoutGrid className="w-4 h-4 text-zinc-300 group-hover:text-[#a3ff12] transition-colors" />
            </div>
            <div>
              <span className="text-[11px] font-mono font-bold tracking-wider text-zinc-400 group-hover:text-white uppercase block">
                CHORD AI
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">Extract & Voicings</span>
            </div>
          </button>

          {/* JOEL'S SONGS */}
          <button
            id="home-action-play-song"
            onClick={() => onSelectMode("songs")}
            className="h-32 bg-[#12151a]/90 hover:bg-[#181d24] border border-white/5 hover:border-[#a3ff12]/30 rounded-3xl p-4 flex flex-col justify-between transition-all group hover:scale-[1.02] shadow-sm text-left"
          >
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-[#a3ff12]/10 group-hover:border-[#a3ff12]/20 transition-all">
              <Music className="w-4 h-4 text-zinc-300 group-hover:text-[#a3ff12] transition-colors" />
            </div>
            <div>
              <span className="text-[11px] font-mono font-bold tracking-wider text-zinc-400 group-hover:text-white uppercase block">
                MY SONGS
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">Suno Playlists</span>
            </div>
          </button>

          {/* MULTI-TRACK DAW */}
          <button
            id="home-action-record"
            onClick={() => onSelectMode("studio")}
            className="h-32 bg-[#12151a]/90 hover:bg-[#181d24] border border-white/5 hover:border-rose-500/30 rounded-3xl p-4 flex flex-col justify-between transition-all group hover:scale-[1.02] shadow-sm text-left"
          >
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-rose-500/10 group-hover:border-rose-500/20 transition-all">
              <Circle className="w-4 h-4 text-rose-400 group-hover:text-rose-300 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-[11px] font-mono font-bold tracking-wider text-zinc-400 group-hover:text-white uppercase block">
                STUDIO DAW
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">8-Track & Stems</span>
            </div>
          </button>

          {/* LOOPER */}
          <button
            id="home-action-looper"
            onClick={() => onSelectMode("looper")}
            className="h-32 bg-[#12151a]/90 hover:bg-[#181d24] border border-white/5 hover:border-[#a3ff12]/30 rounded-3xl p-4 flex flex-col justify-between transition-all group hover:scale-[1.02] shadow-sm text-left"
          >
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-[#a3ff12]/10 group-hover:border-[#a3ff12]/20 transition-all">
              <Repeat className="w-4 h-4 text-zinc-300 group-hover:text-[#a3ff12] transition-colors" />
            </div>
            <div>
              <span className="text-[11px] font-mono font-bold tracking-wider text-zinc-400 group-hover:text-white uppercase block">
                LOOPER
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">Live Overdub</span>
            </div>
          </button>

          {/* TONE STUDIO */}
          <button
            id="home-action-tone-studio"
            onClick={() => onSelectMode("tone-studio")}
            className="h-32 bg-[#12151a]/90 hover:bg-[#181d24] border border-white/5 hover:border-[#a3ff12]/30 rounded-3xl p-4 flex flex-col justify-between transition-all group hover:scale-[1.02] shadow-sm text-left"
          >
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-[#a3ff12]/10 group-hover:border-[#a3ff12]/20 transition-all">
              <AudioWaveform className="w-4 h-4 text-zinc-300 group-hover:text-[#a3ff12] transition-colors" />
            </div>
            <div>
              <span className="text-[11px] font-mono font-bold tracking-wider text-zinc-400 group-hover:text-white uppercase block">
                TONE FX
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">Amps & Pedals</span>
            </div>
          </button>
        </div>

        {/* Enhanced Continue Playing Card with Real Audio Playback (Right) */}
        <div className="lg:col-span-6 bg-gradient-to-br from-[#151921] via-[#11141a] to-[#0c0e12] rounded-3xl p-6 border border-white/10 flex flex-col justify-between relative overflow-hidden shadow-xl group">
          {/* Ambient Glow & Animated Waveform lines */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#a3ff12]/5 rounded-full blur-3xl pointer-events-none" />
          
          <div>
            {/* Top Bar: CONTINUE PLAYING pill & Audio status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-[#a3ff12]/10 text-[#a3ff12] border border-[#a3ff12]/20 uppercase tracking-wider flex items-center gap-1.5">
                  {isPlaying ? (
                    <span className="flex space-x-0.5 items-end h-2.5">
                      <span className="w-0.5 bg-[#a3ff12] h-full animate-bounce" />
                      <span className="w-0.5 bg-[#a3ff12] h-2/3 animate-bounce delay-75" />
                      <span className="w-0.5 bg-[#a3ff12] h-4/5 animate-bounce delay-150" />
                    </span>
                  ) : (
                    <Disc className="w-3 h-3 animate-spin text-[#a3ff12]" />
                  )}
                  CONTINUE PLAYING
                </span>
                <span className="text-[11px] text-zinc-400 font-mono">
                  {activeSong?.lastPlayedAt ? formatTimeAgo(activeSong.lastPlayedAt) : "Recently played"}
                </span>
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Song Artwork & Info Header */}
            <div className="flex items-center space-x-4 mt-5">
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shrink-0 border border-white/10 shadow-lg group-hover:border-[#a3ff12]/30 transition-all">
                <img
                  src={activeSong?.imageUrl || "https://cdn2.suno.ai/1bc7ee09-ee52-487a-85c7-568e961bbc3d.jpeg"}
                  alt={activeSong?.title || "Song Cover"}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <button
                  onClick={() => handleTogglePlay()}
                  className="absolute inset-0 bg-black/40 hover:bg-black/20 flex items-center justify-center transition-all cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-[#a3ff12] text-black flex items-center justify-center shadow-lg transition-transform active:scale-95">
                    {isPlaying ? (
                      <Pause className="w-5 h-5 fill-black" />
                    ) : (
                      <Play className="w-5 h-5 fill-black ml-0.5" />
                    )}
                  </div>
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
                  {activeSong?.title || "红唇转圈"}
                </h2>
                <p className="text-xs text-zinc-300 font-medium mt-0.5 truncate">
                  {activeSong?.artist || "ELITEJOE"} • <span className="text-zinc-400">{activeSong?.album || "Joel's Originals"}</span>
                </p>

                {/* Badges: BPM / Key / Meter */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-md text-[10px] font-mono text-zinc-300 font-bold">
                    {activeSong?.bpm || 120} BPM
                  </span>
                  <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-md text-[10px] font-mono text-zinc-300 font-bold">
                    {activeSong?.key || "A Major"}
                  </span>
                  <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-md text-[10px] font-mono text-[#a3ff12]/90 font-bold">
                    4/4
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Scrub Bar & Time Display */}
          <div className="space-y-3.5 pt-6 z-10">
            <div>
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.5}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
              />
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mt-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration || activeSong?.duration || 185)}</span>
              </div>
            </div>

            {/* Action Bar: Main Play/Pause Button + Quick Extract & DAW Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <button
                id="btn-home-continue-playing"
                onClick={() => handleTogglePlay()}
                className="sm:col-span-6 py-3 px-4 bg-[#a3ff12] hover:bg-[#b5ff33] text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-[0.98]"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4 fill-black" />
                    <span>PAUSE PLAYBACK</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-black" />
                    <span>PLAY / CONTINUE</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  if (activeSong) {
                    onAnalyzeSong?.(activeSong as any);
                  } else {
                    onSelectMode("chords-ai");
                  }
                }}
                className="sm:col-span-3 py-3 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all hover:scale-[1.02]"
                title="Extract Chords in Chord AI"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-[#a3ff12]" />
                <span>CHORDS</span>
              </button>

              <button
                onClick={() => {
                  if (activeSong) {
                    onOpenInStudio?.(activeSong as any);
                  } else {
                    onSelectMode("studio");
                  }
                }}
                className="sm:col-span-3 py-3 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all hover:scale-[1.02]"
                title="Open Stems in Studio DAW"
              >
                <Mic className="w-3.5 h-3.5 text-rose-400" />
                <span>DAW</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom 3 Detailed Panels: Recently Played Songs (Interactive), Recent Recordings, Favorite Tones */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Panel 1: Recently Played Songs (Click any to load into Continue Playing) */}
        <div className="bg-[#12151a]/90 border border-white/5 rounded-3xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div className="flex items-center space-x-2">
              <Music className="w-4 h-4 text-[#a3ff12]" />
              <h3 className="text-sm font-bold text-white tracking-wide">Recently Played</h3>
            </div>
            <button
              onClick={() => onSelectMode("songs")}
              className="text-[10px] font-mono font-bold text-zinc-400 hover:text-white uppercase tracking-wider flex items-center gap-1 transition-colors"
            >
              <span>VIEW ALL</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* List of Recent Songs */}
          <div className="space-y-2.5 mt-3.5 flex-1">
            {recentSongs.slice(0, 4).map((song) => {
              const isCurrent = activeSong?.id === song.id;
              const isCurrentPlaying = isCurrent && isPlaying;

              return (
                <div
                  key={song.id}
                  onClick={() => handleTogglePlay(song)}
                  className={`p-2.5 rounded-2xl flex items-center justify-between cursor-pointer transition-all border group ${
                    isCurrent
                      ? "bg-[#a3ff12]/10 border-[#a3ff12]/30 text-white"
                      : "bg-white/5 hover:bg-white/10 border-transparent hover:border-white/10 text-zinc-300"
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 pr-2">
                    <div className="relative w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/10">
                      <img
                        src={song.imageUrl}
                        alt={song.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div
                        className={`absolute inset-0 bg-black/40 flex items-center justify-center ${
                          isCurrentPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        } transition-opacity`}
                      >
                        {isCurrentPlaying ? (
                          <Pause className="w-4 h-4 text-[#a3ff12] fill-current" />
                        ) : (
                          <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                        )}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate group-hover:text-[#a3ff12] transition-colors">
                        {song.title}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono truncate flex items-center gap-1.5 mt-0.5">
                        <span>{song.key || "A Major"}</span>
                        <span>•</span>
                        <span>{song.bpm || 120} BPM</span>
                        <span>•</span>
                        <span>{formatTime(song.duration)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Direct Extract Action */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnalyzeSong?.(song as any);
                    }}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-[#a3ff12] hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Extract Chords"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel 2: Recent Recordings & Stems */}
        <div className="bg-[#12151a]/90 border border-white/5 rounded-3xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div className="flex items-center space-x-2">
              <Mic className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-bold text-white tracking-wide">Studio Recordings</h3>
            </div>
            <button
              onClick={() => onSelectMode("studio")}
              className="text-[10px] font-mono font-bold text-zinc-400 hover:text-white uppercase tracking-wider flex items-center gap-1 transition-colors"
            >
              <span>OPEN DAW</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2.5 mt-3.5 flex-1">
            {savedRecordings.length > 0 ? (
              savedRecordings.slice(0, 3).map((rec) => (
                <div
                  key={rec.id}
                  className="p-2.5 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-between border border-transparent hover:border-white/5 transition-all"
                >
                  <div className="flex items-center space-x-3 min-w-0 pr-2">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-rose-400 shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{rec.title}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        {formatTime(rec.duration)} • {rec.date}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handlePlayRecording(rec.id, rec.url)}
                    className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-[#a3ff12] hover:text-black text-zinc-300 flex items-center justify-center transition-colors shrink-0"
                  >
                    {playingRecordingId === rec.id ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    )}
                  </button>
                </div>
              ))
            ) : (
              <>
                <div className="p-2.5 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-between border border-transparent hover:border-white/5 transition-all">
                  <div className="flex items-center space-x-3 min-w-0 pr-2">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-rose-400 shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">Acoustic_Idea_Amaj.wav</div>
                      <div className="text-[10px] text-zinc-400 font-mono">01:45 • Yesterday</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handlePlayRecording("rec-1")}
                    className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-[#a3ff12] hover:text-black text-zinc-300 flex items-center justify-center transition-colors shrink-0"
                  >
                    {playingRecordingId === "rec-1" ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    )}
                  </button>
                </div>

                <div className="p-2.5 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-between border border-transparent hover:border-white/5 transition-all">
                  <div className="flex items-center space-x-3 min-w-0 pr-2">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-rose-400 shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">Funk_Groove_Stem.wav</div>
                      <div className="text-[10px] text-zinc-400 font-mono">00:52 • 2 days ago</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handlePlayRecording("rec-2")}
                    className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-[#a3ff12] hover:text-black text-zinc-300 flex items-center justify-center transition-colors shrink-0"
                  >
                    {playingRecordingId === "rec-2" ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    )}
                  </button>
                </div>

                <div className="p-2.5 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-between border border-transparent hover:border-white/5 transition-all">
                  <div className="flex items-center space-x-3 min-w-0 pr-2">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-rose-400 shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">Drop_D_Lead_Riff.wav</div>
                      <div className="text-[10px] text-zinc-400 font-mono">01:10 • 4 days ago</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handlePlayRecording("rec-3")}
                    className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-[#a3ff12] hover:text-black text-zinc-300 flex items-center justify-center transition-colors shrink-0"
                  >
                    {playingRecordingId === "rec-3" ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Panel 3: Quick Favorite Tone Presets */}
        <div className="bg-[#12151a]/90 border border-white/5 rounded-3xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div className="flex items-center space-x-2">
              <AudioWaveform className="w-4 h-4 text-[#a3ff12]" />
              <h3 className="text-sm font-bold text-white tracking-wide">Favorite Tones</h3>
            </div>
            <button
              onClick={() => onSelectMode("presets")}
              className="text-[10px] font-mono font-bold text-zinc-400 hover:text-white uppercase tracking-wider flex items-center gap-1 transition-colors"
            >
              <span>ALL PRESETS</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2.5 mt-3.5 flex-1">
            <div
              onClick={() => handlePreviewTone("tone-clean", "Crystal Clean Delay")}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-between cursor-pointer transition-all border border-transparent hover:border-white/5 group"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <AudioWaveform className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-[#a3ff12] transition-colors">
                    Crystal Clean Delay
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">Fender Twin • Tape Echo</div>
                </div>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 group-hover:text-white">
                {playingToneId === "tone-clean" ? "Previewing..." : "Audition"}
              </span>
            </div>

            <div
              onClick={() => handlePreviewTone("tone-high-gain", "Modern High Gain")}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-between cursor-pointer transition-all border border-transparent hover:border-white/5 group"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-[#a3ff12] transition-colors">
                    Modern High Gain
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">Mesa Rectifier • Tight Noise Gate</div>
                </div>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 group-hover:text-white">
                {playingToneId === "tone-high-gain" ? "Previewing..." : "Audition"}
              </span>
            </div>

            <div
              onClick={() => handlePreviewTone("tone-ambient", "Acoustic Ambient Shimmer")}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-between cursor-pointer transition-all border border-transparent hover:border-white/5 group"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-[#a3ff12] transition-colors">
                    Acoustic Shimmer
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">Piezo Preamp • Cloud Reverb</div>
                </div>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 group-hover:text-white">
                {playingToneId === "tone-ambient" ? "Previewing..." : "Audition"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
