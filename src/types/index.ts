export type TuningName = string;

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
  position?: number;
  notes: string[];
  intervals?: string[];
  cagedShape?: "C" | "A" | "G" | "E" | "D";
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
  voicingType?: "exact" | "simplified" | "generated" | "none";
  voicingConfidence?: number;
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

export interface ChordSegment {
  id: string;
  chord: string;
  root?: string;
  bass?: string;
  quality?: string;
  extensions?: string[];
  startTime: number;
  endTime: number;
  rawStartTime?: number;
  rawEndTime?: number;
  confidence: number;
  stability: number;
  beatStart?: number;
  beatEnd?: number;
  detectionConfidence?: number;
  voicingConfidence?: number;
  displayChord?: string;
  rawChord?: string;
  stabilizedChord?: string;
  durationBeats?: number;
  candidateSupportFrames?: number;
  changeMargin?: number;
  snappedBoundary?: boolean;
  beatIndex?: number;
  voicingType?: "exact" | "simplified" | "generated" | "none";
  simplificationReason?: string;
  voicing?: ChordVoicing | null;
  diagnostics?: any;
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
  chords: string[]; // List of unique chords used
  chordSegments?: ChordSegment[]; // Timeline of chords
  tuning: string;
  tuningDeviation?: number; // Estimated cents deviation from A=440
  sections: SongSection[];
  beats?: number[]; // Timestamps of detected beats
  tips?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  thumbnailUrl?: string;
  isYoutubeTrack?: boolean;
  confidence?: number;
  audioBlob?: Blob;
  duration?: number;
  analysisVersion?: string;
  diagnostics?: {
    fileSize: number;
    mimeType: string;
    decodedDuration: number;
    sampleRate: number;
    numChannels: number;
    numSamples: number;
    workerStarted: boolean;
    workerReceivedSamples: boolean;
    workerSampleCount: number;
    featureFrameCount: number;
    chromaFrameCount: number;
    bassFrameCount: number;
    keyResult: string;
    numChordStates: number;
    observationMatrixDims: string;
    hasNaNOrInf: boolean;
    viterbiInputDims: string;
    viterbiOutputLen: number;
    rawChordSegmentCount: number;
    finalChordSegmentCount: number;
    rawSegmentCount?: number;
    stabilizedSegmentCount?: number;
    mergedSegments?: number;
    rejectedTransientSlashSegments?: number;
    finalProgression?: string[];
    avgSegmentDuration?: number;
    medianSegmentDuration?: number;
    minSegmentDuration?: number;
    maxSegmentDuration?: number;
    numChordChanges?: number;
    changesPerMinute?: number;
    averageChordConfidence?: number;
    averageTransitionConfidence?: number;
    transitionsNearBeats?: number;
    transitionsAwayFromBeats?: number;
  };
}

export interface SavedSong extends SongAnalysis {
  audioBlob?: Blob;
  lastPlayedAt?: number;
  savedAt?: number;
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
  blob?: Blob;
  volume: number; // 0 to 1
  pan: number; // -1 to 1
  muted: boolean;
  soloed: boolean;
  reversed: boolean;
  halfSpeed: boolean;
  lengthSeconds: number;
}

export interface LooperSession {
  id: string;
  name: string;
  bpm: number;
  tracks: LooperTrack[];
  updatedAt: number;
}

export type CountInSetting = "off" | "1bar" | "2bars";
export type GridSnapSetting = "off" | "1bar" | "1/2" | "1/4" | "1/8" | "1/16" | "1beat";

export interface AudioClip {
  id: string;
  name: string;
  startTime: number; // Position on project timeline in seconds
  duration: number; // Playable duration on timeline in seconds
  trimStart: number; // Offset inside the raw audioBuffer (seconds)
  audioBuffer: AudioBuffer | null;
  audioBlob?: Blob;
  waveformPeaks?: number[];
  fadeInSec: number; // Fade-in ramp duration (seconds)
  fadeOutSec: number; // Fade-out ramp duration (seconds)
  gain: number; // Clip gain multiplier (1.0 = 0 dB)
  color?: string;
}

export interface TrackEqConfig {
  lowGainDb: number;
  midGainDb: number;
  highGainDb: number;
}

export interface TrackInsertEffectsConfig {
  reverbSendLevel: number;
  compressorEnabled: boolean;
  compressorThresholdDb: number;
  compressorRatio: number;
}

export const DEFAULT_TRACK_EQ: TrackEqConfig = {
  lowGainDb: 0,
  midGainDb: 0,
  highGainDb: 0,
};

export const DEFAULT_TRACK_INSERT_EFFECTS: TrackInsertEffectsConfig = {
  reverbSendLevel: 0,
  compressorEnabled: false,
  compressorThresholdDb: -24,
  compressorRatio: 4,
};

export interface DAWTrack {
  id: string;
  name: string;
  color: string;
  volume: number; // 0 to 1.5
  pan: number; // -1 to 1
  muted: boolean;
  soloed: boolean;
  armed?: boolean;
  monitoring?: boolean;
  clips: AudioClip[];
  eq?: TrackEqConfig;
  insertEffects?: TrackInsertEffectsConfig;
  busId?: string; // which mix bus this track routes to, undefined / "master" = master
  // Legacy / convenience fields
  audioBuffer?: AudioBuffer | null;
  audioBlob?: Blob;
  recording?: boolean;
  waveformPeaks?: number[];
  startTime?: number;
  duration?: number;
  inputSource?: "processed" | "dry";
}

export interface DAWProject {
  id: string;
  name: string;
  bpm: number;
  keySig: string;
  timeSig: string;
  tracks: DAWTrack[];
  createdAt: number;
  updatedAt: number;
  tonePresetId?: string;
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
  | "studio"
  | "presets"
  | "devices";
