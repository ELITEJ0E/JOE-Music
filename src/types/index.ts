export type TuningName =
  | "Standard (EADGBE)"
  | "Drop D (DADGBE)"
  | "Double Drop D (DADGBD)"
  | "DADGAD (Celtic)"
  | "Open D (DADF#AD)"
  | "Open G (DGDGBD)"
  | "Open E (EBEG#BE)"
  | "Half-Step Down (Eb Ab Db Gb Bb Eb)"
  | "Full-Step Down (D G C F A D)"
  | "Drop C (CGCFAD)"
  | "B Standard / 7-String (BEADGBE)";

export interface GuitarTuning {
  name: TuningName;
  notes: string[]; // e.g. ["E2", "A2", "D3", "G3", "B3", "E4"]
  frequencies: number[];
  description: string;
}

export interface TunerResult {
  frequency: number;
  note: string;
  octave: number;
  cents: number;
  targetFrequency: number;
  inTune: boolean;
  stringIndex: number | null;
  clarity: number;
}

export interface ChordVoicing {
  id: string;
  name: string;
  root: string;
  quality: string;
  frets: (number | "x")[]; // 6 strings: 6th (low E) to 1st (high E), e.g. [3, 2, 0, 0, 3, 3] for G
  fingers?: (number | 0)[]; // 1: Index, 2: Middle, 3: Ring, 4: Pinky, 0: Open/None
  barre?: { fret: number; fromString: number; toString: number };
  baseFret?: number;
  notes: string[];
  intervals?: string[];
  cagedShape?: "C" | "A" | "G" | "E" | "D";
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
}

export interface ScaleDefinition {
  name: string;
  category: "Pentatonic" | "Diatonic" | "Modes" | "Symmetric" | "Exotic" | "Blues";
  intervals: number[]; // Semitone steps from root [0, 2, 4, 5, 7, 9, 11]
  formula: string[]; // e.g. ["1", "2", "3", "4", "5", "6", "7"]
  description: string;
}

export interface SongSection {
  name: string;
  startTime: number;
  bars: number;
  chords: string[];
  strummingPattern: string;
  lyrics?: string;
  confidence?: number;
}

export interface SongAnalysis {
  id: string;
  title: string;
  artist: string;
  key: string;
  tempo: number;
  timeSignature: string;
  suggestedCapo: number;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  chords: string[];
  tuning: string;
  sections: SongSection[];
  tips?: string;
  youtubeUrl?: string;
  confidence?: number;
  audioBlob?: Blob;
  duration?: number;
}

export interface SavedSong extends SongAnalysis {
  audioBlob: Blob;
}

export type PedalType =
  | "noiseGate"
  | "compressor"
  | "overdrive"
  | "distortion"
  | "ampHead"
  | "chorus"
  | "delay"
  | "reverb"
  | "limiter";

export interface PedalConfig {
  id: string;
  type: PedalType;
  name: string;
  enabled: boolean;
  color: string;
  params: Record<string, number | string | boolean>;
}

export interface TonePreset {
  id: string;
  name: string;
  category: "Clean" | "Blues Crunch" | "Classic Rock" | "High Gain Metal" | "Ambient Dream" | "Acoustic Warmth" | "Funk Rhythm";
  description: string;
  pedals: PedalConfig[];
}

export interface LooperTrack {
  id: string;
  name: string;
  buffer: AudioBuffer | null;
  volume: number; // 0 to 1
  pan: number; // -1 to 1
  muted: boolean;
  soloed: boolean;
  reversed: boolean;
  halfSpeed: boolean;
  lengthSeconds: number;
}

export interface DAWTrack {
  id: string;
  name: string;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  audioBuffer: AudioBuffer | null;
  audioBlob?: Blob;
  recording: boolean;
  waveformPeaks?: number[];
  startTime: number;
  duration: number;
}

export interface AudioDevice {
  deviceId: string;
  label: string;
  groupId: string;
  kind: MediaDeviceKind;
}

export interface SavedRecording {
  id: string;
  title: string;
  date: string;
  duration: number;
  blob: Blob;
  url: string;
  bpm?: number;
  key?: string;
  tags: string[];
}

export interface DrumStep {
  kick: boolean;
  snare: boolean;
  hihatClosed: boolean;
  hihatOpen: boolean;
  crash?: boolean;
  ride?: boolean;
  tom?: boolean;
}

export interface DrumPatternConfig {
  id: string;
  name: string;
  timeSignature: "4/4" | "3/4" | "6/8" | "12/8";
  stepsCount: number;
  swing: number;
  steps: DrumStep[];
}

export type WorkstationMode =
  | "home"
  | "songs"
  | "chords-ai"
  | "tuner"
  | "tone-studio"
  | "fretboard"
  | "chord-dictionary"
  | "scales"
  | "looper"
  | "multi-track"
  | "rhythm"
  | "practice"
  | "recordings"
  | "presets"
  | "devices";
