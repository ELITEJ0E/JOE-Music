/**
 * JOE Studio - Clean Minimal Piano Roll Editor
 * 
 * Interactive MIDI note editor supporting note selection, creation, dragging (pitch/time),
 * resizing (duration), velocity adjustment, grid snapping, and real-time audio playback preview.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  X,
  Play,
  Square,
  Trash2,
  Sliders,
  Volume2,
  Grid,
  ChevronDown,
} from "lucide-react";
import { MidiNoteEvent } from "../../types";
import { audioEngine } from "../../audio/audioContext";

interface PianoRollEditorProps {
  trackName: string;
  notes: MidiNoteEvent[];
  onChangeNotes: (notes: MidiNoteEvent[]) => void;
  bpm: number;
  totalBeats?: number;
  onClose: () => void;
}

const PITCH_MIN = 36; // C2
const PITCH_MAX = 84; // C6
const TOTAL_PITCHES = PITCH_MAX - PITCH_MIN + 1;
const ROW_HEIGHT = 18; // px per semitone
const PIXELS_PER_BEAT = 40; // px per beat

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function pitchToName(pitch: number): string {
  const name = NOTE_NAMES[pitch % 12];
  const octave = Math.floor(pitch / 12) - 1;
  return `${name}${octave}`;
}

function isBlackKey(pitch: number): boolean {
  const idx = pitch % 12;
  return [1, 3, 6, 8, 10].includes(idx);
}

export const PianoRollEditor: React.FC<PianoRollEditorProps> = ({
  trackName,
  notes,
  onChangeNotes,
  bpm,
  totalBeats = 32,
  onClose,
}) => {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [snap, setSnap] = useState<number>(0.25); // 0.25 beat = 16th note, 0.5 = 8th note, 1.0 = quarter
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playheadBeat, setPlayheadBeat] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{
    mode: "move" | "resize";
    noteId: string;
    startX: number;
    startY: number;
    origStartBeat: number;
    origPitch: number;
    origDuration: number;
  } | null>(null);

  // Play preview note using Web Audio
  const playPreviewTone = useCallback((pitch: number) => {
    const ctx = audioEngine.getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const freq = 440 * Math.pow(2, (pitch - 69) / 12);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.32);
    } catch {
      // AudioContext safety
    }
  }, []);

  // Snap calculation
  const snapVal = (val: number) => Math.max(0, Math.round(val / snap) * snap);

  // Grid click to create note
  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(".piano-note-block")) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const beat = snapVal(x / PIXELS_PER_BEAT);
    const pitchIndex = Math.floor(y / ROW_HEIGHT);
    const pitch = PITCH_MAX - pitchIndex;

    if (pitch < PITCH_MIN || pitch > PITCH_MAX) return;

    const newNote: MidiNoteEvent = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      pitch,
      startBeat: beat,
      durationBeats: Math.max(snap, 1.0),
      velocity: 95,
    };

    onChangeNotes([...notes, newNote]);
    setSelectedNoteId(newNote.id);
    playPreviewTone(pitch);
  };

  // Note mousedown for move / resize
  const handleNoteMouseDown = (
    e: React.MouseEvent,
    note: MidiNoteEvent,
    mode: "move" | "resize"
  ) => {
    e.stopPropagation();
    setSelectedNoteId(note.id);
    playPreviewTone(note.pitch);

    draggingRef.current = {
      mode,
      noteId: note.id,
      startX: e.clientX,
      startY: e.clientY,
      origStartBeat: note.startBeat,
      origPitch: note.pitch,
      origDuration: note.durationBeats,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draggingRef.current) return;
      const { mode, noteId, startX, startY, origStartBeat, origPitch, origDuration } =
        draggingRef.current;

      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const deltaBeats = deltaX / PIXELS_PER_BEAT;
      const deltaPitch = -Math.round(deltaY / ROW_HEIGHT);

      onChangeNotes(
        notes.map((n) => {
          if (n.id !== noteId) return n;

          if (mode === "move") {
            const newBeat = snapVal(Math.max(0, origStartBeat + deltaBeats));
            const newPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, origPitch + deltaPitch));
            return { ...n, startBeat: newBeat, pitch: newPitch };
          } else {
            // Resize duration
            const newDuration = Math.max(snap, snapVal(origDuration + deltaBeats));
            return { ...n, durationBeats: newDuration };
          }
        })
      );
    };

    const handleMouseUp = () => {
      draggingRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Delete note
  const handleDeleteSelected = () => {
    if (!selectedNoteId) return;
    onChangeNotes(notes.filter((n) => n.id !== selectedNoteId));
    setSelectedNoteId(null);
  };

  const selectedNote = notes.find((n) => n.id === selectedNoteId);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-[#12151e] border border-white/15 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden text-white">
        {/* Top Header & Toolbars */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#171b26] border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold font-mono tracking-tight flex items-center gap-2">
              <span className="text-[#a3ff12]">PIANO ROLL:</span>
              <span>{trackName}</span>
            </h2>
            <span className="text-xs font-mono text-zinc-400">
              {notes.length} notes • {bpm} BPM
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            {/* Snap selector */}
            <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-xl px-2 py-1">
              <span className="text-zinc-400 text-[10px]">SNAP:</span>
              <select
                value={snap}
                onChange={(e) => setSnap(parseFloat(e.target.value))}
                className="bg-transparent text-white focus:outline-none cursor-pointer"
              >
                <option value={1.0} className="bg-[#12151e]">1/4</option>
                <option value={0.5} className="bg-[#12151e]">1/8</option>
                <option value={0.25} className="bg-[#12151e]">1/16</option>
              </select>
            </div>

            {/* Velocity input for selected note */}
            {selectedNote && (
              <div className="flex items-center gap-1.5 bg-black/30 border border-white/10 rounded-xl px-2.5 py-1">
                <span className="text-zinc-400 text-[10px]">VEL:</span>
                <input
                  type="range"
                  min={1}
                  max={127}
                  value={selectedNote.velocity}
                  onChange={(e) => {
                    const vel = parseInt(e.target.value);
                    onChangeNotes(
                      notes.map((n) => (n.id === selectedNoteId ? { ...n, velocity: vel } : n))
                    );
                  }}
                  className="w-16 accent-[#a3ff12] h-1"
                />
                <span className="w-6 text-[10px] text-right">{selectedNote.velocity}</span>
              </div>
            )}

            {/* Delete button */}
            {selectedNote && (
              <button
                onClick={handleDeleteSelected}
                className="p-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                title="Delete selected note"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Grid & Piano Keys Area */}
        <div ref={containerRef} className="flex-1 flex overflow-auto relative select-none">
          {/* Left: Piano Keys Column (Fixed Left) */}
          <div className="sticky left-0 z-20 w-16 bg-[#161a24] border-r border-white/10 shrink-0">
            {Array.from({ length: TOTAL_PITCHES }).map((_, idx) => {
              const pitch = PITCH_MAX - idx;
              const isBlack = isBlackKey(pitch);
              const name = pitchToName(pitch);
              const isC = pitch % 12 === 0;

              return (
                <div
                  key={pitch}
                  onClick={() => playPreviewTone(pitch)}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  className={`flex items-center justify-end pr-1 text-[9px] font-mono cursor-pointer transition-colors border-b border-black/20 ${
                    isBlack
                      ? "bg-[#0d1017] text-zinc-400 hover:bg-[#1a2130]"
                      : isC
                      ? "bg-zinc-200 text-zinc-900 font-bold hover:bg-white"
                      : "bg-[#1f2430] text-zinc-200 hover:bg-zinc-600"
                  }`}
                >
                  {(isC || isBlack === false) && <span>{name}</span>}
                </div>
              );
            })}
          </div>

          {/* Right: Interactive Note Canvas Grid */}
          <div
            onClick={handleGridClick}
            style={{
              width: `${totalBeats * PIXELS_PER_BEAT}px`,
              height: `${TOTAL_PITCHES * ROW_HEIGHT}px`,
            }}
            className="relative bg-[#0c0e14] cursor-crosshair shrink-0"
          >
            {/* Background Semitone Rows */}
            {Array.from({ length: TOTAL_PITCHES }).map((_, idx) => {
              const pitch = PITCH_MAX - idx;
              const isBlack = isBlackKey(pitch);

              return (
                <div
                  key={pitch}
                  style={{
                    top: `${idx * ROW_HEIGHT}px`,
                    height: `${ROW_HEIGHT}px`,
                  }}
                  className={`absolute left-0 right-0 border-b border-white/[0.03] pointer-events-none ${
                    isBlack ? "bg-black/40" : "bg-white/[0.01]"
                  }`}
                />
              );
            })}

            {/* Background Beat Lines */}
            {Array.from({ length: totalBeats }).map((_, b) => {
              const isBar = b % 4 === 0;
              return (
                <div
                  key={b}
                  style={{ left: `${b * PIXELS_PER_BEAT}px` }}
                  className={`absolute top-0 bottom-0 pointer-events-none ${
                    isBar ? "border-l border-white/20" : "border-l border-white/[0.05]"
                  }`}
                />
              );
            })}

            {/* Render MIDI Note Blocks */}
            {notes.map((note) => {
              const rowIndex = PITCH_MAX - note.pitch;
              const top = rowIndex * ROW_HEIGHT;
              const left = note.startBeat * PIXELS_PER_BEAT;
              const width = Math.max(10, note.durationBeats * PIXELS_PER_BEAT);
              const isSelected = note.id === selectedNoteId;

              return (
                <div
                  key={note.id}
                  onMouseDown={(e) => handleNoteMouseDown(e, note, "move")}
                  style={{
                    top: `${top + 1}px`,
                    left: `${left}px`,
                    width: `${width - 2}px`,
                    height: `${ROW_HEIGHT - 2}px`,
                  }}
                  className={`piano-note-block absolute rounded-md text-[9px] font-mono font-bold flex items-center px-1 overflow-hidden transition-shadow cursor-grab active:cursor-grabbing ${
                    isSelected
                      ? "bg-[#a3ff12] text-black ring-2 ring-white shadow-lg z-10"
                      : "bg-emerald-500 hover:bg-emerald-400 text-black shadow-xs z-0"
                  }`}
                  title={`${pitchToName(note.pitch)} | Beat ${note.startBeat} | Dur: ${note.durationBeats}b`}
                >
                  <span className="truncate pointer-events-none">
                    {pitchToName(note.pitch)}
                  </span>

                  {/* Right edge resize handle */}
                  <div
                    onMouseDown={(e) => handleNoteMouseDown(e, note, "resize")}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2 bg-[#171b26] border-t border-white/10 text-[11px] font-mono text-zinc-400 flex items-center justify-between shrink-0">
          <span>Click to place notes • Drag note to move / transpose • Drag right edge to resize</span>
          <span>Press Delete to remove selected note</span>
        </div>
      </div>
    </div>
  );
};
