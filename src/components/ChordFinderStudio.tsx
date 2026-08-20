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
  Trash2,
} from "lucide-react";
import { SAMPLE_SONGS } from "../data/sampleSongs";
import { findChordByName } from "../data/chordDatabase";
import { guitarSynth } from "../audio/guitarSynth";
import { analyzeAudioFile } from "../audio/audioAnalyzer";
import { audioEngine } from "../audio/audioContext";
import { SongAnalysis, SavedSong } from "../types";
import { ChordDiagram } from "./ChordDiagram";
import { saveSongToDB, loadSongsFromDB, deleteSongFromDB } from "../utils/storage";

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

  const [savedSongs, setSavedSongs] = useState<SavedSong[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [songName, setSongName] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState<{ message: string; pct: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isLiveMic, setIsLiveMic] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [transpose, setTranspose] = useState(0);
  const [capo, setCapo] = useState(0);
  const [simplifyChords, setSimplifyChords] = useState(false);
  const [loopSection, setLoopSection] = useState(true);
  const [slowDown, setSlowDown] = useState(false);
  const [voicingIndex, setVoicingIndex] = useState(1);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadSongsFromDB().then(setSavedSongs);
  }, []);

  useEffect(() => {
    if (activeSong.audioBlob && audioRef.current) {
      const url = URL.createObjectURL(activeSong.audioBlob);
      audioRef.current.src = url;
      audioRef.current.load();
      return () => URL.revokeObjectURL(url);
    }
  }, [activeSong.audioBlob]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = slowDown ? 0.75 : 1.0;
    }
  }, [slowDown]);

  useEffect(() => {
    if (isPlaying) {
      audioRef.current?.play().catch(() => setIsPlaying(false));
    } else {
      audioRef.current?.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    let interval: number;
    if (isPlaying) {
      interval = window.setInterval(() => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
        }
      }, 50); // fast update for smooth playhead
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const duration = activeSong.duration || 1;
  const barSeconds = Math.max(1.5, Math.min(4.0, (60 / (activeSong.tempo || 120)) * 4));

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const segments = activeSong.chordSegments || [];
  const activeSegmentIdx = segments.findIndex(s => currentTime >= s.startTime && currentTime <= s.endTime);
  const activeIdx = activeSegmentIdx !== -1 ? activeSegmentIdx : 0;
  
  const getDisplayChord = (idx: number) => {
    if (idx < 0 || idx >= segments.length) return { chord: "-", timeLabel: "-" };
    const seg = segments[idx];
    return { chord: seg.chord, timeLabel: formatTime(seg.startTime) };
  };

  const prevChord = getDisplayChord(activeIdx - 1);
  const activeChord = getDisplayChord(activeIdx);
  const nextChord = getDisplayChord(activeIdx + 1);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    abortControllerRef.current = new AbortController();
    setAnalysisProgress({ message: "Reading audio file...", pct: 0 });
    
    try {
      const result = await analyzeAudioFile(
        file, 
        (msg, pct) => setAnalysisProgress({ message: msg, pct }),
        abortControllerRef.current.signal
      );
      
      setActiveSong(result);
      if (result.audioBlob) {
        await saveSongToDB(result as SavedSong);
        loadSongsFromDB().then(setSavedSongs);
      }
      setCurrentTime(0);
      setIsPlaying(false);
      setAnalysisProgress(null);
      abortControllerRef.current = null;
    } catch (err: any) {
      setAnalysisProgress(null);
      abortControllerRef.current = null;
      if (err.message !== "Analysis cancelled by user.") {
        alert("Error analyzing audio file. Please try another audio format.");
      }
    }
  };

  const handleAnalyzeYoutube = async () => {
    const query = songName.trim() || youtubeUrl.trim();
    if (!query) return;
    setAnalysisProgress({ message: "Searching song database...", pct: 50 });
    
    try {
      const response = await fetch('/api/analyze-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songQuery: query })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        alert(data.error || "Failed to analyze song.");
      } else {
        data.title = data.title + " (AI-Estimated Chords)";
        data.id = `yt-analyzed-${Date.now()}`;
        // Map legacy format to new format
        if (!data.chordSegments) {
          let t = 0;
          data.chordSegments = data.sections.flatMap((sec: any) => 
            sec.chords.map((c: string) => {
              const seg = { chord: c, startTime: t, endTime: t + 2, confidence: 90 };
              t += 2;
              return seg;
            })
          );
        }
        setActiveSong(data);
        setCurrentTime(0);
        setIsPlaying(false);
      }
    } catch (err) {
      console.error(err);
      alert("Network error while contacting analysis server.");
    } finally {
      setAnalysisProgress(null);
    }
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

  const handleDeleteSong = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteSongFromDB(id);
    loadSongsFromDB().then(setSavedSongs);
  };

  const loadSavedSong = (song: SavedSong) => {
    setActiveSong(song);
    setCurrentTime(0);
    setIsPlaying(false);
  };

  // Get active chord fingering for the fretboard diagram
  const activeVoicing = findChordByName(activeChord.chord);

  return (
    <div id="panel-chord-finder" className="max-w-6xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      <audio ref={audioRef} className="hidden" />
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
          className="frosted-card-hover rounded-3xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all group min-h-[140px]"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:scale-105 transition-transform mb-2 border border-white/5">
            <Upload className="w-5 h-5 text-zinc-300 group-hover:text-white" />
          </div>
          <h3 className="text-xs font-bold font-mono text-zinc-200 uppercase tracking-wider">
            Upload Audio
          </h3>
          <p className="text-[11px] font-mono text-zinc-500 mt-0.5">MP3, WAV, FLAC</p>
        </div>

        {/* YouTube Link / Song Search */}
        <div className="frosted-card rounded-3xl p-4 flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center space-x-2">
            <LinkIcon className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-bold font-mono text-zinc-200 uppercase tracking-wider">
              AI Song Search
            </h3>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <input
              type="text"
              placeholder="Song Name & Artist..."
              value={songName}
              onChange={(e) => setSongName(e.target.value)}
              className="flex-1 bg-white/5 text-xs font-mono text-white rounded-xl px-3 py-2 border border-white/10 focus:border-[#a3ff12]/50 focus:outline-none placeholder:text-zinc-500"
            />
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Or paste YouTube URL..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className="flex-1 bg-white/5 text-xs font-mono text-white rounded-xl px-3 py-2 border border-white/10 focus:border-[#a3ff12]/50 focus:outline-none placeholder:text-zinc-500"
              />
              <button
                onClick={handleAnalyzeYoutube}
                disabled={!!analysisProgress}
                className="px-3 py-2 bg-[#a3ff12] hover:bg-[#92eb10] text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer font-mono"
              >
                {analysisProgress ? "..." : "SEARCH"}
              </button>
            </div>
          </div>
        </div>

        {/* Microphone Live Tracking */}
        <div
          onClick={toggleLiveMic}
          className={`border rounded-3xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all group min-h-[140px] ${
            isLiveMic
              ? "bg-[#a3ff12]/15 border-[#a3ff12] shadow-[0_0_20px_rgba(163,255,18,0.2)]"
              : "frosted-card-hover"
          }`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${isLiveMic ? "bg-[#a3ff12] text-black" : "bg-white/5 text-zinc-300 border border-white/5"}`}>
            {isLiveMic ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 text-zinc-400" />}
          </div>
          <h3 className={`text-xs font-bold font-mono uppercase tracking-wider ${isLiveMic ? "text-[#a3ff12]" : "text-zinc-200"}`}>
            Microphone
          </h3>
          <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
            {isLiveMic ? "Listening to live guitar input..." : "Listen to live audio"}
          </p>
        </div>
      </div>

      {/* Analysis Progress Bar */}
      {analysisProgress && (
        <div className="frosted-card rounded-2xl p-4 flex flex-col space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-mono font-bold text-[#a3ff12] tracking-wider animate-pulse">
              ANALYSIS IN PROGRESS
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-zinc-400">
                {Math.round(analysisProgress.pct)}%
              </span>
              {abortControllerRef.current && (
                <button
                  onClick={() => abortControllerRef.current?.abort()}
                  className="px-2 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded text-[10px] font-bold font-mono transition-colors"
                >
                  CANCEL
                </button>
              )}
            </div>
          </div>
          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-500 to-[#a3ff12] transition-all duration-300"
              style={{ width: `${analysisProgress.pct}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-zinc-500 text-center">
            {analysisProgress.message}
          </span>
        </div>
      )}

      {/* My Songs List */}
      {savedSongs.length > 0 && (
        <div className="frosted-card rounded-3xl p-4 flex gap-3 overflow-x-auto pb-4">
          <div className="flex items-center gap-2 pr-4 border-r border-white/10 shrink-0">
            <Music className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-bold font-mono text-zinc-300 uppercase tracking-wider">
              My Songs
            </h3>
          </div>
          {savedSongs.map((song) => (
            <div
              key={song.id}
              onClick={() => loadSavedSong(song)}
              className="shrink-0 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2 flex items-center gap-3 cursor-pointer transition-colors"
            >
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">{song.title}</span>
                <span className="text-[10px] font-mono text-zinc-400">{song.key} • {song.tempo} BPM</span>
              </div>
              <button
                onClick={(e) => handleDeleteSong(song.id, e)}
                className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Song Track Info Bar */}
      <div className="frosted-card rounded-3xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
          <span className="text-[11px] font-mono font-bold text-[#a3ff12] flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#a3ff12]" />
            {activeSong.id === "neon-horizon" ? "DEMO DATA" : `CHORD CONFIDENCE ${activeSong.confidence || 0}%`}
          </span>
          <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-[#a3ff12]" style={{ width: `${activeSong.id === "neon-horizon" ? 100 : activeSong.confidence || 0}%` }} />
          </div>
        </div>
      </div>

      {/* Main Center Area: Chord Progression Canvas + Right Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Chord Progression Canvas (Left/Center 8 cols) */}
        <div className="lg:col-span-8 frosted-card rounded-3xl p-6 flex flex-col justify-between space-y-6">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
              CURRENT PROGRESSION
            </span>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-zinc-300">
                {activeSong.tuning}
              </span>
              <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-zinc-300">
                Key: {activeSong.key}
              </span>
            </div>
          </div>

          {/* Large Chord Triad Display & Diagram */}
          <div className="flex flex-col items-center justify-center py-6 border-y border-white/5 space-y-8">
            <div className="flex items-center justify-around w-full">
              {/* Previous Chord */}
              <div className="text-center opacity-40">
                <div className="text-3xl font-bold font-mono text-zinc-300">
                  {prevChord.chord}
                </div>
                <div className="text-[11px] font-mono text-zinc-500 mt-1">
                  {prevChord.timeLabel}
                </div>
              </div>

              {/* Active Chord - GIANT glowing neon green text */}
              <div className="text-center transform scale-110">
                <div className="text-7xl font-black font-mono text-[#a3ff12] drop-shadow-[0_0_30px_rgba(163,255,18,0.8)] tracking-tight">
                  {activeChord.chord}
                </div>
                <div className="text-xs font-mono font-bold text-[#a3ff12] mt-2 tracking-wider">
                  {activeChord.timeLabel}
                </div>
              </div>

              {/* Next Chord */}
              <div className="text-center opacity-40">
                <div className="text-3xl font-bold font-mono text-zinc-300">
                  {nextChord.chord}
                </div>
                <div className="text-[11px] font-mono text-zinc-500 mt-1">
                  {nextChord.timeLabel}
                </div>
              </div>
            </div>

            {/* Active Chord Diagram */}
            <div className="flex justify-center w-full">
              {activeVoicing ? (
                <div className="bg-[#13161a] rounded-xl p-6 border border-white/5 shadow-inner">
                  <ChordDiagram frets={activeVoicing.frets} fingers={activeVoicing.fingers} size="lg" />
                </div>
              ) : (
                <div className="bg-[#13161a] rounded-xl p-6 border border-white/5 shadow-inner flex flex-col items-center justify-center h-48 w-64 opacity-50">
                  <span className="text-zinc-400 text-xs font-mono text-center mb-4">No diagram available for<br/><strong className="text-zinc-200 text-sm mt-1 block">{activeChord.chord}</strong></span>
                  {/* Muted placeholder representation */}
                  <div className="w-full h-16 border-t-4 border-zinc-600 flex justify-between pt-2">
                    {[0, 1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="h-full w-px bg-zinc-700/50" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Audio Waveform Track with Chord Split Markers */}
          <div className="space-y-3">
            <div className="h-14 bg-white/5 rounded-xl p-2 relative flex items-center justify-between border border-white/5 overflow-hidden">
              {/* Waveform vertical bars */}
              {Array.from({ length: 48 }).map((_, wIdx) => {
                const progress = duration > 0 ? (currentTime / duration) : 0;
                const isPassed = wIdx / 48 <= progress;
                const h = 20 + ((wIdx * 19) % 70);
                return (
                  <div
                    key={wIdx}
                    className={`w-1 rounded-full transition-colors ${
                      isPassed ? "bg-[#a3ff12]" : "bg-zinc-700"
                    }`}
                    style={{ height: `${h}%` }}
                  />
                );
              })}

              {/* Chord split lines */}
              <div className="absolute inset-0 flex pointer-events-none">
                {segments.map((seg, idx) => {
                  const leftPct = duration > 0 ? (seg.startTime / duration) * 100 : 0;
                  return (
                    <div 
                      key={seg.id || idx} 
                      className="absolute h-full border-l border-white/10 flex flex-col justify-end pb-1 pl-1 text-[10px] font-mono text-[#a3ff12]/70"
                      style={{ left: `${leftPct}%` }}
                    >
                      {seg.chord}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Transport controls: |<<, ▶, >>| */}
            <div className="flex items-center justify-center gap-6 pt-1">
              <span className="text-xs font-mono text-zinc-400 w-12 text-right">
                {formatTime(currentTime)}
              </span>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - barSeconds);
                    setCurrentTime((prev) => Math.max(0, prev - barSeconds));
                  }}
                  className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-12 h-12 rounded-xl bg-[#a3ff12] hover:bg-[#92eb10] text-black flex items-center justify-center shadow-[0_0_20px_rgba(163,255,18,0.4)] transition-all cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
                </button>

                <button
                  onClick={() => {
                    if (audioRef.current) audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + barSeconds);
                    setCurrentTime((prev) => Math.min(duration, prev + barSeconds));
                  }}
                  className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              <span className="text-xs font-mono text-zinc-400 w-12">
                {formatTime(duration)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Controls (4 cols) */}
        <div className="lg:col-span-4 frosted-card rounded-3xl p-5 space-y-4">
          {/* Transpose & Capo */}
          <div className="grid grid-cols-2 gap-3">
            {/* Transpose */}
            <div className="bg-white/5 p-3 rounded-xl space-y-1.5 border border-white/5">
              <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">Transpose</span>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setTranspose((t) => Math.max(-12, t - 1))}
                  className="w-6 h-6 rounded bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold"
                >
                  -
                </button>
                <span className="text-xs font-mono font-bold text-white">{transpose >= 0 ? `+${transpose}` : transpose}</span>
                <button
                  onClick={() => setTranspose((t) => Math.min(12, t + 1))}
                  className="w-6 h-6 rounded bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold"
                >
                  +
                </button>
              </div>
            </div>

            {/* Capo */}
            <div className="bg-white/5 p-3 rounded-xl space-y-1.5 border border-white/5">
              <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">Capo</span>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCapo((c) => Math.max(0, c - 1))}
                  className="w-6 h-6 rounded bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold"
                >
                  -
                </button>
                <span className="text-xs font-mono font-bold text-white">{capo}</span>
                <button
                  onClick={() => setCapo((c) => Math.min(12, c + 1))}
                  className="w-6 h-6 rounded bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center text-xs font-bold"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Toggles: Simplify, Loop, Slow Down */}
          <div className="space-y-2 pt-1 text-xs font-mono">
            <label className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
              <span className="text-zinc-300">Simplify Chords</span>
              <input
                type="checkbox"
                checked={simplifyChords}
                onChange={(e) => setSimplifyChords(e.target.checked)}
                className="w-4 h-4 rounded accent-[#a3ff12]"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
              <span className="text-zinc-300">Loop Section</span>
              <input
                type="checkbox"
                checked={loopSection}
                onChange={(e) => setLoopSection(e.target.checked)}
                className="w-4 h-4 rounded accent-[#a3ff12]"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
              <span className="text-zinc-300">Slow Down (0.75x)</span>
              <input
                type="checkbox"
                checked={slowDown}
                onChange={(e) => setSlowDown(e.target.checked)}
                className="w-4 h-4 rounded accent-[#a3ff12]"
              />
            </label>
          </div>

          {/* Voicing Buttons */}
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[11px] font-mono text-zinc-400">
              <span>VOICING</span>
              <span className="text-[#a3ff12] font-bold">Standard Open</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((v) => (
                <button
                  key={v}
                  onClick={() => setVoicingIndex(v)}
                  className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    voicingIndex === v
                      ? "bg-[#a3ff12] text-black"
                      : "bg-white/5 text-zinc-400 hover:text-white"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
