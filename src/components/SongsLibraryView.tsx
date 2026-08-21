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
  Guitar,
  Sliders,
  Layers,
  Sparkles,
  ExternalLink,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Shuffle,
  FileText,
  X,
  Check,
  Share2,
  Plus,
  Compass,
  Flame,
  Radio,
  ChevronRight,
  ArrowRight,
  TrendingUp,
  Heart,
  Clock,
  Tag,
  Edit3,
  ListOrdered
} from "lucide-react";
import {
  MY_SUNO_PLAYLISTS,
  MY_PLAYLIST_CATEGORIES,
  SunoPlaylistMeta,
  SunoTrack,
  SunoPlaylistResponse
} from "../lib/suno-playlists";
import { useSunoPlaylist } from "../hooks/useSunoPlaylist";

// Backward-compatible alias
export type SunoSong = SunoTrack;

interface SongsLibraryViewProps {
  onAnalyzeSong: (song: SunoTrack) => void;
  onOpenInStudio: (song: SunoTrack) => void;
  onUseAsPractice: (song: SunoTrack) => void;
}

export const SongsLibraryView: React.FC<SongsLibraryViewProps> = ({
  onAnalyzeSong,
  onOpenInStudio,
  onUseAsPractice,
}) => {
  // Load configured or user-customized Suno playlists from localStorage
  const [playlists, setPlaylists] = useState<SunoPlaylistMeta[]>(() => {
    try {
      const saved = localStorage.getItem("guitar_studio_my_suno_playlists");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Could not read saved playlists", e);
    }
    return MY_SUNO_PLAYLISTS;
  });

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(() => {
    return playlists[0]?.id || MY_SUNO_PLAYLISTS[0].id;
  });

  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Add / Edit Playlist Modal State
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [editingPlaylist, setEditingPlaylist] = useState<SunoPlaylistMeta | null>(null);
  const [inputTitle, setInputTitle] = useState<string>("");
  const [inputIdOrUrl, setInputIdOrUrl] = useState<string>("");
  const [inputDesc, setInputDesc] = useState<string>("");
  const [inputCat, setInputCat] = useState<string>("Featured");

  // Lyrics / Prompt Modal
  const [selectedLyricsTrack, setSelectedLyricsTrack] = useState<SunoTrack | null>(null);

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

  // Fetch playlist data using the server-side API proxy
  const {
    playlist,
    tracks,
    isLoading,
    isLoadingMore,
    error,
    refresh,
    loadMore,
    hasMore,
  } = useSunoPlaylist(selectedPlaylistId);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  const savePlaylistsToStorage = (updated: SunoPlaylistMeta[]) => {
    setPlaylists(updated);
    try {
      localStorage.setItem("guitar_studio_my_suno_playlists", JSON.stringify(updated));
    } catch (e) {
      console.warn("Storage save failed", e);
    }
  };

  const activeMeta = playlists.find((p) => p.id === selectedPlaylistId) || {
    id: selectedPlaylistId,
    title: playlist?.name || playlist?.title || "My Suno Playlist",
    description: playlist?.description || "Loaded from Suno public API",
    category: "My Playlists",
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
      showToast("Audio playback stream error. Please check your internet connection.");
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
    audio.play().then(() => setIsPlaying(true)).catch((e) => console.warn(e));
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

  // Add / Edit / Remove Playlist ID Modal Form
  const handleOpenAddPlaylist = () => {
    setEditingPlaylist(null);
    setInputTitle("");
    setInputIdOrUrl("");
    setInputDesc("");
    setInputCat("Featured");
    setShowConfigModal(true);
  };

  const handleOpenEditPlaylist = (p: SunoPlaylistMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPlaylist(p);
    setInputTitle(p.title);
    setInputIdOrUrl(p.id);
    setInputDesc(p.description);
    setInputCat(p.category);
    setShowConfigModal(true);
  };

  const handleSavePlaylistModal = (e: React.FormEvent) => {
    e.preventDefault();
    let cleanId = inputIdOrUrl.trim();
    if (!cleanId || !inputTitle.trim()) return;

    // Extract UUID if full URL was pasted
    const match = cleanId.match(/playlist\/([a-f0-9-]+)/i);
    if (match && match[1]) {
      cleanId = match[1];
    }

    if (editingPlaylist) {
      const updated = playlists.map((p) =>
        p.id === editingPlaylist.id
          ? {
              ...p,
              id: cleanId,
              title: inputTitle.trim(),
              description: inputDesc.trim(),
              category: inputCat,
            }
          : p
      );
      savePlaylistsToStorage(updated);
      if (selectedPlaylistId === editingPlaylist.id) {
        setSelectedPlaylistId(cleanId);
      }
      showToast("Updated Suno playlist!");
    } else {
      const newMeta: SunoPlaylistMeta = {
        id: cleanId,
        title: inputTitle.trim(),
        description: inputDesc.trim() || "My Suno Music Collection",
        category: inputCat,
        coverImage: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80",
      };
      const updated = [...playlists, newMeta];
      savePlaylistsToStorage(updated);
      setSelectedPlaylistId(cleanId);
      showToast(`Added Suno Playlist: ${inputTitle}`);
    }

    setShowConfigModal(false);
  };

  const handleDeletePlaylist = (idToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playlists.length <= 1) {
      showToast("Keep at least one active playlist.");
      return;
    }
    const updated = playlists.filter((p) => p.id !== idToDelete);
    savePlaylistsToStorage(updated);
    if (selectedPlaylistId === idToDelete) {
      setSelectedPlaylistId(updated[0].id);
    }
    showToast("Playlist removed from library.");
  };

  const handleResetToDefaults = () => {
    savePlaylistsToStorage(MY_SUNO_PLAYLISTS);
    setSelectedPlaylistId(MY_SUNO_PLAYLISTS[0].id);
    showToast("Reset to default Suno playlists.");
  };

  const handleSharePlaylist = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`https://suno.com/playlist/${selectedPlaylistId}`);
      showToast("Suno Playlist link copied to clipboard!");
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
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-28 animate-in fade-in duration-200">
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
      <div className="frosted-card rounded-3xl p-5 sm:p-6 border border-white/10 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <ListMusic className="w-6 h-6 text-[#a3ff12]" />
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight font-mono">
                MY SUNO <span className="text-[#a3ff12]">MUSIC PLAYLISTS</span>
              </h2>
            </div>
            <p className="text-xs sm:text-sm font-mono text-zinc-400 mt-1">
              Browse and play songs directly from your Suno playlists. Stream high-fidelity audio, analyze chords, or import into DAW.
            </p>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleOpenAddPlaylist}
              className="px-3.5 py-2 rounded-xl bg-[#a3ff12] hover:bg-[#8ee60b] text-black font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-[0_0_12px_rgba(163,255,18,0.25)] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add My Playlist ID</span>
            </button>
            <button
              onClick={refresh}
              disabled={isLoading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh Suno Playlist"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-[#a3ff12]" : ""}`} />
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-hide pt-1 border-t border-white/5">
          <div className="flex items-center gap-1.5">
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

          <button
            onClick={handleResetToDefaults}
            className="text-[11px] font-mono text-zinc-400 hover:text-zinc-300 transition-colors shrink-0 underline ml-auto"
          >
            Reset Playlists
          </button>
        </div>
      </div>

      {/* Suno Playlists Grid Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono text-zinc-400 px-1">
          <span className="flex items-center gap-1.5 uppercase font-bold tracking-wider">
            <Radio className="w-3.5 h-3.5 text-[#a3ff12]" />
            MY CONFIGURED SUNO PLAYLISTS ({filteredPlaylists.length})
          </span>
          <span className="text-[11px] text-zinc-400">Click any card to load tracks</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlaylists.map((pl) => {
            const isSelected = selectedPlaylistId === pl.id;
            return (
              <div
                key={pl.id}
                onClick={() => setSelectedPlaylistId(pl.id)}
                className={`group relative rounded-2xl p-4 border transition-all cursor-pointer flex flex-col justify-between overflow-hidden ${
                  isSelected
                    ? "bg-[#a3ff12]/10 border-[#a3ff12] shadow-[0_0_20px_rgba(163,255,18,0.15)]"
                    : "bg-[#0f1217]/90 border-white/10 hover:border-white/20 hover:bg-[#141820]"
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-black shrink-0 border border-white/10 shadow-md">
                    <img
                      src={pl.coverImage || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80"}
                      alt={pl.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-[#a3ff12]/30 flex items-center justify-center">
                        <Check className="w-5 h-5 text-black bg-[#a3ff12] rounded-full p-0.5" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-white/5 border border-white/10 text-[#a3ff12]">
                        {pl.category}
                      </span>
                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleOpenEditPlaylist(pl, e)}
                          className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
                          title="Edit Playlist Details / ID"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {playlists.length > 1 && (
                          <button
                            onClick={(e) => handleDeletePlaylist(pl.id, e)}
                            className="p-1 rounded hover:bg-red-500/20 text-zinc-400 hover:text-rose-400"
                            title="Remove from list"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <h4 className="text-sm font-bold text-white truncate font-mono" title={pl.title}>
                      {pl.title}
                    </h4>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed font-mono">
                      {pl.description}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span className="truncate max-w-[170px]">ID: {pl.id.slice(0, 14)}...</span>
                  <span className="text-[#a3ff12] flex items-center gap-1 font-bold">
                    {isSelected ? "ACTIVE" : "SELECT"} <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Playlist Active View */}
      <div className="frosted-card rounded-3xl p-5 sm:p-7 border border-white/10 space-y-6">
        {/* Playlist Header & Play All Action */}
        <div className="flex flex-col md:flex-row gap-5 sm:gap-6 items-start border-b border-white/10 pb-6">
          <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-2xl overflow-hidden shrink-0 bg-black shadow-2xl border border-white/10">
            <img
              src={activeMeta.coverImage || playlist?.imageUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80"}
              alt={activeMeta.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono text-[#a3ff12] font-bold">
              SUNO PLAYLIST
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#a3ff12]/15 text-[#a3ff12] border border-[#a3ff12]/30">
                {activeMeta.category}
              </span>
              <span className="text-xs font-mono text-zinc-400">
                Suno API Playlist UUID: <span className="text-white font-mono">{selectedPlaylistId}</span>
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight font-mono">
              {activeMeta.title}
            </h1>

            <p className="text-xs sm:text-sm text-zinc-400 font-mono leading-relaxed max-w-3xl">
              {playlist?.description || activeMeta.description}
            </p>

            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-zinc-400 pt-1">
              <span className="flex items-center gap-1.5">
                <ListMusic className="w-3.5 h-3.5 text-[#a3ff12]" />
                <span className="text-white font-bold">{playlist?.totalTracks || tracks.length}</span> Songs
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>{formatDuration(tracks.reduce((acc, t) => acc + (t.duration || 180), 0))} Total</span>
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              {/* Play All Button */}
              <button
                onClick={handlePlayAll}
                className="px-5 py-2.5 rounded-xl bg-[#a3ff12] hover:bg-[#8ee60b] text-black font-mono font-black text-xs flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(163,255,18,0.3)] cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>PLAY ALL</span>
              </button>

              <button
                onClick={() => setIsShuffling(!isShuffling)}
                className={`px-4 py-2.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  isShuffling
                    ? "bg-purple-500/20 border-purple-500 text-purple-300"
                    : "bg-white/5 border-white/10 hover:bg-white/10 text-zinc-300"
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>{isShuffling ? "SHUFFLE ON" : "SHUFFLE"}</span>
              </button>

              <button
                onClick={handleSharePlaylist}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-zinc-300 hover:text-white flex items-center gap-2 transition-all cursor-pointer"
                title="Copy Suno Playlist URL"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Share</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tracks Search & Summary */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search songs, artists, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#12151a] border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs text-white font-mono focus:outline-none focus:border-[#a3ff12]/50"
            />
          </div>
          <div className="text-xs font-mono text-zinc-400 self-end sm:self-center">
            {filteredTracks.length} song{filteredTracks.length === 1 ? "" : "s"} ready to play
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-mono text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={refresh} className="underline text-red-300 hover:text-white ml-3">
              Retry
            </button>
          </div>
        )}

        {/* Track Listing Table */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="w-8 h-8 text-[#a3ff12] animate-spin" />
            <div className="text-xs font-mono text-zinc-400">Loading your Suno tracks...</div>
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
          <div className="space-y-2 overflow-x-auto">
            <div className="min-w-[640px]">
              {/* Header row */}
              <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[10px] font-mono text-zinc-400 uppercase tracking-wider border-b border-white/5">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-5 sm:col-span-4">SONG & ARTIST</div>
                <div className="col-span-2 hidden sm:block">TAGS</div>
                <div className="col-span-1 text-right">TIME</div>
                <div className="col-span-5 text-right">ACTIONS</div>
              </div>

              {/* Tracks List */}
              <div className="space-y-1.5 mt-2">
                {filteredTracks.map((track, idx) => {
                  const isCurrent = currentTrack?.id === track.id;
                  const isThisPlaying = isCurrent && isPlaying;

                  return (
                    <div
                      key={track.id}
                      onClick={() => handleTrackClick(track)}
                      className={`grid grid-cols-12 gap-3 px-3 py-2.5 rounded-xl items-center transition-all border cursor-pointer ${
                        isCurrent
                          ? "bg-[#a3ff12]/10 border-[#a3ff12]/40 text-white shadow-[0_0_12px_rgba(163,255,18,0.1)]"
                          : "bg-white/5 border-transparent hover:border-white/10 hover:bg-white/10 text-zinc-300"
                      }`}
                    >
                      {/* Play Action / Index */}
                      <div className="col-span-1 flex items-center justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTrackClick(track);
                          }}
                          className="w-7 h-7 rounded-lg bg-black/40 hover:bg-[#a3ff12] hover:text-black text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          {isThisPlaying ? (
                            <Pause className="w-3.5 h-3.5 fill-current" />
                          ) : isCurrent ? (
                            <AudioLines className="w-3.5 h-3.5 text-[#a3ff12] animate-pulse" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          )}
                        </button>
                      </div>

                      {/* Song Artwork & Title */}
                      <div className="col-span-5 sm:col-span-4 flex items-center gap-3 min-w-0">
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-black">
                          <img
                            src={track.imageUrl || track.image_url || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80"}
                            alt={track.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate font-mono" title={track.title}>
                            {track.title}
                          </div>
                          <div className="text-[10px] font-mono text-zinc-400 truncate flex items-center gap-1.5 mt-0.5">
                            <span className="text-[#a3ff12]">{track.artist}</span>
                          </div>
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="col-span-2 hidden sm:flex flex-wrap gap-1 min-w-0 overflow-hidden">
                        {(track.tags || []).slice(0, 2).map((tag, tIdx) => (
                          <span
                            key={tIdx}
                            className="px-1.5 py-0.5 rounded text-[9px] font-mono text-zinc-400 bg-white/5 border border-white/5 truncate max-w-[80px]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      {/* Duration */}
                      <div className="col-span-1 text-right font-mono text-[11px] text-zinc-400">
                        {formatDuration(track.duration)}
                      </div>

                      {/* Studio Action Shortcuts */}
                      <div
                        className="col-span-5 flex items-center justify-end gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Lyrics / Prompt Viewer */}
                        {track.lyrics && (
                          <button
                            onClick={() => setSelectedLyricsTrack(track)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            title="View Lyrics & Suno Prompt"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Analyze Chords Action */}
                        <button
                          onClick={() => onAnalyzeSong(track)}
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-mono text-white transition-colors flex items-center gap-1 cursor-pointer"
                          title="Extract chord progression with AI Chord Finder"
                        >
                          <Search className="w-3 h-3 text-[#a3ff12]" />
                          <span className="hidden md:inline">Chords</span>
                        </button>

                        {/* Open in Studio DAW Action */}
                        <button
                          onClick={() => onOpenInStudio(track)}
                          className="px-2 py-1 rounded-lg bg-[#a3ff12]/15 hover:bg-[#a3ff12]/25 border border-[#a3ff12]/30 text-[11px] font-mono font-bold text-[#a3ff12] transition-colors flex items-center gap-1 cursor-pointer"
                          title="Import into Multi-Track Studio"
                        >
                          <ListMusic className="w-3 h-3" />
                          <span className="hidden md:inline">DAW</span>
                        </button>

                        {/* Practice Mode Action */}
                        <button
                          onClick={() => onUseAsPractice(track)}
                          className="px-2 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-[11px] font-mono font-bold text-sky-400 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Practice along with backing track"
                        >
                          <Guitar className="w-3 h-3" />
                          <span className="hidden md:inline">Practice</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
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
      </div>

      {/* Persistent Global Player Bar */}
      {currentTrack && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0c0f14]/95 backdrop-blur-xl border-t border-white/10 px-4 sm:px-8 py-3 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom duration-300">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Current Song Details */}
            <div className="flex items-center gap-3 w-full sm:w-1/4 min-w-0">
              <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-black border border-white/10 shadow-md">
                <img
                  src={currentTrack.imageUrl || currentTrack.image_url || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80"}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate font-mono">{currentTrack.title}</div>
                <div className="text-[10px] font-mono text-[#a3ff12] truncate">{currentTrack.artist}</div>
              </div>
            </div>

            {/* Playback Controls & Progress Scrubber */}
            <div className="flex flex-col items-center gap-1.5 w-full sm:w-2/4">
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePrevTrack}
                  className="p-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Previous Song"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleTrackClick(currentTrack)}
                  className="w-9 h-9 rounded-full bg-[#a3ff12] hover:bg-[#8ee60b] text-black flex items-center justify-center transition-all shadow-[0_0_12px_rgba(163,255,18,0.4)] cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </button>
                <button
                  onClick={handleNextTrack}
                  className="p-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Next Song"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Scrubber Bar */}
              <div className="w-full flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                <span className="w-8 text-right">{formatDuration(currentTime)}</span>
                <input
                  type="range"
                  min="0"
                  max={duration || currentTrack.duration || 180}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 accent-[#a3ff12] h-1.5 rounded-lg bg-zinc-800 cursor-pointer"
                />
                <span className="w-8">{formatDuration(duration || currentTrack.duration || 180)}</span>
              </div>
            </div>

            {/* Volume & Quick Routing */}
            <div className="flex items-center justify-end gap-3 w-full sm:w-1/4">
              <div className="hidden md:flex items-center gap-1.5">
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
                  className="w-16 accent-[#a3ff12] h-1 rounded-lg bg-zinc-800 cursor-pointer"
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

      {/* Suno Playlist Configuration / ID Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="frosted-card rounded-3xl max-w-md w-full p-6 border border-white/10 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#a3ff12]" />
                <span className="font-mono font-bold text-sm text-white">
                  {editingPlaylist ? "EDIT SUNO PLAYLIST" : "ADD MY SUNO PLAYLIST"}
                </span>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePlaylistModal} className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Playlist Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. My Top Suno Tracks, Worship & Praise..."
                  value={inputTitle}
                  onChange={(e) => setInputTitle(e.target.value)}
                  className="w-full bg-[#12151a] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#a3ff12]"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Suno Playlist URL or UUID *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. suno.com/playlist/7b5e949e-1d72... or raw UUID"
                  value={inputIdOrUrl}
                  onChange={(e) => setInputIdOrUrl(e.target.value)}
                  className="w-full bg-[#12151a] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#a3ff12]"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Category</label>
                <select
                  value={inputCat}
                  onChange={(e) => setInputCat(e.target.value)}
                  className="w-full bg-[#12151a] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#a3ff12]"
                >
                  <option value="Featured">Featured</option>
                  <option value="Worship">Worship</option>
                  <option value="Chill">Chill</option>
                  <option value="Rock">Rock</option>
                  <option value="Acoustic">Acoustic</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Optional notes or description about this playlist"
                  value={inputDesc}
                  onChange={(e) => setInputDesc(e.target.value)}
                  className="w-full bg-[#12151a] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#a3ff12]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#a3ff12] text-black font-bold hover:bg-[#8ee60b] shadow-[0_0_12px_rgba(163,255,18,0.3)]"
                >
                  {editingPlaylist ? "Save Changes" : "Add Playlist"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lyrics Modal */}
      {selectedLyricsTrack && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="frosted-card rounded-3xl max-w-xl w-full p-6 border border-white/10 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#a3ff12]" />
                <span className="font-mono font-bold text-sm text-white">SUNO PROMPT & LYRICS</span>
              </div>
              <button
                onClick={() => setSelectedLyricsTrack(null)}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <img
                src={selectedLyricsTrack.imageUrl || selectedLyricsTrack.image_url || ""}
                alt={selectedLyricsTrack.title}
                className="w-12 h-12 rounded-xl object-cover"
              />
              <div>
                <div className="text-sm font-bold text-white font-mono">{selectedLyricsTrack.title}</div>
                <div className="text-xs font-mono text-[#a3ff12]">{selectedLyricsTrack.artist}</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-black/40 border border-white/5 rounded-2xl p-4 font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {selectedLyricsTrack.lyrics || "No lyrics or prompt available for this instrumental track."}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <div className="flex flex-wrap gap-1">
                {(selectedLyricsTrack.tags || []).map((t, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-white/5 border border-white/10">
                    {t}
                  </span>
                ))}
              </div>
              <button
                onClick={() => {
                  onAnalyzeSong(selectedLyricsTrack);
                  setSelectedLyricsTrack(null);
                }}
                className="px-4 py-2 rounded-xl bg-[#a3ff12] text-black font-mono font-bold text-xs hover:bg-[#8ee60b] transition-all cursor-pointer"
              >
                Analyze Chords
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
