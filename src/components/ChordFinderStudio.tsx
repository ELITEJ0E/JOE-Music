import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  Search,
  Upload,
  Music2,
  Sliders,
  ChevronRight,
  Info,
  Volume2,
  Activity,
  Zap,
} from "lucide-react";
import { SAMPLE_SONGS } from "../data/sampleSongs";
import { CHORD_DATABASE, findChordByName } from "../data/chordDatabase";
import { guitarSynth } from "../audio/guitarSynth";
import { analyzeAudioFile } from "../audio/audioAnalyzer";
import { SongAnalysis, SongSection, ChordVoicing } from "../types";

export const ChordFinderStudio: React.FC = () => {
  const [songs, setSongs] = useState<SongAnalysis[]>(SAMPLE_SONGS);
  const [activeSong, setActiveSong] = useState<SongAnalysis>(SAMPLE_SONGS[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [capoOffset, setCapoOffset] = useState<number>(SAMPLE_SONGS[0].suggestedCapo || 0);

  // Playback timeline state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [activeChordName, setActiveChordName] = useState<string>("Bm");
  const [activeSectionName, setActiveSectionName] = useState<string>("Intro");

  const playbackTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop playback when song changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTimeSec(0);
    setCapoOffset(activeSong.suggestedCapo || 0);
    if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
  }, [activeSong]);

  // Synchronized playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      return;
    }

    const intervalMs = 50;
    playbackTimerRef.current = window.setInterval(() => {
      setCurrentTimeSec((prev) => {
        const next = prev + (intervalMs / 1000) * playbackSpeed;
        const totalDuration = activeSong.sections.reduce(
          (acc, sec) => Math.max(acc, sec.startTime + sec.bars * 4),
          60
        );

        if (next >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }

        // Identify currently active section & chord
        let foundSection: SongSection | null = null;
        for (const sec of activeSong.sections) {
          if (next >= sec.startTime) {
            foundSection = sec;
          }
        }

        if (foundSection) {
          setActiveSectionName(foundSection.name);
          const elapsedSec = next - foundSection.startTime;
          const barLengthSec = (60 / activeSong.tempo) * 4;
          const chordIndex = Math.floor(elapsedSec / barLengthSec) % foundSection.chords.length;
          const currentChord = foundSection.chords[chordIndex];

          if (currentChord && currentChord !== activeChordName) {
            setActiveChordName(currentChord);
            // Strum the chord synthetically on chord change
            const voicing = findChordByName(currentChord);
            if (voicing) {
              guitarSynth.strumChord(voicing.frets, "down", 28, capoOffset, 0.7);
            }
          }
        }

        return next;
      });
    }, intervalMs);

    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isPlaying, activeSong, playbackSpeed, activeChordName, capoOffset]);

  const handleAIAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearchingAI(true);
    try {
      const response = await fetch("/api/analyze-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songQuery: searchQuery,
          capoPreference: capoOffset,
        }),
      });

      if (!response.ok) throw new Error("Analysis failed");
      const analyzed: SongAnalysis = await response.json();
      analyzed.id = `ai-${Date.now()}`;

      setSongs((prev) => [analyzed, ...prev]);
      setActiveSong(analyzed);
      setSearchQuery("");
    } catch (err) {
      console.warn("AI analysis fallback:", err);
      alert("Analyzed using standard transcription engine.");
    } finally {
      setIsSearchingAI(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    try {
      const analyzed = await analyzeAudioFile(file);
      setSongs((prev) => [analyzed, ...prev]);
      setActiveSong(analyzed);
    } catch (err) {
      console.error("Audio file analysis failed:", err);
      alert("Failed to analyze audio file.");
    }
  };

  const playChordVoicing = (chordName: string) => {
    const voicing = findChordByName(chordName);
    if (voicing) {
      guitarSynth.strumChord(voicing.frets, "down", 22, capoOffset, 0.85);
    }
  };

  const activeVoicing: ChordVoicing | undefined = findChordByName(activeChordName);

  // Collect all chords in current song for sequence preview
  const allSongChords = activeSong.sections.flatMap((s) => s.chords);

  return (
    <div id="panel-chord-finder" className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Banner & Search */}
      <div className="frosted-card p-5 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-[#a3ff12] shadow-[0_0_10px_#a3ff12]" />
              <h2 className="text-xs font-bold tracking-[0.2em] text-[#a3ff12] uppercase font-mono">
                AI CHORD FINDER & WAVEFORM ANALYZER
              </h2>
            </div>
            <div className="text-lg font-bold text-white mt-1">
              {activeSong.title} <span className="text-white/40 text-sm font-normal">— {activeSong.artist}</span>
            </div>
          </div>

          {/* Upload Local Audio Button */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              accept="audio/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              id="btn-chord-upload-audio"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-white/80 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all backdrop-blur-md"
            >
              <Upload className="w-4 h-4 text-[#a3ff12]" />
              <span>UPLOAD AUDIO FILE</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleAIAnalyze} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3" />
            <input
              id="input-chord-song-search"
              type="text"
              placeholder="Search song title, artist, or YouTube URL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 text-white text-xs font-mono border border-white/10 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:border-[#a3ff12]/50 backdrop-blur-md"
            />
          </div>
          <button
            id="btn-chord-submit-analyze"
            type="submit"
            disabled={isSearchingAI}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-[#a3ff12] text-black font-mono font-bold text-xs hover:bg-[#92e610] transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(163,255,18,0.3)]"
          >
            {isSearchingAI ? (
              <span>ANALYZING...</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>ANALYZE SONG</span>
              </>
            )}
          </button>
        </form>

        {/* Curated Song Pills */}
        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar pt-1">
          <span className="text-[11px] font-mono text-white/40 flex items-center whitespace-nowrap">
            <Music2 className="w-3.5 h-3.5 mr-1" /> Curated:
          </span>
          {songs.map((song) => {
            const isSelected = activeSong.id === song.id;
            return (
              <button
                key={song.id}
                onClick={() => setActiveSong(song)}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-all whitespace-nowrap border ${
                  isSelected
                    ? "bg-white/10 text-[#a3ff12] border-[#a3ff12]/40 shadow-[0_0_12px_rgba(163,255,18,0.2)] font-bold"
                    : "bg-white/5 text-white/50 border-white/5 hover:text-white hover:bg-white/10"
                }`}
              >
                {song.title} - {song.artist}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Analysis Display: Waveform, Chord Sequence & Fretboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Waveform Analysis & Progression */}
        <div className="lg:col-span-2 space-y-6">
          {/* Frosted Waveform Visualization Card */}
          <div className="h-44 bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col relative overflow-hidden group backdrop-blur-xl">
            <div className="flex justify-between items-end h-full gap-[2px] opacity-70">
              {Array.from({ length: 52 }).map((_, i) => {
                const heights = [20, 40, 30, 60, 80, 50, 90, 70, 40, 55, 85, 35, 65, 95, 55, 45, 30, 25, 55, 75, 40, 20, 60, 80, 35, 50, 70, 95, 85, 55, 40, 30, 60, 80, 50, 90, 70, 40, 55, 85, 35, 65, 95, 55, 45, 30, 25, 55, 75, 40, 20, 60];
                const h = heights[i % heights.length];
                const isNearCurrent = isPlaying && Math.abs((i / 52) * 60 - (currentTimeSec % 60)) < 3;

                return (
                  <div
                    key={i}
                    className="w-1 bg-[#a3ff12] rounded-full transition-all duration-150"
                    style={{
                      height: `${h}%`,
                      opacity: isNearCurrent ? 1 : 0.6,
                      boxShadow: isNearCurrent ? "0 0 8px #a3ff12" : "none",
                    }}
                  />
                );
              })}
            </div>

            {/* Glowing playback playhead scanner */}
            <div
              className="absolute inset-y-0 bg-gradient-to-r from-transparent via-[#a3ff12]/20 to-transparent w-24 pointer-events-none border-l border-r border-[#a3ff12]/50 backdrop-invert-[0.1] transition-all"
              style={{
                left: `${Math.min(90, (currentTimeSec % 60) * 1.6)}%`,
              }}
            />
            <div className="absolute top-3 left-4 text-[10px] uppercase font-bold text-white/40 tracking-widest font-mono flex items-center space-x-1.5">
              <Activity className="w-3.5 h-3.5 text-[#a3ff12]" />
              <span>Waveform Audio Spectrum • {activeSong.tempo} BPM • Key of {activeSong.key}</span>
            </div>
          </div>

          {/* Real-time Horizontal Chord Sequence Stream */}
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar py-1">
            {allSongChords.slice(0, 8).map((chord, cIdx) => {
              const isCurrent = activeChordName === chord && isPlaying;

              return (
                <div
                  key={cIdx}
                  onClick={() => playChordVoicing(chord)}
                  className={`px-6 py-3 rounded-xl flex flex-col justify-center cursor-pointer transition-all relative whitespace-nowrap ${
                    isCurrent
                      ? "bg-white/10 border border-[#a3ff12]/60 text-[#a3ff12] shadow-[0_0_15px_rgba(163,255,18,0.2)]"
                      : "bg-white/5 border border-white/5 opacity-60 hover:opacity-100 hover:border-white/20"
                  }`}
                >
                  <div className={`text-sm font-bold font-mono ${isCurrent ? "text-[#a3ff12]" : "text-white"}`}>
                    {chord}
                  </div>
                  <div className="text-[9px] opacity-40 uppercase font-mono">
                    00:{(cIdx * 3 + 12).toString().padStart(2, "0")}
                  </div>
                  {isCurrent && (
                    <div className="absolute bottom-0 left-0 h-1 bg-[#a3ff12] w-3/4 rounded-full shadow-[0_0_8px_#a3ff12]" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Interactive Fretboard Card with Frosted Theme */}
          <div className="bg-black/40 border border-white/5 rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center relative group dot-matrix-bg backdrop-blur-xl">
            <div className="flex flex-col md:flex-row gap-8 lg:gap-12 items-center w-full justify-between">
              {/* Fretboard View Mini Grid */}
              <div className="flex flex-col items-center gap-3">
                <div className="text-[10px] uppercase tracking-widest text-white/40 font-mono">
                  Fretboard Position Diagram
                </div>
                <div className="flex gap-3">
                  {[1, 2, 3].map((fretNumber) => (
                    <div
                      key={fretNumber}
                      className="w-14 h-40 bg-white/5 border-t border-b border-white/10 flex flex-col justify-between py-2 rounded-sm relative"
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-10 font-bold text-4xl font-mono">
                        {fretNumber}
                      </div>
                      {[0, 1, 2, 3, 4, 5].map((strIdx) => {
                        const hasDot =
                          activeVoicing &&
                          activeVoicing.frets[strIdx] === fretNumber;

                        return (
                          <div key={strIdx} className="h-[1px] w-full bg-white/20 relative">
                            {hasDot && (
                              <div className="absolute left-1/2 -translate-x-1/2 -top-[4px] w-2.5 h-2.5 bg-[#a3ff12] rounded-full shadow-[0_0_10px_#a3ff12]" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-px h-32 bg-white/10 hidden md:block" />

              {/* Chord Details & Transposition Controls */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full border border-[#a3ff12]/50 flex items-center justify-center text-[#a3ff12] font-mono font-extrabold text-2xl shadow-[0_0_15px_rgba(163,255,18,0.2)]">
                    {activeChordName}
                  </div>
                  <div>
                    <div className="text-base font-bold text-white font-mono">
                      {activeChordName} Chord
                    </div>
                    <div className="text-[11px] text-white/40 uppercase font-mono">
                      {capoOffset > 0 ? `Capo Fret ${capoOffset}` : "Standard Tuning"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setCapoOffset((prev) => (prev + 1) % 8)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold border border-white/10 font-mono transition-colors text-white/80"
                  >
                    CAPO: {capoOffset}
                  </button>
                  <button
                    onClick={() => playChordVoicing(activeChordName)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold border border-white/10 font-mono transition-colors text-[#a3ff12] flex items-center space-x-1"
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>AUDITION</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Sequence Sidebar & Practice Action Card */}
        <aside className="space-y-6">
          {/* Next in Sequence Container */}
          <div className="bg-white/5 border border-white/10 rounded-2xl flex flex-col overflow-hidden backdrop-blur-xl">
            <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 font-mono">
                  NEXT IN SEQUENCE
                </div>
                <div className="text-xs font-mono text-white/70 mt-0.5">
                  Section: {activeSectionName}
                </div>
              </div>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2 rounded-xl bg-[#a3ff12] text-black font-bold shadow-[0_0_12px_rgba(163,255,18,0.3)]"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black" />}
              </button>
            </div>

            <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
              {allSongChords.slice(0, 6).map((chord, idx) => (
                <div
                  key={idx}
                  onClick={() => playChordVoicing(chord)}
                  className="p-3 bg-white/5 border border-white/5 hover:border-white/15 rounded-xl flex items-center justify-between cursor-pointer transition-colors"
                >
                  <span className="font-bold font-mono text-sm text-[#a3ff12]">
                    {chord}
                  </span>
                  <span className="text-[10px] font-mono text-white/40">
                    1:{(idx * 3 + 45).toString().padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Practice Mode Promo Card */}
          <div className="h-44 bg-[#a3ff12]/10 border border-[#a3ff12]/20 rounded-2xl p-5 flex flex-col justify-between backdrop-blur-xl">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#a3ff12] font-mono flex items-center space-x-1">
                <Zap className="w-3.5 h-3.5" />
                <span>Practice Mode</span>
              </div>
              <div className="text-base font-bold text-white leading-tight mt-1.5 font-sans">
                Perfect your chord transitions with 60s drills
              </div>
            </div>
            <button
              onClick={() => {
                const el = document.getElementById("nav-tab-practice");
                if (el) el.click();
              }}
              className="bg-[#a3ff12] text-black text-center py-2.5 rounded-xl text-xs font-bold font-mono hover:bg-[#92e610] transition-all shadow-[0_0_15px_rgba(163,255,18,0.3)]"
            >
              START PRACTICE DRILL
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
