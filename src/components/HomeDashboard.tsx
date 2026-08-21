import React, { useState } from "react";
import {
  SlidersHorizontal,
  LayoutGrid,
  Play,
  Pause,
  Circle,
  Repeat,
  MoreVertical,
  Music,
  Mic,
  ChevronRight,
  AudioWaveform,
} from "lucide-react";
import { WorkstationMode } from "../types";
import { guitarSynth } from "../audio/guitarSynth";

interface HomeDashboardProps {
  onSelectMode: (mode: WorkstationMode) => void;
  onSelectSong?: (songId: string) => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({ onSelectMode }) => {
  const [playingRec, setPlayingRec] = useState<string | null>(null);
  const [isPlayingFeatured, setIsPlayingFeatured] = useState<boolean>(false);

  const handleTogglePlayFeatured = () => {
    if (isPlayingFeatured) {
      setIsPlayingFeatured(false);
    } else {
      setIsPlayingFeatured(true);
      // Play a guitar arpeggio progression to preview "Maybe Next Summer" (A Major, 104 BPM)
      guitarSynth.strumChord([null, 0, 2, 2, 2, 0], "down", 35, 0, 0.8);
      setTimeout(() => {
        guitarSynth.strumChord([2, 4, 4, 2, 2, 2], "down", 35, 0, 0.8);
      }, 700);
      setTimeout(() => {
        guitarSynth.strumChord([null, 2, 4, 4, 4, 2], "down", 35, 0, 0.8);
      }, 1400);
      setTimeout(() => {
        guitarSynth.strumChord([0, 2, 2, 1, 0, 0], "down", 35, 0, 0.8);
      }, 2100);
      setTimeout(() => {
        setIsPlayingFeatured(false);
      }, 3500);
    }
  };

  const handlePlayRecordingSample = (id: string, name: string) => {
    if (playingRec === id) {
      setPlayingRec(null);
    } else {
      setPlayingRec(id);
      guitarSynth.strumChord([null, 0, 2, 2, 1, 0], "down", 25, 0, 0.7);
      setTimeout(() => {
        guitarSynth.strumChord([3, 2, 0, 0, 3, 3], "down", 25, 0, 0.7);
      }, 800);
      setTimeout(() => {
        setPlayingRec(null);
      }, 2000);
    }
  };

  return (
    <div id="home-dashboard" className="max-w-6xl mx-auto space-y-6 pb-8 animate-in fade-in duration-200">
      {/* Greeting Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Good afternoon, guitarist.
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Ready to play?</p>
      </div>

      {/* Main Grid: Quick Actions + Continue Playing Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Quick Action Tiles (5 tiles in 2x2 + 1 layout) */}
        <div className="lg:col-span-7 grid grid-cols-2 gap-4">
          {/* TUNE */}
          <button
            id="home-action-tune"
            onClick={() => onSelectMode("tuner")}
            className="h-36 frosted-card-hover rounded-3xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-[#1c2026] flex items-center justify-center group-hover:scale-105 transition-transform border border-white/5">
              <SlidersHorizontal className="w-5 h-5 text-zinc-300 group-hover:text-white" />
            </div>
            <span className="text-xs font-bold font-mono tracking-widest text-zinc-200 uppercase">
              TUNE
            </span>
          </button>

          {/* FIND CHORDS */}
          <button
            id="home-action-find-chords"
            onClick={() => onSelectMode("chords-ai")}
            className="h-36 frosted-card-hover rounded-3xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-[#1c2026] flex items-center justify-center group-hover:scale-105 transition-transform border border-white/5">
              <LayoutGrid className="w-5 h-5 text-zinc-300 group-hover:text-white" />
            </div>
            <span className="text-xs font-bold font-mono tracking-widest text-zinc-200 uppercase">
              FIND CHORDS
            </span>
          </button>

          {/* PLAY SONG */}
          <button
            id="home-action-play-song"
            onClick={() => onSelectMode("songs")}
            className="h-36 frosted-card-hover rounded-3xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-[#1c2026] flex items-center justify-center group-hover:scale-105 transition-transform border border-white/5">
              <Play className="w-5 h-5 text-zinc-300 group-hover:text-white fill-current ml-0.5" />
            </div>
            <span className="text-xs font-bold font-mono tracking-widest text-zinc-200 uppercase">
              PLAY SONG
            </span>
          </button>

          {/* RECORD */}
          <button
            id="home-action-record"
            onClick={() => onSelectMode("studio")}
            className="h-36 frosted-card-hover rounded-3xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-[#1c2026] flex items-center justify-center group-hover:scale-105 transition-transform border border-white/5">
              <Circle className="w-5 h-5 text-rose-400 group-hover:text-rose-300 stroke-[2.5]" />
            </div>
            <span className="text-xs font-bold font-mono tracking-widest text-zinc-200 uppercase">
              RECORD
            </span>
          </button>

          {/* LOOPER */}
          <button
            id="home-action-looper"
            onClick={() => onSelectMode("looper")}
            className="h-36 frosted-card-hover rounded-3xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-[#1c2026] flex items-center justify-center group-hover:scale-105 transition-transform border border-white/5">
              <Repeat className="w-5 h-5 text-zinc-300 group-hover:text-white" />
            </div>
            <span className="text-xs font-bold font-mono tracking-widest text-zinc-200 uppercase">
              LOOPER
            </span>
          </button>
        </div>

        {/* Continue Playing Featured Card (Right Column) */}
        <div className="lg:col-span-5 frosted-card rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden group">
          {/* Subtle Mixing/Waveform Graphic Background */}
          <div className="absolute inset-0 opacity-15 pointer-events-none flex items-end justify-center pb-20">
            <svg viewBox="0 0 400 120" className="w-full h-28 stroke-[#a3ff12] fill-none stroke-[1.5]">
              <path d="M 0 60 Q 40 10 80 60 T 160 60 T 240 60 T 320 60 T 400 60" />
              <path d="M 0 70 Q 50 110 100 70 T 200 70 T 300 70 T 400 70" opacity="0.6" />
            </svg>
          </div>

          <div>
            {/* Top Bar: CONTINUE PLAYING pill & menu dots */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold font-mono text-[#a3ff12] tracking-wider uppercase">
                CONTINUE PLAYING
              </span>
              <button className="text-zinc-500 hover:text-zinc-300 p-1">
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>

            {/* Song Title & Last Played */}
            <div className="mt-4">
              <h2 className="text-2xl font-bold text-white tracking-tight">
                Maybe Next Summer
              </h2>
              <p className="text-xs text-zinc-400 mt-1">Last played 8 min ago</p>
            </div>
          </div>

          {/* Bottom Area: BPM / Key / Meter Badges & Big Continue Button */}
          <div className="space-y-5 pt-12 z-10">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-zinc-200">
                104 BPM
              </span>
              <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-zinc-200">
                A Major
              </span>
              <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-zinc-200">
                4/4
              </span>
            </div>

            <button
              id="btn-home-continue-playing"
              onClick={handleTogglePlayFeatured}
              className="w-full py-3.5 frosted-button-primary rounded-xl text-black font-extrabold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.99]"
            >
              {isPlayingFeatured ? (
                <>
                  <Pause className="w-4 h-4 fill-black" />
                  <span>PAUSE PLAYBACK</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-black" />
                  <span>CONTINUE</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom 3 Cards Row: Recent Songs, Recent Recordings, Favorite Tones */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Recent Songs */}
        <div className="frosted-card rounded-3xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <h3 className="text-sm font-bold text-white tracking-wide">Recent Songs</h3>
            <button
              onClick={() => onSelectMode("songs")}
              className="text-[10px] font-mono font-bold text-zinc-400 hover:text-white uppercase tracking-wider"
            >
              VIEW ALL
            </button>
          </div>

          <div className="space-y-2 mt-3">
            <div
              onClick={() => onSelectMode("songs")}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-between cursor-pointer transition-all border border-transparent hover:border-white/5"
            >
              <div className="flex items-center space-x-3">
                <Music className="w-4 h-4 text-zinc-400" />
                <div>
                  <div className="text-xs font-bold text-white">Neon Nights</div>
                  <div className="text-[10px] text-zinc-400 font-mono">E Minor • 120 BPM</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500" />
            </div>

            <div
              onClick={() => onSelectMode("songs")}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-between cursor-pointer transition-all border border-transparent hover:border-white/5"
            >
              <div className="flex items-center space-x-3">
                <Music className="w-4 h-4 text-zinc-400" />
                <div>
                  <div className="text-xs font-bold text-white">Midnight Drive</div>
                  <div className="text-[10px] text-zinc-400 font-mono">D Dorian • 95 BPM</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500" />
            </div>
          </div>
        </div>

        {/* Recent Recordings */}
        <div className="frosted-card rounded-3xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <h3 className="text-sm font-bold text-white tracking-wide">Recent Recordings</h3>
            <button
              onClick={() => onSelectMode("studio")}
              className="text-[10px] font-mono font-bold text-zinc-400 hover:text-white uppercase tracking-wider"
            >
              VIEW ALL
            </button>
          </div>

          <div className="space-y-2 mt-3">
            <div className="p-3 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-between border border-transparent hover:border-white/5">
              <div className="flex items-center space-x-3">
                <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
                  <Mic className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Idea_04_Amaj.wav</div>
                  <div className="text-[10px] text-zinc-400 font-mono">Yesterday • 02:14</div>
                </div>
              </div>
              <button
                onClick={() => handlePlayRecordingSample("rec-1", "Idea_04_Amaj.wav")}
                className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-[#a3ff12] hover:text-black text-zinc-300 flex items-center justify-center transition-colors"
              >
                {playingRec === "rec-1" ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
              </button>
            </div>

            <div className="p-3 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-between border border-transparent hover:border-white/5">
              <div className="flex items-center space-x-3">
                <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
                  <Mic className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Riff_Heavy_DropD.wav</div>
                  <div className="text-[10px] text-zinc-400 font-mono">Oct 12 • 00:45</div>
                </div>
              </div>
              <button
                onClick={() => handlePlayRecordingSample("rec-2", "Riff_Heavy_DropD.wav")}
                className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-[#a3ff12] hover:text-black text-zinc-300 flex items-center justify-center transition-colors"
              >
                {playingRec === "rec-2" ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Favorite Tones */}
        <div className="frosted-card rounded-3xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <h3 className="text-sm font-bold text-white tracking-wide">Favorite Tones</h3>
            <button
              onClick={() => onSelectMode("presets")}
              className="text-[10px] font-mono font-bold text-zinc-400 hover:text-white uppercase tracking-wider"
            >
              VIEW ALL
            </button>
          </div>

          <div className="space-y-2 mt-3">
            <div
              onClick={() => onSelectMode("tone-studio")}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-between cursor-pointer transition-all border border-transparent hover:border-white/5"
            >
              <div className="flex items-center space-x-3">
                <AudioWaveform className="w-4 h-4 text-[#a3ff12]" />
                <span className="text-xs font-bold text-white">Crystal Clean Delay</span>
              </div>
            </div>

            <div
              onClick={() => onSelectMode("tone-studio")}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-between cursor-pointer transition-all border border-transparent hover:border-white/5"
            >
              <div className="flex items-center space-x-3">
                <AudioWaveform className="w-4 h-4 text-[#a3ff12]" />
                <span className="text-xs font-bold text-white">Modern High Gain</span>
              </div>
            </div>

            <div
              onClick={() => onSelectMode("tone-studio")}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-between cursor-pointer transition-all border border-transparent hover:border-white/5"
            >
              <div className="flex items-center space-x-3">
                <AudioWaveform className="w-4 h-4 text-[#a3ff12]" />
                <span className="text-xs font-bold text-white">Vintage Fuzz Box</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
