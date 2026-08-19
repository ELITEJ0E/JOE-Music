import React, { useState, useEffect } from "react";
import {
  Repeat,
  Play,
  Square,
  Circle,
  RotateCcw,
  Undo2,
  Volume2,
  VolumeX,
  FastForward,
  Mic,
  Trash2,
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
    <div id="panel-looper-station" className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Header & Main Looper Controls */}
      <div className="frosted-card p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Repeat className="w-5 h-5 text-[#a3ff12]" />
            <h2 className="text-xl font-bold text-white font-mono">
              4-TRACK LIVE GUITAR LOOPER
            </h2>
            <span className="text-[10px] font-mono font-bold bg-[#a3ff12]/15 text-[#a3ff12] px-2 py-0.5 rounded-full border border-[#a3ff12]/30">
              SOUND-ON-SOUND
            </span>
          </div>
          <p className="text-xs text-white/40 font-mono mt-0.5">
            Unlimited overdubbing, reverse playback, half-speed & per-track panning
          </p>
        </div>

        {/* Master Stomp Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Main Record/Overdub Stomp Button */}
          <button
            id="btn-looper-record"
            onClick={handleRecordButton}
            className={`flex items-center space-x-2 px-6 py-3 rounded-2xl font-mono font-black text-xs transition-all shadow-lg backdrop-blur-md ${
              status.isRecording
                ? "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.6)] animate-pulse"
                : "bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20"
            }`}
          >
            <Circle className={`w-4 h-4 ${status.isRecording ? "fill-white" : "text-red-500 fill-red-500"}`} />
            <span>{status.isRecording ? "STOP RECORD (LOOP)" : "RECORD / OVERDUB"}</span>
          </button>

          {/* Master Play/Stop */}
          <button
            id="btn-looper-play"
            onClick={handlePlayToggle}
            className={`flex items-center space-x-2 px-6 py-3 rounded-2xl font-mono font-bold text-xs transition-all shadow-lg ${
              status.isPlaying
                ? "bg-[#a3ff12] text-black shadow-[0_0_20px_rgba(163,255,18,0.4)]"
                : "bg-white/10 text-white hover:bg-white/15 border border-white/15 backdrop-blur-md"
            }`}
          >
            {status.isPlaying ? <Square className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{status.isPlaying ? "STOP ALL" : "PLAY LOOPS"}</span>
          </button>

          {/* Clear All */}
          <button
            id="btn-looper-clear"
            onClick={handleClearAll}
            className="p-3 rounded-2xl bg-white/5 border border-white/10 text-white/40 hover:text-red-400 hover:border-red-400/40 transition-colors backdrop-blur-md"
            title="Clear all tracks"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Loop Cycle Ring & Timeline Progress */}
      <div className="frosted-card p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 dot-matrix-bg">
        <div className="flex items-center space-x-6">
          {/* Progress Circular Dial */}
          <div className="relative w-20 h-20 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-white/10"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-[#a3ff12] transition-all duration-75"
                strokeDasharray={`${progress * 100}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute font-mono font-bold text-xs text-white">
              {Math.round(progress * 100)}%
            </span>
          </div>

          <div>
            <div className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              {status.isRecording ? "RECORDING LAYER..." : status.isPlaying ? "PLAYING IN SYNC" : "IDLE"}
            </div>
            <div className="text-[11px] font-mono text-white/40 mt-0.5">
              Loop Length: {status.masterLoopLength > 0 ? `${status.masterLoopLength.toFixed(1)}s` : "Waiting for track 1"}
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="w-full md:w-1/2 h-2.5 bg-black/50 rounded-full border border-white/10 overflow-hidden relative">
          <div
            className="h-full bg-[#a3ff12] transition-all duration-75 shadow-[0_0_10px_#a3ff12]"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* 4 Loop Tracks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {tracks.map((track, idx) => {
          const hasAudio = track.buffer !== null;

          return (
            <div
              key={track.id}
              className={`p-6 rounded-3xl border transition-all relative flex flex-col justify-between backdrop-blur-xl ${
                hasAudio
                  ? "frosted-card border-white/15"
                  : "bg-white/[0.02] border-white/5 opacity-50"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-mono font-bold text-xs text-[#a3ff12]">
                    {idx + 1}
                  </span>
                  <h3 className="font-mono font-bold text-sm text-white">
                    {track.name}
                  </h3>
                </div>

                <div className="flex items-center space-x-1">
                  {hasAudio ? (
                    <span className="text-[10px] font-mono font-bold text-[#a3ff12] bg-[#a3ff12]/15 px-2 py-0.5 rounded-full border border-[#a3ff12]/30">
                      ACTIVE ({track.lengthSeconds.toFixed(1)}s)
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-white/40">EMPTY</span>
                  )}
                </div>
              </div>

              {/* Volume & Pan Sliders */}
              <div className="space-y-3 my-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono text-white/40">
                    <span>TRACK LEVEL</span>
                    <span className="text-white font-bold">{Math.round(track.volume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={track.volume * 100}
                    onChange={(e) => looperEngine.setTrackVolume(track.id, parseInt(e.target.value, 10) / 100)}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono text-white/40">
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
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
                  />
                </div>
              </div>

              {/* Special FX: Reverse, Half-Speed, Mute */}
              <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-2">
                <div className="flex space-x-1.5">
                  <button
                    onClick={() => looperEngine.toggleMute(track.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border transition-colors ${
                      track.muted
                        ? "bg-red-500/20 text-red-400 border-red-500"
                        : "bg-white/5 text-white/40 border-white/10 hover:text-white"
                    }`}
                  >
                    MUTE
                  </button>

                  <button
                    onClick={() => looperEngine.toggleReverse(track.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border transition-colors ${
                      track.reversed
                        ? "bg-[#a3ff12]/20 text-[#a3ff12] border-[#a3ff12]"
                        : "bg-white/5 text-white/40 border-white/10 hover:text-white"
                    }`}
                  >
                    REVERSE
                  </button>

                  <button
                    onClick={() => looperEngine.toggleHalfSpeed(track.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border transition-colors ${
                      track.halfSpeed
                        ? "bg-[#a3ff12]/20 text-[#a3ff12] border-[#a3ff12]"
                        : "bg-white/5 text-white/40 border-white/10 hover:text-white"
                    }`}
                  >
                    1/2 SPEED
                  </button>
                </div>

                <button
                  onClick={() => looperEngine.clearTrack(track.id)}
                  className="p-1.5 rounded-lg text-white/30 hover:text-red-400"
                  title="Clear Track"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
