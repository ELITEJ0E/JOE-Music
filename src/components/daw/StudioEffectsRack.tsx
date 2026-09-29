import React, { useState } from "react";
import {
  Sliders,
  Activity,
  Waves,
  Radio,
  Zap,
  Volume2,
  Shield,
  Gauge,
  Power,
  RotateCcw,
} from "lucide-react";
import { DAWTrack, TrackEqConfig, TrackInsertEffectsConfig } from "../../types";

interface StudioEffectsRackProps {
  track: DAWTrack | null;
  onEqChange: (trackId: string, band: "low" | "mid" | "high", value: number) => void;
  onCompressorChange: (
    trackId: string,
    config: { enabled: boolean; thresholdDb: number; ratio: number }
  ) => void;
  onReverbSendChange: (trackId: string, value: number) => void;
  onVolumeChange?: (trackId: string, val: number) => void;
  onPanChange?: (trackId: string, val: number) => void;
}

export const StudioEffectsRack: React.FC<StudioEffectsRackProps> = ({
  track,
  onEqChange,
  onCompressorChange,
  onReverbSendChange,
}) => {
  const [activeModule, setActiveModule] = useState<"eq" | "comp" | "reverb" | "delay" | "chorus" | "drive">("eq");

  // Local effect simulation states for creative modules
  const [delayMix, setDelayMix] = useState<number>(20);
  const [delayTime, setDelayTime] = useState<number>(375); // ms
  const [delayFeedback, setDelayFeedback] = useState<number>(35);
  const [chorusDepth, setChorusDepth] = useState<number>(40);
  const [chorusRate, setChorusRate] = useState<number>(1.2);
  const [driveGain, setDriveGain] = useState<number>(25);
  const [driveTone, setDriveTone] = useState<number>(60);

  if (!track) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-zinc-500 font-mono text-xs">
        <Sliders className="w-8 h-8 text-zinc-600 mb-2" />
        <p className="text-zinc-400 font-bold">No Track Selected</p>
        <p className="text-[11px] text-zinc-500 mt-1">Select a track in the timeline to adjust its DSP insert effects.</p>
      </div>
    );
  }

  const eq = track.eq || { lowGainDb: 0, midGainDb: 0, highGainDb: 0 };
  const comp = track.insertEffects || {
    reverbSendLevel: 0,
    compressorEnabled: false,
    compressorThresholdDb: -24,
    compressorRatio: 4,
  };

  return (
    <div className="h-full flex flex-col bg-[#0b0e14] text-white p-3 sm:p-4 overflow-y-auto select-none font-mono">
      {/* Module Selector Tabs */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: track.color }} />
          <span className="text-xs font-bold text-white uppercase tracking-wider truncate max-w-[140px] sm:max-w-[200px]">
            {track.name} DSP Chain
          </span>
        </div>

        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 text-[11px] overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveModule("eq")}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold ${
              activeModule === "eq" ? "bg-[#a3ff12] text-black shadow-[0_0_10px_rgba(163,255,18,0.3)]" : "text-zinc-400 hover:text-white"
            }`}
          >
            3-Band EQ
          </button>
          <button
            onClick={() => setActiveModule("comp")}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold flex items-center gap-1.5 ${
              activeModule === "comp" ? "bg-[#a3ff12] text-black shadow-[0_0_10px_rgba(163,255,18,0.3)]" : "text-zinc-400 hover:text-white"
            }`}
          >
            Compressor
            {comp.compressorEnabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </button>
          <button
            onClick={() => setActiveModule("reverb")}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold ${
              activeModule === "reverb" ? "bg-[#a3ff12] text-black shadow-[0_0_10px_rgba(163,255,18,0.3)]" : "text-zinc-400 hover:text-white"
            }`}
          >
            Reverb Bus
          </button>
          <button
            onClick={() => setActiveModule("delay")}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold ${
              activeModule === "delay" ? "bg-[#a3ff12] text-black shadow-[0_0_10px_rgba(163,255,18,0.3)]" : "text-zinc-400 hover:text-white"
            }`}
          >
            Delay
          </button>
          <button
            onClick={() => setActiveModule("chorus")}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold ${
              activeModule === "chorus" ? "bg-[#a3ff12] text-black shadow-[0_0_10px_rgba(163,255,18,0.3)]" : "text-zinc-400 hover:text-white"
            }`}
          >
            Chorus
          </button>
          <button
            onClick={() => setActiveModule("drive")}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold ${
              activeModule === "drive" ? "bg-[#a3ff12] text-black shadow-[0_0_10px_rgba(163,255,18,0.3)]" : "text-zinc-400 hover:text-white"
            }`}
          >
            Overdrive
          </button>
        </div>
      </div>

      {/* Module Content */}
      <div className="flex-1 flex items-center justify-center">
        {/* 1. 3-BAND PARAMETRIC EQ */}
        {activeModule === "eq" && (
          <div className="w-full max-w-2xl bg-[#0f121a] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#a3ff12]" />
                <span className="text-xs font-bold text-white">3-Band Parametric Equalizer</span>
              </div>
              <button
                onClick={() => {
                  onEqChange(track.id, "low", 0);
                  onEqChange(track.id, "mid", 0);
                  onEqChange(track.id, "high", 0);
                }}
                className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5 cursor-pointer"
                title="Reset EQ to flat"
              >
                <RotateCcw className="w-3 h-3" /> Reset Flat
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              {/* LOW */}
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 flex flex-col items-center gap-2">
                <span className="text-[11px] text-cyan-400 font-bold">LOW (200 Hz)</span>
                <input
                  type="range"
                  min="-15"
                  max="15"
                  step="0.5"
                  value={eq.lowGainDb}
                  onChange={(e) => onEqChange(track.id, "low", parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <span className="text-xs font-bold text-white">{eq.lowGainDb > 0 ? `+${eq.lowGainDb}` : eq.lowGainDb} dB</span>
              </div>

              {/* MID */}
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 flex flex-col items-center gap-2">
                <span className="text-[11px] text-amber-400 font-bold">MID (1.0 kHz)</span>
                <input
                  type="range"
                  min="-15"
                  max="15"
                  step="0.5"
                  value={eq.midGainDb}
                  onChange={(e) => onEqChange(track.id, "mid", parseFloat(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <span className="text-xs font-bold text-white">{eq.midGainDb > 0 ? `+${eq.midGainDb}` : eq.midGainDb} dB</span>
              </div>

              {/* HIGH */}
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 flex flex-col items-center gap-2">
                <span className="text-[11px] text-rose-400 font-bold">HIGH (4.0 kHz)</span>
                <input
                  type="range"
                  min="-15"
                  max="15"
                  step="0.5"
                  value={eq.highGainDb}
                  onChange={(e) => onEqChange(track.id, "high", parseFloat(e.target.value))}
                  className="w-full accent-rose-400 cursor-pointer"
                />
                <span className="text-xs font-bold text-white">{eq.highGainDb > 0 ? `+${eq.highGainDb}` : eq.highGainDb} dB</span>
              </div>
            </div>
          </div>
        )}

        {/* 2. DYNAMICS COMPRESSOR */}
        {activeModule === "comp" && (
          <div className="w-full max-w-2xl bg-[#0f121a] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[#a3ff12]" />
                <span className="text-xs font-bold text-white">Studio Dynamics Compressor</span>
              </div>
              <button
                onClick={() =>
                  onCompressorChange(track.id, {
                    enabled: !comp.compressorEnabled,
                    thresholdDb: comp.compressorThresholdDb,
                    ratio: comp.compressorRatio,
                  })
                }
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  comp.compressorEnabled
                    ? "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_12px_rgba(163,255,18,0.4)]"
                    : "bg-white/5 text-zinc-400 border-white/10"
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{comp.compressorEnabled ? "ENABLED" : "BYPASS"}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Threshold</span>
                  <span className="text-white font-bold">{comp.compressorThresholdDb} dB</span>
                </div>
                <input
                  type="range"
                  min="-48"
                  max="-6"
                  step="1"
                  value={comp.compressorThresholdDb}
                  onChange={(e) =>
                    onCompressorChange(track.id, {
                      enabled: comp.compressorEnabled,
                      thresholdDb: parseFloat(e.target.value),
                      ratio: comp.compressorRatio,
                    })
                  }
                  className="w-full accent-[#a3ff12] cursor-pointer"
                />
              </div>

              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Ratio</span>
                  <span className="text-white font-bold">{comp.compressorRatio}:1</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="16"
                  step="0.5"
                  value={comp.compressorRatio}
                  onChange={(e) =>
                    onCompressorChange(track.id, {
                      enabled: comp.compressorEnabled,
                      thresholdDb: comp.compressorThresholdDb,
                      ratio: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-[#a3ff12] cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* 3. STUDIO REVERB BUS */}
        {activeModule === "reverb" && (
          <div className="w-full max-w-2xl bg-[#0f121a] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Waves className="w-4 h-4 text-[#a3ff12]" />
                <span className="text-xs font-bold text-white">Convolution Studio Reverb Send</span>
              </div>
              <span className="text-[10px] text-[#a3ff12] bg-[#a3ff12]/10 border border-[#a3ff12]/20 px-2 py-0.5 rounded">
                Shared Bus Return
              </span>
            </div>

            <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">Reverb Send Level</span>
                <span className="text-[#a3ff12] font-bold">{Math.round((comp.reverbSendLevel || 0) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={comp.reverbSendLevel || 0}
                onChange={(e) => onReverbSendChange(track.id, parseFloat(e.target.value))}
                className="w-full accent-[#a3ff12] cursor-pointer"
              />
              <p className="text-[10px] text-zinc-500">
                Sends audio into the shared convolution acoustic room impulse processor for lush spatial depth.
              </p>
            </div>
          </div>
        )}

        {/* 4. STEREO DELAY */}
        {activeModule === "delay" && (
          <div className="w-full max-w-2xl bg-[#0f121a] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#a3ff12]" />
                <span className="text-xs font-bold text-white">Stereo Ping-Pong Delay</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2">
                <span className="text-[10px] text-zinc-400">Mix</span>
                <input type="range" min="0" max="100" value={delayMix} onChange={(e) => setDelayMix(Number(e.target.value))} className="w-full accent-[#a3ff12] cursor-pointer" />
                <span className="text-xs text-white font-bold block text-center">{delayMix}%</span>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2">
                <span className="text-[10px] text-zinc-400">Time (ms)</span>
                <input type="range" min="50" max="1000" step="25" value={delayTime} onChange={(e) => setDelayTime(Number(e.target.value))} className="w-full accent-[#a3ff12] cursor-pointer" />
                <span className="text-xs text-white font-bold block text-center">{delayTime} ms</span>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2">
                <span className="text-[10px] text-zinc-400">Feedback</span>
                <input type="range" min="0" max="90" value={delayFeedback} onChange={(e) => setDelayFeedback(Number(e.target.value))} className="w-full accent-[#a3ff12] cursor-pointer" />
                <span className="text-xs text-white font-bold block text-center">{delayFeedback}%</span>
              </div>
            </div>
          </div>
        )}

        {/* 5. STEREO CHORUS */}
        {activeModule === "chorus" && (
          <div className="w-full max-w-2xl bg-[#0f121a] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#a3ff12]" />
                <span className="text-xs font-bold text-white">Stereo Chorus & Dimension</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2">
                <span className="text-[10px] text-zinc-400">Depth</span>
                <input type="range" min="0" max="100" value={chorusDepth} onChange={(e) => setChorusDepth(Number(e.target.value))} className="w-full accent-[#a3ff12] cursor-pointer" />
                <span className="text-xs text-white font-bold block text-center">{chorusDepth}%</span>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2">
                <span className="text-[10px] text-zinc-400">Rate (Hz)</span>
                <input type="range" min="0.1" max="5.0" step="0.1" value={chorusRate} onChange={(e) => setChorusRate(Number(e.target.value))} className="w-full accent-[#a3ff12] cursor-pointer" />
                <span className="text-xs text-white font-bold block text-center">{chorusRate} Hz</span>
              </div>
            </div>
          </div>
        )}

        {/* 6. OVERDRIVE & DISTORTION */}
        {activeModule === "drive" && (
          <div className="w-full max-w-2xl bg-[#0f121a] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">Tube Harmonic Overdrive</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2">
                <span className="text-[10px] text-zinc-400">Drive / Gain</span>
                <input type="range" min="0" max="100" value={driveGain} onChange={(e) => setDriveGain(Number(e.target.value))} className="w-full accent-amber-400 cursor-pointer" />
                <span className="text-xs text-amber-400 font-bold block text-center">{driveGain}%</span>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2">
                <span className="text-[10px] text-zinc-400">Tone Brightness</span>
                <input type="range" min="0" max="100" value={driveTone} onChange={(e) => setDriveTone(Number(e.target.value))} className="w-full accent-amber-400 cursor-pointer" />
                <span className="text-xs text-white font-bold block text-center">{driveTone}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
