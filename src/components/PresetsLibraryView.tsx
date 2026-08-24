import React, { useState } from "react";
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

  const presetList = [
    {
      id: "ethereal-echoes",
      name: "Ethereal Echoes",
      genre: "AMBIENT",
      description: "Deep space reverb with subtle chorus.",
      toneName: "Shimmer Verb",
      toneActive: true,
      looperStatus: "2 Tracks Ready",
      trackStatus: null,
      presetData: DEFAULT_TONE_PRESETS.find((p) => p.category === "Ambient Dream") || DEFAULT_TONE_PRESETS[0],
    },
    {
      id: "djent-core",
      name: "Djent Core",
      genre: "METAL",
      description: "Ultra-tight gate, scooped mids, heavy drive.",
      toneName: "High Gain Modern",
      toneActive: true,
      looperStatus: null,
      trackStatus: "160BPM Click",
      presetData: DEFAULT_TONE_PRESETS.find((p) => p.category === "High Gain Metal") || DEFAULT_TONE_PRESETS[1],
    },
    {
      id: "texas-crunch",
      name: "Texas Crunch",
      genre: "BLUES",
      description: "Warm tube break-up with spring reverb.",
      toneName: "Tube Screamer + Fender",
      toneActive: true,
      looperStatus: "Off",
      trackStatus: null,
      presetData: DEFAULT_TONE_PRESETS.find((p) => p.category === "Blues Crunch") || DEFAULT_TONE_PRESETS[2],
    },
    {
      id: "crystal-clean",
      name: "Crystal Clean Glass",
      genre: "CLEAN",
      description: "Studio compressor into boutique sparkling clean preamp.",
      toneName: "Studio Clean & Mod Chorus",
      toneActive: true,
      looperStatus: "1 Track Ready",
      trackStatus: null,
      presetData: DEFAULT_TONE_PRESETS.find((p) => p.category === "Clean") || DEFAULT_TONE_PRESETS[0],
    },
    {
      id: "vintage-lead",
      name: "Vintage Lead 70s",
      genre: "ROCK",
      description: "Creamy overdrive with analog tape slapback delay.",
      toneName: "Vintage Fuzz & Tube Head",
      toneActive: true,
      looperStatus: null,
      trackStatus: "120BPM Groove",
      presetData: DEFAULT_TONE_PRESETS.find((p) => p.category === "Classic Rock") || DEFAULT_TONE_PRESETS[3],
    },
    {
      id: "funk-envelope",
      name: "Funk Groove Envelope",
      genre: "FUNK",
      description: "Tight optical compression with crisp transient attack.",
      toneName: "Optical Comp & Stereo Reverb",
      toneActive: true,
      looperStatus: "Off",
      trackStatus: null,
      presetData: DEFAULT_TONE_PRESETS.find((p) => p.category === "Funk Rhythm") || DEFAULT_TONE_PRESETS[4],
    },
  ];

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
