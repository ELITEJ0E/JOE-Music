/**
 * JOE Music - Chord Progression to MIDI Generator
 * 
 * Generates rich musical MIDI tracks from detected chord segments:
 * - Block Chords
 * - Piano Voicings
 * - Ambient Synth Pad
 * - Guitar Strum Simulation
 * - Arpeggio Patterns
 */

import { ChordSegment, MidiNoteEvent } from "../types";
import { findChordByName } from "../data/chordDatabase";

// Standard MIDI base pitches
const ROOT_NOTE_MIDI_BASE: Record<string, number> = {
  C: 48, "C#": 49, Db: 49, D: 50, "D#": 51, Eb: 51,
  E: 52, F: 53, "F#": 54, Gb: 54, G: 55, "G#": 56, Ab: 56,
  A: 57, "A#": 58, Bb: 58, B: 59,
};

export type ChordMidiStyle = "block" | "piano" | "pad" | "strum" | "arpeggio";

export interface ChordToMidiOptions {
  style: ChordMidiStyle;
  tempo?: number;
  secondsPerBeat?: number;
}

/**
 * Extracts MIDI pitch intervals for a chord quality.
 */
function getIntervalsForChord(chordName: string): number[] {
  const isMinor = /m(?!aj)/i.test(chordName);
  const isMaj7 = /maj7/i.test(chordName);
  const isMin7 = /m7/i.test(chordName);
  const isDom7 = /7/i.test(chordName) && !isMaj7 && !isMin7;
  const isSus4 = /sus4/i.test(chordName);
  const isSus2 = /sus2/i.test(chordName);
  const isDim = /dim/i.test(chordName);

  if (isMaj7) return [0, 4, 7, 11];
  if (isMin7) return [0, 3, 7, 10];
  if (isDom7) return [0, 4, 7, 10];
  if (isSus4) return [0, 5, 7];
  if (isSus2) return [0, 2, 7];
  if (isDim) return [0, 3, 6];
  if (isMinor) return [0, 3, 7];
  return [0, 4, 7]; // Major triad
}

/**
 * Converts chord segments to MIDI note events.
 */
export function generateMidiFromChords(
  chordSegments: ChordSegment[],
  options: ChordToMidiOptions
): MidiNoteEvent[] {
  if (!chordSegments || chordSegments.length === 0) return [];

  const { style, tempo = 120 } = options;
  const secondsPerBeat = 60 / Math.max(40, tempo);
  const notes: MidiNoteEvent[] = [];

  let noteCounter = 0;

  for (let cIdx = 0; cIdx < chordSegments.length; cIdx++) {
    const seg = chordSegments[cIdx];
    const segDurationSec = Math.max(0.2, seg.endTime - seg.startTime);
    const startBeat = seg.startTime / secondsPerBeat;
    const durationBeats = segDurationSec / secondsPerBeat;

    const rootName = seg.chord.match(/^[A-G][#b]?/)?.[0] || "C";
    const baseRootPitch = ROOT_NOTE_MIDI_BASE[rootName] || 48; // Octave 3 (C3 = 48)
    const intervals = getIntervalsForChord(seg.chord);

    switch (style) {
      case "block": {
        // Sustained block triad/7th
        intervals.forEach((interval) => {
          notes.push({
            id: `chord-midi-${noteCounter++}`,
            pitch: baseRootPitch + interval,
            startBeat: Number(startBeat.toFixed(2)),
            durationBeats: Number((durationBeats * 0.95).toFixed(2)),
            velocity: 95,
          });
        });
        break;
      }

      case "piano": {
        // Left hand bass note (C2) + right hand open voicing (C4)
        notes.push({
          id: `chord-midi-${noteCounter++}`,
          pitch: baseRootPitch - 12, // Bass root octave 2
          startBeat: Number(startBeat.toFixed(2)),
          durationBeats: Number((durationBeats * 0.95).toFixed(2)),
          velocity: 100,
        });

        intervals.forEach((interval) => {
          notes.push({
            id: `chord-midi-${noteCounter++}`,
            pitch: baseRootPitch + 12 + interval, // Octave 4
            startBeat: Number(startBeat.toFixed(2)),
            durationBeats: Number((durationBeats * 0.95).toFixed(2)),
            velocity: 88,
          });
        });
        break;
      }

      case "pad": {
        // Warm sustained atmospheric pad voicing (Octave 3 + 4)
        intervals.forEach((interval) => {
          notes.push({
            id: `chord-midi-${noteCounter++}`,
            pitch: baseRootPitch + interval,
            startBeat: Number(startBeat.toFixed(2)),
            durationBeats: Number(durationBeats.toFixed(2)), // Full sustain with no gap
            velocity: 75,
          });
        });
        break;
      }

      case "strum": {
        // Simulates downstroke guitar strum with micro-offsets (0.04 beats per string)
        const strumPitches = [
          baseRootPitch - 12, // Low root
          baseRootPitch + intervals[0],
          baseRootPitch + intervals[1],
          baseRootPitch + intervals[2],
          baseRootPitch + 12 + intervals[0],
        ];

        strumPitches.forEach((pitch, stringIdx) => {
          const strumOffset = stringIdx * 0.04;
          notes.push({
            id: `chord-midi-${noteCounter++}`,
            pitch,
            startBeat: Number((startBeat + strumOffset).toFixed(2)),
            durationBeats: Number(Math.max(0.2, durationBeats - strumOffset).toFixed(2)),
            velocity: 95 - stringIdx * 3,
          });
        });
        break;
      }

      case "arpeggio": {
        // 8th-note ascending / descending pattern
        const arpeggioPitches = [
          baseRootPitch,
          baseRootPitch + intervals[1],
          baseRootPitch + intervals[2],
          baseRootPitch + (intervals[3] || intervals[1] + 12),
        ];

        const steps = Math.max(1, Math.floor(durationBeats / 0.5)); // 8th notes = 0.5 beat
        for (let s = 0; s < steps; s++) {
          const stepPitch = arpeggioPitches[s % arpeggioPitches.length];
          notes.push({
            id: `chord-midi-${noteCounter++}`,
            pitch: stepPitch,
            startBeat: Number((startBeat + s * 0.5).toFixed(2)),
            durationBeats: 0.45,
            velocity: s % 2 === 0 ? 95 : 80,
          });
        }
        break;
      }
    }
  }

  return notes;
}
