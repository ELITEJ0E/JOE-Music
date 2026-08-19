import React, { useState } from "react";
import {
  Grid,
  Volume2,
  Layers,
  Music,
  Eye,
  RotateCcw,
  Sliders,
  Play,
  Square,
} from "lucide-react";
import { GUITAR_TUNINGS } from "../data/tuningsDatabase";
import { SCALES_DATABASE } from "../data/scalesDatabase";
import { guitarSynth } from "../audio/guitarSynth";
import { ScaleDefinition, GuitarTuning } from "../types";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const OPEN_STRING_BASE_SEMITONES = [4, 9, 2, 7, 11, 4]; // E2 (4), A2 (9), D3 (2), G3 (7), B3 (11), E4 (4)
const FRET_MARKERS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const DOUBLE_FRET_MARKERS = [12, 24];

// CAGED position fret boundaries relative to root position
const CAGED_BOX_RANGES: Record<string, { startOffset: number; endOffset: number }> = {
  E: { startOffset: 0, endOffset: 3 },
  D: { startOffset: 2, endOffset: 5 },
  C: { startOffset: 4, endOffset: 8 },
  A: { startOffset: 7, endOffset: 10 },
  G: { startOffset: 9, endOffset: 13 },
};

export const FretboardViewer: React.FC = () => {
  const [selectedRoot, setSelectedRoot] = useState<string>("A");
  const [selectedScale, setSelectedScale] = useState<ScaleDefinition>(SCALES_DATABASE[0]);
  const [selectedTuning, setSelectedTuning] = useState<GuitarTuning>(GUITAR_TUNINGS[0]);
  const [cagedFilter, setCagedFilter] = useState<"ALL" | "C" | "A" | "G" | "E" | "D">("ALL");
  const [displayMode, setDisplayMode] = useState<"notes" | "intervals" | "degrees">("notes");
  const [capoFret, setCapoFret] = useState<number>(0);
  const [fretCount, setFretCount] = useState<number>(22); // 15, 18, 22, 24 frets
  const [isPlayingScale, setIsPlayingScale] = useState<boolean>(false);

  const rootIndex = NOTE_NAMES.indexOf(selectedRoot.toUpperCase());

  // Calculate scale note names and interval mapping
  const scaleNotes: { note: string; interval: number; formula: string; role: "root" | "3rd" | "5th" | "7th" | "scale" }[] =
    selectedScale.intervals.map((semitones, idx) => {
      const noteIdx = (rootIndex + semitones) % 12;
      const formula = selectedScale.formula[idx] || `${semitones}`;
      let role: "root" | "3rd" | "5th" | "7th" | "scale" = "scale";
      if (semitones === 0) role = "root";
      else if (semitones === 3 || semitones === 4) role = "3rd";
      else if (semitones === 7 || semitones === 6 || semitones === 8) role = "5th";
      else if (semitones === 10 || semitones === 11) role = "7th";

      return {
        note: NOTE_NAMES[noteIdx],
        interval: semitones,
        formula,
        role,
      };
    });

  const scaleNoteNames = new Set(scaleNotes.map((s) => s.note));
  const scaleNoteMap = new Map(scaleNotes.map((s) => [s.note, s]));

  const handleFretClick = (stringIdx: number, fret: number) => {
    // stringIdx: 0 = high E (1st str), 5 = low E (6th str)
    guitarSynth.playFretNote(5 - stringIdx, fret, capoFret, 0.85);
  };

  const playEntireScale = () => {
    if (isPlayingScale) return;
    setIsPlayingScale(true);

    // Play ascending run across strings
    const runSteps: { strIdx: number; fret: number }[] = [];
    for (let str = 5; str >= 0; str--) {
      const stringBaseSemitone = OPEN_STRING_BASE_SEMITONES[str];
      for (let fret = 0; fret <= 12; fret++) {
        const semitoneAtFret = (stringBaseSemitone + fret + capoFret) % 12;
        const noteAtFret = NOTE_NAMES[semitoneAtFret];
        if (scaleNoteNames.has(noteAtFret)) {
          runSteps.push({ strIdx: 5 - str, fret });
          break;
        }
      }
    }

    runSteps.forEach((step, idx) => {
      setTimeout(() => {
        guitarSynth.playFretNote(step.strIdx, step.fret, capoFret, 0.85);
        if (idx === runSteps.length - 1) {
          setTimeout(() => setIsPlayingScale(false), 500);
        }
      }, idx * 220);
    });
  };

  return (
    <div id="panel-fretboard-scales" className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Header & Selector Controls */}
      <div className="frosted-card p-5 rounded-2xl space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Grid className="w-5 h-5 text-[#a3ff12]" />
              <h2 className="text-xl font-bold text-white font-mono">
                INTERACTIVE FRETBOARD & SCALES ENGINE
              </h2>
            </div>
            <p className="text-xs text-white/40 font-mono mt-0.5">
              Explore CAGED boxes, 3-Notes-Per-String, harmonic intervals & real synth audio
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={playEntireScale}
              disabled={isPlayingScale}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                isPlayingScale
                  ? "bg-[#a3ff12] text-black shadow-[0_0_15px_rgba(163,255,18,0.4)]"
                  : "bg-white/5 border border-white/10 text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              {isPlayingScale ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-[#a3ff12]" />}
              <span>{isPlayingScale ? "PLAYING SCALE..." : "PLAY SCALE AUDIO"}</span>
            </button>
          </div>
        </div>

        {/* Root Note & Scale Mode Selector Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {/* Root Note Picker */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-white/40 uppercase tracking-wider block">
              Root Key
            </label>
            <div className="flex flex-wrap gap-1">
              {NOTE_NAMES.map((n) => (
                <button
                  key={n}
                  onClick={() => setSelectedRoot(n)}
                  className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-all ${
                    selectedRoot === n
                      ? "bg-[#a3ff12] text-black shadow-[0_0_10px_#a3ff12]"
                      : "bg-white/5 text-white/50 border border-white/5 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Scale Type Dropdown */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-white/40 uppercase tracking-wider block">
              Scale Mode / Formula
            </label>
            <select
              value={selectedScale.name}
              onChange={(e) => {
                const s = SCALES_DATABASE.find((sc) => sc.name === e.target.value);
                if (s) setSelectedScale(s);
              }}
              className="w-full bg-black/40 text-xs font-mono text-white border border-white/10 rounded-xl px-3 py-2 focus:outline-none focus:border-[#a3ff12]/50 backdrop-blur-md"
            >
              {SCALES_DATABASE.map((sc) => (
                <option key={sc.name} value={sc.name} className="bg-[#101016]">
                  {sc.name} ({sc.category})
                </option>
              ))}
            </select>
          </div>

          {/* Guitar Tuning Dropdown */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-white/40 uppercase tracking-wider block">
              Instrument Tuning
            </label>
            <select
              value={selectedTuning.name}
              onChange={(e) => {
                const t = GUITAR_TUNINGS.find((tn) => tn.name === e.target.value);
                if (t) setSelectedTuning(t);
              }}
              className="w-full bg-black/40 text-xs font-mono text-white border border-white/10 rounded-xl px-3 py-2 focus:outline-none focus:border-[#a3ff12]/50 backdrop-blur-md"
            >
              {GUITAR_TUNINGS.map((tn) => (
                <option key={tn.name} value={tn.name} className="bg-[#101016]">
                  {tn.name}
                </option>
              ))}
            </select>
          </div>

          {/* Display Label Mode Toggle */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-white/40 uppercase tracking-wider block">
              Label Overlay
            </label>
            <div className="flex rounded-xl bg-black/40 p-0.5 border border-white/10">
              {(["notes", "intervals", "degrees"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setDisplayMode(m)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-mono capitalize transition-all ${
                    displayMode === m
                      ? "bg-white/10 text-[#a3ff12] font-bold shadow-sm"
                      : "text-white/40 hover:text-white"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Secondary Bar: Capo Position, CAGED Filter & Fret Count */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/5">
          {/* CAGED System Selector */}
          <div className="flex items-center space-x-1.5">
            <span className="text-[10px] font-mono text-white/40 uppercase mr-1">CAGED BOX:</span>
            {(["ALL", "C", "A", "G", "E", "D"] as const).map((box) => (
              <button
                key={box}
                onClick={() => setCagedFilter(box)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all border ${
                  cagedFilter === box
                    ? "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_10px_#a3ff12]"
                    : "bg-white/5 text-white/40 border-white/5 hover:text-white hover:bg-white/10"
                }`}
              >
                {box}
              </button>
            ))}
          </div>

          {/* Capo Selector & Fret Count */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-xs font-mono text-white/60">
              <span>Capo:</span>
              <select
                value={capoFret}
                onChange={(e) => setCapoFret(parseInt(e.target.value, 10))}
                className="bg-black/40 text-xs font-mono text-[#a3ff12] font-bold border border-white/10 rounded-lg px-2 py-1"
              >
                <option value={0} className="bg-[#101016]">Open (No Capo)</option>
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1} className="bg-[#101016]">
                    Fret {i + 1} (+{i + 1} st)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2 text-xs font-mono text-white/60">
              <span>Frets:</span>
              <div className="flex rounded-lg bg-black/40 p-0.5 border border-white/10">
                {[15, 18, 22, 24].map((count) => (
                  <button
                    key={count}
                    onClick={() => setFretCount(count)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                      fretCount === count
                        ? "bg-white/15 text-[#a3ff12] font-bold"
                        : "text-white/40 hover:text-white"
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Fretboard Neck Visualizer */}
      <div className="frosted-card p-6 rounded-3xl space-y-4 overflow-x-auto dot-matrix-bg">
        <div
          className="select-none"
          style={{ minWidth: `${Math.max(900, fretCount * 44 + 80)}px` }}
        >
          {/* Fret Markers Row (Top Numbers) */}
          <div
            className="grid text-center text-[10px] font-mono text-white/40 mb-2"
            style={{
              gridTemplateColumns: `56px repeat(${fretCount}, minmax(0, 1fr))`,
            }}
          >
            <div>NUT</div>
            {Array.from({ length: 18 }).slice(0, fretCount).map((_, fIdx) => {
              const fretNum = fIdx + 1;
              const isDouble = DOUBLE_FRET_MARKERS.includes(fretNum);
              const isMarker = FRET_MARKERS.includes(fretNum);
              return (
                <div
                  key={fIdx}
                  className={
                    isDouble
                      ? "text-[#a3ff12] font-bold"
                      : isMarker
                      ? "text-white/80 font-semibold"
                      : ""
                  }
                >
                  {fretNum}
                </div>
              );
            })}
          </div>

          {/* 6 Guitar Strings Neck */}
          <div className="bg-black/60 border border-white/10 rounded-2xl p-4 space-y-3 relative shadow-2xl overflow-hidden">
            {/* Physical Capo Clamp Visualizer */}
            {capoFret > 0 && capoFret <= fretCount && (
              <div
                className="absolute top-0 bottom-0 z-20 pointer-events-none flex flex-col items-center justify-center"
                style={{
                  left: `calc(56px + ${(capoFret / fretCount) * 100}% - 14px)`,
                  width: "10px",
                }}
              >
                <div className="w-2.5 h-full bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 rounded-sm shadow-[0_0_12px_rgba(251,191,36,0.6)] border border-amber-300" />
                <span className="absolute -top-1 bg-amber-400 text-black text-[8px] font-mono font-bold px-1 rounded">
                  CAPO {capoFret}
                </span>
              </div>
            )}

            {[0, 1, 2, 3, 4, 5].map((strIdx) => {
              const stringOpenNote = selectedTuning.notes[5 - strIdx] || "E";
              const stringBaseSemitone = OPEN_STRING_BASE_SEMITONES[5 - strIdx] || 4;

              return (
                <div
                  key={strIdx}
                  className="grid items-center relative"
                  style={{
                    gridTemplateColumns: `56px repeat(${fretCount}, minmax(0, 1fr))`,
                  }}
                >
                  {/* String Open Nut Head */}
                  <div
                    onClick={() => handleFretClick(strIdx, 0)}
                    className="cursor-pointer text-xs font-mono font-bold text-white/70 hover:text-[#a3ff12] flex items-center space-x-1 pr-2"
                  >
                    <span className="w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px]">
                      {stringOpenNote}
                    </span>
                  </div>

                  {/* Fret Slots on this String */}
                  {Array.from({ length: fretCount }).map((_, fIdx) => {
                    const fret = fIdx + 1;
                    const semitoneAtFret = (stringBaseSemitone + fret + capoFret) % 12;
                    const noteAtFret = NOTE_NAMES[semitoneAtFret];
                    const isScaleNote = scaleNoteNames.has(noteAtFret);
                    const noteMeta = scaleNoteMap.get(noteAtFret);
                    const isRoot = noteMeta?.role === "root";
                    const isThird = noteMeta?.role === "3rd";
                    const isFifth = noteMeta?.role === "5th";
                    const isSeventh = noteMeta?.role === "7th";

                    // String thickness line
                    const stringHeight = 1 + strIdx * 0.45;

                    return (
                      <div
                        key={fret}
                        onClick={() => handleFretClick(strIdx, fret)}
                        className={`h-8 border-r border-white/10 relative flex items-center justify-center cursor-pointer group ${
                          fret <= capoFret ? "opacity-30 bg-black/40" : ""
                        }`}
                      >
                        {/* Horizontal String Line */}
                        <div
                          className="absolute inset-x-0 bg-white/20 group-hover:bg-white/40 transition-colors"
                          style={{ height: `${stringHeight}px` }}
                        />

                        {/* Interactive Scale Marker Dot with Harmonic Roles */}
                        {isScaleNote && (
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold z-10 transition-transform group-hover:scale-125 ${
                              isRoot
                                ? "bg-[#a3ff12] text-black shadow-[0_0_12px_#a3ff12] font-black"
                                : isThird
                                ? "bg-sky-400 text-black shadow-[0_0_8px_#38bdf8]"
                                : isFifth
                                ? "bg-amber-400 text-black shadow-[0_0_8px_#fbbf24]"
                                : isSeventh
                                ? "bg-purple-400 text-black shadow-[0_0_8px_#c084fc]"
                                : "bg-white/15 text-white border border-white/20 backdrop-blur-md shadow-sm"
                            }`}
                            title={`${noteAtFret} (${noteMeta?.formula})`}
                          >
                            {displayMode === "notes"
                              ? noteAtFret
                              : displayMode === "intervals"
                              ? noteMeta?.interval
                              : noteMeta?.formula}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/5 text-[11px] font-mono text-white/50">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-full bg-[#a3ff12]" />
              <span className="text-white">Root (1)</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-full bg-sky-400" />
              <span className="text-white">3rd (Maj/Min)</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              <span className="text-white">5th (Perfect)</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-full bg-purple-400" />
              <span className="text-white">7th</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-full bg-white/20 border border-white/40" />
              <span className="text-white">Scale Tone</span>
            </span>
          </div>

          <div className="text-white/40">
            Scale Formula: <span className="text-[#a3ff12]">{selectedScale.formula.join(" - ")}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
