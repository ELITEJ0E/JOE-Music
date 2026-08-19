import React, { useEffect, useState, useRef } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  Radio,
  CheckCircle2,
  AlertCircle,
  Sliders,
  RotateCcw,
  Zap,
  Lock,
  Unlock,
} from "lucide-react";
import { audioEngine } from "../audio/audioContext";
import { analyzePitchFrame } from "../audio/pitchDetector";
import { guitarSynth } from "../audio/guitarSynth";
import { GUITAR_TUNINGS } from "../data/tuningsDatabase";
import { GuitarTuning, TunerResult } from "../types";

export const TunerPanel: React.FC = () => {
  const [selectedTuning, setSelectedTuning] = useState<GuitarTuning>(GUITAR_TUNINGS[0]);
  const [isListening, setIsListening] = useState(false);
  const [tunerData, setTunerData] = useState<TunerResult | null>(null);
  const [playingRefToneIdx, setPlayingRefToneIdx] = useState<number | null>(null);
  const [calibrationA4, setCalibrationA4] = useState<number>(440);
  const [lockedStringIdx, setLockedStringIdx] = useState<number | null>(null); // null = Auto-detect
  const [strobeOffset, setStrobeOffset] = useState<number>(0);

  const stopToneRef = useRef<(() => void) | null>(null);
  const animRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array | null>(null);
  const strobePhaseRef = useRef<number>(0);

  useEffect(() => {
    const unsub = audioEngine.subscribeMicStatus(setIsListening);
    return () => {
      unsub();
    };
  }, []);

  // Main real-time pitch detection and strobe loop
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

    let lastTime = performance.now();
    let lastDetectTime = 0;

    const loop = (currentTime: number) => {
      if (!isMounted) return;

      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      // Throttle pitch calculations to ~30 FPS to preserve CPU responsiveness
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
            // If a specific string is locked, filter by that string's target
            if (lockedStringIdx !== null) {
              const stringFreq = selectedTuning.frequencies[lockedStringIdx] * (calibrationA4 / 440);
              result.stringIndex = lockedStringIdx;
              const diffRatio = result.frequency / stringFreq;
              const customCents = Math.round(1200 * (Math.log(diffRatio) / Math.log(2)));
              if (Math.abs(customCents) < 150) {
                result.cents = customCents;
                result.inTune = Math.abs(customCents) <= 3;
              }
            }
            setTunerData(result);

            // Update strobe band drift: moves right for sharp, left for flat, stays still in tune
            const speed = result.cents * 4; // pixels per second
            strobePhaseRef.current = (strobePhaseRef.current + speed * dt) % 40;
            setStrobeOffset(strobePhaseRef.current);
          }
        }
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      isMounted = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (sourceNode && analyser) {
        try {
          sourceNode.disconnect(analyser);
        } catch (_) {}
      }
    };
  }, [isListening, selectedTuning, calibrationA4, lockedStringIdx]);

  const toggleListening = async () => {
    if (isListening) {
      audioEngine.stopMicrophone();
      setIsListening(false);
    } else {
      try {
        await audioEngine.startMicrophone();
        setIsListening(true);
      } catch (err) {
        alert("Microphone permission required for guitar tuning.");
      }
    }
  };

  const playReferenceTone = (freq: number, index: number) => {
    if (stopToneRef.current) {
      stopToneRef.current();
      stopToneRef.current = null;
    }

    if (playingRefToneIdx === index) {
      setPlayingRefToneIdx(null);
      return;
    }

    setPlayingRefToneIdx(index);
    const calibratedFreq = freq * (calibrationA4 / 440);
    stopToneRef.current = guitarSynth.playReferenceTone(calibratedFreq, 3.5);
    setTimeout(() => {
      setPlayingRefToneIdx(null);
    }, 3500);
  };

  const cents = tunerData ? tunerData.cents : 0;
  const inTune = tunerData ? tunerData.inTune : false;
  const note = tunerData ? tunerData.note : "--";
  const octave = tunerData ? tunerData.octave : "";
  const freq = tunerData ? tunerData.frequency.toFixed(1) : "---";

  return (
    <div id="panel-guitar-tuner" className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 frosted-card p-5 rounded-2xl">
        <div>
          <div className="flex items-center space-x-2">
            <Radio className="w-5 h-5 text-[#a3ff12]" />
            <h2 className="text-xl font-bold text-white font-mono">
              CHROMATIC STROBE TUNER
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[#a3ff12]/15 text-[#a3ff12] border border-[#a3ff12]/30 uppercase">
              YIN DSP
            </span>
          </div>
          <p className="text-xs text-white/40 font-mono mt-0.5">
            Autocorrelation Pitch Tracking • Strobe Visualization • A4={calibrationA4}Hz
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Tuning Dropdown */}
          <select
            id="select-tuner-tuning"
            value={selectedTuning.name}
            onChange={(e) => {
              const found = GUITAR_TUNINGS.find((t) => t.name === e.target.value);
              if (found) setSelectedTuning(found);
            }}
            className="bg-black/40 text-white text-xs font-mono border border-white/10 rounded-xl px-3.5 py-2 focus:outline-none focus:border-[#a3ff12]/50 backdrop-blur-md"
          >
            {GUITAR_TUNINGS.map((t) => (
              <option key={t.name} value={t.name} className="bg-[#121218]">
                {t.name}
              </option>
            ))}
          </select>

          {/* String Detection Mode Selector */}
          <button
            onClick={() => setLockedStringIdx(lockedStringIdx === null ? 0 : null)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-mono border transition-all ${
              lockedStringIdx === null
                ? "bg-white/5 text-white/70 border-white/10 hover:text-white"
                : "bg-[#a3ff12]/15 text-[#a3ff12] border-[#a3ff12]/40"
            }`}
            title="Toggle between Auto string detection and Manual string target locking"
          >
            {lockedStringIdx === null ? (
              <>
                <Unlock className="w-3.5 h-3.5" />
                <span>AUTO-DETECT</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-[#a3ff12]" />
                <span>STR {6 - lockedStringIdx} LOCKED</span>
              </>
            )}
          </button>

          {/* Mic Toggle */}
          <button
            id="btn-tuner-mic-toggle"
            onClick={toggleListening}
            className={`flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-mono font-bold transition-all shadow-md ${
              isListening
                ? "bg-[#a3ff12] text-black shadow-[0_0_20px_rgba(163,255,18,0.3)] hover:bg-[#92e610]"
                : "bg-white/5 text-white hover:bg-white/10 border border-white/10 backdrop-blur-md"
            }`}
          >
            {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            <span>{isListening ? "STOP TUNER" : "START TUNER"}</span>
          </button>
        </div>
      </div>

      {/* Main Tuner Display */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Strobe Visualizer & Cents Meter */}
        <div className="lg:col-span-2 frosted-card p-6 sm:p-8 rounded-3xl flex flex-col items-center justify-between relative overflow-hidden dot-matrix-bg space-y-6">
          {/* Ambient In-Tune Glow Background */}
          <div
            className={`absolute inset-0 transition-opacity duration-300 pointer-events-none ${
              inTune
                ? "bg-[#a3ff12]/10 opacity-100"
                : tunerData
                ? "bg-red-500/5 opacity-80"
                : "opacity-0"
            }`}
          />

          {/* Strobe Band Visualization Banner */}
          <div className="w-full h-12 bg-black/60 rounded-2xl border border-white/10 overflow-hidden relative shadow-inner flex items-center justify-center">
            {/* Moving Strobe Bands */}
            <div
              className="absolute inset-y-0 -inset-x-20 flex space-x-3 pointer-events-none transition-transform"
              style={{
                transform: `translateX(${isListening && tunerData ? -strobeOffset : 0}px)`,
              }}
            >
              {Array.from({ length: 40 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-full rounded-sm ${
                    inTune
                      ? "bg-[#a3ff12] shadow-[0_0_8px_#a3ff12]"
                      : isListening && tunerData
                      ? "bg-white/40"
                      : "bg-white/10"
                  }`}
                />
              ))}
            </div>

            {/* Strobe Center Lock Marker */}
            <div className="absolute inset-y-0 w-1 bg-[#a3ff12] shadow-[0_0_12px_#a3ff12] z-10" />
            <span className="absolute top-1 right-3 text-[9px] font-mono font-bold text-white/40 uppercase tracking-widest z-20">
              {inTune ? "STROBE LOCKED" : "STROBE PHASE WHEEL"}
            </span>
          </div>

          {/* Target Detected Note Display */}
          <div className="text-center z-10 my-2">
            <div className="flex items-baseline justify-center">
              <span
                id="text-tuner-detected-note"
                className={`text-8xl sm:text-9xl font-black font-mono tracking-tighter transition-all ${
                  inTune
                    ? "text-[#a3ff12] drop-shadow-[0_0_35px_rgba(163,255,18,0.8)] scale-105"
                    : tunerData
                    ? "text-white"
                    : "text-white/20"
                }`}
              >
                {note}
              </span>
              <span className="text-3xl font-mono text-white/40 ml-1">
                {octave}
              </span>
            </div>

            <div className="flex items-center justify-center space-x-3 mt-2 text-sm font-mono text-white/50">
              <span>{freq} Hz</span>
              <span>•</span>
              <span
                className={`font-bold ${
                  inTune
                    ? "text-[#a3ff12]"
                    : Math.abs(cents) > 10
                    ? "text-red-400"
                    : "text-amber-400"
                }`}
              >
                {tunerData
                  ? `${cents > 0 ? `+${cents}` : cents} cents`
                  : "Listening for guitar string..."}
              </span>
            </div>
          </div>

          {/* Precision Needle / Cents Gauge (-50 to +50 cents) */}
          <div className="w-full max-w-lg px-2 sm:px-4 z-10">
            {/* Scale markings */}
            <div className="flex justify-between text-[11px] font-mono text-white/40 mb-1.5 px-1">
              <span>-50</span>
              <span>-30</span>
              <span>-15</span>
              <span className="text-[#a3ff12] font-bold">IN TUNE</span>
              <span>+15</span>
              <span>+30</span>
              <span>+50</span>
            </div>

            {/* Meter Bar */}
            <div className="relative h-6 bg-black/50 rounded-full border border-white/10 overflow-hidden p-0.5 shadow-inner">
              {/* Center in-tune zone */}
              <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-8 bg-[#a3ff12]/20 border-x border-[#a3ff12]/40" />

              {/* Dynamic Needle */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-white transition-all duration-75 rounded-full z-20"
                style={{
                  left: `${Math.max(2, Math.min(98, 50 + (cents / 50) * 48))}%`,
                  backgroundColor: inTune ? "#a3ff12" : cents < 0 ? "#38bdf8" : "#f43f5e",
                  boxShadow: inTune ? "0 0 12px #a3ff12" : "0 0 8px rgba(255,255,255,0.7)",
                }}
              />

              {/* Tick Marks */}
              <div className="absolute inset-0 flex justify-between items-center px-4 pointer-events-none">
                {[-50, -35, -20, -10, 0, 10, 20, 35, 50].map((tick) => (
                  <div
                    key={tick}
                    className={`w-[1px] ${
                      tick === 0 ? "h-4 bg-[#a3ff12]" : "h-2 bg-white/20"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Tuning Guidance Status */}
            <div className="flex items-center justify-center space-x-2 mt-4">
              {inTune ? (
                <div className="flex items-center space-x-1.5 text-[#a3ff12] text-xs font-mono font-bold bg-[#a3ff12]/15 px-4 py-1.5 rounded-full border border-[#a3ff12]/30 shadow-[0_0_12px_rgba(163,255,18,0.2)]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>PERFECTLY IN TUNE</span>
                </div>
              ) : tunerData && cents < -3 ? (
                <div className="flex items-center space-x-1.5 text-sky-400 text-xs font-mono font-bold bg-sky-500/15 px-4 py-1.5 rounded-full border border-sky-500/30">
                  <AlertCircle className="w-4 h-4" />
                  <span>TUNE UP (FLAT)</span>
                </div>
              ) : tunerData && cents > 3 ? (
                <div className="flex items-center space-x-1.5 text-rose-400 text-xs font-mono font-bold bg-rose-500/15 px-4 py-1.5 rounded-full border border-rose-500/30">
                  <AlertCircle className="w-4 h-4" />
                  <span>TUNE DOWN (SHARP)</span>
                </div>
              ) : (
                <div className="text-white/40 text-xs font-mono">
                  {isListening ? "Pluck any open guitar string..." : "Press START TUNER above"}
                </div>
              )}
            </div>
          </div>

          {/* Reference Calibration Slider */}
          <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/10 z-10">
            <div className="flex items-center space-x-2 text-xs font-mono text-white/60">
              <Sliders className="w-3.5 h-3.5 text-[#a3ff12]" />
              <span>A4 Calibration:</span>
              <span className="text-[#a3ff12] font-bold">{calibrationA4} Hz</span>
            </div>

            <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
              <input
                type="range"
                min={432}
                max={448}
                value={calibrationA4}
                onChange={(e) => setCalibrationA4(parseInt(e.target.value, 10))}
                className="w-36 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
              />
              <button
                onClick={() => setCalibrationA4(440)}
                className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 hover:bg-white/10 text-white/50 hover:text-white border border-white/10"
                title="Reset to standard 440 Hz"
              >
                RESET
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive String Pegs */}
        <div className="frosted-card p-6 rounded-3xl flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white font-mono flex items-center mb-1">
              <Volume2 className="w-4 h-4 text-[#a3ff12] mr-2" />
              GUITAR STRING TARGETS
            </h3>
            <p className="text-[11px] text-white/40 font-mono">
              Click string peg to lock target or play reference sine tone
            </p>
          </div>

          <div className="space-y-2.5">
            {selectedTuning.notes.map((stringNote, idx) => {
              const baseFreq = selectedTuning.frequencies[idx];
              const calibratedTarget = baseFreq * (calibrationA4 / 440);
              const isCurrentDetected = tunerData?.stringIndex === idx;
              const isLocked = lockedStringIdx === idx;
              const isPlayingThisTone = playingRefToneIdx === idx;

              return (
                <div
                  key={idx}
                  id={`tuner-string-peg-${idx}`}
                  onClick={() => {
                    if (lockedStringIdx === idx) {
                      setLockedStringIdx(null); // Unlock
                    } else {
                      setLockedStringIdx(idx); // Lock to this string
                    }
                  }}
                  className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                    isLocked
                      ? "bg-[#a3ff12]/15 border-[#a3ff12] text-white shadow-[0_0_15px_rgba(163,255,18,0.25)]"
                      : isCurrentDetected
                      ? "bg-white/10 border-[#a3ff12]/60 text-white"
                      : isPlayingThisTone
                      ? "bg-amber-500/15 border-amber-500 text-white"
                      : "bg-white/5 border-white/5 text-white/70 hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className="w-7 h-7 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-mono font-bold text-white/50">
                      {6 - idx}
                    </span>
                    <div>
                      <div className="font-mono font-bold text-sm text-white flex items-center space-x-1.5">
                        <span>{stringNote}</span>
                        {isLocked && (
                          <span className="text-[9px] text-[#a3ff12] font-mono font-bold bg-[#a3ff12]/20 px-1.5 py-0.2 rounded border border-[#a3ff12]/30">
                            LOCKED
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-white/40">
                        {calibratedTarget.toFixed(1)} Hz
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {isCurrentDetected && inTune && (
                      <span className="text-[10px] font-mono font-bold text-[#a3ff12] bg-[#a3ff12]/20 px-2 py-0.5 rounded-full border border-[#a3ff12]/30">
                        IN TUNE
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playReferenceTone(baseFreq, idx);
                      }}
                      className={`p-2 rounded-xl border transition-colors ${
                        isPlayingThisTone
                          ? "bg-amber-500 text-black border-amber-400"
                          : "bg-white/5 border-white/10 text-white/50 hover:text-white"
                      }`}
                      title="Play Reference Tone"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-[11px] font-mono text-white/50">
            <span className="text-[#a3ff12] font-bold block mb-0.5">Tuning Profile:</span>
            {selectedTuning.description}
          </div>
        </div>
      </div>
    </div>
  );
};
