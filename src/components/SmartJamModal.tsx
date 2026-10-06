/**
 * JOE Music - Smart Jam Modal
 * 
 * Interactive accompaniment generator for drums & bass from active chord progressions.
 * Supports style selection, bass mode, intensity, live jam playback, and handoff to Studio / Looper.
 */

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Play,
  Pause,
  Zap,
  Volume2,
  VolumeX,
  Layers,
  Sliders,
  Send,
  Music,
} from "lucide-react";
import { smartJamEngine, SmartJamStepEvent } from "../audio/smartJamEngine";
import { ChordSegment, SmartJamStyle, BassMode } from "../types";
import { audioEngine } from "../audio/audioContext";

interface SmartJamModalProps {
  chordSegments: ChordSegment[];
  tempo: number;
  timeSignature?: string;
  onClose: () => void;
  onSendToStudio?: () => void;
  onSendToLooper?: () => void;
}

const STYLES: Array<{ id: SmartJamStyle; label: string; desc: string }> = [
  { id: "pop", label: "Pop Groove", desc: "4-on-the-floor kick, crisp backbeat" },
  { id: "rock", label: "Rock Drive", desc: "Driving kick-snare with crash accents" },
  { id: "funk", label: "Funk 16ths", desc: "Syncopated pocket, ghosted snares" },
  { id: "ballad", label: "Slow Ballad", desc: "Gentle rhythmic flow & warm bass" },
  { id: "worship", label: "Worship Swell", desc: "Building ambient toms & floor punch" },
  { id: "indie", label: "Indie Upbeat", desc: "Bright hi-hat bounce & driving bass" },
  { id: "citypop", label: "City Pop", desc: "80s Tokyo disco-funk with octave bass" },
];

