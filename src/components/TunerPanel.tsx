import React, { useEffect, useState, useRef } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  Activity,
  Music,
} from "lucide-react";
import { audioEngine } from "../audio/audioContext";
import { analyzePitchFrame } from "../audio/pitchDetector";
import { guitarSynth } from "../audio/guitarSynth";
import { GUITAR_TUNINGS } from "../data/tuningsDatabase";
import { GuitarTuning, TunerResult } from "../types";
import { CustomConfirmDialog } from "./ui/CustomConfirmDialog";

const BASS_TUNINGS: GuitarTuning[] = [
  {
    name: "Standard Bass (EADG)",
    notes: ["E1", "A1", "D2", "G2"],
    frequencies: [41.20, 55.00, 73.42, 98.00],
    description: "Standard 4-string bass guitar tuning.",
  },
  {
    name: "Drop D Bass (DADG)",
    notes: ["D1", "A1", "D2", "G2"],
    frequencies: [36.71, 55.00, 73.42, 98.00],
    description: "Drop D tuning for heavy bass tones.",
  },
  {
    name: "5-String Bass (BEADG)",
    notes: ["B0", "E1", "A1", "D2", "G2"],
    frequencies: [30.87, 41.20, 55.00, 73.42, 98.00],
    description: "Standard 5-string bass tuning.",
  }
];

const UKULELE_TUNINGS: GuitarTuning[] = [
  {
    name: "Standard Ukulele (GCEA)",
    notes: ["G4", "C4", "E4", "A4"],
    frequencies: [392.00, 261.63, 329.63, 440.00],
    description: "Standard high-G ukulele tuning.",
  }
];

const CHROMATIC_DUMMY: GuitarTuning = {
  name: "Chromatic Mode",
  notes: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  frequencies: [261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.00, 415.30, 440.00, 466.16, 493.88],
  description: "Free chromatic tuning mode - play any note freely."
};

