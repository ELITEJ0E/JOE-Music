import React, { useState, useEffect } from "react";
import { Music, Search, Play, Pause, ListMusic, AudioLines, MoreVertical, RefreshCw, Loader2, ArrowRight, Guitar } from "lucide-react";

export interface SunoSong {
  id: string;
  title: string;
  artist: string;
  duration: number;
  created_at: string;
  image_url: string;
  audio_url: string;
  tags: string[];
}

interface SongsLibraryViewProps {
  onAnalyzeSong: (song: SunoSong) => void;
  onOpenInStudio: (song: SunoSong) => void;
  onUseAsPractice: (song: SunoSong) => void;
}

export const SongsLibraryView: React.FC<SongsLibraryViewProps> = ({
  onAnalyzeSong,
  onOpenInStudio,
  onUseAsPractice
}) => {
  const [songs, setSongs] = useState<SunoSong[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  
  // A simple audio element ref for preview playback
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const fetchSongs = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/suno/feed");
      if (!res.ok) throw new Error("Failed to load library");
      const data = await res.json();
      setSongs(data);
    } catch (err: any) {
      setError(err.message || "Could not connect to Suno API");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSongs();
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  const handleTogglePlay = (song: SunoSong) => {
    if (playingId === song.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(song.audio_url);
      audio.crossOrigin = "anonymous";
      audio.play().catch(e => console.error("Playback error", e));
      
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(song.id);
    }
  };

  const filteredSongs = songs.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ListMusic className="w-6 h-6 text-[#a3ff12]" />
            SONG <span className="text-[#a3ff12]">LIBRARY</span>
          </h2>
          <p className="text-sm font-mono text-zinc-400 mt-1">
            Browse Suno API generated tracks and import them into your workstation.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#12151a] border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-white font-mono focus:outline-none focus:border-[#a3ff12]/50"
            />
          </div>
          <button
            onClick={fetchSongs}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-mono text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="w-8 h-8 text-[#a3ff12] animate-spin" />
          <div className="text-sm font-mono text-zinc-400">Syncing with Suno API...</div>
        </div>
      ) : filteredSongs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4 border border-white/5 rounded-3xl bg-white/5">
          <Music className="w-12 h-12 text-zinc-600" />
          <div className="text-sm font-mono text-zinc-400">No songs found.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSongs.map((song) => (
            <div key={song.id} className="frosted-card rounded-2xl p-4 border border-white/10 space-y-4 group hover:border-white/20 transition-all flex flex-col">
              <div className="flex gap-4">
                <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-black shadow-lg">
                  <img src={song.image_url} alt={song.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  <button
                    onClick={() => handleTogglePlay(song)}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/20 transition-colors"
                  >
                    {playingId === song.id ? (
                      <Pause className="w-8 h-8 text-[#a3ff12] drop-shadow-md" />
                    ) : (
                      <Play className="w-8 h-8 text-white drop-shadow-md ml-1" />
                    )}
                  </button>
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white truncate" title={song.title}>{song.title}</h3>
                  <div className="text-[10px] font-mono text-[#a3ff12] mt-0.5 truncate">{song.artist}</div>
                  <div className="flex items-center gap-2 mt-2 text-[10px] font-mono text-zinc-500">
                    <span>{formatDuration(song.duration)}</span>
                    <span>•</span>
                    <span>{new Date(song.created_at).toLocaleDateString()}</span>
                  </div>
                  {playingId === song.id && (
                    <div className="mt-2 flex items-center gap-1">
                      <AudioLines className="w-3 h-3 text-[#a3ff12] animate-pulse" />
                      <span className="text-[9px] font-mono text-[#a3ff12]">PREVIEWING</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/5">
                {song.tags.slice(0, 3).map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 rounded text-[9px] font-mono text-zinc-400 bg-white/5 border border-white/10">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-auto grid grid-cols-1 gap-2 pt-3">
                <button
                  onClick={() => onAnalyzeSong(song)}
                  className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white transition-colors flex items-center justify-center gap-2"
                >
                  <Search className="w-3.5 h-3.5" />
                  Analyze Chords
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onOpenInStudio(song)}
                    className="py-2 rounded-xl bg-[#a3ff12]/10 hover:bg-[#a3ff12]/20 border border-[#a3ff12]/30 text-xs font-mono text-[#a3ff12] font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <ListMusic className="w-3.5 h-3.5" />
                    Studio
                  </button>
                  <button
                    onClick={() => onUseAsPractice(song)}
                    className="py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-xs font-mono text-sky-400 font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Guitar className="w-3.5 h-3.5" />
                    Practice
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