export const SmartJamModal: React.FC<SmartJamModalProps> = ({
  chordSegments,
  tempo,
  timeSignature = "4/4",
  onClose,
  onSendToStudio,
  onSendToLooper,
}) => {
  const [style, setStyle] = useState<SmartJamStyle>("pop");
  const [bassMode, setBassMode] = useState<BassMode>("simple");
  const [intensity, setIntensity] = useState<number>(75);
  const [complexity, setComplexity] = useState<number>(50);
  const [drumsEnabled, setDrumsEnabled] = useState<boolean>(true);
  const [bassEnabled, setBassEnabled] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeBeat, setActiveBeat] = useState<number>(0);

  const playbackTimerRef = useRef<number | null>(null);

  // Update engine config
  useEffect(() => {
    smartJamEngine.setConfig({
      style,
      bassMode,
      tempo,
      timeSignature,
      intensity,
      complexity,
      drumsEnabled,
      bassEnabled,
    });
    smartJamEngine.setProgression(chordSegments);
  }, [style, bassMode, tempo, timeSignature, intensity, complexity, drumsEnabled, bassEnabled, chordSegments]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, []);

  const handleTogglePlay = () => {
    if (isPlaying) {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      setIsPlaying(false);
      setActiveBeat(0);
    } else {
      const events = smartJamEngine.generateAccompanimentEvents();
      if (events.length === 0) return;

      setIsPlaying(true);
      let step = 0;
      const beatIntervalMs = (60 / Math.max(40, tempo)) * 1000;

      playbackTimerRef.current = window.setInterval(() => {
        const ev = events[step % events.length];
        setActiveBeat(ev.beatNumber);

        // Trigger drums if active
        if (drumsEnabled) {
          if (ev.kick) smartJamEngine.playDrumHit("kick");
          if (ev.snare) smartJamEngine.playDrumHit("snare");
          if (ev.hihat) smartJamEngine.playDrumHit("hihat");
          if (ev.crash) smartJamEngine.playDrumHit("crash");
        }

        // Trigger synth bass if active
        if (ev.bassPitch !== null && bassEnabled) {
          smartJamEngine.playBassNote(ev.bassPitch, ev.bassDurationSec);
        }

        step++;
      }, beatIntervalMs);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-[#131722] border border-white/15 rounded-3xl max-w-2xl w-full p-4 sm:p-6 text-white shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold font-mono tracking-tight flex items-center gap-2">
                <span>SMART JAM ACCOMPANIMENT</span>
                <span className="text-xs text-amber-400 font-bold bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                  {tempo} BPM • {timeSignature}
                </span>
              </h2>
              <p className="text-xs text-zinc-400 font-mono">
                Real-time musical drums and bass generated from detected chords
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Style Selector */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono font-bold text-zinc-400 uppercase">
            Drum & Groove Style
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STYLES.map((st) => (
              <button
                key={st.id}
                onClick={() => setStyle(st.id)}
                className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                  style === st.id
                    ? "bg-amber-400/20 border-amber-400/50 text-white shadow-xs"
                    : "bg-white/5 border-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                <div className="text-xs font-bold font-mono">{st.label}</div>
                <div className="text-[10px] text-zinc-400 truncate">{st.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Bass Mode Selector */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono font-bold text-zinc-400 uppercase">
            Bass Performance Mode
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "root" as BassMode, label: "Root Notes", desc: "Locked to downbeats & 5ths" },
              { id: "simple" as BassMode, label: "Simple Grooves", desc: "Roots with smooth approach tones" },
              { id: "melodic" as BassMode, label: "Melodic Walking", desc: "Scale-aware walking bass line" },
            ].map((bm) => (
              <button
                key={bm.id}
                onClick={() => setBassMode(bm.id)}
                className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                  bassMode === bm.id
                    ? "bg-[#a3ff12]/20 border-[#a3ff12]/50 text-white shadow-xs"
                    : "bg-white/5 border-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                <div className="text-xs font-bold font-mono">{bm.label}</div>
                <div className="text-[10px] text-zinc-400 truncate">{bm.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Sliders: Intensity & Complexity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-black/30 p-3.5 rounded-2xl border border-white/5 text-xs font-mono">
          <div className="space-y-1">
            <div className="flex justify-between text-zinc-400">
              <span>Intensity:</span>
              <span className="text-white font-bold">{intensity}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={100}
              value={intensity}
              onChange={(e) => setIntensity(parseInt(e.target.value))}
              className="w-full accent-amber-400 h-1.5 cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-zinc-400">
              <span>Rhythmic Complexity:</span>
              <span className="text-white font-bold">{complexity}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              value={complexity}
              onChange={(e) => setComplexity(parseInt(e.target.value))}
              className="w-full accent-[#a3ff12] h-1.5 cursor-pointer"
            />
          </div>
        </div>

        {/* Layer Toggles & Preview Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrumsEnabled(!drumsEnabled)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                drumsEnabled
                  ? "bg-amber-400/20 border-amber-400/40 text-amber-300"
                  : "bg-white/5 border-white/10 text-zinc-500"
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Drums: {drumsEnabled ? "ON" : "OFF"}</span>
            </button>

            <button
              onClick={() => setBassEnabled(!bassEnabled)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                bassEnabled
                  ? "bg-[#a3ff12]/20 border-[#a3ff12]/40 text-[#a3ff12]"
                  : "bg-white/5 border-white/10 text-zinc-500"
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Bass: {bassEnabled ? "ON" : "OFF"}</span>
            </button>
          </div>

          {/* Jam Preview Play Button */}
          <button
            onClick={handleTogglePlay}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md ${
              isPlaying
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-amber-400 hover:bg-amber-300 text-black"
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{isPlaying ? "Stop Jam" : "Audition Jam"}</span>
          </button>
        </div>

        {/* Handoff Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10 text-xs font-mono">
          {onSendToLooper && (
            <button
              onClick={() => {
                if (isPlaying) handleTogglePlay();
                onSendToLooper();
              }}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15 transition-all cursor-pointer"
            >
              Send to Looper
            </button>
          )}

          {onSendToStudio && (
            <button
              onClick={() => {
                if (isPlaying) handleTogglePlay();
                onSendToStudio();
              }}
              className="px-4 py-2 rounded-xl bg-[#a3ff12] hover:bg-[#92eb10] text-black font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Send to JOE Studio (MIDI)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
