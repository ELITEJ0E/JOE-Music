import React, { useState, useEffect } from "react";
import { Clock, Play, Square, Volume2, Sparkles, Sliders, Music } from "lucide-react";
import { transport } from "../audio/transport";
import { drumEngine, DrumStyle, DrumPatternConfig, PRESET_DRUM_PATTERNS } from "../audio/drumEngine";

export const DrumMetronome: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(transport.getState().isPlaying);
  const [bpm, setBpm] = useState(transport.getState().bpm);
  const [activePresetName, setActivePresetName] = useState<DrumStyle>("Rock 4/4");
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [metronomeOnly, setMetronomeOnly] = useState<boolean>(false);
  const [drumVolume, setDrumVolume] = useState<number>(85);

  useEffect(() => {
    const unsubStep = drumEngine.subscribeStep((step) => setCurrentStep(step));
    const unsubTransport = transport.subscribe((state) => {
      setIsPlaying(state.isPlaying);
      setBpm(state.bpm);
      drumEngine.setBpm(state.bpm);
    });
    
    // Sync initial state
    drumEngine.setBpm(transport.getState().bpm);
    
    return () => {
      unsubStep();
      unsubTransport();
    };
  }, []);
  
  // React to play/stop changes
  useEffect(() => {
    if (isPlaying) {
      drumEngine.start();
    } else {
      drumEngine.stop();
      setCurrentStep(0);
    }
  }, [isPlaying]);

  const handleTogglePlay = () => {
    transport.togglePlay();
  };

  const handleSelectPreset = (style: DrumStyle) => {
    setActivePresetName(style);
    drumEngine.setPattern(style);
  };

  const handleBpmChange = (newBpm: number) => {
    transport.setBpm(newBpm);
  };

  const pattern = drumEngine.getCurrentPattern();
  const instruments: Array<{ key: "kick" | "snare" | "hihatClosed" | "hihatOpen" | "crash" | "ride" | "tom"; label: string }> = [
    { key: "kick", label: "Kick Drum" },
    { key: "snare", label: "Snare Drum" },
    { key: "hihatClosed", label: "Closed Hat" },
    { key: "hihatOpen", label: "Open Hat" },
    { key: "crash", label: "Crash Cymbal" },
    { key: "ride", label: "Ride Bell" },
    { key: "tom", label: "Low Tom" },
  ];

  return (
    <div id="panel-drum-metronome" className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Header & Main Metronome Transport */}
      <div className="frosted-card rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <Clock className="w-5 h-5 text-[#a3ff12]" />
            <h2 className="text-xl font-extrabold text-white font-mono tracking-tight">
              DRUM MACHINE & PRECISION METRONOME
            </h2>
          </div>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            Lookahead Web Audio Scheduler • Step Sequencer & Real Drum Synthesis
          </p>
        </div>

        {/* Play/Stop & Metronome Mode Toggle */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Metronome Only Toggle */}
          <button
            onClick={() => {
              const next = !metronomeOnly;
              setMetronomeOnly(next);
              drumEngine.setMetronomeOnly(next);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold border transition-colors cursor-pointer ${
              metronomeOnly
                ? "bg-white/10 text-[#a3ff12] border-[#a3ff12]/50 shadow-[0_0_12px_rgba(163,255,18,0.15)]"
                : "bg-white/5 text-zinc-400 border border-white/5 hover:text-white"
            }`}
          >
            {metronomeOnly ? "CLICK ONLY (ACTIVE)" : "FULL DRUM KIT"}
          </button>

          {/* Master Start / Stop Button */}
          <button
            id="btn-drum-play-toggle"
            onClick={handleTogglePlay}
            className={`flex items-center space-x-2 px-6 py-2.5 text-xs font-mono font-bold transition-all border cursor-pointer ${
              isPlaying
                ? "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_20px_rgba(163,255,18,0.3)]"
                : "bg-white/5 hover:bg-white/10 text-zinc-300 border-white/5 hover:border-white/10"
            }`}
          >
            {isPlaying ? <Square className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-current text-[#a3ff12]" />}
            <span>{isPlaying ? "STOP GROOVE" : "START GROOVE"}</span>
          </button>
        </div>
      </div>

      {/* BPM & Pendulum Beat Visualizer */}
      <div className="frosted-card rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 dot-matrix-bg">
        <div className="flex items-center space-x-6 w-full md:w-auto">
          {/* Big BPM Counter */}
          <div>
            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">TEMPO</div>
            <div className="text-4xl font-extrabold font-mono text-[#a3ff12]">
              {bpm} <span className="text-sm text-zinc-400 font-normal">BPM</span>
            </div>
          </div>

          <input
            type="range"
            min={40}
            max={260}
            value={bpm}
            onChange={(e) => handleBpmChange(parseInt(e.target.value, 10))}
            className="w-40 sm:w-56 h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
          />
        </div>

        {/* 16-Step LED Beat Runner */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 overflow-x-auto p-2 bg-white/5 rounded-xl border border-white/5">
          {Array.from({ length: pattern.stepsCount || 16 }).map((_, stepIdx) => {
            const isDownbeat = stepIdx % 4 === 0;
            const isCurrent = isPlaying && currentStep === stepIdx;

            return (
              <div
                key={stepIdx}
                className={`w-3.5 h-8 rounded-sm transition-all flex flex-col justify-end ${
                  isCurrent
                    ? "bg-[#a3ff12] shadow-[0_0_12px_#a3ff12] scale-110"
                    : isDownbeat
                    ? "bg-white/20 border border-white/30"
                    : "bg-white/5"
                }`}
              >
                {isDownbeat && (
                  <div className="w-full h-1 bg-[#a3ff12]/50 rounded-t-sm" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Preset Grooves Bar */}
      <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar pb-1">
        {(Object.keys(PRESET_DRUM_PATTERNS) as DrumStyle[]).map((styleName) => {
          const isSelected = activePresetName === styleName;
          return (
            <button
              key={styleName}
              onClick={() => handleSelectPreset(styleName)}
              className={`px-4 py-2 rounded-xl text-xs font-mono transition-all whitespace-nowrap border cursor-pointer ${
                isSelected
                  ? "bg-white/10 text-[#a3ff12] border-[#a3ff12]/50 shadow-[0_0_15px_rgba(163,255,18,0.15)] font-bold"
                  : "bg-white/5 text-zinc-400 border border-white/5 hover:text-white hover:border-zinc-700"
              }`}
            >
              {styleName}
            </button>
          );
        })}
      </div>

      {/* Matrix Sequencer Grid */}
      <div className="frosted-card rounded-3xl p-6 space-y-4 overflow-x-auto">
        <div className="min-w-[680px] space-y-2.5">
          {instruments.map((inst) => {
            return (
              <div
                key={inst.key}
                className="grid grid-cols-[140px_repeat(16,1fr)] items-center gap-1.5 bg-white/5 p-2.5 rounded-xl border border-white/5"
              >
                {/* Instrument Name */}
                <div className="font-mono font-bold text-xs text-zinc-300 capitalize pr-2">
                  {inst.label}
                </div>

                {/* Step Buttons */}
                {Array.from({ length: 16 }).map((_, stepIdx) => {
                  const stepObj = pattern.steps[stepIdx % pattern.steps.length];
                  const isActive = stepObj ? Boolean(stepObj[inst.key]) : false;
                  const isCurrent = isPlaying && currentStep === (stepIdx % (pattern.stepsCount || 16));
                  const isDownbeat = stepIdx % 4 === 0;

                  return (
                    <button
                      key={stepIdx}
                      onClick={() => drumEngine.toggleInstrumentStep(inst.key, stepIdx % pattern.steps.length)}
                      className={`h-9 rounded-lg transition-all border font-mono text-[9px] font-bold cursor-pointer ${
                        isActive
                          ? isCurrent
                            ? "bg-white text-black border-white shadow-[0_0_15px_white] scale-105"
                            : "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_8px_rgba(163,255,18,0.4)]"
                          : isCurrent
                          ? "bg-[#a3ff12]/25 border-[#a3ff12]"
                          : isDownbeat
                          ? "bg-white/10 border-white/15 text-zinc-400 hover:bg-white/15"
                          : "bg-white/5 border-white/5 text-zinc-500 hover:bg-white/10"
                      }`}
                    >
                      {stepIdx + 1}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
