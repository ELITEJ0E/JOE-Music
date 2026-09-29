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
  Sparkles,
} from "lucide-react";
import {
  DAWTrack,
  TrackEqConfig,
  TrackInsertEffectsConfig,
  TrackDelayConfig,
  TrackChorusConfig,
  TrackDriveConfig,
  DEFAULT_TRACK_DELAY,
  DEFAULT_TRACK_CHORUS,
  DEFAULT_TRACK_DRIVE,
} from "../../types";

interface StudioEffectsRackProps {
  track: DAWTrack | null;
  onEqChange: (trackId: string, band: "low" | "mid" | "high", value: number) => void;
  onCompressorChange: (
    trackId: string,
    config: { enabled: boolean; thresholdDb: number; ratio: number }
  ) => void;
  onReverbSendChange: (trackId: string, value: number) => void;
  onDelayChange?: (trackId: string, config: TrackDelayConfig) => void;
  onChorusChange?: (trackId: string, config: TrackChorusConfig) => void;
  onDriveChange?: (trackId: string, config: TrackDriveConfig) => void;
  onVolumeChange?: (trackId: string, val: number) => void;
  onPanChange?: (trackId: string, val: number) => void;
}

export const StudioEffectsRack: React.FC<StudioEffectsRackProps> = ({
  track,
  onEqChange,
  onCompressorChange,
  onReverbSendChange,
  onDelayChange,
  onChorusChange,
  onDriveChange,
}) => {
  const [activeModule, setActiveModule] = useState<"eq" | "comp" | "reverb" | "delay" | "chorus" | "drive">("eq");

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
  const insertFx = track.insertEffects || {
    reverbSendLevel: 0,
    compressorEnabled: false,
    compressorThresholdDb: -24,
    compressorRatio: 4,
  };

  const delayCfg = insertFx.delay || DEFAULT_TRACK_DELAY;
  const chorusCfg = insertFx.chorus || DEFAULT_TRACK_CHORUS;
  const driveCfg = insertFx.drive || DEFAULT_TRACK_DRIVE;

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
            {insertFx.compressorEnabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </button>
          <button
            onClick={() => setActiveModule("reverb")}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold ${
              activeModule === "reverb" ? "bg-[#a3ff12] text-black shadow-[0_0_10px_rgba(163,255,18,0.3)]" : "text-zinc-400 hover:text-white"
            }`}
          >
            Reverb Send
          </button>
          <button
            onClick={() => setActiveModule("delay")}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold flex items-center gap-1.5 ${
              activeModule === "delay" ? "bg-[#a3ff12] text-black shadow-[0_0_10px_rgba(163,255,18,0.3)]" : "text-zinc-400 hover:text-white"
            }`}
          >
            Delay
            {delayCfg.enabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>
          <button
            onClick={() => setActiveModule("chorus")}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold flex items-center gap-1.5 ${
              activeModule === "chorus" ? "bg-[#a3ff12] text-black shadow-[0_0_10px_rgba(163,255,18,0.3)]" : "text-zinc-400 hover:text-white"
            }`}
          >
            Chorus
            {chorusCfg.enabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>
          <button
            onClick={() => setActiveModule("drive")}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold flex items-center gap-1.5 ${
              activeModule === "drive" ? "bg-[#a3ff12] text-black shadow-[0_0_10px_rgba(163,255,18,0.3)]" : "text-zinc-400 hover:text-white"
            }`}
          >
            Overdrive
            {driveCfg.enabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
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
                    enabled: !insertFx.compressorEnabled,
                    thresholdDb: insertFx.compressorThresholdDb,
                    ratio: insertFx.compressorRatio,
                  })
                }
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  insertFx.compressorEnabled
                    ? "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_12px_rgba(163,255,18,0.4)]"
                    : "bg-white/5 text-zinc-400 border-white/10"
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{insertFx.compressorEnabled ? "ENABLED" : "BYPASS"}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Threshold</span>
                  <span className="text-white font-bold">{insertFx.compressorThresholdDb} dB</span>
                </div>
                <input
                  type="range"
                  min="-48"
                  max="-6"
                  step="1"
                  value={insertFx.compressorThresholdDb}
                  onChange={(e) =>
                    onCompressorChange(track.id, {
                      enabled: insertFx.compressorEnabled,
                      thresholdDb: parseFloat(e.target.value),
                      ratio: insertFx.compressorRatio,
                    })
                  }
                  className="w-full accent-[#a3ff12] cursor-pointer"
                />
              </div>

              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Ratio</span>
                  <span className="text-white font-bold">{insertFx.compressorRatio}:1</span>
                </div>
                <input
                  type="range"
                  min="1.5"
                  max="12"
                  step="0.5"
                  value={insertFx.compressorRatio}
                  onChange={(e) =>
                    onCompressorChange(track.id, {
                      enabled: insertFx.compressorEnabled,
                      thresholdDb: insertFx.compressorThresholdDb,
                      ratio: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-[#a3ff12] cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* 3. REVERB SEND */}
        {activeModule === "reverb" && (
          <div className="w-full max-w-2xl bg-[#0f121a] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Waves className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-white">Studio Convolution Reverb Send</span>
              </div>
              <span className="text-[10px] text-zinc-500 font-bold bg-white/5 px-2 py-0.5 rounded">
                Shared Bus
              </span>
            </div>

            <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">Reverb Send Level</span>
                <span className="text-purple-400 font-bold">
                  {Math.round((insertFx.reverbSendLevel || 0) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={insertFx.reverbSendLevel || 0}
                onChange={(e) => onReverbSendChange(track.id, parseFloat(e.target.value))}
                className="w-full accent-purple-400 cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* 4. DELAY */}
        {activeModule === "delay" && (
          <div className="w-full max-w-2xl bg-[#0f121a] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-white">Stereo Feedback Delay</span>
              </div>
              <button
                onClick={() =>
                  onDelayChange?.(track.id, {
                    ...delayCfg,
                    enabled: !delayCfg.enabled,
                  })
                }
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  delayCfg.enabled
                    ? "bg-sky-400 text-black border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.4)]"
                    : "bg-white/5 text-zinc-400 border-white/10"
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{delayCfg.enabled ? "ENABLED" : "BYPASS"}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2 text-center">
                <span className="text-[10px] text-zinc-400 font-bold">TIME</span>
                <input
                  type="range"
                  min="0.05"
                  max="0.8"
                  step="0.01"
                  value={delayCfg.timeSec}
                  onChange={(e) =>
                    onDelayChange?.(track.id, {
                      ...delayCfg,
                      timeSec: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-sky-400 cursor-pointer"
                />
                <span className="text-xs font-bold text-white">{Math.round(delayCfg.timeSec * 1000)} ms</span>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2 text-center">
                <span className="text-[10px] text-zinc-400 font-bold">FEEDBACK</span>
                <input
                  type="range"
                  min="0"
                  max="0.85"
                  step="0.01"
                  value={delayCfg.feedback}
                  onChange={(e) =>
                    onDelayChange?.(track.id, {
                      ...delayCfg,
                      feedback: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-sky-400 cursor-pointer"
                />
                <span className="text-xs font-bold text-white">{Math.round(delayCfg.feedback * 100)}%</span>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2 text-center">
                <span className="text-[10px] text-zinc-400 font-bold">MIX</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={delayCfg.mix}
                  onChange={(e) =>
                    onDelayChange?.(track.id, {
                      ...delayCfg,
                      mix: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-sky-400 cursor-pointer"
                />
                <span className="text-xs font-bold text-white">{Math.round(delayCfg.mix * 100)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* 5. CHORUS */}
        {activeModule === "chorus" && (
          <div className="w-full max-w-2xl bg-[#0f121a] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-pink-400" />
                <span className="text-xs font-bold text-white">Dimension Chorus & Width</span>
              </div>
              <button
                onClick={() =>
                  onChorusChange?.(track.id, {
                    ...chorusCfg,
                    enabled: !chorusCfg.enabled,
                  })
                }
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  chorusCfg.enabled
                    ? "bg-pink-400 text-black border-pink-400 shadow-[0_0_12px_rgba(236,72,153,0.4)]"
                    : "bg-white/5 text-zinc-400 border-white/10"
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{chorusCfg.enabled ? "ENABLED" : "BYPASS"}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2 text-center">
                <span className="text-[10px] text-zinc-400 font-bold">RATE</span>
                <input
                  type="range"
                  min="0.2"
                  max="5.0"
                  step="0.1"
                  value={chorusCfg.rateHz}
                  onChange={(e) =>
                    onChorusChange?.(track.id, {
                      ...chorusCfg,
                      rateHz: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-pink-400 cursor-pointer"
                />
                <span className="text-xs font-bold text-white">{chorusCfg.rateHz.toFixed(1)} Hz</span>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2 text-center">
                <span className="text-[10px] text-zinc-400 font-bold">DEPTH</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={chorusCfg.depth}
                  onChange={(e) =>
                    onChorusChange?.(track.id, {
                      ...chorusCfg,
                      depth: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-pink-400 cursor-pointer"
                />
                <span className="text-xs font-bold text-white">{Math.round(chorusCfg.depth * 100)}%</span>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2 text-center">
                <span className="text-[10px] text-zinc-400 font-bold">MIX</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={chorusCfg.mix}
                  onChange={(e) =>
                    onChorusChange?.(track.id, {
                      ...chorusCfg,
                      mix: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-pink-400 cursor-pointer"
                />
                <span className="text-xs font-bold text-white">{Math.round(chorusCfg.mix * 100)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* 6. OVERDRIVE / DRIVE */}
        {activeModule === "drive" && (
          <div className="w-full max-w-2xl bg-[#0f121a] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-white">Analog Warmth & Overdrive</span>
              </div>
              <button
                onClick={() =>
                  onDriveChange?.(track.id, {
                    ...driveCfg,
                    enabled: !driveCfg.enabled,
                  })
                }
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  driveCfg.enabled
                    ? "bg-amber-500 text-black border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                    : "bg-white/5 text-zinc-400 border-white/10"
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{driveCfg.enabled ? "ENABLED" : "BYPASS"}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2 text-center">
                <span className="text-[10px] text-zinc-400 font-bold">DRIVE</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={driveCfg.amount}
                  onChange={(e) =>
                    onDriveChange?.(track.id, {
                      ...driveCfg,
                      amount: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-white">{driveCfg.amount}</span>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2 text-center">
                <span className="text-[10px] text-zinc-400 font-bold">TONE</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={driveCfg.tone}
                  onChange={(e) =>
                    onDriveChange?.(track.id, {
                      ...driveCfg,
                      tone: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-white">{driveCfg.tone}</span>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2 text-center">
                <span className="text-[10px] text-zinc-400 font-bold">MIX</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={driveCfg.mix}
                  onChange={(e) =>
                    onDriveChange?.(track.id, {
                      ...driveCfg,
                      mix: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-white">{Math.round(driveCfg.mix * 100)}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
