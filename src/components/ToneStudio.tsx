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
  ArrowLeft,
  Zap,
  Radio,
  Headphones,
  Sliders,
  HelpCircle,
  Activity,
} from "lucide-react";
import { pedalboardDsp } from "../audio/pedalboardDsp";
import { audioEngine } from "../audio/audioContext";
import { DEFAULT_TONE_PRESETS } from "../data/presetsDatabase";
import { TonePreset, PedalConfig } from "../types";
import { savePresetToDB, loadPresetsFromDB } from "../utils/storage";
import { CustomConfirmDialog } from "./ui/CustomConfirmDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export const ToneStudio: React.FC = () => {
  const [presets, setPresets] = useState<TonePreset[]>(DEFAULT_TONE_PRESETS);
  const [activePreset, setActivePreset] = useState<TonePreset>(DEFAULT_TONE_PRESETS[0]);
  const [pedals, setPedals] = useState<PedalConfig[]>(DEFAULT_TONE_PRESETS[0].pedals);
  const [isLiveMic, setIsLiveMic] = useState<boolean>(audioEngine.getIsMicActive());
  const [isMonitoring, setIsMonitoring] = useState<boolean>(audioEngine.getIsMonitoring());
  const [inputGainVal, setInputGainVal] = useState<number>(100);
  const [masterVolVal, setMasterVolVal] = useState<number>(85);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [inputDb, setInputDb] = useState<number>(-100);
  const [masterDb, setMasterDb] = useState<number>(-100);
  const [latencyMs, setLatencyMs] = useState<number>(4.2);
  const [activePedalId, setActivePedalId] = useState<string | null>(DEFAULT_TONE_PRESETS[0].pedals[0].id);
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    type?: "confirm" | "alert" | "error" | "success";
    showInput?: boolean;
    inputDefaultValue?: string;
    inputPlaceholder?: string;
    onConfirmWithInput?: (val: string) => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  // Initialize DSP and load saved user presets from IndexedDB
  useEffect(() => {
    pedalboardDsp.init();
    loadPresetsFromDB().then((loaded) => {
      if (loaded.length > 0) {
        setPresets((prev) => {
          const ids = new Set(loaded.map((l) => l.id));
          return [...loaded, ...prev.filter((p) => !ids.has(p.id))];
        });
      }
    });

    const ctx = audioEngine.getContext();
    const baseLatency = (ctx as any).baseLatency || 0.003;
    const outputLatency = (ctx as any).outputLatency || 0.002;
    const calcLatency = Number(((baseLatency + outputLatency) * 1000 + 1.2).toFixed(1));
    setLatencyMs(calcLatency > 0 ? calcLatency : 4.2);

    const unsubMic = audioEngine.subscribeMicStatus(setIsLiveMic);
    const unsubMon = audioEngine.subscribeMonitorStatus(setIsMonitoring);

    return () => {
      unsubMic();
      unsubMon();
      audioEngine.releaseInput("tone-studio");
    };
  }, []);

  // Update DSP graph when pedal parameters change
  useEffect(() => {
    pedalboardDsp.applyPedalConfig(pedals);
  }, [pedals]);

  // Audio visualizer and real-time dB meters loop
  useEffect(() => {
    const canvas = canvasRef.current;
    let isMounted = true;
    let lastRenderTime = 0;

    const draw = (now: number) => {
      if (!isMounted) return;

      if (now - lastRenderTime >= 30) {
        lastRenderTime = now;

        // 1. Get real input dB
        const inputLvl = audioEngine.getInputLevel();
        setInputDb(inputLvl.db);

        // 2. Get real master output dB and frequency spectrum
        const analyser = audioEngine.getMasterAnalyser();
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        // Calculate master RMS
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const norm = (dataArray[i] / 255);
          sumSquares += norm * norm;
        }
        const masterRms = Math.sqrt(sumSquares / bufferLength);
        const mDb = masterRms > 0.0001 ? 20 * Math.log10(masterRms) : -100;
        setMasterDb(mDb);

        // 3. Draw mini frequency spectrum
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "rgba(10, 12, 14, 0.4)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const barWidth = canvas.width / 32;
            let x = 0;

            for (let i = 0; i < 32; i++) {
              const binIndex = Math.floor(Math.pow(i / 32, 1.8) * (bufferLength / 3));
              const value = dataArray[binIndex] || 0;
              const percent = value / 255;
              const height = percent * canvas.height;

              ctx.fillStyle = `rgba(163, 255, 18, ${0.2 + percent * 0.8})`;
              ctx.fillRect(x, canvas.height - height, barWidth - 1.5, height);

              x += barWidth;
            }
          }
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
    const newPedals = JSON.parse(JSON.stringify(preset.pedals));
    setPedals(newPedals);
    if (newPedals.length > 0) {
      setActivePedalId(newPedals[0].id);
    }
  };

  const handleTogglePedal = (pedalId: string) => {
    setPedals((prev) =>
      prev.map((p) => (p.id === pedalId ? { ...p, enabled: !p.enabled } : p))
    );
  };

  const handleMovePedal = (index: number, direction: "left" | "right") => {
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= pedals.length) return;

    const newPedals = [...pedals];
    const temp = newPedals[index];
    newPedals[index] = newPedals[targetIndex];
    newPedals[targetIndex] = temp;
    setPedals(newPedals);
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

  const handleInputGainChange = (val: number) => {
    setInputGainVal(val);
    audioEngine.setInputGain(val / 100);
  };

  const handleMasterVolChange = (val: number) => {
    setMasterVolVal(val);
    audioEngine.setMasterVolume(val / 100);
  };

  const toggleLiveMic = async () => {
    try {
      if (isLiveMic) {
        audioEngine.releaseInput("tone-studio");
      } else {
        await audioEngine.acquireInput("tone-studio", { enableMonitoring: isMonitoring });
      }
    } catch (err) {
      setDialog({
        isOpen: true,
        title: "Microphone Access Required",
        message: "Microphone/audio input permission is required for real-time guitar tone processing.",
        confirmText: "OK",
        type: "alert",
        onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
      });
    }
  };

  const toggleMonitoring = async () => {
    await audioEngine.toggleMonitoring();
  };

  const handleSaveCustomPreset = async () => {
    setDialog({
      isOpen: true,
      title: "Save Custom Rig Preset",
      message: "Enter a custom name for your guitar signal chain and DSP parameters preset.",
      confirmText: "Save Preset",
      cancelText: "Cancel",
      showInput: true,
      inputDefaultValue: `${activePreset.name} (Custom)`,
      inputPlaceholder: "e.g., Warm British Crunch, Heavy Octafuzz...",
      onConfirm: () => {}, // Not used when onConfirmWithInput is defined
      onConfirmWithInput: async (customName) => {
        if (!customName.trim()) {
          setDialog((prev) => ({
            ...prev,
            title: "Name Required",
            message: "Please specify a name for your custom preset to save it.",
            type: "error",
            showInput: false,
          }));
          return;
        }

        const newPreset: TonePreset = {
          id: `custom-${Date.now()}`,
          name: customName.trim(),
          category: activePreset.category,
          description: "User customized signal chain and DSP parameters.",
          pedals: JSON.parse(JSON.stringify(pedals)),
        };

        await savePresetToDB(newPreset);
        setPresets((prev) => [newPreset, ...prev]);
        setActivePreset(newPreset);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        setDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  return (
    <div id="panel-tone-studio" className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Tone Studio Master Control Bar */}
      <div className="frosted-card rounded-3xl p-5 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <SlidersHorizontal className="w-5 h-5 text-[#a3ff12]" />
            <h2 className="text-xl font-extrabold text-white font-mono tracking-tight">
              TONE STUDIO & DSP SIGNAL CHAIN
            </h2>
            <span className="text-[10px] font-mono font-bold bg-[#a3ff12]/10 text-[#a3ff12] px-2 py-0.5 rounded border border-[#a3ff12]/30">
              64-BIT DSP • {latencyMs}ms
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            Reorderable modular pedalboard • Real-time waveshaping • Speaker IR convolution • Safe live monitoring
          </p>
        </div>

        {/* Level Controls & Live Hardware In */}
        <div className="flex flex-wrap items-center gap-3.5 w-full xl:w-auto">
          {/* Live In Level Meter */}
          <div className="flex items-center space-x-2 bg-white/5 border border-white/5 px-3 py-1.5 rounded-xl">
            <span className="text-[10px] font-mono text-zinc-400 font-bold">IN</span>
            <div className="w-16 h-2 bg-black/50 rounded-full overflow-hidden flex items-center p-0.5">
              <div
                className="h-full rounded-full transition-all duration-75"
                style={{
                  width: `${Math.min(100, Math.max(0, (inputDb + 60) * 1.66))}%`,
                  backgroundColor: inputDb > -6 ? "#ef4444" : inputDb > -18 ? "#eab308" : "#a3ff12",
                }}
              />
            </div>
            <span className="text-[9px] font-mono text-zinc-400">{inputDb > -90 ? `${inputDb.toFixed(0)}dB` : "--"}</span>
          </div>

          {/* Master Out Level Meter */}
          <div className="flex items-center space-x-2 bg-white/5 border border-white/5 px-3 py-1.5 rounded-xl">
            <span className="text-[10px] font-mono text-zinc-400 font-bold">OUT</span>
            <div className="w-16 h-2 bg-black/50 rounded-full overflow-hidden flex items-center p-0.5">
              <div
                className="h-full rounded-full transition-all duration-75"
                style={{
                  width: `${Math.min(100, Math.max(0, (masterDb + 60) * 1.66))}%`,
                  backgroundColor: masterDb > -3 ? "#ef4444" : masterDb > -12 ? "#eab308" : "#a3ff12",
                }}
              />
            </div>
            <span className="text-[9px] font-mono text-zinc-400">{masterDb > -90 ? `${masterDb.toFixed(0)}dB` : "--"}</span>
          </div>

          {/* Safe Live Monitoring Headphone Switch */}
          <button
            id="btn-tone-monitor"
            onClick={toggleMonitoring}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer ${
              isMonitoring
                ? "bg-[#a3ff12]/20 text-[#a3ff12] border-[#a3ff12] shadow-[0_0_15px_rgba(163,255,18,0.25)]"
                : "bg-white/5 border-white/5 text-zinc-400 hover:text-white"
            }`}
            title="Listen to processed guitar tone live (Use headphones to avoid acoustic feedback)"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>{isMonitoring ? "MONITOR ON" : "MONITOR OFF"}</span>
          </button>

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
            <span>{isLiveMic ? "LIVE INPUT ACTIVE" : "ENABLE GUITAR IN"}</span>
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

      {/* Preset Category Selector */}
      <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar pb-1">
        {presets.map((preset) => {
          const isSelected = activePreset.id === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              className={`px-4 py-2 rounded-xl text-xs font-mono transition-all whitespace-nowrap border cursor-pointer ${
                isSelected
                  ? "bg-white/10 text-[#a3ff12] border-[#a3ff12]/40 shadow-[0_0_15px_rgba(163,255,18,0.15)] font-bold"
                  : "bg-white/5 text-zinc-400 border border-white/5 hover:text-white hover:border-zinc-700"
              }`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      {/* Active Rig Banner with Live Oscilloscope Canvas */}
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

        {/* Sliders for Input Gain & Master Volume */}
        <div className="hidden md:flex items-center space-x-6 pr-2">
          <div className="space-y-1 w-28">
            <div className="flex justify-between text-[10px] font-mono text-zinc-400">
              <span>INPUT GAIN</span>
              <span className="text-white font-bold">{inputGainVal}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              value={inputGainVal}
              onChange={(e) => handleInputGainChange(parseInt(e.target.value, 10))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
            />
          </div>

          <div className="space-y-1 w-28">
            <div className="flex justify-between text-[10px] font-mono text-zinc-400">
              <span>MASTER VOL</span>
              <span className="text-white font-bold">{masterVolVal}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={masterVolVal}
              onChange={(e) => handleMasterVolChange(parseInt(e.target.value, 10))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
            />
          </div>

          <div className="w-40 h-10 bg-[#0a0c0e]/80 rounded-xl border border-white/5 overflow-hidden">
            <canvas ref={canvasRef} width={160} height={40} className="w-full h-full" />
          </div>
        </div>
      </div>

      {/* Reorderable Signal Chain Rack */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono text-zinc-400 px-1">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[#a3ff12]" />
            <span className="text-white font-bold">SIGNAL CHAIN</span>
            <span className="text-zinc-500">• Reorderable serial processing rack</span>
          </div>
          <div className="flex items-center space-x-2 text-[11px] text-zinc-500">
            <span>IN: High-Z / Mic</span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-600" />
            <span>OUT: 24-bit Stereo Master</span>
          </div>
        </div>

        {/* Signal Flow Horizontal Chain */}
        <div className="flex overflow-x-auto gap-4 py-4 px-2 no-scrollbar items-center border border-white/5 bg-[#0b0e14] rounded-3xl shadow-inner relative">
          {pedals.map((pedal, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === pedals.length - 1;
            const isActiveNode = activePedalId === pedal.id;

            return (
              <div key={pedal.id} className="flex items-center shrink-0">
                <div
                  id={`pedal-${pedal.type}`}
                  onClick={() => setActivePedalId(pedal.id)}
                  className={`w-36 h-48 relative flex flex-col justify-between transition-all rounded-2xl border p-4 cursor-pointer select-none ${
                    pedal.enabled
                      ? "bg-gradient-to-b from-[#1c2128] to-[#12151d] border-white/10 shadow-lg"
                      : "bg-[#0b0d10] border-white/5 opacity-50"
                  } ${isActiveNode ? "ring-2 ring-[#a3ff12]/50 border-[#a3ff12] shadow-[0_0_20px_rgba(163,255,18,0.15)]" : ""}`}
                >
                  {/* Top Bar: LED & Name */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-2 h-2 rounded-full transition-all"
                        style={{
                          backgroundColor: pedal.enabled ? "#a3ff12" : "rgba(255,255,255,0.1)",
                          boxShadow: pedal.enabled ? "0 0 10px #a3ff12" : "none",
                        }}
                      />
                      <span className="text-[9px] font-mono text-zinc-500 font-bold">0{idx + 1}</span>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <h3 className="font-mono font-bold text-xs text-white tracking-wide">
                      {pedal.name}
                    </h3>
                    <span className="text-[9px] font-mono text-zinc-500 uppercase mt-1">
                      {pedal.type}
                    </span>
                  </div>

                  {/* Stomp Switch */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleTogglePedal(pedal.id); }}
                    className={`mt-4 w-10 h-10 mx-auto rounded-full border-4 flex items-center justify-center transition-all ${
                      pedal.enabled
                        ? "bg-zinc-800 border-[#a3ff12]/50 shadow-[0_0_15px_rgba(163,255,18,0.4)]"
                        : "bg-zinc-900 border-zinc-800"
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full ${pedal.enabled ? 'bg-zinc-300' : 'bg-zinc-700'}`} />
                  </button>
                </div>
                
                {/* Arrow to Next */}
                {!isLast && (
                  <div className="w-8 flex items-center justify-center text-zinc-700 mx-2">
                    <ArrowRight className="w-5 h-5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Selected Pedal Controls Panel */}
        {(() => {
          const activePedal = pedals.find(p => p.id === activePedalId);
          if (!activePedal) return null;
          const pedalIdx = pedals.findIndex(p => p.id === activePedalId);

          return (
            <div className="mt-6 bg-[#11141a] border border-white/10 rounded-3xl p-6 shadow-xl relative animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-mono font-bold text-zinc-400">
                    0{pedalIdx + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-mono font-bold text-white tracking-wide">{activePedal.name}</h3>
                    <p className="text-[10px] font-mono text-[#a3ff12] uppercase tracking-wider">{activePedal.type} MODULE</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                   <button
                    disabled={pedalIdx === 0}
                    onClick={() => handleMovePedal(pedalIdx, "left")}
                    className={`p-2 rounded-xl text-xs font-mono border transition-all ${
                      pedalIdx === 0
                        ? "opacity-20 text-zinc-600 border-transparent cursor-not-allowed"
                        : "bg-white/5 text-zinc-400 hover:text-white border-white/5 hover:border-white/20 cursor-pointer"
                    }`}
                    title="Move Left in Signal Chain"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={pedalIdx === pedals.length - 1}
                    onClick={() => handleMovePedal(pedalIdx, "right")}
                    className={`p-2 rounded-xl text-xs font-mono border transition-all ${
                      pedalIdx === pedals.length - 1
                        ? "opacity-20 text-zinc-600 border-transparent cursor-not-allowed"
                        : "bg-white/5 text-zinc-400 hover:text-white border-white/5 hover:border-white/20 cursor-pointer"
                    }`}
                    title="Move Right in Signal Chain"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <div className="w-px h-6 bg-white/10 mx-2" />
                  <button
                    onClick={() => handleTogglePedal(activePedal.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer ${
                      activePedal.enabled
                        ? "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_12px_rgba(163,255,18,0.3)]"
                        : "bg-white/5 text-zinc-400 border border-white/5 hover:text-white"
                    }`}
                  >
                    {activePedal.enabled ? "ACTIVE" : "BYPASSED"}
                  </button>
                </div>
              </div>

              {/* Parameter Controls Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Object.entries(activePedal.params).map(([key, val]) => {
                  if (typeof val === "boolean") return null;

                  if (key === "cabinet") {
                    return (
                      <div key={key} className="space-y-2">
                        <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
                          Cabinet Speaker IR
                        </label>
                        <Select
                          value={val as string}
                          onValueChange={(newVal) => handleParamChange(activePedal.id, key, newVal)}
                        >
                          <SelectTrigger className="h-11 text-xs font-mono px-4 bg-black/40 border-white/10 rounded-xl focus:border-[#a3ff12]">
                            <SelectValue placeholder="Cabinet IR" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="4x12 Vintage">4x12 Vintage Celestion V30</SelectItem>
                            <SelectItem value="2x12 Open Back">2x12 Open Back Fender Tweed</SelectItem>
                            <SelectItem value="1x12 Tweed">1x12 Studio Direct Amp</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  }

                  const numVal = val as number;
                  const isDb = key === "threshold";
                  const isMs = key === "time" || key === "attack" || key === "release";
                  const isHz = key === "rate";

                  return (
                    <div key={key} className="space-y-2 bg-black/20 p-4 rounded-2xl border border-white/5">
                      <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
                        <span className="uppercase tracking-wider">{key}</span>
                        <span className="text-white font-bold bg-white/5 px-2 py-1 rounded-lg">
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
                            activePedal.id,
                            key,
                            key === "rate" ? parseFloat(e.target.value) : parseInt(e.target.value, 10)
                          )
                        }
                        className="w-full h-2 bg-[#181c22] rounded-lg appearance-none cursor-pointer accent-[#a3ff12] mt-2"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
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

      <CustomConfirmDialog
        isOpen={dialog.isOpen}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        type={dialog.type}
        showInput={dialog.showInput}
        inputDefaultValue={dialog.inputDefaultValue}
        inputPlaceholder={dialog.inputPlaceholder}
        onConfirm={dialog.onConfirm || (() => {})}
        onConfirmWithInput={dialog.onConfirmWithInput}
        onCancel={() => setDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