export const TunerPanel: React.FC = () => {
  const [selectedInstrument, setSelectedInstrument] = useState<"Guitar" | "Bass" | "Ukulele" | "Chromatic">("Guitar");
  const [selectedTuning, setSelectedTuning] = useState<GuitarTuning>(GUITAR_TUNINGS[0]);
  const [activeCategory, setActiveCategory] = useState<"All" | "Standard" | "Drops" | "Opens" | "Down">("All");
  const [isListening, setIsListening] = useState(false);
  const [tunerData, setTunerData] = useState<TunerResult | null>(null);
  const [smoothedCents, setSmoothedCents] = useState<number>(0);
  const [smoothedFreq, setSmoothedFreq] = useState<number>(0);
  const [playingRefToneIdx, setPlayingRefToneIdx] = useState<number | null>(null);
  const [lockedStringIdx, setLockedStringIdx] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    type?: "confirm" | "alert" | "error" | "success";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const stopToneRef = useRef<(() => void) | null>(null);
  const animRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array | null>(null);
  const centsSmoothRef = useRef<number>(0);
  const freqSmoothRef = useRef<number>(0);

  // Clean unmount release and force monitor gain to 0 immediately on mount
  useEffect(() => {
    const ctx = audioEngine.getContext();
    audioEngine.getMonitorGainNode().gain.setValueAtTime(0.0, ctx.currentTime);
    return () => {
      audioEngine.releaseInput("tuner");
      if (stopToneRef.current) stopToneRef.current();
    };
  }, []);

  // Update active tuning list and selection when changing instrument
  useEffect(() => {
    if (selectedInstrument === "Guitar") {
      setSelectedTuning(GUITAR_TUNINGS[0]);
    } else if (selectedInstrument === "Bass") {
      setSelectedTuning(BASS_TUNINGS[0]);
    } else if (selectedInstrument === "Ukulele") {
      setSelectedTuning(UKULELE_TUNINGS[0]);
    } else {
      setSelectedTuning(CHROMATIC_DUMMY);
    }
    setLockedStringIdx(null);
  }, [selectedInstrument]);

  // Active tuning reference depending on selection
  const activeTuning = selectedTuning;

  // Filter tunings based on selected category (Guitar only)
  const filteredTunings = (() => {
    if (selectedInstrument === "Bass") return BASS_TUNINGS;
    if (selectedInstrument === "Ukulele") return UKULELE_TUNINGS;
    if (selectedInstrument === "Chromatic") return [CHROMATIC_DUMMY];
    
    return GUITAR_TUNINGS.filter((tuning) => {
      if (activeCategory === "All") return true;
      if (activeCategory === "Standard") return tuning.name.includes("Standard");
      if (activeCategory === "Drops") return tuning.name.includes("Drop");
      if (activeCategory === "Opens") return tuning.name.includes("Open") || tuning.name.includes("Celtic") || tuning.name.includes("DADGAD");
      if (activeCategory === "Down") return tuning.name.includes("Down") || tuning.name.includes("Step");
      return true;
    });
  })();

  // Main real-time pitch detection
  useEffect(() => {
    if (!isListening) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      setTunerData(null);
      centsSmoothRef.current = 0;
      setSmoothedCents(0);
      setSmoothedFreq(0);
      audioEngine.releaseInput("tuner");
      return;
    }

    let isMounted = true;
    const ctx = audioEngine.getContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    const buffer = new Float32Array(analyser.fftSize);
    bufferRef.current = buffer;

    audioEngine.getMonitorGainNode().gain.setValueAtTime(0.0, ctx.currentTime);
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    audioEngine
      .acquireInput("tuner", { enableMonitoring: false })
      .then(({ source }) => {
        if (!isMounted) return;
        sourceNode = source;
        source.connect(analyser);
      })
      .catch((err) => {
        console.warn("Tuner mic connection error:", err);
        setIsListening(false);
      });

    let lastDetectTime = 0;
    let lastFrequency = 0;

    const loop = (currentTime: number) => {
      if (!isMounted) return;

      if (currentTime - lastDetectTime >= 30) {
        lastDetectTime = currentTime;

        if (analyserRef.current && bufferRef.current) {
          analyserRef.current.getFloatTimeDomainData(bufferRef.current);

          const targetFreqs = activeTuning.frequencies;
          const result = analyzePitchFrame(
            bufferRef.current,
            ctx.sampleRate,
            targetFreqs,
            440,
            lastFrequency
          );

          if (result) {
            lastFrequency = result.frequency;
            if (lockedStringIdx !== null && activeTuning.frequencies[lockedStringIdx]) {
              const stringFreq = activeTuning.frequencies[lockedStringIdx];
              result.stringIndex = lockedStringIdx;
              result.targetFrequency = stringFreq;
              result.cents = 1200 * Math.log2(result.frequency / stringFreq);
              result.inTune = Math.abs(result.cents) <= 3;
            }

            // Exponential smoothing for steady, jitter-free needle
            centsSmoothRef.current = centsSmoothRef.current * 0.70 + result.cents * 0.30;
            freqSmoothRef.current = freqSmoothRef.current === 0
              ? result.frequency
              : freqSmoothRef.current * 0.75 + result.frequency * 0.25;

            setSmoothedCents(centsSmoothRef.current);
            setSmoothedFreq(freqSmoothRef.current);
            setTunerData(result);
          } else {
            // Slowly decay needle towards center when note releases
            centsSmoothRef.current *= 0.90;
            setSmoothedCents(centsSmoothRef.current);
          }
        }
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      isMounted = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (sourceNode) {
        try {
          sourceNode.disconnect();
        } catch (_) {}
      }
    };
  }, [isListening, activeTuning, lockedStringIdx]);

  const toggleListening = async () => {
    if (!isListening) {
      try {
        const ctx = audioEngine.getContext();
        audioEngine.getMonitorGainNode().gain.setValueAtTime(0.0, ctx.currentTime);
        await audioEngine.acquireInput("tuner", { enableMonitoring: false });
        setIsListening(true);
      } catch (err) {
        setDialog({
          isOpen: true,
          title: "Microphone Access Required",
          message: "Please authorize microphone access to use the high-accuracy guitar tuner.",
          confirmText: "OK",
          type: "alert",
          onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
        });
      }
    } else {
      setIsListening(false);
      audioEngine.releaseInput("tuner");
    }
  };

  const handlePlayStringTone = (note: string, idx: number) => {
    if (playingRefToneIdx === idx) {
      if (stopToneRef.current) stopToneRef.current();
      setPlayingRefToneIdx(null);
      return;
    }

    if (stopToneRef.current) stopToneRef.current();
    const freq = activeTuning.frequencies[idx] || 440;
    const stopFn = guitarSynth.playReferenceTone(freq, 2.5);
    stopToneRef.current = stopFn;
    setPlayingRefToneIdx(idx);

    setTimeout(() => {
      setPlayingRefToneIdx((curr) => (curr === idx ? null : curr));
    }, 2500);
  };

  const displayNote = tunerData ? tunerData.note : activeTuning.notes[lockedStringIdx ?? 0] || "E";
  const displayCents = tunerData ? smoothedCents : 0;
  const isInTune = tunerData ? Math.abs(smoothedCents) <= 3 : false;
  const activeString = tunerData?.stringIndex ?? lockedStringIdx ?? 0;

  // Arc meter calculation (-50 to +50 cents mapped to -60deg to +60deg)
  const clampedCents = Math.max(-50, Math.min(50, displayCents));
  const needleRotation = (clampedCents / 50) * 60;

  return (
    <div id="panel-precision-tuner" className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Header Controls */}
      <div className="frosted-card rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <Activity className="w-5 h-5 text-[#a3ff12]" />
            <h1 className="text-xl font-extrabold text-white font-mono tracking-tight">
              CHROMATIC WORKSTATION TUNER
            </h1>
          </div>
          <p className="text-xs font-mono text-zinc-400 mt-1">
            Standard 440Hz reference tuning • Dynamic string detection
          </p>
        </div>

        <button
          id="btn-tuner-activate"
          onClick={toggleListening}
          className={`px-5 py-2.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 border transition-all cursor-pointer ${
            isListening
              ? "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_20px_rgba(163,255,18,0.35)]"
              : "bg-white/5 text-zinc-300 hover:text-white border-white/10 hover:border-white/20"
          }`}
        >
          {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-zinc-400" />}
          <span>{isListening ? "TUNER ON" : "ACTIVATE TUNER"}</span>
        </button>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Left Column: Tuner Arc Gauge */}
        <div className="md:col-span-8 frosted-card rounded-3xl p-6 flex flex-col items-center justify-between min-h-[420px] relative overflow-hidden">
          {/* Top Info Tag */}
          <div className="w-full flex items-center justify-between border-b border-white/5 pb-3">
            <span className="text-xs font-mono font-bold text-zinc-300">
              {activeTuning.name}
            </span>
            <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${
              isInTune
                ? "bg-[#a3ff12]/20 text-[#a3ff12] border-[#a3ff12]"
                : tunerData
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : "bg-white/5 text-zinc-400 border-white/10"
            }`}>
              {tunerData ? (isInTune ? "IN TUNE" : `${displayCents > 0 ? "+" : ""}${displayCents.toFixed(1)}¢`) : "READY"}
            </span>
          </div>

          {/* Radial Arc Meter Graphic */}
          <div className="relative w-full max-w-[340px] h-[210px] flex items-center justify-center my-2">
            <svg viewBox="0 0 300 180" className="w-full h-full">
              {/* Center in-tune highlight zone */}
              <path
                d="M 142 30 A 130 130 0 0 1 158 30 L 154 160 A 10 10 0 0 0 146 160 Z"
                fill={isInTune ? "rgba(163, 255, 18, 0.15)" : "transparent"}
              />

              {/* Arc background graduated ticks */}
              {Array.from({ length: 11 }).map((_, i) => {
                const angle = -50 + i * 10;
                const rad = (angle - 90) * (Math.PI / 180);
                const isCenter = i === 5;
                const r1 = 120;
                const r2 = isCenter ? 144 : 132;
                const x1 = 150 + r1 * Math.cos(rad);
                const y1 = 160 + r1 * Math.sin(rad);
                const x2 = 150 + r2 * Math.cos(rad);
                const y2 = 160 + r2 * Math.sin(rad);

                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isCenter ? "#a3ff12" : "rgba(255, 255, 255, 0.2)"}
                    strokeWidth={isCenter ? 3.5 : 1.5}
                  />
                );
              })}

              {/* Needle Indicator */}
              <g
                style={{
                  transform: `rotate(${needleRotation}deg)`,
                  transformOrigin: "150px 160px",
                  transition: "transform 0.08s linear",
                }}
              >
                <line
                  x1="150"
                  y1="160"
                  x2="150"
                  y2="28"
                  stroke="#a3ff12"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <circle cx="150" cy="160" r="6" fill="#a3ff12" />
              </g>
            </svg>

            {/* Note Center Display */}
            <div className="absolute inset-x-0 bottom-1 flex flex-col items-center justify-center pointer-events-none">
              <span
                className={`text-6xl font-black tracking-tighter transition-all duration-150 ${
                  isInTune
                    ? "text-[#a3ff12] drop-shadow-[0_0_20px_rgba(163,255,18,0.8)]"
                    : "text-white"
                }`}
              >
                {displayNote}
              </span>
              <span className="text-xs font-mono text-zinc-400 font-bold mt-1">
                {tunerData?.frequency ? `${smoothedFreq.toFixed(1)} Hz` : "-- Hz"}
              </span>
            </div>
          </div>

          {/* String Selection Pill Bar */}
          <div className="w-full space-y-2 pt-3 border-t border-white/5">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span>REFERENCE TONER (CLICK TO EMIT NOTE):</span>
            </div>

            <div className="flex items-center justify-center gap-1.5 overflow-x-auto pb-1">
              {activeTuning.notes.map((note, idx) => {
                const isActive = selectedInstrument !== "Chromatic" && activeString === idx;
                const isPlaying = playingRefToneIdx === idx;

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      if (lockedStringIdx === idx) {
                        setLockedStringIdx(null);
                      } else {
                        setLockedStringIdx(idx);
                      }
                      handlePlayStringTone(note, idx);
                    }}
                    className={`flex-1 min-w-[45px] py-2 px-1 rounded-xl text-xs font-mono font-bold flex flex-col items-center justify-center transition-all cursor-pointer border ${
                      isActive
                        ? "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_12px_rgba(163,255,18,0.3)]"
                        : "bg-white/5 text-zinc-300 hover:text-white border-white/5 hover:border-white/10"
                    }`}
                  >
                    <span className="text-sm font-extrabold">{note}</span>
                    <span className="text-[9px] opacity-70">
                      {isPlaying ? <Volume2 className="w-3 h-3 animate-bounce" /> : selectedInstrument === "Chromatic" ? `Pitch` : `Str ${idx + 1}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Tuning Presets & Instrument Selector */}
        <div className="md:col-span-4 frosted-card rounded-3xl p-5 space-y-4">
          {/* Instrument Selection */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
              INSTRUMENT TUNING MODE
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {(["Guitar", "Bass", "Ukulele", "Chromatic"] as const).map((inst) => {
                const isSelected = selectedInstrument === inst;
                return (
                  <button
                    key={inst}
                    onClick={() => setSelectedInstrument(inst)}
                    className={`py-2 px-1.5 rounded-xl text-xs font-mono font-bold transition-all text-center cursor-pointer border ${
                      isSelected
                        ? "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_10px_rgba(163,255,18,0.3)] font-extrabold"
                        : "bg-white/5 text-zinc-400 hover:text-white border-white/5 hover:border-white/10"
                    }`}
                  >
                    {inst.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedInstrument !== "Chromatic" ? (
            <div className="space-y-4 pt-3 border-t border-white/5">
              <div className="flex items-center space-x-2 pb-1">
                <Music className="w-4 h-4 text-[#a3ff12]" />
                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  TUNINGS
                </h3>
              </div>

              {/* Quick Categories filter (Guitar only) */}
              {selectedInstrument === "Guitar" && (
                <div className="flex flex-wrap gap-1 pb-1">
                  {([
                    { id: "All", label: "ALL" },
                    { id: "Standard", label: "STD" },
                    { id: "Drops", label: "DROPS" },
                    { id: "Opens", label: "OPENS" },
                    { id: "Down", label: "DOWN" },
                  ] as const).map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={`px-2 py-1 rounded-lg text-[9px] font-mono font-bold transition-all border cursor-pointer ${
                        activeCategory === cat.id
                          ? "bg-[#a3ff12]/20 text-[#a3ff12] border-[#a3ff12]/50"
                          : "bg-white/5 text-zinc-400 border-transparent hover:text-white"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-1.5 max-h-[260px] overflow-y-auto no-scrollbar pr-0.5">
                {filteredTunings.map((tuning) => {
                  const isSelected = selectedTuning.name === tuning.name;
                  return (
                    <button
                      key={tuning.name}
                      onClick={() => {
                        setSelectedTuning(tuning);
                        setLockedStringIdx(null);
                      }}
                      className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer border ${
                        isSelected
                          ? "bg-[#a3ff12]/15 border-[#a3ff12]/30 text-white font-bold"
                          : "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border-transparent"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{tuning.name.split(" (")[0]}</div>
                        <div className="text-[10px] font-mono text-zinc-400 truncate mt-0.5">
                          {tuning.notes.join(" ")}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="pt-4 border-t border-white/5 text-center space-y-2">
              <p className="text-[11px] font-mono text-zinc-400 leading-relaxed text-left">
                Free Chromatic Mode active. Play any string on your guitar, bass, or ukulele, and the tuner will automatically detect and show the closest note. No locking or presets required.
              </p>
            </div>
          )}
        </div>
      </div>

      <CustomConfirmDialog
        isOpen={dialog.isOpen}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        type={dialog.type}
        onConfirm={dialog.onConfirm}
        onCancel={() => setDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
