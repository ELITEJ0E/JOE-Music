import React, { useState, useEffect, useRef } from "react";
import {
  SkipBack,
  Square,
  Play,
  Pause,
  Circle,
  Repeat,
  Sliders,
  Volume2,
  Plus,
  Trash2,
  Download,
  Settings,
  User,
  Radio,
  AudioWaveform,
  Check,
} from "lucide-react";
import { audioEngine } from "../audio/audioContext";
import { DAWTrack, SavedRecording } from "../types";
import { saveRecordingToDB } from "../utils/storage";
import { guitarSynth } from "../audio/guitarSynth";

export const MultiTrackStudio: React.FC = () => {
  const [tracks, setTracks] = useState<DAWTrack[]>([
    {
      id: "trk-1",
      name: "Guitar 1",
      color: "#a3ff12",
      volume: 0.85,
      pan: 0,
      muted: false,
      soloed: false,
      audioBuffer: null,
      recording: false,
      startTime: 0,
      duration: 12,
    },
    {
      id: "trk-2",
      name: "Guitar 2",
      color: "#38bdf8",
      volume: 0.78,
      pan: 0.2,
      muted: false,
      soloed: false,
      audioBuffer: null,
      recording: false,
      startTime: 0,
      duration: 12,
    },
  ]);

  const [bpm, setBpm] = useState<number>(120);
  const [keySig, setKeySig] = useState<string>("Am");
  const [timeSig, setTimeSig] = useState<string>("4/4");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [armedTrackId, setArmedTrackId] = useState<string>("trk-1");
  const [selectedTrackId, setSelectedTrackId] = useState<string>("trk-1");
  const [playheadTimeSec, setPlayheadTimeSec] = useState<number>(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  const audioChunksRef = useRef<Blob[]>([]);
  const timelineAnimRef = useRef<number | null>(null);
  const playheadStartCtxTimeRef = useRef<number>(0);
  const playheadStartOffsetRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Timeline playhead loop
  useEffect(() => {
    if (!isPlaying && !isRecording) {
      if (timelineAnimRef.current) cancelAnimationFrame(timelineAnimRef.current);
      return;
    }

    const ctx = audioEngine.getContext();
    const tick = () => {
      const elapsed = ctx.currentTime - playheadStartCtxTimeRef.current;
      const current = playheadStartOffsetRef.current + Math.max(0, elapsed);
      // Loop at 16 seconds if looping is active
      if (isLooping && current > 16) {
        playheadStartCtxTimeRef.current = ctx.currentTime;
        playheadStartOffsetRef.current = 0;
        setPlayheadTimeSec(0);
      } else {
        setPlayheadTimeSec(current);
      }
      timelineAnimRef.current = requestAnimationFrame(tick);
    };

    timelineAnimRef.current = requestAnimationFrame(tick);

    return () => {
      if (timelineAnimRef.current) cancelAnimationFrame(timelineAnimRef.current);
    };
  }, [isPlaying, isRecording, isLooping]);

  const handleTogglePlay = () => {
    if (isPlaying) {
      activeSourcesRef.current.forEach((s) => {
        try {
          s.stop();
        } catch (_) {}
      });
      activeSourcesRef.current = [];
      setIsPlaying(false);
    } else {
      const ctx = audioEngine.getContext();
      playheadStartCtxTimeRef.current = ctx.currentTime;
      playheadStartOffsetRef.current = playheadTimeSec;

      // Play backing chord preview
      guitarSynth.strumChord([null, 0, 2, 2, 1, 0], "down", 30, 0, 0.6);

      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    activeSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch (_) {}
    });
    activeSourcesRef.current = [];
    setIsPlaying(false);
    setIsRecording(false);
    setPlayheadTimeSec(0);
    playheadStartOffsetRef.current = 0;
  };

  const handleToggleRecord = async () => {
    if (isRecording) {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      setIsRecording(false);
      setIsPlaying(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false },
        });

        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream);

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const arrayBuffer = await blob.arrayBuffer();
          const decoded = await audioEngine.getContext().decodeAudioData(arrayBuffer);

          setTracks((prev) =>
            prev.map((t) =>
              t.id === armedTrackId
                ? {
                    ...t,
                    audioBuffer: decoded,
                    audioBlob: blob,
                    duration: decoded.duration,
                    startTime: playheadTimeSec,
                  }
                : t
            )
          );
        };

        recorder.start();
        setMediaRecorder(recorder);

        const ctx = audioEngine.getContext();
        playheadStartCtxTimeRef.current = ctx.currentTime;
        playheadStartOffsetRef.current = playheadTimeSec;

        setIsRecording(true);
        setIsPlaying(true);
      } catch (err) {
        alert("Please grant microphone permission to record tracks.");
      }
    }
  };

  const handleAddTrack = () => {
    const newIdx = tracks.length + 1;
    const newTrk: DAWTrack = {
      id: `trk-${Date.now()}`,
      name: `Guitar ${newIdx}`,
      color: newIdx % 2 === 1 ? "#a3ff12" : "#f59e0b",
      volume: 0.8,
      pan: 0,
      muted: false,
      soloed: false,
      audioBuffer: null,
      recording: false,
      startTime: 0,
      duration: 12,
    };
    setTracks((prev) => [...prev, newTrk]);
  };

  const activeSelectedTrack = tracks.find((t) => t.id === selectedTrackId) || tracks[0];

  return (
    <div id="panel-studio-session" className="max-w-6xl mx-auto space-y-5 pb-12 animate-in fade-in duration-200">
      {/* Top Header & Transport Bar */}
      <div className="frosted-card rounded-3xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left: Studio Session & Tuning Pill */}
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-bold text-white tracking-tight">Studio Session</h2>
          <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-zinc-300 font-bold">
            E-Standard Tuning
          </span>
        </div>

        {/* Center: DAW Transport Controls */}
        <div className="flex items-center gap-3">
          {/* Rewind */}
          <button
            onClick={handleStop}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/5 transition-colors cursor-pointer"
            title="Rewind"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* Stop */}
          <button
            onClick={handleStop}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/5 transition-colors cursor-pointer"
            title="Stop"
          >
            <Square className="w-4 h-4" />
          </button>

          {/* Master Play / Pause */}
          <button
            onClick={handleTogglePlay}
            className="px-5 py-2.5 rounded-xl bg-[#a3ff12] hover:bg-[#92eb10] text-black font-extrabold text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(163,255,18,0.4)] transition-all cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black ml-0.5" />}
          </button>

          {/* Master Record */}
          <button
            onClick={handleToggleRecord}
            className={`p-2.5 rounded-xl transition-all cursor-pointer ${
              isRecording
                ? "bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.6)] animate-pulse"
                : "bg-white/5 hover:bg-rose-500/20 text-rose-400 border border-white/5"
            }`}
            title="Record"
          >
            <Circle className={`w-4 h-4 ${isRecording ? "fill-white" : "fill-rose-500"}`} />
          </button>

          {/* Loop Toggle */}
          <button
            onClick={() => setIsLooping(!isLooping)}
            className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
              isLooping
                ? "bg-[#a3ff12]/15 text-[#a3ff12] border-[#a3ff12]/40"
                : "bg-white/5 text-zinc-400 border-white/5 hover:text-white"
            }`}
            title="Loop"
          >
            <Repeat className="w-4 h-4" />
          </button>

          {/* BPM, KEY, SIG */}
          <div className="flex items-center gap-2 pl-2">
            <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-white font-bold">
              {bpm} BPM
            </span>
            <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-zinc-300">
              KEY {keySig}
            </span>
            <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs font-mono text-zinc-300">
              SIG {timeSig}
            </span>
          </div>
        </div>

        {/* Right: Add Track & Export */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddTrack}
            className="px-3 py-2 bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/5 rounded-xl text-xs font-mono flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#a3ff12]" />
            <span>ADD TRACK</span>
          </button>
        </div>
      </div>

      {/* Main Multi-Track DAW Workspace */}
      <div className="frosted-card rounded-3xl p-5 space-y-4">
        {/* Timeline Bar Numbers Ruler */}
        <div className="flex items-center pl-60 pr-4 pb-2 border-b border-white/5 text-[11px] font-mono text-zinc-500 justify-between">
          <span>1</span>
          <span>2</span>
          <span>3</span>
          <span>4</span>
          <span>5</span>
          <span>6</span>
          <span>7</span>
          <span>8</span>
        </div>

        {/* Track Lanes */}
        <div className="space-y-3">
          {tracks.map((track, idx) => {
            const isArmed = armedTrackId === track.id;
            const isSelected = selectedTrackId === track.id;

            return (
              <div
                key={track.id}
                onClick={() => setSelectedTrackId(track.id)}
                className={`p-3.5 rounded-2xl flex items-center gap-4 transition-all cursor-pointer ${
                  isSelected
                    ? "bg-white/5 border border-[#a3ff12]/50 shadow-[0_0_20px_rgba(163,255,18,0.08)]"
                    : "bg-[#16191f]/40 border border-white/5 hover:border-white/10"
                }`}
              >
                {/* Left Track Controls (w-56) */}
                <div className="w-56 space-y-2 shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shadow-[0_0_6px_currentColor]"
                        style={{ color: track.color, backgroundColor: track.color }}
                      />
                      <span className="text-xs font-bold font-mono text-white">
                        {track.name}
                      </span>
                    </div>

                    <span className="text-[9px] font-mono bg-[#202630] text-zinc-300 px-1.5 py-0.5 rounded">
                      IN {idx + 1}
                    </span>
                  </div>

                  {/* R, M, S buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setArmedTrackId(track.id);
                      }}
                      className={`w-6 h-6 rounded text-[10px] font-mono font-bold flex items-center justify-center transition-colors cursor-pointer ${
                        isArmed
                          ? "bg-rose-500 text-white shadow-[0_0_8px_rgba(244,63,94,0.6)]"
                          : "bg-[#202630] text-zinc-400 hover:text-white"
                      }`}
                    >
                      R
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTracks((prev) =>
                          prev.map((t) => (t.id === track.id ? { ...t, muted: !t.muted } : t))
                        );
                      }}
                      className={`w-6 h-6 rounded text-[10px] font-mono font-bold flex items-center justify-center transition-colors cursor-pointer ${
                        track.muted
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500"
                          : "bg-[#202630] text-zinc-400 hover:text-white"
                      }`}
                    >
                      M
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTracks((prev) =>
                          prev.map((t) => (t.id === track.id ? { ...t, soloed: !t.soloed } : t))
                        );
                      }}
                      className={`w-6 h-6 rounded text-[10px] font-mono font-bold flex items-center justify-center transition-colors cursor-pointer ${
                        track.soloed
                          ? "bg-[#a3ff12] text-black"
                          : "bg-[#202630] text-zinc-400 hover:text-white"
                      }`}
                    >
                      S
                    </button>

                    {/* Volume Slider */}
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={track.volume * 100}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) / 100;
                        setTracks((prev) =>
                          prev.map((t) => (t.id === track.id ? { ...t, volume: val } : t))
                        );
                      }}
                      className="w-20 h-1 bg-[#202630] rounded-lg accent-[#a3ff12] ml-2 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Right Timeline Waveform Clip Area */}
                <div className="flex-1 h-16 bg-[#111317]/80 rounded-xl border border-white/5 p-2 relative overflow-hidden flex items-center">
                  {/* Clip Block */}
                  <div
                    className={`h-full rounded-lg px-3 flex items-center justify-between gap-1 overflow-hidden transition-all ${
                      idx === 0
                        ? "w-[85%] bg-[#a3ff12]/15 border border-[#a3ff12]/40 text-[#a3ff12]"
                        : "w-[65%] bg-sky-500/15 border border-sky-500/30 text-sky-400 ml-12"
                    }`}
                  >
                    <span className="text-[10px] font-mono font-bold shrink-0">
                      {idx === 0 ? "Rhythm Chugs" : "Lead Solo"}
                    </span>

                    {/* Waveform graphic bars */}
                    <div className="flex-1 flex items-center justify-end gap-[2px] h-full py-1">
                      {Array.from({ length: 32 }).map((_, w) => (
                        <div
                          key={w}
                          className="w-1 rounded-full opacity-80"
                          style={{
                            height: `${25 + ((w * 13 + idx * 7) % 65)}%`,
                            backgroundColor: idx === 0 ? "#a3ff12" : "#38bdf8",
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Playhead Needle */}
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-pink-500 pointer-events-none z-10 shadow-[0_0_8px_#ec4899]"
                    style={{
                      left: `${Math.min(98, (playheadTimeSec % 16) * 6.25)}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Track Inspector (Guitar 1, Interface 1, FX chain) */}
        <div className="bg-white/5 rounded-xl p-4 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
          <div className="flex items-center space-x-4">
            <span className="text-xs font-mono font-bold text-white">
              {activeSelectedTrack.name}
            </span>
            <span className="text-xs font-mono text-zinc-400">
              INPUT: <span className="text-white">Interface 1</span>
            </span>
            <span className="text-xs font-mono text-zinc-400">
              PAN: <span className="text-white">C</span>
            </span>
          </div>

          {/* FX Chain Pedal Slots */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">FX CHAIN:</span>
            <div className="px-3 py-1.5 bg-[#202630] rounded-lg text-xs font-mono text-white flex items-center gap-2 border border-white/5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#a3ff12] shadow-[0_0_6px_#a3ff12]" />
              <span>Amp Sim</span>
            </div>
            <div className="px-3 py-1.5 bg-[#202630] rounded-lg text-xs font-mono text-zinc-300 flex items-center gap-2 border border-white/5">
              <span>Reverb</span>
            </div>
            <button className="w-7 h-7 rounded-lg bg-[#202630] hover:bg-[#28303d] text-zinc-400 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer">
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
