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

        ctx.fillStyle = "rgba(5, 5, 5, 0.4)";
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
    <div id="panel-tone-studio" className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Tone Studio Header & Rig Selector */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 frosted-card p-5 rounded-2xl">
        <div>
          <div className="flex items-center space-x-2">
            <SlidersHorizontal className="w-5 h-5 text-[#a3ff12]" />
            <h2 className="text-xl font-bold text-white font-mono">
              PRO TONE STUDIO & DSP RIG
            </h2>
            <span className="text-[10px] font-mono font-bold bg-[#a3ff12]/15 text-[#a3ff12] px-2 py-0.5 rounded-full border border-[#a3ff12]/30">
              64-BIT DSP
            </span>
          </div>
          <p className="text-xs text-white/40 font-mono mt-0.5">
            Real-time Waveshaper Distortion • Tube Tone Stack • Modulated Delay • Convolution Reverb
          </p>
        </div>

        {/* Live Guitar Input Switch & Preset Saver */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Live Mic Monitoring Button */}
          <button
            id="btn-tone-live-mic"
            onClick={toggleLiveMic}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all shadow-md backdrop-blur-md ${
              isLiveMic
                ? "bg-[#a3ff12] text-black shadow-[0_0_20px_rgba(163,255,18,0.4)] animate-pulse"
                : "bg-white/5 text-white hover:bg-white/10 border border-white/10"
            }`}
          >
            {isLiveMic ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            <span>{isLiveMic ? "LIVE GUITAR INPUT ON" : "ENABLE LIVE GUITAR IN"}</span>
          </button>

          {/* Save Preset */}
          <button
            id="btn-tone-save-preset"
            onClick={handleSaveCustomPreset}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-white/80 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all backdrop-blur-md"
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
              className={`px-4 py-2 rounded-xl text-xs font-mono font-medium transition-all whitespace-nowrap border ${
                isSelected
                  ? "bg-white/10 text-[#a3ff12] border-[#a3ff12]/40 shadow-[0_0_15px_rgba(163,255,18,0.2)] font-bold"
                  : "bg-white/5 text-white/50 border-white/5 hover:text-white hover:bg-white/10"
              }`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      {/* Active Rig Visualizer Canvas */}
      <div className="frosted-card p-4 rounded-2xl flex items-center justify-between dot-matrix-bg">
        <div className="flex items-center space-x-3">
          <Disc className="w-5 h-5 text-[#a3ff12] animate-spin" style={{ animationDuration: "6s" }} />
          <div>
            <div className="text-sm font-mono font-bold text-white">
              {activePreset.name}
            </div>
            <div className="text-[11px] font-mono text-white/40">
              {activePreset.description}
            </div>
          </div>
        </div>
        <div className="w-48 h-10 bg-black/50 rounded-xl border border-white/10 overflow-hidden hidden sm:block">
          <canvas ref={canvasRef} width={192} height={40} className="w-full h-full" />
        </div>
      </div>

      {/* Virtual Pedalboard Rack (Pedal Stompboxes & Tube Amp) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {pedals.map((pedal) => {
          return (
            <div
              key={pedal.id}
              id={`pedal-${pedal.type}`}
              className={`p-5 rounded-2xl border transition-all relative flex flex-col justify-between backdrop-blur-xl ${
                pedal.enabled
                  ? "frosted-card border-white/15 shadow-xl"
                  : "bg-white/[0.02] border-white/5 opacity-60"
              }`}
            >
              {/* Top Bar: Pedal Name & Bypass LED */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div
                    className="w-3 h-3 rounded-full transition-all"
                    style={{
                      backgroundColor: pedal.enabled ? "#a3ff12" : "#333",
                      boxShadow: pedal.enabled ? "0 0 10px #a3ff12" : "none",
                    }}
                  />
                  <h3 className="font-mono font-bold text-sm text-white tracking-wide">
                    {pedal.name}
                  </h3>
                </div>

                {/* Stomp Switch */}
                <button
                  id={`btn-stomp-${pedal.id}`}
                  onClick={() => handleTogglePedal(pedal.id)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold transition-all border ${
                    pedal.enabled
                      ? "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_10px_#a3ff12]"
                      : "bg-white/5 text-white/40 border-white/10 hover:text-white"
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
                        <label className="text-[11px] font-mono text-white/40 uppercase tracking-wider block">
                          Cabinet Speaker IR
                        </label>
                        <select
                          value={val as string}
                          onChange={(e) => handleParamChange(pedal.id, key, e.target.value)}
                          className="w-full bg-black/40 text-xs font-mono text-white border border-white/10 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#a3ff12]/50"
                        >
                          <option value="4x12 Vintage">4x12 Vintage Celestion V30</option>
                          <option value="2x12 Open Back">2x12 Open Back Fender Tweed</option>
                          <option value="1x12 Tweed">1x12 Studio Direct Amp</option>
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
                      <div className="flex justify-between text-[11px] font-mono text-white/40">
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
                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Bottom Pedal Chassis Screws */}
              <div className="flex justify-between items-center mt-3 pt-2 border-t border-white/5 text-[10px] font-mono text-white/30">
                <span>IN &rarr; DSP</span>
                <span className="text-[#a3ff12]/70 uppercase font-semibold">{pedal.type}</span>
                <span>OUT &rarr;</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
