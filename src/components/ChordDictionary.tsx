import React, { useState } from "react";
import {
  BookOpen,
  Search,
  Volume2,
  ArrowDown,
  ArrowUp,
  Music,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sliders,
} from "lucide-react";
import { CHORD_DATABASE } from "../data/chordDatabase";
import { guitarSynth } from "../audio/guitarSynth";
import { ChordVoicing } from "../types";

const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const QUALITIES = [
  "All",
  "Major",
  "Minor",
  "7",
  "maj7",
  "min7",
  "sus4",
  "sus2",
  "add9",
  "dim7",
  "min7b5",
  "aug",
];
const CAGED_SHAPES = ["ALL", "C", "A", "G", "E", "D"];

export const ChordDictionary: React.FC = () => {
  const [selectedRoot, setSelectedRoot] = useState<string>("C");
  const [selectedQuality, setSelectedQuality] = useState<string>("All");
  const [selectedCaged, setSelectedCaged] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedChord, setSelectedChord] = useState<ChordVoicing>(CHORD_DATABASE[0]);
  const [strumSpeed, setStrumSpeed] = useState<number>(24); // ms
  const [capoFret, setCapoFret] = useState<number>(0);
  const [transposeOffset, setTransposeOffset] = useState<number>(0);

  const filteredChords = CHORD_DATABASE.filter((c) => {
    const matchesSearch = searchQuery
      ? c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.root.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    const matchesRoot =
      selectedRoot === "All" || c.root.toUpperCase() === selectedRoot.toUpperCase();
    const matchesQuality =
      selectedQuality === "All" ||
      c.quality.toLowerCase() === selectedQuality.toLowerCase();
    const matchesCaged =
      selectedCaged === "ALL" || c.cagedShape === selectedCaged;

    return (
      matchesSearch &&
      (searchQuery ? true : matchesRoot && matchesQuality && matchesCaged)
    );
  });

  const handleStrum = (chord: ChordVoicing, direction: "down" | "up") => {
    guitarSynth.strumChord(
      chord.frets,
      direction,
      strumSpeed,
      capoFret + transposeOffset,
      0.85
    );
  };

  const handleArpeggio = (chord: ChordVoicing) => {
    guitarSynth.arpeggiateChord(
      chord.frets,
      110,
      [0, 1, 2, 3, 4, 5, 4, 3, 2, 1],
      capoFret + transposeOffset
    );
  };

  const handleSingleStringPluck = (stringIdx: number, fret: number | "x") => {
    if (fret === "x") return;
    guitarSynth.playFretNote(stringIdx, fret, capoFret + transposeOffset, 0.9);
  };

  // Calculates sounding chord root when Capo / Transposition is active
  const baseRootIdx = ROOTS.indexOf(selectedChord.root.toUpperCase());
  const effectiveSemitones = (baseRootIdx + capoFret + transposeOffset + 24) % 12;
  const soundingRoot = ROOTS[effectiveSemitones];
  const soundingChordName = `${soundingRoot} ${selectedChord.quality}`;

  return (
    <div id="panel-chord-dictionary" className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Header & Search */}
      <div className="frosted-card p-5 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <BookOpen className="w-5 h-5 text-[#a3ff12]" />
              <h2 className="text-xl font-bold text-white font-mono">
                CHORD DICTIONARY & VOICING EXPLORER
              </h2>
            </div>
            <p className="text-xs text-white/40 font-mono mt-0.5">
              Comprehensive guitar voicings, CAGED positions, finger placements & interactive strum audio
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search chord (e.g. Dm7, G7, Cadd9)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 text-xs font-mono text-white border border-white/10 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:border-[#a3ff12]/50 backdrop-blur-md"
            />
          </div>
        </div>

        {/* Root Filter Pills */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {ROOTS.map((r) => {
            const isSelected = selectedRoot === r && !searchQuery;
            return (
              <button
                key={r}
                onClick={() => {
                  setSelectedRoot(r);
                  setSearchQuery("");
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border ${
                  isSelected
                    ? "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_10px_#a3ff12]"
                    : "bg-white/5 text-white/50 border-white/5 hover:text-white hover:bg-white/10"
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>

        {/* Quality & CAGED Filter Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/5">
          {/* Quality Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            {QUALITIES.map((q) => {
              const isSelected = selectedQuality === q && !searchQuery;
              return (
                <button
                  key={q}
                  onClick={() => {
                    setSelectedQuality(q);
                    setSearchQuery("");
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-all border ${
                    isSelected
                      ? "bg-white/10 text-[#a3ff12] border-[#a3ff12]/40 font-bold"
                      : "bg-white/5 text-white/40 border-white/5 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {q}
                </button>
              );
            })}
          </div>

          {/* CAGED Filter Buttons */}
          <div className="flex items-center space-x-1">
            <span className="text-[10px] font-mono text-white/40 uppercase mr-1">CAGED:</span>
            {CAGED_SHAPES.map((shape) => (
              <button
                key={shape}
                onClick={() => setSelectedCaged(shape)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border transition-all ${
                  selectedCaged === shape
                    ? "bg-[#a3ff12] text-black border-[#a3ff12]"
                    : "bg-white/5 text-white/50 border-white/5 hover:text-white"
                }`}
              >
                {shape}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid: Chord Selection List & Big Diagram Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Filtered Chords List */}
        <div className="frosted-card p-4 rounded-3xl space-y-2 max-h-[560px] overflow-y-auto">
          <div className="text-[10px] font-mono uppercase tracking-widest text-white/40 px-2 py-1 flex justify-between items-center">
            <span>MATCHING VOICINGS ({filteredChords.length})</span>
            {selectedCaged !== "ALL" && (
              <span className="text-[#a3ff12] font-bold">SHAPE: {selectedCaged}</span>
            )}
          </div>

          {filteredChords.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-white/40">
              No matching voicings found. Try selecting "All" qualities or resetting search.
            </div>
          ) : (
            filteredChords.map((chord) => {
              const isSelected = selectedChord.id === chord.id;
              return (
                <div
                  key={chord.id}
                  onClick={() => {
                    setSelectedChord(chord);
                    handleStrum(chord, "down");
                  }}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? "bg-white/10 border-[#a3ff12] text-white shadow-[0_0_15px_rgba(163,255,18,0.2)]"
                      : "bg-white/5 border-white/5 text-white/70 hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  <div>
                    <div className="font-mono font-bold text-sm text-white">
                      {chord.name}
                    </div>
                    <div className="text-[10px] font-mono text-white/40">
                      {chord.frets.map((f) => (f === "x" ? "X" : f)).join("-")}
                      {chord.cagedShape ? ` • CAGED: ${chord.cagedShape}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-mono text-[#a3ff12] px-2 py-0.5 rounded-md bg-[#a3ff12]/15 border border-[#a3ff12]/30">
                      {chord.difficulty || "Open"}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStrum(chord, "down");
                      }}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white"
                      title="Quick Preview"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right 2 Columns: Large SVG Chord Box & Audio Controls */}
        <div className="lg:col-span-2 frosted-card p-6 sm:p-8 rounded-3xl flex flex-col justify-between space-y-6 dot-matrix-bg">
          {/* Chord Name, Sounding Transposed Key & Strum Triggers */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div>
              <div className="flex items-baseline space-x-3">
                <h2 className="text-3xl sm:text-4xl font-extrabold font-mono text-white">
                  {selectedChord.name}
                </h2>
                <span className="text-xs font-mono font-bold text-[#a3ff12] px-2.5 py-0.5 rounded-full bg-[#a3ff12]/15 border border-[#a3ff12]/30">
                  {selectedChord.quality}
                </span>
              </div>
              <div className="flex items-center space-x-2 text-xs font-mono text-white/40 mt-1">
                <span>Voicing: {selectedChord.notes?.join(" - ") || "Root, 3rd, 5th"}</span>
                {(capoFret > 0 || transposeOffset !== 0) && (
                  <span className="text-[#a3ff12] font-bold">
                    • Sounding Key: {soundingChordName}
                  </span>
                )}
              </div>
            </div>

            {/* Audio Playback Triggers */}
            <div className="flex items-center space-x-2">
              <button
                id="btn-chord-downstrum"
                onClick={() => handleStrum(selectedChord, "down")}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-white hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <ArrowDown className="w-3.5 h-3.5 text-[#a3ff12]" />
                <span>DOWNSTRUM</span>
              </button>

              <button
                id="btn-chord-upstrum"
                onClick={() => handleStrum(selectedChord, "up")}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-white hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <ArrowUp className="w-3.5 h-3.5 text-[#a3ff12]" />
                <span>UPSTRUM</span>
              </button>

              <button
                id="btn-chord-arpeggio"
                onClick={() => handleArpeggio(selectedChord)}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#a3ff12] text-black font-mono font-bold text-xs hover:bg-[#92e610] shadow-[0_0_15px_rgba(163,255,18,0.3)] transition-all"
              >
                <Music className="w-3.5 h-3.5" />
                <span>ARPEGGIO</span>
              </button>
            </div>
          </div>

          {/* SVG Fretboard Chord Diagram (Click dots/strings to pluck single notes) */}
          <div className="flex flex-col justify-center items-center py-2">
            <div className="text-[10px] font-mono text-white/40 mb-2">
              💡 Click any string nut or finger dot to pluck individual note
            </div>
            <div className="bg-black/50 p-6 rounded-3xl border border-white/10 shadow-2xl">
              <svg width="240" height="260" viewBox="0 0 240 260" className="select-none">
                {/* Nut / Base Fret */}
                <rect x="30" y="30" width="180" height="6" fill="#a3ff12" rx="3" />

                {/* 5 Frets Horizontal Lines */}
                {[0, 1, 2, 3, 4].map((f) => (
                  <line
                    key={f}
                    x1="30"
                    y1={30 + f * 42}
                    x2="210"
                    y2={30 + f * 42}
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="1.5"
                  />
                ))}

                {/* 6 Strings Vertical Lines */}
                {[0, 1, 2, 3, 4, 5].map((s) => (
                  <line
                    key={s}
                    x1={30 + s * 36}
                    y1="30"
                    x2={30 + s * 36}
                    y2="198"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth={1 + (5 - s) * 0.4}
                  />
                ))}

                {/* Finger Dots and Mute/Open Markers */}
                {selectedChord.frets.map((fret, sIdx) => {
                  const x = 30 + sIdx * 36;
                  if (fret === "x") {
                    return (
                      <text
                        key={sIdx}
                        x={x}
                        y="20"
                        fill="#ff4d4d"
                        fontSize="14"
                        fontFamily="monospace"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        ✕
                      </text>
                    );
                  }
                  if (fret === 0) {
                    return (
                      <circle
                        key={sIdx}
                        cx={x}
                        cy="18"
                        r="6"
                        fill="none"
                        stroke="#a3ff12"
                        strokeWidth="2"
                        className="cursor-pointer hover:fill-[#a3ff12]/30 transition-all"
                        onClick={() => handleSingleStringPluck(5 - sIdx, 0)}
                      />
                    );
                  }
                  if (typeof fret === "number" && fret > 0 && fret <= 5) {
                    const y = 30 + fret * 42 - 21;
                    const fingerNumber = selectedChord.fingers ? selectedChord.fingers[sIdx] : 0;
                    return (
                      <g
                        key={sIdx}
                        className="cursor-pointer"
                        onClick={() => handleSingleStringPluck(5 - sIdx, fret)}
                      >
                        <circle
                          cx={x}
                          cy={y}
                          r="12"
                          fill="#a3ff12"
                          filter="drop-shadow(0 0 6px #a3ff12)"
                        />
                        {fingerNumber ? (
                          <text
                            x={x}
                            y={y + 4}
                            fill="#000"
                            fontSize="11"
                            fontFamily="monospace"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {fingerNumber}
                          </text>
                        ) : null}
                      </g>
                    );
                  }
                  return null;
                })}
              </svg>
            </div>
          </div>

          {/* Capo & Transposition & Strum Speed Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            {/* Capo Position */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-mono text-white/60 mb-1">
                <span>Capo Fret:</span>
                <span className="text-[#a3ff12] font-bold">
                  {capoFret === 0 ? "None (Open)" : `Fret ${capoFret}`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={12}
                value={capoFret}
                onChange={(e) => setCapoFret(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
              />
            </div>

            {/* Transpose Semitones */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-mono text-white/60 mb-1">
                <span>Transpose:</span>
                <span className="text-[#a3ff12] font-bold">
                  {transposeOffset > 0 ? `+${transposeOffset}` : transposeOffset} st
                </span>
              </div>
              <div className="flex items-center justify-between space-x-2">
                <button
                  onClick={() => setTransposeOffset((v) => Math.max(-12, v - 1))}
                  className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-mono"
                >
                  -1
                </button>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  value={transposeOffset}
                  onChange={(e) => setTransposeOffset(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
                />
                <button
                  onClick={() => setTransposeOffset((v) => Math.min(12, v + 1))}
                  className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-mono"
                >
                  +1
                </button>
              </div>
            </div>

            {/* Strum Speed */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-mono text-white/60 mb-1">
                <span>Strum Speed:</span>
                <span className="text-[#a3ff12] font-bold">{strumSpeed} ms</span>
              </div>
              <input
                type="range"
                min={10}
                max={80}
                value={strumSpeed}
                onChange={(e) => setStrumSpeed(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
