import React from "react";
import { Sliders, Sun, Flame, Sparkles, Waves, Maximize2, Zap, RotateCcw } from "lucide-react";
import { ToneMacroSettings, DEFAULT_TONE_MACROS } from "../../types/toneAndEffects";

interface StudioToneMacrosProps {
  macros: ToneMacroSettings;
  onChangeMacros: (newMacros: ToneMacroSettings) => void;
  trackName?: string;
  trackColor?: string;
}

const TONE_CARDS: {
  key: keyof ToneMacroSettings;
  label: string;
  desc: string;
  icon: React.ElementType;
  color: string;
}[] = [
  {
    key: "warmth",
    label: "Warmth",
    desc: "Low-mid harmonic body and vintage tube analog saturation",
    icon: Flame,
    color: "#f59e0b",
  },
  {
    key: "brightness",
    label: "Brightness",
    desc: "High-end presence, clarity, and treble top-end shimmer",
    icon: Sun,
    color: "#38bdf8",
  },
  {
    key: "punch",
    label: "Punch",
    desc: "Transient impact, dynamic compression bite, and attack snap",
    icon: Zap,
    color: "#a3ff12",
  },
  {
    key: "space",
    label: "Space",
    desc: "Acoustic room convolution reflections and reverb depth",
    icon: Waves,
    color: "#a855f7",
  },
  {
    key: "width",
    label: "Width",
    desc: "Stereo spatial spread, chorus dimension, and decorrelation",
    icon: Maximize2,
    color: "#ec4899",
  },
  {
    key: "character",
    label: "Character",
    desc: "Harmonic grit, tube distortion, and cabinet drive edge",
    icon: Sparkles,
    color: "#10b981",
  },
];

const PRESET_STYLES: {
  name: string;
  macros: ToneMacroSettings;
}[] = [
  {
    name: "Clean Acoustic",
    macros: { warmth: 60, brightness: 70, punch: 40, space: 35, width: 50, character: 30 },
  },
  {
    name: "Modern Lead",
    macros: { warmth: 50, brightness: 65, punch: 75, space: 45, width: 45, character: 70 },
  },
  {
    name: "Ambient Cloud",
    macros: { warmth: 45, brightness: 60, punch: 30, space: 85, width: 80, character: 40 },
  },
  {
    name: "Vintage Crunch",
    macros: { warmth: 70, brightness: 50, punch: 65, space: 30, width: 35, character: 75 },
  },
  {
    name: "Punchy Bass",
    macros: { warmth: 80, brightness: 35, punch: 85, space: 15, width: 20, character: 55 },
  },
  {
    name: "Vocal Clarity",
    macros: { warmth: 45, brightness: 75, punch: 60, space: 40, width: 50, character: 35 },
  },
];

export const StudioToneMacros: React.FC<StudioToneMacrosProps> = ({
  macros,
  onChangeMacros,
  trackName = "Master Mix",
  trackColor = "#a3ff12",
}) => {
  const handleMacroChange = (key: keyof ToneMacroSettings, val: number) => {
    onChangeMacros({
      ...macros,
      [key]: val,
    });
  };

  const handleReset = () => {
    onChangeMacros({ ...DEFAULT_TONE_MACROS });
  };

  return (
    <div className="h-full flex flex-col bg-[#0b0e14] text-white p-3 sm:p-5 overflow-y-auto font-mono select-none">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/10 pb-3 mb-4 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#a3ff12]" />
            <h3 className="text-xs sm:text-sm font-bold text-white">
              Studio Macro Tone Shaping
            </h3>
            <span className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded text-zinc-400">
              {trackName}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Macro knobs automatically balance multiple underlying DSP parameters for intuitive sound crafting.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 transition-colors cursor-pointer"
            title="Reset macros to balanced default"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Default
          </button>
        </div>
      </div>

      {/* Quick 1-Touch Presets */}
      <div className="mb-4">
        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-2">
          One-Touch Tone Signatures:
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {PRESET_STYLES.map((st) => (
            <button
              key={st.name}
              onClick={() => onChangeMacros({ ...st.macros })}
              className="px-3 py-1.5 bg-[#12151d] hover:bg-white/10 border border-white/10 hover:border-[#a3ff12]/40 rounded-xl text-xs font-bold text-zinc-300 hover:text-white shrink-0 transition-all cursor-pointer active:scale-95"
            >
              {st.name}
            </button>
          ))}
        </div>
      </div>

      {/* 6 Macro Knobs Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {TONE_CARDS.map((item) => {
          const Icon = item.icon;
          const val = macros[item.key] ?? 50;

          return (
            <div
              key={item.key}
              className="bg-[#0f121a] border border-white/10 rounded-2xl p-3.5 flex flex-col justify-between space-y-3 hover:border-white/20 transition-all"
            >
              <div className="flex items-center justify-between">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center border"
                  style={{
                    backgroundColor: `${item.color}15`,
                    borderColor: `${item.color}30`,
                    color: item.color,
                  }}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold" style={{ color: item.color }}>
                  {val}%
                </span>
              </div>

              <div>
                <div className="text-xs font-bold text-white mb-0.5">{item.label}</div>
                <div className="text-[10px] text-zinc-500 line-clamp-2 leading-tight">
                  {item.desc}
                </div>
              </div>

              <div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={val}
                  onChange={(e) => handleMacroChange(item.key, Number(e.target.value))}
                  className="w-full cursor-pointer h-1.5 rounded-lg bg-zinc-800"
                  style={{ accentColor: item.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
