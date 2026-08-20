import React, { useEffect, useState, useRef } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  CheckCircle2,
  Sliders,
  RotateCcw,
  Activity,
  Zap,
} from "lucide-react";
import { audioEngine } from "../audio/audioContext";
import { analyzePitchFrame } from "../audio/pitchDetector";
import { guitarSynth } from "../audio/guitarSynth";
import { GUITAR_TUNINGS } from "../data/tuningsDatabase";
import { GuitarTuning, TunerResult } from "../types";

export const TunerPanel: React.FC = () => {
  const [selectedInstrument, setSelectedInstrument] = useState<"Chromatic" | "Guitar" | "Bass" | "Custom">("Guitar");
  const [selectedTuning, setSelectedTuning] = useState<GuitarTuning>(GUITAR_TUNINGS[0]);
  const [isListening, setIsListening] = useState(false);
  const [tunerData, setTunerData] = useState<TunerResult | null>(null);
  const [playingRefToneIdx, setPlayingRefToneIdx] = useState<number | null>(null);
  const [calibrationA4, setCalibrationA4] = useState<number>(440);
  const [lockedStringIdx, setLockedStringIdx] = useState<number | null>(null);
  const [recentAccuracy, setRecentAccuracy] = useState<number[]>([1.2, 0.8, -0.4, 0.2, 1.2]);

  const stopToneRef = useRef<(() => void) | null>(null);
  const animRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array | null>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const unsub = audioEngine.subscribeMicStatus(setIsListening);
    return () => {
      unsub();
    };
  }, []);

  // Main real-time pitch detection
  useEffect(() => {
    if (!isListening) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      setTunerData(null);
      return;
    }

    let isMounted = true;
    const ctx = audioEngine.getContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    const buffer = new Float32Array(analyser.fftSize);
    bufferRef.current = buffer;

    let sourceNode: MediaStreamAudioSourceNode | null = null;
    audioEngine
      .startMicrophone()
      .then(({ source }) => {
        if (!isMounted) return;
        sourceNode = source;
        source.connect(analyser);
      })
      .catch((err) => {
        console.warn("Tuner mic connection error:", err);
      });

    let lastDetectTime = 0;

    const loop = (currentTime: number) => {
      if (!isMounted) return;

      if (currentTime - lastDetectTime >= 33) {
        lastDetectTime = currentTime;

        if (analyserRef.current && bufferRef.current) {
          analyserRef.current.getFloatTimeDomainData(bufferRef.current);

          const targetFreqs = selectedTuning.frequencies;
          const result = analyzePitchFrame(
            bufferRef.current,
            ctx.sampleRate,
            targetFreqs,
            calibrationA4
          );

          if (result) {
            if (lockedStringIdx !== null) {
              const stringFreq = selectedTuning.frequencies[lockedStringIdx] * (calibrationA4 / 440);
              result.stringIndex = lockedStringIdx;
              result.targetFrequency = stringFreq;
              result.cents = 1200 * Math.log2(result.frequency / stringFreq);
              result.inTune = Math.abs(result.cents) <= 3;
            }
            setTunerData(result);
            setRecentAccuracy((prev) => [...prev.slice(-14), result.cents]);
          }
        }
      }

      // Draw spectrum canvas
      if (analyserRef.current && spectrumCanvasRef.current) {
        const canvas = spectrumCanvasRef.current;
        const sCtx = canvas.getContext("2d");
        if (sCtx) {
          const freqData = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(freqData);

          sCtx.clearRect(0, 0, canvas.width, canvas.height);
          const barCount = 18;
          const barWidth = canvas.width / barCount;

          for (let i = 0; i < barCount; i++) {
            const val = freqData[i * 2] || 0;
            const percent = val / 255;
            const barH = percent * canvas.height;

            sCtx.fillStyle = i === 2 || i === 3 ? "#a3ff12" : "rgba(163, 255, 18, 0.4)";
            sCtx.fillRect(i * barWidth + 1.5, canvas.height - barH, barWidth - 3, barH);
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
  }, [isListening, selectedTuning, calibrationA4, lockedStringIdx]);

  const toggleListening = async () => {
    if (isListening) {
      audioEngine.stopMicrophone();
    } else {
      await audioEngine.startMicrophone();
    }
  };

  const handlePlayStringTone = (note: string, octave: number, idx: number) => {
    if (playingRefToneIdx === idx) {
      if (stopToneRef.current) stopToneRef.current();
      setPlayingRefToneIdx(null);
      return;
    }

    if (stopToneRef.current) stopToneRef.current();
    const freq = selectedTuning.frequencies[idx] || 440;
    const stopFn = guitarSynth.playReferenceTone(freq, 2.5);
    stopToneRef.current = stopFn;
    setPlayingRefToneIdx(idx);

    setTimeout(() => {
      setPlayingRefToneIdx(null);
    }, 2500);
  };

  const displayNote = tunerData ? tunerData.note : selectedTuning.notes[lockedStringIdx ?? 0];
  const displayCents = tunerData ? tunerData.cents : 0;
  const isInTune = tunerData ? tunerData.inTune : false;
  const activeString = tunerData?.stringIndex ?? lockedStringIdx ?? 0;

  // Arc meter calculation (-50 to +50 cents mapped to -60deg to +60deg)
  const clampedCents = Math.max(-50, Math.min(50, displayCents));
  const needleRotation = (clampedCents / 50) * 60;

  return (
    <div id="panel-precision-tuner" className="max-w-6xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Precision Tuner</h1>
          <p className="text-xs font-mono text-zinc-400 mt-1 tracking-wider">
            A4 = {calibrationA4}Hz • IN: INST 1
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleListening}
            className={`px-4 py-2 rounded-full text-xs font-mono font-bold flex items-center gap-2 border transition-all cursor-pointer ${
              isListening
                ? "bg-[#a3ff12]/10 text-[#a3ff12] border-[#a3ff12]/50 shadow-[0_0_15px_rgba(163,255,18,0.25)]"
                : "bg-white/5 text-zinc-400 border-white/10 hover:text-white"
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${isListening ? "bg-[#a3ff12] animate-pulse" : "bg-zinc-500"}`} />
            <span>{isListening ? "ACTIVE" : "STANDBY (CLICK TO START)"}</span>
          </button>
        </div>
      </div>

      {/* Main 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Instrument & Tuning Presets */}
        <div className="lg:col-span-3 space-y-5">
          {/* INSTRUMENT Selector */}
          <div className="frosted-card rounded-3xl p-5 space-y-3">
            <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
              INSTRUMENT
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {(["Chromatic", "Guitar", "Bass", "Custom"] as const).map((inst) => {
                const isSelected = selectedInstrument === inst;
                return (
                  <button
                    key={inst}
                    onClick={() => setSelectedInstrument(inst)}
                    className={`py-3 px-3 rounded-xl text-xs font-bold transition-all text-center cursor-pointer ${
                      isSelected
                        ? "bg-[#a3ff12]/15 text-white border border-[#a3ff12]/60 shadow-[0_0_15px_rgba(163,255,18,0.15)]"
                        : "bg-white/5 text-zinc-400 hover:text-white border border-transparent hover:border-white/5"
                    }`}
                  >
                    {inst}
                  </button>
                );
              })}
            </div>
          </div>

          {/* TUNING PRESETS */}
          <div className="frosted-card rounded-3xl p-5 space-y-3">
            <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
              TUNING PRESETS
            </h3>

            <div className="space-y-1.5">
              {GUITAR_TUNINGS.slice(0, 6).map((tuning) => {
                const isSelected = selectedTuning.name === tuning.name;
                return (
                  <button
                    key={tuning.name}
                    onClick={() => {
                      setSelectedTuning(tuning);
                      setLockedStringIdx(null);
                    }}
                    className={`w-full p-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#a3ff12]/15 border border-[#a3ff12]/40 text-white font-bold"
                        : "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-transparent"
                    }`}
                  >
                    <span className="text-xs font-bold">{tuning.name}</span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {tuning.notes.join(" ")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Center Column: Radial Tuner Arc Gauge */}
        <div className="lg:col-span-6 frosted-card rounded-3xl p-6 flex flex-col items-center justify-between min-h-[440px] relative overflow-hidden">
          {/* Top Info Tag */}
          <div className="w-full flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-400">
              {selectedTuning.name}
            </span>
            <div className="flex items-center space-x-1.5">
              <span className={`text-xs font-mono font-bold ${isInTune ? "text-[#a3ff12]" : "text-zinc-300"}`}>
                {tunerData ? (isInTune ? "IN TUNE" : `${displayCents > 0 ? "+" : ""}${displayCents.toFixed(1)}¢`) : "WAITING FOR SIGNAL"}
              </span>
            </div>
          </div>

          {/* Radial Arc Meter Graphic */}
          <div className="relative w-full max-w-[340px] h-[220px] flex items-center justify-center my-4">
            <svg viewBox="0 0 300 180" className="w-full h-full">
              {/* Arc background graduated ticks */}
              {Array.from({ length: 21 }).map((_, i) => {
                const angle = -60 + i * 6; // from -60 to +60
                const rad = (angle - 90) * (Math.PI / 180);
                const isCenter = i === 10;
                const r1 = 120;
                const r2 = isCenter ? 142 : i % 5 === 0 ? 136 : 130;
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
                    stroke={isCenter ? "#a3ff12" : "rgba(255, 255, 255, 0.15)"}
                    strokeWidth={isCenter ? 3 : 1.5}
                  />
                );
              })}

              {/* Needle Indicator */}
              <g
                style={{
                  transform: `rotate(${needleRotation}deg)`,
                  transformOrigin: "150px 160px",
                  transition: "transform 0.1s ease-out",
                }}
              >
                <line
                  x1="150"
                  y1="160"
                  x2="150"
                  y2="30"
                  stroke={isInTune ? "#a3ff12" : "#a3ff12"}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  filter="drop-shadow(0px 0px 8px rgba(163,255,18,0.8))"
                />
                <circle cx="150" cy="160" r="7" fill="#a3ff12" />
              </g>
            </svg>

            {/* Note Center Display */}
            <div className="absolute inset-x-0 bottom-2 flex flex-col items-center justify-center">
              <span
                className={`text-6xl font-black tracking-tighter ${
                  isInTune ? "text-[#a3ff12] drop-shadow-[0_0_25px_rgba(163,255,18,0.8)]" : "text-white"
                }`}
              >
                {displayNote}
              </span>
              <span className="text-xs font-mono font-bold text-zinc-400 mt-1">
                {tunerData?.frequency ? `${tunerData.frequency.toFixed(1)} Hz` : "-- Hz"}
              </span>
            </div>
          </div>

          {/* String Selection Pill Bar */}
          <div className="w-full flex items-center justify-center gap-2 pt-2 border-t border-white/5">
            {selectedTuning.notes.map((note, idx) => {
              const isActive = activeString === idx;
              return (
                <button
                  key={idx}
                  onClick={() => {
                    setLockedStringIdx(idx);
                    handlePlayStringTone(note, idx < 3 ? 2 : idx < 5 ? 3 : 4, idx);
                  }}
                  className={`w-11 h-11 rounded-xl text-xs font-mono font-bold flex flex-col items-center justify-center transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#a3ff12] text-black shadow-[0_0_18px_rgba(163,255,18,0.4)]"
                      : "bg-white/5 text-zinc-400 hover:text-white border border-white/5"
                  }`}
                >
                  <span>{note}</span>
                  <span className="text-[9px] opacity-70">{idx + 1}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Accuracy & Frequency Analysis */}
        <div className="lg:col-span-3 space-y-5">
          {/* RECENT ACCURACY GRAPH */}
          <div className="frosted-card rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                RECENT ACCURACY
              </h3>
              <span className="text-[10px] font-mono text-[#a3ff12]">±1.2¢ AVG</span>
            </div>

            {/* Line chart */}
            <div className="h-28 bg-white/5 rounded-xl p-3 relative flex items-center">
              {/* Zero reference line */}
              <div className="absolute inset-x-3 h-[1px] bg-white/20 top-1/2" />
              <span className="absolute right-2 top-2 text-[9px] font-mono text-zinc-500">+5¢</span>
              <span className="absolute right-2 top-[44%] text-[9px] font-mono text-[#a3ff12]">0¢</span>
              <span className="absolute right-2 bottom-2 text-[9px] font-mono text-zinc-500">-5¢</span>

              <svg className="w-full h-full overflow-visible">
                <polyline
                  fill="none"
                  stroke="#a3ff12"
                  strokeWidth="2"
                  points={recentAccuracy
                    .map((val, i) => {
                      const x = (i / (recentAccuracy.length - 1 || 1)) * 170;
                      const y = 45 - (val / 5) * 30;
                      return `${x},${Math.max(10, Math.min(80, y))}`;
                    })
                    .join(" ")}
                />
              </svg>
            </div>
          </div>

          {/* FREQ ANALYSIS */}
          <div className="frosted-card rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                FREQ ANALYSIS
              </h3>
              <div className="flex items-center gap-2 text-[9px] font-mono text-zinc-400">
                <span className="text-[#a3ff12]">FUND.</span>
                <span>HARMONICS</span>
              </div>
            </div>

            <div className="h-24 bg-white/5 rounded-xl p-2 flex items-center justify-center">
              <canvas ref={spectrumCanvasRef} width={200} height={70} className="w-full h-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
