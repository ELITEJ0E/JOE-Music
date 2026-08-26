import React, { useState, useEffect } from "react";
import {
  Search,
  Plus,
  Heart,
  MoreVertical,
  AudioWaveform,
  Repeat,
  Music,
  Check,
  Ban,
} from "lucide-react";
import { TonePreset } from "../types";
import { DEFAULT_TONE_PRESETS } from "../data/presetsDatabase";
import { pedalboardDsp } from "../audio/pedalboardDsp";
import { loadPresetsFromDB } from "../utils/storage";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface PresetsLibraryViewProps {
  onSelectTonePreset?: (preset: TonePreset) => void;
  onOpenToneStudio?: () => void;
}

export const PresetsLibraryView: React.FC<PresetsLibraryViewProps> = ({
  onSelectTonePreset,
  onOpenToneStudio,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All Presets");
  const [selectedGenre, setSelectedGenre] = useState<string>("All Genres");
  const [loadedPresetId, setLoadedPresetId] = useState<string>("ethereal-echoes");
  const [favorites, setFavorites] = useState<string[]>(["ethereal-echoes", "texas-crunch"]);
  const [allPresets, setAllPresets] = useState<TonePreset[]>(DEFAULT_TONE_PRESETS);

  useEffect(() => {
    loadPresetsFromDB().then((presets) => {
      if (presets && presets.length > 0) {
        setAllPresets(presets);
      }
    });
  }, []);

  const presetList = React.useMemo(() => {
    return allPresets.map((p) => {
      let genre = "ROCK";
      const cat = (p.category || "").toLowerCase();
      if (cat.includes("ambient")) genre = "AMBIENT";
      else if (cat.includes("metal") || cat.includes("high gain")) genre = "METAL";
      else if (cat.includes("blues") || cat.includes("crunch")) genre = "BLUES";
      else if (cat.includes("clean") || cat.includes("glass")) genre = "CLEAN";
      else if (cat.includes("funk")) genre = "FUNK";

      return {
        id: p.id,
        name: p.name,
        genre,
        description: p.description || `${p.name} signal chain with active DSP effects.`,
        toneName: p.name,
        toneActive: true,
        looperStatus: (p as any).looperPreset ? "1 Track Ready" : null,
        trackStatus: null,
        presetData: p,
      };
    });
  }, [allPresets]);

  const handleLoadRig = (presetItem: (typeof presetList)[0]) => {
    setLoadedPresetId(presetItem.id);
    pedalboardDsp.applyPedalConfig(presetItem.presetData.pedals);
    if (onSelectTonePreset) {
      onSelectTonePreset(presetItem.presetData);
    }
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const filteredPresets = presetList.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.genre.toLowerCase().includes(searchQuery.toLowerCase());

    if (activeCategory === "Favorites") {
      return matchesSearch && favorites.includes(item.id);
    }
    if (selectedGenre !== "All Genres") {
      return matchesSearch && item.genre === selectedGenre.toUpperCase();
    }
    return matchesSearch;
  });

  return (
    <div id="presets-library-page" className="max-w-6xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Preset Library</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage your rig configurations, tones, and backing tracks.
          </p>
        </div>

        <button
          onClick={() => {
            if (onOpenToneStudio) onOpenToneStudio();
          }}
          className="px-5 py-2.5 bg-[#a3ff12] hover:bg-[#92eb10] text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(163,255,18,0.3)] transition-all cursor-pointer w-fit"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Create New Preset</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 frosted-card p-3 rounded-3xl">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search presets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 text-xs font-mono text-white rounded-xl pl-10 pr-4 py-2.5 border border-white/5 focus:border-[#a3ff12]/50 focus:outline-none placeholder:text-zinc-500"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {["All Presets", "Favorites", "Recently Used", "Factory", "User"].map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-mono font-medium transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-[#a3ff12]/15 text-[#a3ff12] border border-[#a3ff12]/40 font-bold"
                    : "bg-white/5 text-zinc-400 hover:text-white border border-transparent hover:border-white/5"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Genre Dropdown */}
        <div className="flex items-center gap-2 pl-2 min-w-[140px]">
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase">GENRE:</span>
          <Select
            value={selectedGenre}
            onValueChange={(val) => setSelectedGenre(val)}
          >
            <SelectTrigger className="h-8 text-xs font-mono px-3 bg-white/5 border-white/10 rounded-xl focus:border-[#a3ff12]">
              <SelectValue placeholder="Genre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All Genres">All Genres</SelectItem>
              <SelectItem value="Ambient">Ambient</SelectItem>
              <SelectItem value="Metal">Metal</SelectItem>
              <SelectItem value="Blues">Blues</SelectItem>
              <SelectItem value="Clean">Clean</SelectItem>
              <SelectItem value="Rock">Rock</SelectItem>
              <SelectItem value="Funk">Funk</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Preset Cards 3-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredPresets.map((item) => {
          const isLoaded = loadedPresetId === item.id;
          const isFav = favorites.includes(item.id);

          return (
            <div
              key={item.id}
              className={`rounded-3xl p-5 flex flex-col justify-between transition-all relative ${
                isLoaded
                  ? "bg-[#a3ff12]/15 border border-[#a3ff12] shadow-[0_0_25px_rgba(163,255,18,0.15)] ring-1 ring-[#a3ff12]/30"
                  : "frosted-card-hover"
              }`}
            >
              <div>
                {/* Header: Genre tag + Actions */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-[#a3ff12] tracking-wider uppercase">
                    {item.genre}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => toggleFavorite(item.id, e)}
                      className={`p-1 rounded-lg transition-colors cursor-pointer ${
                        isFav ? "text-[#a3ff12]" : "text-zinc-500 hover:text-white"
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isFav ? "fill-[#a3ff12]" : ""}`} />
                    </button>
                    <button className="text-zinc-500 hover:text-white p-1">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Title & Description */}
                <h3 className="text-xl font-bold text-white tracking-tight mt-2">
                  {item.name}
                </h3>
                <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                  {item.description}
                </p>

                {/* Tone / Effects Slot */}
                <div className="space-y-2 mt-4">
                  <div className="p-2.5 bg-white/5 rounded-xl flex items-center justify-between border border-white/5">
                    <div className="flex items-center space-x-2.5 overflow-hidden">
                      <AudioWaveform className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="text-xs font-mono text-zinc-300 truncate">
                        Tone: {item.toneName}
                      </span>
                    </div>
                    {item.toneActive && (
                      <div className="w-2 h-2 rounded-full bg-[#a3ff12] shadow-[0_0_8px_#a3ff12] shrink-0" />
                    )}
                  </div>

                  {/* Looper / Track Slot */}
                  {item.looperStatus && (
                    <div className="p-2.5 bg-white/5 rounded-xl flex items-center space-x-2.5 border border-white/5">
                      {item.looperStatus === "Off" ? (
                        <Ban className="w-3.5 h-3.5 text-zinc-500" />
                      ) : (
                        <Repeat className="w-3.5 h-3.5 text-zinc-400" />
                      )}
                      <span className="text-xs font-mono text-zinc-400">
                        Looper: {item.looperStatus}
                      </span>
                    </div>
                  )}

                  {item.trackStatus && (
                    <div className="p-2.5 bg-white/5 rounded-xl flex items-center space-x-2.5 border border-white/5">
                      <Music className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-xs font-mono text-zinc-300">
                        Track: {item.trackStatus}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Load / Loaded Button */}
              <div className="mt-5 pt-2">
                {isLoaded ? (
                  <button
                    disabled
                    className="w-full py-2.5 rounded-xl border border-[#a3ff12]/60 bg-[#a3ff12]/10 text-[#a3ff12] font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(163,255,18,0.15)]"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Loaded</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleLoadRig(item)}
                    className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 hover:text-white font-mono font-bold text-xs transition-colors cursor-pointer border border-white/5"
                  >
                    Load Rig
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
