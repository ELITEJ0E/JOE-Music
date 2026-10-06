/**
 * JOE Music - Smart Jam Accompaniment Engine
 * 
 * Musical, rule-based drum & bass accompaniment generator driven by detected chord progressions.
 * Supports Pop, Rock, Funk, Ballad, Worship, Indie, and City Pop styles with Root, Simple, and Melodic bass modes.
 * Generates live Web Audio synthesis, MIDI data, and exportable stems for JOE Looper & JOE Studio.
 */

import { audioEngine } from "./audioContext";
import { ChordSegment, SmartJamConfig, SmartJamStyle, BassMode, MidiNoteEvent } from "../types";

// Pitch helpers
const NOTE_TO_MIDI_PITCH: Record<string, number> = {
  C: 36, "C#": 37, Db: 37, D: 38, "D#": 39, Eb: 39,
  E: 40, F: 41, "F#": 42, Gb: 42, G: 43, "G#": 44, Ab: 44,
  A: 45, "A#": 46, Bb: 46, B: 47,
};

export function getMidiPitchFromChord(chord: string): number {
  const root = chord.match(/^[A-G][#b]?/)?.[0] || "C";
  return NOTE_TO_MIDI_PITCH[root] || 36;
}

export interface SmartJamStepEvent {
  beatNumber: number; // 0-indexed beat in progression
  timeSec: number;
  chord: string;
  isDownbeat: boolean;
  kick: boolean;
  snare: boolean;
  hihat: boolean;
  crash: boolean;
  bassPitch: number | null; // MIDI note (e.g. 36 = C2)
  bassDurationSec: number;
}

export class SmartJamEngine {
  private isRunning: boolean = false;
  private config: SmartJamConfig = {
    style: "pop",
    bassMode: "simple",
    tempo: 120,
    timeSignature: "4/4",
    intensity: 75,
    complexity: 50,
    drumsEnabled: true,
    bassEnabled: true,
  };

  private chords: ChordSegment[] = [];
  private currentStepIndex: number = 0;
  private timerId: number | null = null;
  private nextEventTime: number = 0;
  private bassGainNode: GainNode | null = null;

  public setConfig(newConfig: Partial<SmartJamConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): SmartJamConfig {
    return { ...this.config };
  }

  public setProgression(chords: ChordSegment[]) {
    this.chords = chords;
  }

  /**
   * Generates rhythmic accompaniment pattern events for given chord progression.
   */
  public generateAccompanimentEvents(): SmartJamStepEvent[] {
    if (!this.chords || this.chords.length === 0) return [];

    const events: SmartJamStepEvent[] = [];
    const secondsPerBeat = 60 / Math.max(40, this.config.tempo);
    const beatsPerBar = this.config.timeSignature === "3/4" ? 3 : this.config.timeSignature === "6/8" ? 6 : 4;
    const style = this.config.style;
    const bassMode = this.config.bassMode;

    let globalBeat = 0;

    for (let cIdx = 0; cIdx < this.chords.length; cIdx++) {
      const seg = this.chords[cIdx];
      const nextSeg = this.chords[(cIdx + 1) % this.chords.length];
      const segDuration = Math.max(0.5, seg.endTime - seg.startTime);
      const beatsInSeg = Math.max(1, Math.round(segDuration / secondsPerBeat));
      const rootPitch = getMidiPitchFromChord(seg.chord);
      const nextRootPitch = getMidiPitchFromChord(nextSeg.chord);
      const fifthPitch = rootPitch + 7;

      for (let b = 0; b < beatsInSeg; b++) {
        const beatInBar = globalBeat % beatsPerBar;
        const isDownbeat = beatInBar === 0;
        const timeSec = globalBeat * secondsPerBeat;

        let kick = false;
        let snare = false;
        let hihat = true;
        let crash = false;
        let bassPitch: number | null = null;

        // --- Drum Pattern Logic by Style ---
        switch (style) {
          case "pop":
            kick = isDownbeat || beatInBar === 2;
            snare = beatInBar === 1 || beatInBar === 3;
            if (isDownbeat && globalBeat % (beatsPerBar * 4) === 0) crash = true;
            break;
          case "rock":
            kick = isDownbeat || beatInBar === 2 || (beatInBar === 3 && this.config.intensity > 70);
            snare = beatInBar === 1 || beatInBar === 3;
            if (isDownbeat && globalBeat % (beatsPerBar * 2) === 0) crash = true;
            break;
          case "funk":
            kick = isDownbeat || beatInBar === 1 || beatInBar === 2;
            snare = beatInBar === 1 || beatInBar === 3;
            break;
          case "ballad":
            kick = isDownbeat;
            snare = beatInBar === 2;
            break;
          case "worship":
            kick = isDownbeat || beatInBar === 2;
            snare = beatInBar === 1 || beatInBar === 3;
            crash = isDownbeat;
            break;
          case "citypop":
            kick = isDownbeat || beatInBar === 2;
            snare = beatInBar === 1 || beatInBar === 3;
            break;
          case "indie":
          default:
            kick = isDownbeat || beatInBar === 2;
            snare = beatInBar === 1 || beatInBar === 3;
            break;
        }

        // --- Bass Line Generation by BassMode ---
        if (this.config.bassEnabled) {
          if (bassMode === "root") {
            // Roots primarily on downbeat and beat 3
            if (isDownbeat || beatInBar === 2) {
              bassPitch = rootPitch;
            } else if (beatInBar === beatsPerBar - 1 && this.config.complexity > 40) {
              bassPitch = fifthPitch;
            }
          } else if (bassMode === "simple") {
            // Root + 5th + approach tone to next root
            if (isDownbeat) {
              bassPitch = rootPitch;
            } else if (beatInBar === 2) {
              bassPitch = fifthPitch;
            } else if (beatInBar === beatsPerBar - 1 && b === beatsInSeg - 1) {
              // Approach note: 1 semitone below next root
              bassPitch = nextRootPitch - 1;
            } else {
              bassPitch = rootPitch;
            }
          } else {
            // Melodic: Walking / grooving bass line
            if (isDownbeat) {
              bassPitch = rootPitch;
            } else if (beatInBar === 1) {
              bassPitch = rootPitch + 4; // Major/minor 3rd
            } else if (beatInBar === 2) {
              bassPitch = fifthPitch;
            } else if (beatInBar === 3) {
              bassPitch = nextRootPitch > rootPitch ? rootPitch + 2 : rootPitch - 2;
            } else {
              bassPitch = rootPitch;
            }
          }
        }

        events.push({
          beatNumber: globalBeat,
          timeSec,
          chord: seg.chord,
          isDownbeat,
          kick: this.config.drumsEnabled ? kick : false,
          snare: this.config.drumsEnabled ? snare : false,
          hihat: this.config.drumsEnabled ? hihat : false,
          crash: this.config.drumsEnabled ? crash : false,
          bassPitch: this.config.bassEnabled ? bassPitch : null,
          bassDurationSec: secondsPerBeat * 0.85,
        });

        globalBeat++;
      }
    }

    return events;
  }

  /**
   * Generates MIDI events for the bass track.
   */
  public generateBassMidi(): MidiNoteEvent[] {
    const events = this.generateAccompanimentEvents();
    const notes: MidiNoteEvent[] = [];

    events.forEach((ev, idx) => {
      if (ev.bassPitch !== null) {
        notes.push({
          id: `bass-midi-${idx}`,
          pitch: ev.bassPitch,
          startBeat: ev.beatNumber,
          durationBeats: 0.9,
          velocity: ev.isDownbeat ? 110 : 90,
        });
      }
    });

    return notes;
  }

  /**
   * Generates MIDI events for the drum track (GM Drum Map: Kick=36, Snare=38, HiHat=42, Crash=49).
   */
  public generateDrumMidi(): MidiNoteEvent[] {
    const events = this.generateAccompanimentEvents();
    const notes: MidiNoteEvent[] = [];

    events.forEach((ev, idx) => {
      if (ev.kick) {
        notes.push({
          id: `kick-${idx}`,
          pitch: 36,
          startBeat: ev.beatNumber,
          durationBeats: 0.25,
          velocity: 110,
        });
      }
      if (ev.snare) {
        notes.push({
          id: `snare-${idx}`,
          pitch: 38,
          startBeat: ev.beatNumber,
          durationBeats: 0.25,
          velocity: 105,
        });
      }
      if (ev.hihat) {
        notes.push({
          id: `hihat-${idx}`,
          pitch: 42,
          startBeat: ev.beatNumber,
          durationBeats: 0.2,
          velocity: 80,
        });
      }
      if (ev.crash) {
        notes.push({
          id: `crash-${idx}`,
          pitch: 49,
          startBeat: ev.beatNumber,
          durationBeats: 0.5,
          velocity: 115,
        });
      }
    });

    return notes;
  }

  /**
   * Real-time synthesized bass note triggering in Web Audio.
   */
  public playBassNote(pitch: number, durationSec: number = 0.5) {
    const ctx = audioEngine.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const freq = 440 * Math.pow(2, (pitch - 69) / 12);

      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      // Warm analog-style synth bass
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now);

      subOsc.type = "sine";
      subOsc.frequency.setValueAtTime(freq / 2, now); // Sub octave

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(Math.min(2200, freq * 4), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 1.5), now + durationSec);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

      osc.connect(filter);
      subOsc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      subOsc.start(now);
      osc.stop(now + durationSec);
      subOsc.stop(now + durationSec);
    } catch {
      // AudioContext state safety
    }
  }
}

export const smartJamEngine = new SmartJamEngine();
