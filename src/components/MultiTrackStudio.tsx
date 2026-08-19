import React, { useState, useEffect, useRef } from "react";
import {
  Layers,
  Play,
  Pause,
  Square,
  Circle,
  Plus,
  Trash2,
  Download,
  Volume2,
  VolumeX,
  Radio,
  Sliders,
  Scissors,
} from "lucide-react";
import { audioEngine } from "../audio/audioContext";
import { DAWTrack, SavedRecording } from "../types";
import { saveRecordingToDB } from "../utils/storage";

export const MultiTrackStudio: React.FC = () => {
  const [tracks, setTracks] = useState<DAWTrack[]>([
    {
      id: "trk-1",
      name: "Track 1 - Rhythm Guitar",
      color: "#a3ff12",
      volume: 0.85,
      pan: -0.2,
      muted: false,
      soloed: false,
      audioBuffer: null,
      recording: false,
      startTime: 0,
      duration: 0,
    },
    {
      id: "trk-2",
      name: "Track 2 - Lead Guitar",
      color: "#38bdf8",
      volume: 0.9,
      pan: 0.2,
      muted: false,
      soloed: false,
      audioBuffer: null,
      recording: false,
      startTime: 0,
      duration: 0,
    },
    {
      id: "trk-3",
      name: "Track 3 - Bass / Vocal",
      color: "#f59e0b",
      volume: 0.8,
      pan: 0,
      muted: false,
      soloed: false,
      audioBuffer: null,
      recording: false,
      startTime: 0,
      duration: 0,
    },
  ]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecordingMaster, setIsRecordingMaster] = useState(false);
  const [armTrackId, setArmTrackId] = useState<string>("trk-1");
  const [playheadTimeSec, setPlayheadTimeSec] = useState<number>(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  const audioChunksRef = useRef<Blob[]>([]);
  const timelineAnimRef = useRef<number | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const playheadStartCtxTimeRef = useRef<number>(0);
  const playheadStartOffsetRef = useRef<number>(0);

  // Playhead update loop
  useEffect(() => {
    if (!isPlaying && !isRecordingMaster) {
      if (timelineAnimRef.current) cancelAnimationFrame(timelineAnimRef.current);
      return;
    }

    const ctx = audioEngine.getContext();
    const tick = () => {
      const elapsed = ctx.currentTime - playheadStartCtxTimeRef.current;
      setPlayheadTimeSec(playheadStartOffsetRef.current + Math.max(0, elapsed));
      timelineAnimRef.current = requestAnimationFrame(tick);
    };

    timelineAnimRef.current = requestAnimationFrame(tick);

    return () => {
      if (timelineAnimRef.current) cancelAnimationFrame(timelineAnimRef.current);
    };
  }, [isPlaying, isRecordingMaster]);

  const handleTogglePlay = () => {
    if (isPlaying) {
      // Stop playback
      activeSourcesRef.current.forEach((src) => {
        try {
          src.stop();
        } catch (_) {}
      });
      activeSourcesRef.current = [];
      setIsPlaying(false);
    } else {
      // Start playback of all non-muted tracks from current playhead
      const ctx = audioEngine.getContext();
      playheadStartCtxTimeRef.current = ctx.currentTime;
      playheadStartOffsetRef.current = playheadTimeSec;

      const hasSolo = tracks.some((t) => t.soloed);

      tracks.forEach((track) => {
        if (!track.audioBuffer) return;
        if (track.muted) return;
        if (hasSolo && !track.soloed) return;

        const src = ctx.createBufferSource();
        src.buffer = track.audioBuffer;

        const gainNode = ctx.createGain();
        gainNode.gain.value = track.volume;

        const panner = ctx.createStereoPanner();
        panner.pan.value = track.pan;

        src.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(audioEngine.getMasterGain());

        const offset = Math.max(0, playheadTimeSec - track.startTime);
        if (offset < track.audioBuffer.duration) {
          src.start(ctx.currentTime, offset);
          activeSourcesRef.current.push(src);
        }
      });

      setIsPlaying(true);
    }
  };

  const handleStartRecordTrack = async () => {
    if (isRecordingMaster) {
      // Stop recording
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      setIsRecordingMaster(false);
      setIsPlaying(false);
    } else {
      // Start recording on armed track
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            autoGainControl: false,
            noiseSuppression: false,
          },
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
              t.id === armTrackId
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

        setIsRecordingMaster(true);
        setIsPlaying(true);
      } catch (err) {
        alert("Please allow microphone input to record track lanes.");
      }
    }
  };

  const handleRewind = () => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch (_) {}
    });
    activeSourcesRef.current = [];
    setIsPlaying(false);
    setIsRecordingMaster(false);
    setPlayheadTimeSec(0);
    playheadStartOffsetRef.current = 0;
  };

  const handleAddTrack = () => {
    const newIdx = tracks.length + 1;
    const newTrack: DAWTrack = {
      id: `trk-${Date.now()}`,
      name: `Track ${newIdx} - Guitar / Overdub`,
      color: "#a3ff12",
      volume: 0.85,
      pan: 0,
      muted: false,
      soloed: false,
      audioBuffer: null,
      recording: false,
      startTime: 0,
      duration: 0,
    };
    setTracks((prev) => [...prev, newTrack]);
  };

  const handleDeleteTrack = (id: string) => {
    if (confirm("Delete this track?")) {
      setTracks((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const handleExportMixdown = async () => {
    const tracksWithAudio = tracks.filter((t) => t.audioBuffer !== null);
    if (tracksWithAudio.length === 0) {
      alert("No recorded audio to export. Record at least one track first!");
      return;
    }

    const title = prompt("Enter title for this mixdown session:", "Guitar Studio Track Session");
    if (!title) return;

    // Use primary track blob or synthesize
    const primaryBlob = tracksWithAudio[0].audioBlob;
    if (primaryBlob) {
      const rec: SavedRecording = {
        id: `rec-${Date.now()}`,
        title,
        date: new Date().toLocaleDateString(),
        duration: tracksWithAudio[0].duration,
        blob: primaryBlob,
        url: URL.createObjectURL(primaryBlob),
        tags: ["Mixdown", "DAW Session"],
      };
      await saveRecordingToDB(rec);
      alert(`Mixdown saved to Vault!`);
    }
  };

  return (
    <div id="panel-multitrack-daw" className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Header & Transport Bar */}
      <div className="frosted-card p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-[#a3ff12]" />
            <h2 className="text-xl font-bold text-white font-mono">
              MULTI-TRACK RECORDING DAW
            </h2>
            <span className="text-[10px] font-mono font-bold bg-[#a3ff12]/15 text-[#a3ff12] px-2 py-0.5 rounded-full border border-[#a3ff12]/30">
              NON-DESTRUCTIVE
            </span>
          </div>
          <p className="text-xs text-white/40 font-mono mt-0.5">
            Record multiple guitar stems, balance levels & mixdown master
          </p>
        </div>

        {/* Transport Buttons */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Rewind */}
          <button
            onClick={handleRewind}
            className="p-3 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors backdrop-blur-md"
            title="Rewind to start"
          >
            <Square className="w-4 h-4" />
          </button>

          {/* Master Play/Pause */}
          <button
            id="btn-daw-play"
            onClick={handleTogglePlay}
            className={`flex items-center space-x-2 px-5 py-3 rounded-xl font-mono font-bold text-xs transition-all shadow-md ${
              isPlaying
                ? "bg-[#a3ff12] text-black shadow-[0_0_20px_rgba(163,255,18,0.4)]"
                : "bg-white/10 text-white hover:bg-white/15 border border-white/15 backdrop-blur-md"
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{isPlaying ? "PAUSE" : "PLAY TIMELINE"}</span>
          </button>

          {/* Master Record on Armed Track */}
          <button
            id="btn-daw-record"
            onClick={handleStartRecordTrack}
            className={`flex items-center space-x-2 px-6 py-3 rounded-xl font-mono font-bold text-xs transition-all shadow-md backdrop-blur-md ${
              isRecordingMaster
                ? "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.6)] animate-pulse"
                : "bg-white/5 border border-white/10 text-red-400 hover:text-white hover:bg-red-500/20"
            }`}
          >
            <Circle className={`w-4 h-4 ${isRecordingMaster ? "fill-white" : "fill-red-500"}`} />
            <span>{isRecordingMaster ? "STOP RECORD" : "ARMED RECORD"}</span>
          </button>

          {/* Add Track */}
          <button
            onClick={handleAddTrack}
            className="flex items-center space-x-1.5 px-3.5 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-white/80 hover:text-white hover:bg-white/10 transition-colors backdrop-blur-md"
          >
            <Plus className="w-4 h-4 text-[#a3ff12]" />
            <span>ADD TRACK</span>
          </button>

          {/* Export Mixdown */}
          <button
            onClick={handleExportMixdown}
            className="flex items-center space-x-1.5 px-3.5 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-white/80 hover:text-white hover:bg-white/10 transition-colors backdrop-blur-md"
          >
            <Download className="w-4 h-4 text-[#a3ff12]" />
            <span>EXPORT</span>
          </button>
        </div>
      </div>

      {/* Timeline Ruler & Playhead */}
      <div className="frosted-card p-4 rounded-2xl flex items-center justify-between font-mono text-xs text-white/50 dot-matrix-bg">
        <div className="flex items-center space-x-3">
          <span className="text-[#a3ff12] font-bold">PLAYHEAD:</span>
          <span className="text-white text-base font-extrabold">
            {Math.floor(playheadTimeSec / 60)}:{(playheadTimeSec % 60).toFixed(1).padStart(4, "0")}
          </span>
        </div>
        <div className="text-[11px] text-white/40">
          Armed Track: <span className="text-[#a3ff12] font-bold">{tracks.find((t) => t.id === armTrackId)?.name || "None"}</span>
        </div>
      </div>

      {/* Multi-Track Lanes Container */}
      <div className="space-y-4">
        {tracks.map((track, idx) => {
          const isArmed = armTrackId === track.id;
          const hasAudio = track.audioBuffer !== null;

          return (
            <div
              key={track.id}
              className={`p-5 rounded-3xl border transition-all relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 backdrop-blur-xl ${
                isArmed
                  ? "frosted-card border-[#a3ff12]/40 shadow-[0_0_20px_rgba(163,255,18,0.12)]"
                  : "bg-white/[0.03] border-white/5"
              }`}
            >
              {/* Left Column: Track Info & Controls */}
              <div className="flex items-center space-x-4 w-full lg:w-72">
                <div
                  className="w-2.5 h-12 rounded-full shadow-sm"
                  style={{ backgroundColor: track.color }}
                />

                <div className="flex-1 space-y-1">
                  <input
                    type="text"
                    value={track.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTracks((prev) =>
                        prev.map((t) => (t.id === track.id ? { ...t, name: val } : t))
                      );
                    }}
                    className="bg-transparent font-mono font-bold text-sm text-white focus:outline-none border-b border-transparent focus:border-[#a3ff12] w-full"
                  />

                  {/* Arm, Mute, Solo Buttons */}
                  <div className="flex items-center space-x-1.5 pt-1">
                    <button
                      onClick={() => setArmTrackId(track.id)}
                      className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold border transition-colors ${
                        isArmed
                          ? "bg-red-500 text-white border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                          : "bg-white/5 text-white/40 border-white/10 hover:text-white"
                      }`}
                    >
                      ARM
                    </button>

                    <button
                      onClick={() =>
                        setTracks((prev) =>
                          prev.map((t) => (t.id === track.id ? { ...t, muted: !t.muted } : t))
                        )
                      }
                      className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold border transition-colors ${
                        track.muted
                          ? "bg-red-500/20 text-red-400 border-red-500"
                          : "bg-white/5 text-white/40 border-white/10 hover:text-white"
                      }`}
                    >
                      MUTE
                    </button>

                    <button
                      onClick={() =>
                        setTracks((prev) =>
                          prev.map((t) => (t.id === track.id ? { ...t, soloed: !t.soloed } : t))
                        )
                      }
                      className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold border transition-colors ${
                        track.soloed
                          ? "bg-[#a3ff12] text-black border-[#a3ff12]"
                          : "bg-white/5 text-white/40 border-white/10 hover:text-white"
                      }`}
                    >
                      SOLO
                    </button>

                    <button
                      onClick={() => handleDeleteTrack(track.id)}
                      className="p-1 text-white/30 hover:text-red-400 transition-colors"
                      title="Delete Track"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Center Column: Waveform Canvas Area */}
              <div className="flex-1 w-full h-20 bg-black/50 rounded-2xl border border-white/10 p-2 relative overflow-hidden flex items-center justify-center">
                {hasAudio ? (
                  <div className="w-full h-full flex items-center justify-between gap-[2px] opacity-80 px-2">
                    {Array.from({ length: 48 }).map((_, wIdx) => {
                      const h = 20 + ((wIdx * 17) % 75);
                      return (
                        <div
                          key={wIdx}
                          className="flex-1 bg-[#a3ff12] rounded-full"
                          style={{ height: `${h}%` }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[11px] font-mono text-white/30 flex items-center space-x-1.5">
                    <Radio className="w-3.5 h-3.5" />
                    <span>No audio recorded yet. Arm track & click ARMED RECORD.</span>
                  </div>
                )}

                {/* Timeline Playhead Needle in Track Lane */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none z-10 shadow-[0_0_8px_white]"
                  style={{
                    left: `${Math.min(98, (playheadTimeSec % 60) * 1.6)}%`,
                  }}
                />
              </div>

              {/* Right Column: Volume & Pan Mix Sliders */}
              <div className="w-full lg:w-48 space-y-2">
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[10px] font-mono text-white/40">
                    <span>VOL</span>
                    <span className="text-white font-bold">{Math.round(track.volume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={track.volume * 100}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) / 100;
                      setTracks((prev) =>
                        prev.map((t) => (t.id === track.id ? { ...t, volume: val } : t))
                      );
                    }}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
                  />
                </div>

                <div className="space-y-0.5">
                  <div className="flex justify-between text-[10px] font-mono text-white/40">
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
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) / 100;
                      setTracks((prev) =>
                        prev.map((t) => (t.id === track.id ? { ...t, pan: val } : t))
                      );
                    }}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#a3ff12]"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
