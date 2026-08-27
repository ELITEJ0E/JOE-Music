import React, { useState, useEffect, useRef } from "react";
import {
  Music,
  Search,
  Play,
  Pause,
  ListMusic,
  AudioLines,
  RefreshCw,
  Loader2,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Shuffle,
  Check,
  Radio,
  ChevronRight,
  ArrowRight,
  Clock,
  Share2,
  Lock,
  Unlock
} from "lucide-react";
import {
  MY_SUNO_PLAYLISTS,
  SunoTrack,
} from "../lib/suno-playlists";
import { useSunoPlaylist } from "../hooks/useSunoPlaylist";
import { recordRecentSongPlay } from "../utils/recentSongs";

// Backward-compatible alias
export type SunoSong = SunoTrack;

interface SongsLibraryViewProps {
  onAnalyzeSong: (song: SunoTrack) => void;
  onOpenInStudio: (song: SunoTrack) => void;
  onUseAsPractice?: (song: SunoTrack) => void;
}

export const SongsLibraryView: React.FC<SongsLibraryViewProps> = ({
  onAnalyzeSong,
  onOpenInStudio,
}) => {
  // Fixed playlists by Joel - cannot be deleted or modified
  const playlists = MY_SUNO_PLAYLISTS;

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(() => {
    return MY_SUNO_PLAYLISTS[0].id;
  });

  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Password Lock States
  const [isUpcomingUnlocked, setIsUpcomingUnlocked] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("joelify_upcoming_unlocked") === "true";
    }
    return false;
  });
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingPlaylistId, setPendingPlaylistId] = useState<string | null>(null);

  const handleUnlock = (pwd: string) => {
    if (pwd.trim().toLowerCase() === "joelify") {
      setIsUpcomingUnlocked(true);
      if (typeof window !== "undefined") {
        localStorage.setItem("joelify_upcoming_unlocked", "true");
      }
      setPasswordError("");
      setPasswordInput("");
      setShowPasswordModal(false);
      if (pendingPlaylistId) {
        setSelectedPlaylistId(pendingPlaylistId);
        setPendingPlaylistId(null);
      }
      showToast("Unlocked Upcoming Releases!");
    } else {
      setPasswordError("Incorrect password.");
    }
  };

  // Global Player & Queue Engine State
  const [queue, setQueue] = useState<SunoTrack[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
  const [currentTrack, setCurrentTrack] = useState<SunoTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isShuffling, setIsShuffling] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch playlist data using the server-side API proxy with background resync
  const {
    playlist,
    tracks,
    isLoading,
    isSyncing,
    isLoadingMore,
    error,
    lastSynced,
    refresh,
    loadMore,
    hasMore,
  } = useSunoPlaylist(selectedPlaylistId);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  const activeMeta = playlists.find((p) => p.id === selectedPlaylistId) || {
    id: selectedPlaylistId,
    title: playlist?.name || playlist?.title || "Joel's Originals",
    description: playlist?.description || "Original music collection",
    category: "Originals",
    coverImage: playlist?.imageUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80",
  };

  // Audio element event setup
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration || currentTrack?.duration || 0);
    const handleEnded = () => {
      handleNextTrack();
    };
    const handleError = () => {
      setIsPlaying(false);
      showToast("Audio playback stream error. Please check your connection.");
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
  }, [currentTrack, queue, isShuffling, currentTrackIndex]);

  // Audio Playback Actions
  const playTrackInQueue = (track: SunoTrack, newQueue?: SunoTrack[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    const targetQueue = newQueue || (queue.length > 0 ? queue : tracks);
    setQueue(targetQueue);

    const index = targetQueue.findIndex((t) => t.id === track.id);
    setCurrentTrackIndex(index >= 0 ? index : 0);
    setCurrentTrack(track);

    audio.src = track.audioUrl || track.audio_url || "";
    audio.currentTime = 0;
    audio.volume = isMuted ? 0 : volume;
    audio.play().then(() => {
      setIsPlaying(true);
      recordRecentSongPlay(track);
    }).catch((e) => console.warn(e));
  };

  // "Play All" Handler: Loads the full playlist into the player queue and starts playing track 1
  const handlePlayAll = () => {
    const listToPlay = filteredTracks.length > 0 ? filteredTracks : tracks;
    if (listToPlay.length > 0) {
      setQueue(listToPlay);
      playTrackInQueue(listToPlay[0], listToPlay);
      showToast(`Playing all ${listToPlay.length} songs from "${activeMeta.title}"`);
    } else {
      showToast("No tracks available to play.");
    }
  };

  // Click any track: immediately plays that song and sets the current playlist as upcoming queue
  const handleTrackClick = (track: SunoTrack) => {
    const audio = audioRef.current;
    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        audio?.pause();
        setIsPlaying(false);
      } else {
        audio?.play().then(() => setIsPlaying(true)).catch((e) => console.warn(e));
      }
      return;
    }

    const currentList = filteredTracks.length > 0 ? filteredTracks : tracks;
    playTrackInQueue(track, currentList);
  };

  const handleNextTrack = () => {
    const activeQueue = queue.length > 0 ? queue : tracks;
    if (!activeQueue.length) return;

    let nextIndex = 0;
    if (isShuffling) {
      nextIndex = Math.floor(Math.random() * activeQueue.length);
    } else if (currentTrackIndex >= 0 && currentTrackIndex < activeQueue.length - 1) {
      nextIndex = currentTrackIndex + 1;
    }

    playTrackInQueue(activeQueue[nextIndex], activeQueue);
  };

  const handlePrevTrack = () => {
    const activeQueue = queue.length > 0 ? queue : tracks;
    if (!activeQueue.length) return;

    let prevIndex = activeQueue.length - 1;
    if (currentTrackIndex > 0) {
      prevIndex = currentTrackIndex - 1;
    }

    playTrackInQueue(activeQueue[prevIndex], activeQueue);
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
        const audio = audioRef.current;
        if (currentTrack) {
          if (isPlaying) {
            audio?.pause();
            setIsPlaying(false);
          } else {
            audio?.play().then(() => setIsPlaying(true)).catch((err) => console.warn(err));
          }
        } else if (tracks && tracks.length > 0) {
          playTrackInQueue(tracks[0]);
        }
      } else if (e.key === "F7") {
        e.preventDefault();
        handlePrevTrack();
      } else if (e.key === "F9") {
        e.preventDefault();
        handleNextTrack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentTrack, isPlaying, tracks, queue, currentTrackIndex, isShuffling]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : newVol;
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.volume = nextMuted ? 0 : volume;
    }
  };

  const handleShareSong = () => {
    if (currentTrack) {
      showToast(`Now playing: ${currentTrack.title} by ${currentTrack.artist}`);
    } else {
      showToast(`Playlist: ${activeMeta.title}`);
    }
  };

  // Filter playlists by category
  const filteredPlaylists = playlists.filter((p) => {
    if (selectedCategory === "All") return true;
    return p.category === selectedCategory;
  });

  // Filter tracks by search query
  const filteredTracks = tracks.filter((t) => {
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.tags?.some((tag) => tag.toLowerCase().includes(q))
    );
  });

  const formatDuration = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-32 px-1 sm:px-2 md:px-4 animate-in fade-in duration-200 overflow-hidden">
      {/* Hidden Native Audio Player Engine */}
      <audio ref={audioRef} preload="metadata" />

      {/* Floating Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-[#a3ff12] text-black font-mono font-bold text-xs shadow-2xl flex items-center gap-2 animate-in slide-in-from-top duration-200">
          <Check className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner & Header */}
      <div className="frosted-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-white/10 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <ListMusic className="w-6 h-6 text-[#a3ff12] shrink-0" />
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight font-mono">
                JOEL'S <span className="text-[#a3ff12]">SONGS</span>
              </h2>
            </div>
            <p className="text-xs sm:text-sm font-mono text-zinc-400 mt-1">
              Listen to original tracks, worship melodies, and upcoming releases. Stream high-fidelity audio or extract chords.
            </p>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2.5 self-start md:self-auto">
            {isSyncing && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#a3ff12]/10 border border-[#a3ff12]/30 text-[11px] font-mono text-[#a3ff12] animate-in fade-in duration-200">
                <span className="w-2 h-2 rounded-full bg-[#a3ff12] animate-ping" />
                <span>Syncing latest songs...</span>
              </div>
            )}
            <button
              onClick={refresh}
              disabled={isLoading || isSyncing}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white font-mono text-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              title="Force Sync / Refresh Songs"
            >
              <RefreshCw className={`w-4 h-4 ${(isLoading || isSyncing) ? "animate-spin text-[#a3ff12]" : ""}`} />
              <span>{isSyncing ? "Syncing..." : "Sync"}</span>
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide pt-1 border-t border-white/5">
          {["All", ...Array.from(new Set(playlists.map((p) => p.category)))].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all shrink-0 cursor-pointer border ${
                selectedCategory === cat
                  ? "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_10px_rgba(163,255,18,0.3)]"
                  : "bg-white/5 text-zinc-400 border-white/5 hover:text-white hover:border-white/10"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Joel's Playlists Grid Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono text-zinc-400 px-1">
          <span className="flex items-center gap-1.5 uppercase font-bold tracking-wider">
            <Radio className="w-3.5 h-3.5 text-[#a3ff12]" />
            MY PLAYLISTS ({filteredPlaylists.length})
          </span>
          <span className="text-[11px] text-zinc-400 hidden sm:inline">Click any card to load tracks</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filteredPlaylists.map((pl) => {
            const isSelected = selectedPlaylistId === pl.id;
            const isLocked = pl.category === "Upcoming" && !isUpcomingUnlocked;
            return (
              <div
                key={pl.id}
                onClick={() => {
                  if (isLocked) {
                    setPendingPlaylistId(pl.id);
                    setShowPasswordModal(true);
                  } else {
                    setSelectedPlaylistId(pl.id);
                  }
                }}
                className={`group relative rounded-2xl p-3.5 sm:p-4 border transition-all cursor-pointer flex flex-col justify-between overflow-hidden ${
                  isSelected
                    ? "bg-[#a3ff12]/10 border-[#a3ff12] shadow-[0_0_20px_rgba(163,255,18,0.15)]"
                    : "bg-[#0f1217]/90 border-white/10 hover:border-white/20 hover:bg-[#141820]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-black shrink-0 border border-white/10 shadow-md">
                    <img
                      src={pl.coverImage || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80"}
                      alt={pl.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {isLocked ? (
                      <div className="absolute inset-0 bg-black/70 flex items-center justify-center backdrop-blur-xs">
                        <Lock className="w-5 h-5 text-amber-400" />
                      </div>
                    ) : isSelected ? (
                      <div className="absolute inset-0 bg-[#a3ff12]/30 flex items-center justify-center">
                        <Check className="w-5 h-5 text-black bg-[#a3ff12] rounded-full p-0.5" />
                      </div>
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-white/5 border border-white/10 text-[#a3ff12]">
                        {pl.category}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white truncate font-mono flex items-center gap-1.5" title={pl.title}>
                      {pl.title}
                      {isLocked && <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    </h4>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed font-mono">
                      {pl.description}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span className="text-zinc-500">Curated by Joel</span>
                  <span className="text-[#a3ff12] flex items-center gap-1 font-bold">
                    {isLocked ? (
                      <span className="text-amber-400 flex items-center gap-1">LOCKED <Lock className="w-3 h-3" /></span>
                    ) : isSelected ? (
                      "ACTIVE"
                    ) : (
                      "SELECT"
                    )} <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Playlist Active View */}
      <div className="frosted-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-7 border border-white/10 space-y-6">
        {selectedPlaylistId === "34ac065b-e68e-4dfa-9780-00c49bae047a" && !isUpcomingUnlocked ? (
          <div className="flex flex-col items-center justify-center py-12 md:py-16 text-center max-w-md mx-auto space-y-6">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 animate-pulse">
              <Lock className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg sm:text-xl font-bold font-mono text-white">Upcoming Releases Locked</h3>
              <p className="text-xs sm:text-sm font-mono text-zinc-400 leading-relaxed">
                This playlist contains Joel's unreleased work-in-progress compositions, synth-pop demos, and new guitar tracks. Enter the password to unlock.
              </p>
            </div>

            <div className="w-full space-y-3">
              <input
                type="password"
                placeholder="Enter password..."
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setPasswordError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUnlock(passwordInput);
                }}
                className="w-full bg-[#12151a] border border-white/10 rounded-xl py-2.5 px-4 text-sm text-center text-white font-mono focus:outline-none focus:border-amber-400/50"
              />
              {passwordError && (
                <div className="text-[11px] font-mono text-rose-500">{passwordError}</div>
              )}
              <button
                onClick={() => handleUnlock(passwordInput)}
                className="w-full py-2.5 rounded-xl bg-[#a3ff12] hover:bg-[#8ee60b] text-black font-mono font-black text-xs transition-all shadow-[0_0_15px_rgba(163,255,18,0.2)] cursor-pointer"
              >
                UNLOCK PLAYLIST
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Playlist Header & Play All Action */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start border-b border-white/10 pb-5 sm:pb-6">
          <div className="relative w-24 h-24 sm:w-36 sm:h-36 rounded-2xl overflow-hidden shrink-0 bg-black shadow-2xl border border-white/10">
            <img
              src={activeMeta.coverImage || playlist?.imageUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80"}
              alt={activeMeta.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded bg-black/70 backdrop-blur-md border border-white/10 text-[9px] sm:text-[10px] font-mono text-[#a3ff12] font-bold">
              ORIGINAL
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#a3ff12]/15 text-[#a3ff12] border border-[#a3ff12]/30">
                {activeMeta.category}
              </span>
              <span className="text-xs font-mono text-zinc-400">
                Artist: <span className="text-white font-bold">ELITEJOE</span>
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight font-mono">
              {activeMeta.title}
            </h1>

            <p className="text-xs sm:text-sm text-zinc-400 font-mono leading-relaxed max-w-3xl">
              {playlist?.description || activeMeta.description}
            </p>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-mono text-zinc-400 pt-0.5">
              <span className="flex items-center gap-1.5">
                <ListMusic className="w-3.5 h-3.5 text-[#a3ff12]" />
                <span className="text-white font-bold">{playlist?.totalTracks || tracks.length}</span> Songs
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>{formatDuration(tracks.reduce((acc, t) => acc + (t.duration || 180), 0))} Total</span>
              </span>
              <span>•</span>
              {isSyncing ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#a3ff12] bg-[#a3ff12]/10 px-2.5 py-0.5 rounded-full border border-[#a3ff12]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a3ff12] animate-ping" />
                  Updating in background...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10">
                  <Check className="w-3 h-3 text-[#a3ff12]" />
                  Cached & Synced
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {/* Play All Button */}
              <button
                onClick={handlePlayAll}
                className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-[#a3ff12] hover:bg-[#8ee60b] text-black font-mono font-black text-xs flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(163,255,18,0.3)] cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>PLAY ALL</span>
              </button>

              <button
                onClick={() => setIsShuffling(!isShuffling)}
                className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  isShuffling
                    ? "bg-purple-500/20 border-purple-500 text-purple-300"
                    : "bg-white/5 border-white/10 hover:bg-white/10 text-zinc-300"
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>{isShuffling ? "SHUFFLE ON" : "SHUFFLE"}</span>
              </button>

              <button
                onClick={handleShareSong}
                className="px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-zinc-300 hover:text-white flex items-center gap-2 transition-all cursor-pointer"
                title="Share Info"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Share</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tracks Search & Summary */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search songs or genres..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#12151a] border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs text-white font-mono focus:outline-none focus:border-[#a3ff12]/50"
            />
          </div>
          <div className="text-xs font-mono text-zinc-400 text-right">
            {filteredTracks.length} song{filteredTracks.length === 1 ? "" : "s"} ready
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-mono text-xs flex items-center justify-between">
            <span>Failed to load songs. Please check your connection.</span>
            <button onClick={refresh} className="underline text-red-300 hover:text-white ml-3">
              Retry
            </button>
          </div>
        )}

        {/* Track Listing */}
        {(isLoading && tracks.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="w-8 h-8 text-[#a3ff12] animate-spin" />
            <div className="text-xs font-mono text-zinc-400">Loading songs...</div>
          </div>
        ) : filteredTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3 border border-white/5 rounded-2xl bg-white/5 text-center p-4">
            <Music className="w-10 h-10 text-zinc-600" />
            <div className="text-xs font-mono text-zinc-400">No songs found in this playlist matching search.</div>
            <button
              onClick={() => setSearchQuery("")}
              className="px-3 py-1 rounded-lg bg-white/10 text-white text-xs font-mono cursor-pointer"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Header row - desktop only */}
            <div className="hidden sm:flex items-center justify-between px-3 py-2 text-[10px] font-mono text-zinc-400 uppercase tracking-wider border-b border-white/5">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="w-8 text-center">#</span>
                <span>SONG & ARTIST</span>
              </div>
              <div className="flex items-center gap-6 shrink-0 pr-1">
                <span className="w-12 text-right">TIME</span>
                <span className="w-36 text-right">ACTIONS</span>
              </div>
            </div>

            {/* Tracks List */}
            <div className="space-y-1.5">
              {filteredTracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const isThisPlaying = isCurrent && isPlaying;

                return (
                  <div
                    key={track.id}
                    onClick={() => handleTrackClick(track)}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:px-3 sm:py-2.5 rounded-xl gap-2 sm:gap-3 transition-all border cursor-pointer ${
                      isCurrent
                        ? "bg-[#a3ff12]/10 border-[#a3ff12]/40 text-white shadow-[0_0_12px_rgba(163,255,18,0.1)]"
                        : "bg-white/5 border-transparent hover:border-white/10 hover:bg-white/10 text-zinc-300"
                    }`}
                  >
                    {/* Left: Play button + Artwork + Title */}
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      {/* Play Action / Index */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTrackClick(track);
                        }}
                        className="w-8 h-8 rounded-lg bg-black/40 hover:bg-[#a3ff12] hover:text-black text-zinc-300 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                        title={isThisPlaying ? "Pause" : "Play"}
                      >
                        {isThisPlaying ? (
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : isCurrent ? (
                          <AudioLines className="w-3.5 h-3.5 text-[#a3ff12] animate-pulse" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        )}
                      </button>

                      {/* Song Artwork */}
                      <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-lg overflow-hidden shrink-0 bg-black">
                        <img
                          src={track.imageUrl || track.image_url || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80"}
                          alt={track.title}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Song Title & Artist */}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white truncate font-mono" title={track.title}>
                          {track.title}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400 truncate flex items-center gap-1.5 mt-0.5">
                          <span className="text-[#a3ff12]">{track.artist}</span>
                          <span className="sm:hidden text-zinc-500">• {formatDuration(track.duration)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Duration + Actions */}
                    <div
                      className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pt-1 sm:pt-0 border-t border-white/5 sm:border-t-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="hidden sm:block font-mono text-[11px] text-zinc-400 w-12 text-right">
                        {formatDuration(track.duration)}
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        {/* Extract Chords Action */}
                        <button
                          onClick={() => onAnalyzeSong(track)}
                          className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Extract chord progression with Chord Finder"
                        >
                          <Search className="w-3.5 h-3.5 text-[#a3ff12]" />
                          <span>Extract Chords</span>
                        </button>

                        {/* Open in Studio DAW Action */}
                        <button
                          onClick={() => onOpenInStudio(track)}
                          className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-[#a3ff12]/15 hover:bg-[#a3ff12]/25 border border-[#a3ff12]/30 text-xs font-mono font-bold text-[#a3ff12] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Import into Multi-Track Studio"
                        >
                          <ListMusic className="w-3.5 h-3.5" />
                          <span>DAW</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Load More Pagination */}
        {hasMore && !isLoading && (
          <div className="flex justify-center pt-4">
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#a3ff12]" />
                  <span>Loading more songs...</span>
                </>
              ) : (
                <>
                  <span>Load More Songs</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#a3ff12]" />
                </>
              )}
            </button>
          </div>
        )}
          </>
        )}
      </div>

      {/* Persistent Global Player Bar */}
      {currentTrack && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0c0f14]/95 backdrop-blur-xl border-t border-white/10 px-3 sm:px-8 py-2.5 sm:py-3 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom duration-300">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3">
            {/* Current Song Details */}
            <div className="flex items-center gap-2.5 w-full sm:w-1/4 min-w-0">
              <div className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-lg overflow-hidden shrink-0 bg-black border border-white/10 shadow-md">
                <img
                  src={currentTrack.imageUrl || currentTrack.image_url || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80"}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate font-mono">{currentTrack.title}</div>
                <div className="text-[10px] font-mono text-[#a3ff12] truncate">{currentTrack.artist}</div>
              </div>
            </div>

            {/* Playback Controls & Progress Scrubber */}
            <div className="flex flex-col items-center gap-1 w-full sm:w-2/4">
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePrevTrack}
                  className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Previous Song"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleTrackClick(currentTrack)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#a3ff12] hover:bg-[#8ee60b] text-black flex items-center justify-center transition-all shadow-[0_0_12px_rgba(163,255,18,0.4)] cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                </button>
                <button
                  onClick={handleNextTrack}
                  className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Next Song"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Scrubber Bar */}
              <div className="w-full flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                <span className="w-7 sm:w-8 text-right text-[9px] sm:text-[10px]">{formatDuration(currentTime)}</span>
                <input
                  type="range"
                  min="0"
                  max={duration || currentTrack.duration || 180}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 accent-[#a3ff12] h-1 sm:h-1.5 rounded-lg bg-zinc-800 cursor-pointer"
                />
                <span className="w-7 sm:w-8 text-[9px] sm:text-[10px]">{formatDuration(duration || currentTrack.duration || 180)}</span>
              </div>
            </div>

            {/* Volume & Quick Routing */}
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 w-full sm:w-1/4">
              <div className="flex items-center gap-1.5">
                <button onClick={toggleMute} className="text-zinc-400 hover:text-white p-1">
                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-14 sm:w-16 accent-[#a3ff12] h-1 rounded-lg bg-zinc-800 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onAnalyzeSong(currentTrack)}
                  className="px-2.5 py-1 rounded-lg bg-[#a3ff12]/15 text-[#a3ff12] hover:bg-[#a3ff12]/25 border border-[#a3ff12]/30 text-[10px] font-mono font-bold transition-colors cursor-pointer"
                >
                  Chords
                </button>
                <button
                  onClick={() => onOpenInStudio(currentTrack)}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-mono font-bold transition-colors cursor-pointer"
                >
                  DAW
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Password Modal Overlay */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md frosted-card border border-white/10 rounded-2xl p-6 md:p-8 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200 bg-[#0b0e12]">
            
            {/* Close Button */}
            <button
              onClick={() => {
                setShowPasswordModal(false);
                setPendingPlaylistId(null);
                setPasswordError("");
                setPasswordInput("");
              }}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white text-sm font-mono w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 cursor-pointer"
              title="Close"
            >
              ✕
            </button>

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold font-mono text-white uppercase tracking-wider">🔒 Password Required</h3>
                <p className="text-xs font-mono text-zinc-400 leading-relaxed">
                  "Upcoming Releases" is restricted. Enter the exclusive password to view tracks.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <input
                  type="password"
                  placeholder="Enter 'joelify'..."
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setPasswordError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUnlock(passwordInput);
                  }}
                  className="w-full bg-[#12151a] border border-white/10 rounded-xl py-2.5 px-4 text-sm text-center text-white font-mono focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20"
                  autoFocus
                />
                {passwordError && (
                  <p className="text-[11px] font-mono text-rose-500 text-center">{passwordError}</p>
                )}
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPendingPlaylistId(null);
                    setPasswordError("");
                    setPasswordInput("");
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-zinc-300 font-bold cursor-pointer transition-colors"
                >
                  CANCEL
                </button>
                <button
                  onClick={() => handleUnlock(passwordInput)}
                  className="flex-1 py-2.5 rounded-xl bg-[#a3ff12] hover:bg-[#8ee60b] text-black font-mono font-black text-xs transition-all shadow-[0_0_15px_rgba(163,255,18,0.2)] cursor-pointer"
                >
                  UNLOCK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
