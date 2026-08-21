import React, { useState, useEffect } from "react";
import {
  Repeat,
  Play,
  Square,
  Circle,
  Volume2,
  Trash2,
  Sliders,
  Sparkles,
  ArrowRight,
  Save,
  Check,
  Share2,
  Mic,
  MicOff,
} from "lucide-react";
import { looperEngine } from "../audio/looperEngine";
import { audioEngine } from "../audio/audioContext";
import { LooperTrack, DAWProject, WorkstationMode } from "../types";
import { saveProjectToDB, saveLooperSessionToDB } from "../utils/storage";

interface LooperStationProps {
  onSelectMode?: (mode: WorkstationMode) => void;
}

export const LooperStation: React.FC<LooperStationProps> = ({ onSelectMode }) => {
  const [tracks, setTracks] = useState<LooperTrack[]>(looperEngine.getTracks());
  const [status, setStatus] = useState(looperEngine.getStatus());
  const [progress, setProgress] = useState<number>(0);
  const [isMicActive, setIsMicActive] = useState<boolean>(audioEngine.getIsMicActive());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubState = looperEngine.subscribeState(() => {
      setTracks([...looperEngine.getTracks()]);
      setStatus({ ...looperEngine.getStatus() });
    });

    const unsubProg = looperEngine.subscribeProgress(setProgress);
    const unsubMic = audioEngine.subscribeMicStatus(setIsMicActive);

    return () => {
      unsubState();
      unsubProg();
      unsubMic();
      audioEngine.releaseInput("looper-input");
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

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
      showToast("All loop tracks cleared.");
    }
  };

  const handleToggleMic = async () => {
    try {
      if (isMicActive) {
        audioEngine.releaseInput("looper-input");
      } else {
        await audioEngine.acquireInput("looper-input");
      }
    } catch (err) {
      alert("Microphone permission required for guitar recording.");
    }
  };

  const handleCommitSingleTrackToDAW = async (trackIdx: number) => {
    const dawTrack = looperEngine.exportTrackAsDAWTrack(trackIdx);
    if (!dawTrack) {
      showToast("No audio in this loop layer to send.");
      return;
    }

    const newProject: DAWProject = {
      id: `project-loop-${Date.now()}`,
      name: `Loop Take ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      bpm: 120,
      keySig: "Am",
      timeSig: "4/4",
      tracks: [dawTrack],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveProjectToDB(newProject);
    showToast(`Layer "${tracks[trackIdx].name}" committed to Studio DAW!`);
    if (onSelectMode) {
      setTimeout(() => onSelectMode("multi-track"), 800);
    }
  };

  const handleCommitAllToDAW = async () => {
    const dawTracks = looperEngine.exportAllTracksAsDAWTracks();
    if (dawTracks.length === 0) {
      showToast("Record at least one loop layer before committing to DAW.");
      return;
    }

    const newProject: DAWProject = {
      id: `project-loop-session-${Date.now()}`,
      name: `Loop Session (${dawTracks.length} Layers)`,
      bpm: 120,
      keySig: "Am",
      timeSig: "4/4",
      tracks: dawTracks,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveProjectToDB(newProject);
    showToast(`Committed ${dawTracks.length} loop layers to Studio DAW!`);
    if (onSelectMode) {
      setTimeout(() => onSelectMode("multi-track"), 800);
    }
  };

  const handleSaveLooperSession = async () => {
    const hasAudio = tracks.some((t) => t.buffer !== null);
    if (!hasAudio) {
      showToast("Record something before saving session.");
      return;
    }

    await saveLooperSessionToDB({
      id: `looper-sess-${Date.now()}`,
      name: `Guitar Loop (${new Date().toLocaleDateString()})`,
      bpm: 120,
      tracks: [...tracks],
      updatedAt: Date.now(),
    });

    showToast("Looper session saved to local library!");
  };

  return (
    <div id="panel-looper-station" className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Toast notification banner */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 bg-[#16191f] border border-[#a3ff12] text-[#a3ff12] px-4 py-2.5 rounded-2xl shadow-[0_0_20px_rgba(163,255,18,0.2)] text-xs font-mono font-bold flex items-center gap-2 animate-in slide-in-from-top duration-200">
          <Check className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

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
            Processed Tone Studio DSP recording, sound-on-sound overdubbing, reverse playback & DAW export
          </p>
        </div>

        {/* Master Stomp & DAW Commit Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Live Guitar Input Toggle */}
          <button
            id="btn-looper-mic"
            onClick={handleToggleMic}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer ${
              isMicActive
                ? "bg-[#a3ff12]/15 text-[#a3ff12] border-[#a3ff12]/40"
                : "bg-white/5 border-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            {isMicActive ? <Mic className="w-3.5 h-3.5 text-[#a3ff12]" /> : <MicOff className="w-3.5 h-3.5 text-zinc-400" />}
            <span>{isMicActive ? "INPUT READY" : "ENABLE IN"}</span>
          </button>

          {/* Commit All Loops to DAW */}
          <button
            id="btn-looper-commit-daw"
            onClick={handleCommitAllToDAW}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-[#a3ff12]/10 border border-white/5 hover:border-[#a3ff12]/40 text-xs font-mono font-bold text-zinc-300 hover:text-[#a3ff12] transition-colors cursor-pointer"
            title="Commit all active loop layers to Multi-Track Studio"
          >
            <Share2 className="w-3.5 h-3.5 text-[#a3ff12]" />
            <span>COMMIT TO STUDIO</span>
          </button>

          {/* Save Session */}
          <button
            onClick={handleSaveLooperSession}
            className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Save Looper Session"
          >
            <Save className="w-4 h-4" />
          </button>

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
            const isSelectedActive = status.activeTrackIndex === idx;

            return (
              <div
                key={track.id}
                id={`loop-track-${idx + 1}`}
                onClick={() => looperEngine.setActiveTrackIndex(idx)}
                className={`p-5 rounded-3xl border transition-all relative flex flex-col justify-between cursor-pointer ${
                  isSelectedActive
                    ? "border-[#a3ff12]/60 shadow-[0_0_20px_rgba(163,255,18,0.1)] frosted-card"
                    : hasAudio
                    ? isPlayingThis
                      ? "frosted-card border-[#a3ff12]/40"
                      : "frosted-card"
                    : "bg-white/5 border border-white/5 opacity-70"
                }`}
              >
                {/* Track Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2.5">
                    <span className={`w-6 h-6 rounded-lg border flex items-center justify-center font-mono font-bold text-xs ${
                      isSelectedActive
                        ? "bg-[#a3ff12] text-black border-[#a3ff12]"
                        : "bg-white/5 border-white/5 text-[#a3ff12]"
                    }`}>
                      {idx + 1}
                    </span>
                    <div>
                      <h3 className="font-mono font-bold text-sm text-white flex items-center gap-2">
                        <span>{track.name}</span>
                        {isSelectedActive && (
                          <span className="text-[9px] text-[#a3ff12] uppercase font-bold tracking-wider">
                            (REC TARGET)
                          </span>
                        )}
                      </h3>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {hasAudio ? `${track.lengthSeconds.toFixed(1)}s Loop` : "Empty track"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    {hasAudio ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCommitSingleTrackToDAW(idx);
                        }}
                        className="text-[10px] font-mono font-bold text-zinc-300 hover:text-[#a3ff12] bg-white/5 hover:bg-[#a3ff12]/10 px-2 py-0.5 rounded border border-white/5 hover:border-[#a3ff12]/30 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Export this layer into Studio DAW"
                      >
                        <span>&rarr; DAW</span>
                      </button>
                    ) : null}

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
                      {Array.from({ length: 32 }).map((_, bIdx) => {
                        const channelData = track.buffer?.getChannelData(0);
                        let heightPercent = 20;
                        if (channelData && channelData.length > 0) {
                          const step = Math.floor(channelData.length / 32);
                          const start = bIdx * step;
                          let max = 0;
                          for (let j = 0; j < step && start + j < channelData.length; j++) {
                            const val = Math.abs(channelData[start + j]);
                            if (val > max) max = val;
                          }
                          heightPercent = Math.min(100, Math.max(15, max * 160));
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
                      <span>{isSelectedActive ? "Arm target - press REC" : "Click to select"}</span>
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
                <div className="space-y-2.5 my-1" onClick={(e) => e.stopPropagation()}>
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
                <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-2" onClick={(e) => e.stopPropagation()}>
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
    </div>
  );
};
