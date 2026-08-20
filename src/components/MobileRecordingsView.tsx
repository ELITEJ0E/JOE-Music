import React, { useState } from "react";
import {
  SlidersHorizontal,
  Music,
  Sliders,
  Repeat,
  MoreHorizontal,
  SlidersVertical,
  Play,
  Pause,
  Filter,
  Plus,
} from "lucide-react";
import { WorkstationMode } from "../types";
import { guitarSynth } from "../audio/guitarSynth";

interface MobileRecordingsViewProps {
  onSelectMode: (mode: WorkstationMode) => void;
}

export const MobileRecordingsView: React.FC<MobileRecordingsViewProps> = ({ onSelectMode }) => {
  const [playingId, setPlayingId] = useState<string | null>("track-1");

  const tracks = [
    {
      id: "track-1",
      title: "Prog Riff #42",
      date: "TODAY, 14:32",
      tags: ["DROP D", "124 BPM"],
      duration: "01:24",
    },
    {
      id: "track-2",
      title: "Clean Arpeggios",
      date: "YESTERDAY",
      tags: ["E-STANDARD"],
      duration: "02:45",
    },
    {
      id: "track-3",
      title: "Heavy Chug Test",
      date: "OCT 12, 2023",
      tags: ["DROP A", "DISTORTION"],
      duration: "00:58",
    },
    {
      id: "track-4",
      title: "Funk Groove Take 3",
      date: "OCT 8, 2023",
      tags: ["STANDARD", "110 BPM"],
      duration: "03:12",
    },
    {
      id: "track-5",
      title: "Solo Harmonized Run",
      date: "OCT 4, 2023",
      tags: ["D-STANDARD", "LEAD"],
      duration: "01:40",
    },
  ];

  const handleTogglePlay = (id: string) => {
    if (playingId === id) {
      setPlayingId(null);
    } else {
      setPlayingId(id);
      guitarSynth.strumChord([null, 0, 2, 2, 1, 0], "down", 30, 0, 0.8);
      setTimeout(() => {
        guitarSynth.strumChord([3, 2, 0, 0, 3, 3], "down", 30, 0, 0.8);
      }, 700);
    }
  };

  return (
    <div id="mobile-recordings-screen" className="max-w-xl mx-auto space-y-5 pb-16 animate-in fade-in duration-200">
      {/* Page Title & Stats */}
      <div className="flex items-end justify-between px-1">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Recordings</h1>
          <p className="text-xs font-mono font-bold text-zinc-400 mt-1 tracking-wider">
            44 TRACKS • 2.4GB
          </p>
        </div>

        <button className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:border-[#a3ff12]/30 flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer">
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {/* Track Cards List */}
      <div className="space-y-3.5">
        {tracks.map((track) => {
          const isPlaying = playingId === track.id;

          return (
            <div
              key={track.id}
              className={`p-5 rounded-3xl flex items-center justify-between transition-all ${
                isPlaying
                  ? "bg-[#a3ff12]/15 border border-[#a3ff12] shadow-[0_0_25px_rgba(163,255,18,0.15)] ring-1 ring-[#a3ff12]/30"
                  : "frosted-card-hover"
              }`}
            >
              <div className="space-y-2.5">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {track.title}
                  </h3>
                  <p className="text-[11px] font-mono font-bold text-zinc-400 mt-0.5 tracking-wider">
                    {track.date}
                  </p>
                </div>

                {/* Tags */}
                <div className="flex items-center gap-2">
                  {track.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-[11px] font-mono text-zinc-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Play / Pause Circular Button */}
              <button
                onClick={() => handleTogglePlay(track.id)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  isPlaying
                    ? "bg-[#a3ff12] text-black shadow-[0_0_20px_rgba(163,255,18,0.5)]"
                    : "bg-white/5 hover:bg-white/10 text-white border border-white/5"
                }`}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-black" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
