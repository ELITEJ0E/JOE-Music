import React, { useState, useEffect, useRef } from "react";
import {
  Repeat,
  Play,
  Square,
  Circle,
  RotateCcw,
  Volume2,
  VolumeX,
  FastForward,
  Mic,
  Trash2,
  Sliders,
  Sparkles,
  Music,
  Disc,
} from "lucide-react";
import { looperEngine } from "../audio/looperEngine";
import { LooperTrack } from "../types";

export const LooperStation: React.FC = () => {
  const [tracks, setTracks] = useState<LooperTrack[]>(looperEngine.getTracks());
  const [status, setStatus] = useState(looperEngine.getStatus());
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    const unsubState = looperEngine.subscribeState(() => {
      setTracks([...looperEngine.getTracks()]);
      setStatus({ ...looperEngine.getStatus() });
    });

    const unsubProg = looperEngine.subscribeProgress(setProgress);

    return () => {
      unsubState();
      unsubProg();
    };
  }, []);

  const handleRecordButton = () => {
    if (status.isRecording) {
      looperEngine.stopRecord();
    } else {
      looperEngine.startRecord();
    }
  };

  const handlePlayToggle = () => {
    looperEngine.togglePlay();
  };

  const handleClearAll = () => {
    if (confirm("Clear all recorded loop tracks?")) {
      looperEngine.clearAll();
    }
  };

  return (
    <div id="panel-looper-station" className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Header & Main Looper Controls */}
      <div className="frosted-card rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <Repeat className="w-5 h-5 text-[#a3ff12]" />
            <h2 className="text-xl font-extrabold text-white font-mono tracking-tight">
              4-TRACK LIVE GUITAR LOOPER
            </h2>
            <span className="text-[10px] font-mono font-bold bg-[#a3ff12]/10 text-[#a3ff12] px-2 py-0.5 rounded border border-[#a3ff12]/30">
              SOUND-ON-SOUND
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            Unlimited overdubbing, reverse playback, half-speed & per-track panning
          </p>
        </div>

        {/* Master Stomp Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Master Play/Stop */}
          <button
            id="btn-looper-play"
            onClick={handlePlayToggle}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer ${
              status.isPlaying
                ? "bg-[#a3ff12] text-black border-[#a3ff12] shadow-[0_0_20px_rgba(163,255,18,0.3)]"
                : "bg-white/5 border border-white/5 hover:border-white/10 text-zinc-300 hover:text-white"
            }`}
          >
            {status.isPlaying ? <Square className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-current text-[#a3ff12]" />}
            <span>{status.isPlaying ? "STOP ALL" : "PLAY ALL"}</span>
          </button>

          {/* Clear All */}
          <button
            id="btn-looper-clear"
            onClick={handleClearAll}
            className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-red-500/40 hover:text-red-400 text-zinc-400 transition-colors cursor-pointer"
            title="Clear all tracks"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Section: 2x2 Loop Grid on Left + Master Stomp & Dial on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left 3 Columns: 2x2 Loop Grid */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-5">
          {tracks.map((track, idx) => {
            const hasAudio = track.buffer !== null;
            const isPlayingThis = status.isPlaying && hasAudio && !track.muted;

            return (
              <div
                key={track.id}
                id={`loop-track-${idx + 1}`}
                className={`p-5 rounded-3xl border transition-all relative flex flex-col justify-between ${
                  hasAudio
                    ? isPlayingThis
                      ? "frosted-card border-[#a3ff12]/50 shadow-[0_0_20px_rgba(163,255,18,0.08)]"
                      : "frosted-card"
                    : "bg-white/5 border border-white/5 opacity-70"
                }`}
              >
                {/* Track Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2.5">
                    <span className="w-6 h-6 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center font-mono font-bold text-xs text-[#a3ff12]">
                      {idx + 1}
                    </span>
                    <div>
                      <h3 className="font-mono font-bold text-sm text-white">
                        {track.name}
                      </h3>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {hasAudio ? `${track.lengthSeconds.toFixed(1)}s Loop` : "Empty track"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    {hasAudio ? (
                      <span className="text-[10px] font-mono font-bold text-[#a3ff12] bg-[#a3ff12]/10 px-2 py-0.5 rounded border border-[#a3ff12]/30">
                        {track.muted ? "MUTED" : isPlayingThis ? "PLAYING" : "READY"}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-zinc-500 bg-white/5 px-2 py-0.5 rounded">
                        EMPTY
                      </span>
                    )}
                  </div>
                </div>

                {/* Track Waveform Display Area */}
                <div className="h-14 bg-[#0a0c0e]/60 rounded-xl border border-white/5 p-2 flex items-center justify-center relative overflow-hidden mb-3">
                  {hasAudio && track.buffer ? (
                    <div className="w-full h-full flex items-center justify-between gap-0.5">
                      {/* Real Waveform Peak Slices */}
                      {Array.from({ length: 32 }).map((_, bIdx) => {
                        const channelData = track.buffer?.getChannelData(0);
                        let heightPercent = 20;
                        if (channelData && channelData.length > 0) {
                          const step = Math.floor(channelData.length / 32);
                          const sampleVal = Math.abs(channelData[bIdx * step] || 0);
                          heightPercent = Math.min(100, Math.max(15, sampleVal * 160));
                        }
                        const isPlayhead = Math.floor(progress * 32) === bIdx && isPlayingThis;

                        return (
                          <div
                            key={bIdx}
                            className={`w-1 rounded-full transition-all ${
                              isPlayhead
                                ? "bg-white shadow-[0_0_8px_white] scale-y-125"
                                : "bg-[#a3ff12]"
                            }`}
                            style={{ height: `${heightPercent}%` }}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono text-zinc-600 flex items-center gap-1.5">
                      <span>Ready to record</span>
                    </div>
                  )}

                  {/* Playhead line */}
                  {isPlayingThis && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-[#a3ff12] shadow-[0_0_8px_#a3ff12] pointer-events-none transition-all"
                      style={{ left: `${progress * 100}%` }}
                    />
                  )}
                </div>

                {/* Volume & Pan Sliders */}
                <div className="space-y-2.5 my-1">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                      <span>LEVEL</span>
                      <span className="text-white font-bold">{Math.round(track.volume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={track.volume * 100}
                      onChange={(e) => looperEngine.setTrackVolume(track.id, parseInt(e.target.value, 10) / 100)}
                      className="w-full h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                      <span>PAN</span>
                      <span className="text-white font-bold">
                        {track.pan === 0 ? "C" : track.pan < 0 ? `L${Math.round(-track.pan * 50)}` : `R${Math.round(track.pan * 50)}`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={track.pan * 100}
                      onChange={(e) => looperEngine.setTrackPan(track.id, parseInt(e.target.value, 10) / 100)}
                      className="w-full h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
                    />
                  </div>
                </div>

                {/* Special FX: Mute, Reverse, Half-Speed & Clear */}
                <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-2">
                  <div className="flex space-x-1.5">
                    <button
                      onClick={() => looperEngine.toggleMute(track.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                        track.muted
                          ? "bg-red-500/20 text-red-400 border-red-500"
                          : "bg-white/5 text-zinc-400 border border-white/5 hover:text-white"
                      }`}
                    >
                      MUTE
                    </button>

                    <button
                      onClick={() => looperEngine.toggleReverse(track.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                        track.reversed
                          ? "bg-[#a3ff12]/20 text-[#a3ff12] border-[#a3ff12]"
                          : "bg-white/5 text-zinc-400 border border-white/5 hover:text-white"
                      }`}
                    >
                      REV
                    </button>

                    <button
                      onClick={() => looperEngine.toggleHalfSpeed(track.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                        track.halfSpeed
                          ? "bg-[#a3ff12]/20 text-[#a3ff12] border-[#a3ff12]"
                          : "bg-white/5 text-zinc-400 border border-white/5 hover:text-white"
                      }`}
                    >
                      1/2
                    </button>
                  </div>

                  <button
                    onClick={() => looperEngine.clearTrack(track.id)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                    title="Clear Track"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right 1 Column: Big Circular Record Stomp Button & Loop Dial */}
        <div className="frosted-card rounded-3xl p-6 flex flex-col items-center justify-between space-y-6 dot-matrix-bg">
          {/* Status Badge */}
          <div className="w-full flex items-center justify-between border-b border-white/5 pb-3">
            <span className="text-[11px] font-mono font-bold text-zinc-400 uppercase">
              MASTER LOOPER
            </span>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
              status.isRecording
                ? "bg-red-500/20 text-red-400 border border-red-500 animate-pulse"
                : status.isPlaying
                ? "bg-[#a3ff12]/10 text-[#a3ff12] border border-[#a3ff12]/30"
                : "bg-white/5 text-zinc-500"
            }`}>
              {status.isRecording ? "RECORDING" : status.isPlaying ? "PLAYING" : "IDLE"}
            </span>
          </div>

          {/* Master Big Circular Record Stomp Button */}
          <div className="flex flex-col items-center space-y-4">
            <div className="relative animate-in zoom-in duration-300">
              {/* Outer Circular Progress Ring */}
              <svg className="w-44 h-44 transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  className="text-white/10"
                  strokeWidth="5"
                  stroke="currentColor"
                  fill="none"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  className="text-[#a3ff12] transition-all duration-75"
                  strokeDasharray={`${progress * 282.7}, 282.7`}
                  strokeWidth="5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                />
              </svg>

              {/* Centered Large Circular Stomp Button */}
              <button
                id="btn-looper-record-big"
                onClick={handleRecordButton}
                className={`absolute inset-4 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer shadow-2xl ${
                  status.isRecording
                    ? "bg-red-500 text-white shadow-[0_0_35px_rgba(239,68,68,0.7)] animate-pulse scale-95"
                    : "bg-white/5 border-2 border-white/5 hover:border-[#a3ff12] text-white hover:scale-105"
                }`}
              >
                <Circle
                  className={`w-8 h-8 ${
                    status.isRecording
                      ? "fill-white text-white"
                      : "text-red-500 fill-red-500"
                  }`}
                />
                <span className="font-mono font-extrabold text-xs mt-1 tracking-wider">
                  {status.isRecording ? "DUB / STOP" : "REC / DUB"}
                </span>
                <span className="text-[9px] font-mono text-zinc-400">
                  {status.isRecording ? "CLICK TO LOOP" : "TAP TO RECORD"}
                </span>
              </button>
            </div>

            <div className="text-center font-mono space-y-0.5">
              <div className="text-sm font-bold text-white">
                {status.masterLoopLength > 0 ? `${status.masterLoopLength.toFixed(1)}s Loop Duration` : "Waiting for First Layer"}
              </div>
              <div className="text-[11px] text-zinc-400">
                {Math.round(progress * 100)}% cycle position
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="w-full space-y-2 pt-2 border-t border-white/5">
            <button
              onClick={handlePlayToggle}
              className={`w-full py-2 rounded-xl font-mono font-bold text-xs flex items-center justify-center gap-2 border cursor-pointer ${
                status.isPlaying
                  ? "bg-[#a3ff12] hover:bg-[#92eb10] border-[#a3ff12] text-black shadow-[0_0_15px_rgba(163,255,18,0.3)]"
                  : "bg-white/5 border-white/5 text-zinc-300 hover:text-white"
              }`}
            >
              {status.isPlaying ? <Square className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-current text-[#a3ff12]" />}
              <span>{status.isPlaying ? "STOP PLAYBACK" : "START PLAYBACK"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* "Session Mix" Panel (Clearly labeled Coming Soon / Disabled Demo State) */}
      <div className="frosted-card rounded-3xl p-6 space-y-4 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div className="flex items-center space-x-2.5">
            <Sliders className="w-4 h-4 text-zinc-500" />
            <h3 className="font-mono font-bold text-sm text-zinc-300">
              SESSION MIX & SMART BACKING BANDS
            </h3>
          </div>
          <span className="text-[10px] font-mono font-bold bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded border border-zinc-700">
            COMING SOON • FIRMWARE V2.2
          </span>
        </div>

        {/* Genre Selector Buttons (Disabled Demo) */}
        <div className="space-y-2 opacity-50 pointer-events-none">
          <div className="text-xs font-mono text-zinc-400">SELECT BACKING GENRE:</div>
          <div className="flex flex-wrap gap-2">
            {["Rock Heavy", "Blues 12-Bar", "Funk Groove", "Jazz Swing", "Acoustic Pop"].map((genre, idx) => (
              <button
                key={genre}
                disabled
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border ${
                  idx === 0
                    ? "bg-white/10 text-[#a3ff12] border-[#a3ff12]/40 font-bold"
                    : "bg-white/5 border border-white/5 text-zinc-500"
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>

        {/* Drums / Bass / Backing Track Sliders (Disabled Demo) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 opacity-50 pointer-events-none">
          <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
            <div className="flex justify-between text-[11px] font-mono text-zinc-500">
              <span>DRUM STEM</span>
              <span>80%</span>
            </div>
            <input type="range" disabled value={80} min={0} max={100} className="w-full h-1.5 bg-white/5 rounded accent-[#a3ff12]" />
          </div>

          <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
            <div className="flex justify-between text-[11px] font-mono text-zinc-500">
              <span>BASS STEM</span>
              <span>70%</span>
            </div>
            <input type="range" disabled value={70} min={0} max={100} className="w-full h-1.5 bg-white/5 rounded accent-[#a3ff12]" />
          </div>

          <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
            <div className="flex justify-between text-[11px] font-mono text-zinc-500">
              <span>KEYS / ACCENT STEM</span>
              <span>60%</span>
            </div>
            <input type="range" disabled value={60} min={0} max={100} className="w-full h-1.5 bg-white/5 rounded accent-[#a3ff12]" />
          </div>
        </div>
      </div>
    </div>
  );
};
