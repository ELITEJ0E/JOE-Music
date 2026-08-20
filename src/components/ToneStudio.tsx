import React, { useState, useEffect, useRef } from "react";
import {
  SlidersHorizontal,
  Volume2,
  Mic,
  MicOff,
  Power,
  RotateCcw,
  Sparkles,
  Save,
  Check,
  Disc,
  ArrowRight,
  Zap,
  Radio,
} from "lucide-react";
import { pedalboardDsp } from "../audio/pedalboardDsp";
import { audioEngine } from "../audio/audioContext";
import { DEFAULT_TONE_PRESETS } from "../data/presetsDatabase";
import { TonePreset, PedalConfig } from "../types";
import { savePresetToDB, loadPresetsFromDB } from "../utils/storage";

export const ToneStudio: React.FC = () => {
  const [presets, setPresets] = useState<TonePreset[]>(DEFAULT_TONE_PRESETS);
  const [activePreset, setActivePreset] = useState<TonePreset>(DEFAULT_TONE_PRESETS[0]);
  const [pedals, setPedals] = useState<PedalConfig[]>(DEFAULT_TONE_PRESETS[0].pedals);
  const [isLiveMic, setIsLiveMic] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  // Initialize DSP and load saved user presets from IndexedDB
  useEffect(() => {
    pedalboardDsp.init();
    loadPresetsFromDB().then((loaded) => {
      if (loaded.length > 0) {
        setPresets(loaded);
      }
    });
  }, []);

  // Update DSP graph when pedal parameters change
  useEffect(() => {
    pedalboardDsp.applyPedalConfig(pedals);
  }, [pedals]);

  // Audio visualizer loop for Tone Studio
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isMounted = true;
    let lastRenderTime = 0;

    const draw = (now: number) => {
      if (!isMounted) return;

      if (now - lastRenderTime >= 33) {
        lastRenderTime = now;
        const analyser = audioEngine.getMasterAnalyser();
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = "rgba(10, 12, 14, 0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = canvas.width / 36;
        let x = 0;

        for (let i = 0; i < 36; i++) {
          const binIndex = Math.floor(Math.pow(i / 36, 1.8) * (bufferLength / 3));
          const value = dataArray[binIndex] || 0;
          const percent = value / 255;
          const height = percent * canvas.height;

          ctx.fillStyle = `rgba(163, 255, 18, ${0.25 + percent * 0.75})`;
          ctx.fillRect(x, canvas.height - height, barWidth - 1.5, height);

          x += barWidth;
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      isMounted = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const handleSelectPreset = (preset: TonePreset) => {
    setActivePreset(preset);
    setPedals(JSON.parse(JSON.stringify(preset.pedals)));
  };

  const handleTogglePedal = (pedalId: string) => {
    setPedals((prev) =>
      prev.map((p) => (p.id === pedalId ? { ...p, enabled: !p.enabled } : p))
    );
  };

  const handleParamChange = (pedalId: string, paramKey: string, val: number | string) => {
    setPedals((prev) =>
      prev.map((p) => {
        if (p.id === pedalId) {
          return {
            ...p,
            params: {
              ...p.params,
              [paramKey]: val,
            },
          };
        }
        return p;
      })
    );
  };

  const toggleLiveMic = async () => {
    const nextState = !isLiveMic;
    const res = await pedalboardDsp.toggleLiveMicMonitoring(nextState);
    setIsLiveMic(res);
  };

  const handleSaveCustomPreset = async () => {
    const customName = prompt("Enter a name for your custom guitar rig preset:", `${activePreset.name} (Custom)`);
    if (!customName) return;

    const newPreset: TonePreset = {
      id: `custom-${Date.now()}`,
      name: customName,
      category: activePreset.category,
      description: "User customized guitar rig.",
      pedals: JSON.parse(JSON.stringify(pedals)),
    };

    await savePresetToDB(newPreset);
    setPresets((prev) => [...prev, newPreset]);
    setActivePreset(newPreset);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  return (
    <div id="panel-tone-studio" className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Tone Studio Header & Rig Selector */}
      <div className="frosted-card rounded-3xl p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <SlidersHorizontal className="w-5 h-5 text-[#a3ff12]" />
            <h2 className="text-xl font-extrabold text-white font-mono tracking-tight">
              TONE STUDIO & DSP SIGNAL CHAIN
            </h2>
            <span className="text-[10px] font-mono font-bold bg-[#a3ff12]/10 text-[#a3ff12] px-2 py-0.5 rounded border border-[#a3ff12]/30">
              64-BIT DSP
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            Real-time Waveshaper Distortion • Tube Tone Stack • Modulated Delay • Convolution Reverb
          </p>
        </div>

        {/* Live Guitar Input Switch & Preset Saver */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Live Mic Monitoring Button */}
          <button
            id="btn-tone-live-mic"
            onClick={toggleLiveMic}
            className={`flex items-center space-x-2 px-4 py-2 text-xs font-mono font-bold transition-all border rounded-xl cursor-pointer ${
              isLiveMic
                ? "bg-[#a3ff12] hover:bg-[#92eb10] text-black border-[#a3ff12] shadow-[0_0_20px_rgba(163,255,18,0.4)] animate-pulse"
                : "bg-white/5 border border-white/5 hover:border-white/10 text-zinc-300 hover:text-white"
            }`}
          >
            {isLiveMic ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-zinc-400" />}
            <span>{isLiveMic ? "LIVE INPUT ACTIVE" : "ENABLE LIVE GUITAR IN"}</span>
          </button>

          {/* Save Preset */}
          <button
            id="btn-tone-save-preset"
            onClick={handleSaveCustomPreset}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 text-xs font-mono text-zinc-300 hover:text-white cursor-pointer"
          >
            {saveSuccess ? <Check className="w-4 h-4 text-[#a3ff12]" /> : <Save className="w-4 h-4" />}
            <span>{saveSuccess ? "SAVED!" : "SAVE RIG"}</span>
          </button>
        </div>
      </div>

      {/* Preset Category Bar */}
      <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar pb-1">
        {presets.map((preset) => {
          const isSelected = activePreset.id === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              className={`px-4 py-2 rounded-xl text-xs font-mono transition-all whitespace-nowrap border cursor-pointer ${
                isSelected
                  ? "bg-white/10 text-[#a3ff12] border-[#a3ff12]/30 shadow-[0_0_15px_rgba(163,255,18,0.15)] font-bold"
                  : "bg-white/5 text-zinc-400 border border-white/5 hover:text-white hover:border-zinc-700"
              }`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      {/* Active Rig Visualizer Canvas */}
      <div className="frosted-card rounded-3xl p-4 flex items-center justify-between dot-matrix-bg">
        <div className="flex items-center space-x-3">
          <Disc className="w-5 h-5 text-[#a3ff12] animate-spin" style={{ animationDuration: "6s" }} />
          <div>
            <div className="text-sm font-mono font-bold text-white flex items-center gap-2">
              <span>{activePreset.name}</span>
              <span className="text-[10px] text-[#a3ff12] bg-[#a3ff12]/10 px-2 py-0.5 rounded border border-[#a3ff12]/20 font-semibold">
                {activePreset.category}
              </span>
            </div>
            <div className="text-[11px] font-mono text-zinc-400">
              {activePreset.description}
            </div>
          </div>
        </div>
        <div className="w-48 h-10 bg-[#0a0c0e]/60 rounded-xl border border-white/5 overflow-hidden hidden sm:block">
          <canvas ref={canvasRef} width={192} height={40} className="w-full h-full" />
        </div>
      </div>

      {/* Connected Left-to-Right Signal Path Rack */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono text-zinc-400 px-1">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[#a3ff12]" />
            <span className="text-white font-bold">SIGNAL CHAIN</span>
            <span className="text-zinc-500">• Left to right serial processing</span>
          </div>
          <div className="flex items-center space-x-2 text-[11px] text-zinc-500">
            <span>IN: 24-bit 48kHz</span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-600" />
            <span>OUT: Stereo Master</span>
          </div>
        </div>

        {/* Horizontal Signal Flow Grid / Cards with Connecting Elements */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {pedals.map((pedal, idx) => {
            return (
              <div
                key={pedal.id}
                id={`pedal-${pedal.type}`}
                className={`p-5 relative flex flex-col justify-between transition-all rounded-3xl border ${
                  pedal.enabled
                    ? "frosted-card border-[#a3ff12]/20 shadow-xl"
                    : "bg-white/5 border border-white/5 opacity-60"
                }`}
              >
                {/* Top Bar: Pedal Name, Stage Index & Bypass Switch */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2.5">
                    {/* LED Indicator */}
                    <div
                      className="w-2.5 h-2.5 rounded-full transition-all"
                      style={{
                        backgroundColor: pedal.enabled ? "#a3ff12" : "rgba(255,255,255,0.1)",
                        boxShadow: pedal.enabled ? "0 0 10px #a3ff12" : "none",
                      }}
                    />
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[10px] font-mono text-zinc-500 font-bold">0{idx + 1}</span>
                        <h3 className="font-mono font-bold text-sm text-white tracking-wide">
                          {pedal.name}
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400 uppercase">
                        {pedal.type}
                      </span>
                    </div>
                  </div>

                  {/* Stomp Switch */}
                  <button
                    id={`btn-stomp-${pedal.id}`}
                    onClick={() => handleTogglePedal(pedal.id)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold transition-all border cursor-pointer ${
                      pedal.enabled
                        ? "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_12px_rgba(163,255,18,0.3)]"
                        : "bg-white/5 text-zinc-400 border border-white/5 hover:text-white"
                    }`}
                  >
                    {pedal.enabled ? "ACTIVE" : "BYPASS"}
                  </button>
                </div>

                {/* Rotary Knobs & Sliders */}
                <div className="space-y-3.5 my-2">
                  {Object.entries(pedal.params).map(([key, val]) => {
                    if (typeof val === "boolean") return null;

                    if (key === "cabinet") {
                      return (
                        <div key={key} className="space-y-1">
                          <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
                            Cabinet Speaker IR
                          </label>
                          <select
                            value={val as string}
                            onChange={(e) => handleParamChange(pedal.id, key, e.target.value)}
                            className="w-full bg-[#0a0c0e]/80 text-xs font-mono text-white border border-white/10 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#a3ff12]"
                          >
                            <option value="4x12 Vintage" className="bg-[#13161a]">4x12 Vintage Celestion V30</option>
                            <option value="2x12 Open Back" className="bg-[#13161a]">2x12 Open Back Fender Tweed</option>
                            <option value="1x12 Tweed" className="bg-[#13161a]">1x12 Studio Direct Amp</option>
                          </select>
                        </div>
                      );
                    }

                    const numVal = val as number;
                    const isDb = key === "threshold";
                    const isMs = key === "time" || key === "attack" || key === "release";
                    const isHz = key === "rate";

                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                          <span className="uppercase tracking-wider">{key}</span>
                          <span className="text-white font-bold">
                            {numVal}
                            {isDb ? " dB" : isMs ? " ms" : isHz ? " Hz" : "%"}
                          </span>
                        </div>

                        <input
                          type="range"
                          min={key === "threshold" ? -70 : key === "rate" ? 0.2 : 0}
                          max={key === "threshold" ? 0 : key === "time" ? 1000 : key === "rate" ? 5 : 100}
                          step={key === "rate" ? 0.1 : 1}
                          value={numVal}
                          onChange={(e) =>
                             handleParamChange(
                               pedal.id,
                               key,
                               key === "rate" ? parseFloat(e.target.value) : parseInt(e.target.value, 10)
                             )
                          }
                          className="w-full h-1.5 bg-[#181c22] rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Pedal Chassis Status & Connector */}
                <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-white/5 text-[10px] font-mono text-zinc-500">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/10" />
                    IN
                  </span>
                  <span className="text-[#a3ff12]/70 uppercase font-semibold">STAGE 0{idx + 1}</span>
                  <span className="flex items-center gap-1">
                    OUT
                    <ArrowRight className="w-2.5 h-2.5 text-zinc-600" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* User Presets Vault Row */}
      <div className="space-y-3 pt-4">
        <div className="flex items-center justify-between text-xs font-mono text-zinc-400 px-1">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[#a3ff12]" />
            <span className="text-white font-bold">SAVED RIGS & FACTORY PRESETS</span>
          </div>
          <span className="text-zinc-500 font-mono text-[11px]">{presets.length} presets loaded</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {presets.map((preset) => {
            const isSelected = activePreset.id === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`p-4 cursor-pointer transition-all rounded-3xl ${
                  isSelected
                    ? "frosted-card-highlight"
                    : "frosted-card"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold text-[#a3ff12] bg-[#a3ff12]/10 px-2 py-0.5 rounded border border-[#a3ff12]/20">
                    {preset.category}
                  </span>
                  {isSelected && (
                    <span className="text-[10px] font-mono font-bold text-[#a3ff12] flex items-center gap-1">
                      <Check className="w-3 h-3" /> ACTIVE
                    </span>
                  )}
                </div>
                <h4 className="font-mono font-bold text-sm text-white mb-1">
                  {preset.name}
                </h4>
                <p className="text-xs text-zinc-400 font-mono line-clamp-2">
                  {preset.description}
                </p>
                <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-zinc-500">
                  <span>{preset.pedals.filter((p) => p.enabled).length} Active FX</span>
                  <span className="text-[#a3ff12] hover:underline font-semibold">Load Rig &rarr;</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
