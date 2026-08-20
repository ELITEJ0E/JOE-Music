import React, { useState, useEffect, useRef } from "react";
import {
  Upload,
  Link as LinkIcon,
  Mic,
  MicOff,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  CheckCircle2,
  Sliders,
  Sparkles,
  Music,
  Check,
} from "lucide-react";
import { SAMPLE_SONGS } from "../data/sampleSongs";
import { findChordByName } from "../data/chordDatabase";
import { guitarSynth } from "../audio/guitarSynth";
import { analyzeAudioFile } from "../audio/audioAnalyzer";
import { audioEngine } from "../audio/audioContext";
import { SongAnalysis } from "../types";

export const ChordFinderStudio: React.FC = () => {
  const [activeSong, setActiveSong] = useState<SongAnalysis>({
    id: "neon-horizon",
    title: "Neon Horizon",
    artist: "Unknown Artist",
    tempo: 120,
    timeSignature: "4/4",
    key: "G Maj",
    suggestedCapo: 0,
    difficulty: "Intermediate",
    tuning: "E Standard",
    chords: ["G", "D/F#", "Em7", "Cadd9"],
    sections: [
      {
        name: "Verse",
        startTime: 0,
        bars: 8,
        chords: ["G", "D/F#", "Em7", "Cadd9", "G", "D/F#", "Em7", "Cadd9"],
        strummingPattern: "D D U U D U",
      },
    ],
  });

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLiveMic, setIsLiveMic] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBarIndex, setCurrentBarIndex] = useState(2); // Active is Em7 at Bar 3 (index 2)
  const [transpose, setTranspose] = useState(0);
  const [capo, setCapo] = useState(0);
  const [simplifyChords, setSimplifyChords] = useState(false);
  const [loopSection, setLoopSection] = useState(true);
  const [slowDown, setSlowDown] = useState(false);
  const [voicingIndex, setVoicingIndex] = useState(1);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const playTimerRef = useRef<number | null>(null);

  const chordProgression = [
    { chord: "G", bar: "Bar 1", time: "0:00" },
    { chord: "D/F#", bar: "Bar 2", time: "0:02" },
    { chord: "Em7", bar: "Bar 3", time: "0:04" },
    { chord: "Cadd9", bar: "Bar 4", time: "0:06" },
  ];

  const prevChord = chordProgression[(currentBarIndex - 1 + chordProgression.length) % chordProgression.length];
  const activeChord = chordProgression[currentBarIndex % chordProgression.length];
  const nextChord = chordProgression[(currentBarIndex + 1) % chordProgression.length];

  // Playback timer loop
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }

    const intervalTime = slowDown ? 2600 : 2000;
    playTimerRef.current = window.setInterval(() => {
      setCurrentBarIndex((prev) => {
        const next = (prev + 1) % chordProgression.length;
        const targetChord = chordProgression[next].chord;
        // Synthesize chord strum
        const voicing = findChordByName(targetChord);
        if (voicing) {
          guitarSynth.strumChord(voicing.frets, "down", 30, capo + transpose, 0.8);
        }
        return next;
      });
    }, intervalTime);

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, slowDown, capo, transpose]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    try {
      const result = await analyzeAudioFile(file);
      setActiveSong(result);
      setCurrentBarIndex(0);
      setIsAnalyzing(false);
    } catch (err) {
      setIsAnalyzing(false);
      alert("Error analyzing audio file. Please try another audio format.");
    }
  };

  const handleAnalyzeYoutube = () => {
    if (!youtubeUrl) return;
    setIsAnalyzing(true);
    setTimeout(() => {
      setActiveSong({
        id: "yt-analyzed",
        title: "Track from YouTube",
        artist: "Extracted Stream",
        tempo: 120,
        timeSignature: "4/4",
        key: "G Maj",
        suggestedCapo: 0,
        difficulty: "Intermediate",
        tuning: "E Standard",
        chords: ["G", "D/F#", "Em7", "Cadd9"],
        sections: [
          {
            name: "Progression",
            startTime: 0,
            bars: 8,
            chords: ["G", "D/F#", "Em7", "Cadd9"],
            strummingPattern: "D D U U D U",
          },
        ],
      });
      setIsAnalyzing(false);
    }, 1200);
  };

  const toggleLiveMic = async () => {
    if (isLiveMic) {
      audioEngine.stopMicrophone();
      setIsLiveMic(false);
    } else {
      await audioEngine.startMicrophone();
      setIsLiveMic(true);
    }
  };

  // Get active chord fingering for the fretboard diagram
  const activeVoicing = findChordByName(activeChord.chord) || {
    name: "Em7",
    frets: [0, 2, 2, 0, 3, 0],
    fingers: [0, 1, 2, 0, 3, 0],
  };

  return (
    <div id="panel-chord-finder" className="max-w-6xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Centered Page Header */}
      <div className="text-center space-y-1.5">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Find the chords.
        </h1>
        <p className="text-zinc-400 text-xs">
          Drop a song, paste a YouTube link, or play it through your microphone.
        </p>
      </div>

      {/* 3 Top Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Upload Audio */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="bg-[#13161a] hover:bg-[#181c22] border border-[#1f242b] hover:border-[#2f3844] rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all group min-h-[140px]"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="w-10 h-10 rounded-xl bg-[#1c2128] flex items-center justify-center group-hover:scale-105 transition-transform mb-2">
            <Upload className="w-5 h-5 text-zinc-300 group-hover:text-white" />
          </div>
          <h3 className="text-xs font-bold font-mono text-zinc-200 uppercase tracking-wider">
            Upload Audio
          </h3>
          <p className="text-[11px] font-mono text-zinc-500 mt-0.5">MP3, WAV, FLAC</p>
        </div>

        {/* YouTube Link */}
        <div className="bg-[#13161a] border border-[#1f242b] rounded-2xl p-4 flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center space-x-2">
            <LinkIcon className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-bold font-mono text-zinc-200 uppercase tracking-wider">
              YouTube Link
            </h3>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              placeholder="Paste URL here..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className="flex-1 bg-[#181c22] text-xs font-mono text-white rounded-xl px-3 py-2 border border-transparent focus:border-[#00FF66]/50 focus:outline-none placeholder:text-zinc-500"
            />
            <button
              onClick={handleAnalyzeYoutube}
              disabled={isAnalyzing}
              className="px-3.5 py-2 bg-[#00FF66] hover:bg-[#00e65c] text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer font-mono"
            >
              {isAnalyzing ? "..." : "ANALYZE"}
            </button>
          </div>
        </div>

        {/* Microphone Live Tracking */}
        <div
          onClick={toggleLiveMic}
          className={`border rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all group min-h-[140px] ${
            isLiveMic
              ? "bg-[#182a1d] border-[#00FF66] shadow-[0_0_20px_rgba(0,255,102,0.2)]"
              : "bg-[#13161a] hover:bg-[#181c22] border-[#1f242b] hover:border-[#2f3844]"
          }`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${isLiveMic ? "bg-[#00FF66] text-black" : "bg-[#1c2128] text-zinc-300"}`}>
            {isLiveMic ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 text-zinc-400" />}
          </div>
          <h3 className={`text-xs font-bold font-mono uppercase tracking-wider ${isLiveMic ? "text-[#00FF66]" : "text-zinc-200"}`}>
            Microphone
          </h3>
          <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
            {isLiveMic ? "Listening to live guitar input..." : "Listen to live audio"}
          </p>
        </div>
      </div>

      {/* Song Track Info Bar */}
      <div className="bg-[#13161a] border border-[#1f242b] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-900 to-purple-900 flex items-center justify-center text-white border border-white/10 shrink-0">
            <Music className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              {activeSong.title}
            </h2>
            <p className="text-xs font-mono text-zinc-400">
              {activeSong.artist} • {activeSong.tempo} BPM
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-[11px] font-mono font-bold text-[#00FF66] flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#00FF66]" />
            CHORD CONFIDENCE 94%
          </span>
          <div className="w-24 h-2 bg-[#1c2128] rounded-full overflow-hidden">
            <div className="w-[94%] h-full bg-[#00FF66]" />
          </div>
        </div>
      </div>

      {/* Main Center Area: Chord Progression Canvas + Right Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Chord Progression Canvas (Left/Center 8 cols) */}
        <div className="lg:col-span-8 bg-[#13161a] border border-[#1f242b] rounded-2xl p-6 flex flex-col justify-between space-y-6">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
              CURRENT PROGRESSION
            </span>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-[#181c22] border border-white/5 rounded-full text-xs font-mono text-zinc-300">
                {activeSong.tuning}
              </span>
              <span className="px-3 py-1 bg-[#181c22] border border-white/5 rounded-full text-xs font-mono text-zinc-300">
                Key: {activeSong.key}
              </span>
            </div>
          </div>

          {/* Large Chord Triad Display (Previous, Active Glowing, Next) */}
          <div className="flex items-center justify-around py-6 border-y border-white/5">
            {/* Previous Chord */}
            <div className="text-center opacity-40">
              <div className="text-3xl font-bold font-mono text-zinc-300">
                {prevChord.chord}
              </div>
              <div className="text-[11px] font-mono text-zinc-500 mt-1">
                {prevChord.bar}
              </div>
            </div>

            {/* Active Chord - GIANT glowing neon green text */}
            <div className="text-center transform scale-110">
              <div className="text-7xl font-black font-mono text-[#00FF66] drop-shadow-[0_0_30px_rgba(0,255,102,0.8)] tracking-tight">
                {activeChord.chord}
              </div>
              <div className="text-xs font-mono font-bold text-[#00FF66] mt-2 tracking-wider">
                {activeChord.bar}
              </div>
            </div>

            {/* Next Chord */}
            <div className="text-center opacity-40">
              <div className="text-3xl font-bold font-mono text-zinc-300">
                {nextChord.chord}
              </div>
              <div className="text-[11px] font-mono text-zinc-500 mt-1">
                {nextChord.bar}
              </div>
            </div>
          </div>

          {/* Audio Waveform Track with Chord Split Markers */}
          <div className="space-y-3">
            <div className="h-14 bg-[#181c22] rounded-xl p-2 relative flex items-center justify-between border border-white/5 overflow-hidden">
              {/* Waveform vertical bars */}
              {Array.from({ length: 48 }).map((_, wIdx) => {
                const isPassed = wIdx <= currentBarIndex * 12 + 6;
                const h = 20 + ((wIdx * 19) % 70);
                return (
                  <div
                    key={wIdx}
                    className={`w-1 rounded-full transition-colors ${
                      isPassed ? "bg-[#00FF66]" : "bg-zinc-700"
                    }`}
                    style={{ height: `${h}%` }}
                  />
                );
              })}

              {/* Chord split lines */}
              <div className="absolute inset-0 flex justify-between pointer-events-none px-4">
                {chordProgression.map((cp, idx) => (
                  <div key={idx} className="h-full border-r border-white/10 flex flex-col justify-end pb-1 pr-1 text-[10px] font-mono text-zinc-400">
                    | {cp.chord}
                  </div>
                ))}
              </div>
            </div>

            {/* Transport controls: |<<, ▶, >>| */}
            <div className="flex items-center justify-center gap-4 pt-1">
              <button
                onClick={() => setCurrentBarIndex((prev) => (prev - 1 + chordProgression.length) % chordProgression.length)}
                className="w-10 h-10 rounded-xl bg-[#181c22] hover:bg-[#202630] border border-white/5 flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-12 h-12 rounded-xl bg-[#00FF66] hover:bg-[#00e65c] text-black flex items-center justify-center shadow-[0_0_20px_rgba(0,255,102,0.4)] transition-all cursor-pointer"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
              </button>

              <button
                onClick={() => setCurrentBarIndex((prev) => (prev + 1) % chordProgression.length)}
                className="w-10 h-10 rounded-xl bg-[#181c22] hover:bg-[#202630] border border-white/5 flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Controls & Fretboard Diagram (4 cols) */}
        <div className="lg:col-span-4 bg-[#13161a] border border-[#1f242b] rounded-2xl p-5 space-y-4">
          {/* Transpose & Capo */}
          <div className="grid grid-cols-2 gap-3">
            {/* Transpose */}
            <div className="bg-[#181c22] p-3 rounded-xl space-y-1.5 border border-white/5">
              <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">Transpose</span>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setTranspose((t) => Math.max(-12, t - 1))}
                  className="w-6 h-6 rounded bg-[#202630] text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold"
                >
                  -
                </button>
                <span className="text-xs font-mono font-bold text-white">{transpose >= 0 ? `+${transpose}` : transpose}</span>
                <button
                  onClick={() => setTranspose((t) => Math.min(12, t + 1))}
                  className="w-6 h-6 rounded bg-[#202630] text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold"
                >
                  +
                </button>
              </div>
            </div>

            {/* Capo */}
            <div className="bg-[#181c22] p-3 rounded-xl space-y-1.5 border border-white/5">
              <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">Capo</span>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCapo((c) => Math.max(0, c - 1))}
                  className="w-6 h-6 rounded bg-[#202630] text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold"
                >
                  -
                </button>
                <span className="text-xs font-mono font-bold text-white">{capo}</span>
                <button
                  onClick={() => setCapo((c) => Math.min(12, c + 1))}
                  className="w-6 h-6 rounded bg-[#202630] text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Toggles: Simplify, Loop, Slow Down */}
          <div className="space-y-2 pt-1 text-xs font-mono">
            <label className="flex items-center justify-between p-2.5 bg-[#181c22] rounded-xl border border-white/5 cursor-pointer">
              <span className="text-zinc-300">Simplify Chords</span>
              <input
                type="checkbox"
                checked={simplifyChords}
                onChange={(e) => setSimplifyChords(e.target.checked)}
                className="w-4 h-4 rounded accent-[#00FF66]"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-[#181c22] rounded-xl border border-white/5 cursor-pointer">
              <span className="text-zinc-300">Loop Section</span>
              <input
                type="checkbox"
                checked={loopSection}
                onChange={(e) => setLoopSection(e.target.checked)}
                className="w-4 h-4 rounded accent-[#00FF66]"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-[#181c22] rounded-xl border border-white/5 cursor-pointer">
              <span className="text-zinc-300">Slow Down (0.75x)</span>
              <input
                type="checkbox"
                checked={slowDown}
                onChange={(e) => setSlowDown(e.target.checked)}
                className="w-4 h-4 rounded accent-[#00FF66]"
              />
            </label>
          </div>

          {/* Voicing Buttons */}
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[11px] font-mono text-zinc-400">
              <span>VOICING</span>
              <span className="text-[#00FF66] font-bold">Standard Open</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((v) => (
                <button
                  key={v}
                  onClick={() => setVoicingIndex(v)}
                  className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                    voicingIndex === v
                      ? "bg-[#00FF66] text-black"
                      : "bg-[#181c22] text-zinc-400 hover:text-white"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Fretboard Diagram for Active Chord */}
          <div className="bg-[#181c22] rounded-xl p-4 border border-white/5 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-zinc-300">
              <span>{activeChord.chord} DIAGRAM</span>
              <span className="text-[10px] text-zinc-400">NUT / FRET 1-4</span>
            </div>

            {/* Fretboard SVG / Grid */}
            <div className="w-full bg-[#13161a] rounded-lg p-3 border border-white/5 flex flex-col items-center justify-center">
              <svg viewBox="0 0 160 110" className="w-full h-28">
                {/* Nut */}
                <line x1="20" y1="20" x2="140" y2="20" stroke="#ffffff" strokeWidth="4" />
                {/* Frets */}
                {[40, 60, 80, 100].map((y, i) => (
                  <line key={i} x1="20" y1={y} x2="140" y2={y} stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
                ))}
                {/* Strings (E, A, D, G, B, e) */}
                {[20, 44, 68, 92, 116, 140].map((x, i) => (
                  <line key={i} x1={x} y1="20" x2={x} y2="100" stroke="rgba(255,255,255,0.4)" strokeWidth={2.5 - i * 0.3} />
                ))}

                {/* Finger Dots for Em7: (0, 2, 2, 0, 3, 0) */}
                {/* A string fret 2 (x=44, y=50) */}
                <circle cx="44" cy="50" r="7" fill="#00FF66" filter="drop-shadow(0 0 6px rgba(0,255,102,0.8))" />
                <text x="44" y="53.5" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#000">1</text>

                {/* D string fret 2 (x=68, y=50) */}
                <circle cx="68" cy="50" r="7" fill="#00FF66" filter="drop-shadow(0 0 6px rgba(0,255,102,0.8))" />
                <text x="68" y="53.5" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#000">2</text>

                {/* B string fret 3 (x=116, y=70) */}
                <circle cx="116" cy="70" r="7" fill="#00FF66" filter="drop-shadow(0 0 6px rgba(0,255,102,0.8))" />
                <text x="116" y="73.5" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#000">3</text>

                {/* Open strings markers above nut: E(20), G(92), e(140) */}
                <circle cx="20" cy="10" r="3.5" fill="none" stroke="#00FF66" strokeWidth="1.5" />
                <circle cx="92" cy="10" r="3.5" fill="none" stroke="#00FF66" strokeWidth="1.5" />
                <circle cx="140" cy="10" r="3.5" fill="none" stroke="#00FF66" strokeWidth="1.5" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
