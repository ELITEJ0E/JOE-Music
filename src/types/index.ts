export type WorkstationMode =
  | "home"
  | "songs"
  | "chords-ai"
  | "practice"
  | "tuner"
  | "chord-dictionary"
  | "fretboard"
  | "scales"
  | "rhythm"
  | "studio"
  | "multi-track"
  | "looper"
  | "tone-studio"
  | "presets";

export interface ChordSegment {
  id?: string;
  chord: string;
  root?: string;
  quality?: string;
  bass?: string;
  extensions?: string[] | any;
  rawChord?: any;
  startTime: number;
  endTime: number;
  durationBeats?: number;
  confidence?: number;
  stability?: number;
  section?: string;
  diagnostics?: any;
}

export type SectionType = "intro" | "verse" | "chorus" | "bridge" | "outro" | "solo" | "section";

export interface SongSection {
  id?: string;
  name: string; // Retained for backwards compatibility
  label?: string; // Canonical musical label e.g. "Chorus", "Section A"
  type?: SectionType;
  startTime: number;
  endTime?: number;
  confidence?: number;
  repeatGroup?: string; // "A", "B", "C"
  key?: string; // Local section key
  harmonicVocabulary?: string[];
  averageEnergy?: number;
  color?: string;
  bars?: number;
  chords?: string[];
  strummingPattern?: string;
  lyrics?: string;
}

export type ChordComplexityMode = "easy" | "standard" | "detailed";

export interface DownbeatAnalysis {
  timeSignature: string;
  meterConfidence: number;
  beatsPerBar: number;
  downbeatIndices: number[];
  downbeats: number[];
}

export interface MidiNoteEvent {
  id: string;
  pitch: number; // 0 - 127
  startBeat: number;
  durationBeats: number;
  velocity: number; // 0 - 127
}

export interface MidiTrackData {
  channel: number;
  instrumentName?: string;
  notes: MidiNoteEvent[];
}

export interface StemAsset {
  id: string;
  name: string;
  type: "vocals" | "drums" | "bass" | "guitar" | "other";
  audioUrl?: string;
  audioBlob?: Blob;
  audioBuffer?: AudioBuffer | null;
  volume: number;
  muted: boolean;
}

export interface PracticePerformance {
  sessionId: string;
  timestamp: number;
  songId?: string;
  songTitle?: string;
  tempo: number;
  chordAccuracy: number; // 0 - 100
  timingAccuracy: number; // 0 - 100
  averageTransitionMs: number;
  totalChordsAttempted: number;
  correctChords: number;
  missedChanges: number;
  lateChanges: number;
  bestTransition?: string;
  weakestTransition?: string;
  details?: Array<{
    targetChord: string;
    detectedChord: string;
    transitionTimeMs: number;
    success: boolean;
  }>;
}

export type SmartJamStyle = "pop" | "rock" | "funk" | "ballad" | "worship" | "indie" | "citypop";
export type BassMode = "root" | "simple" | "melodic";

export interface SmartJamConfig {
  style: SmartJamStyle;
  bassMode: BassMode;
  tempo: number;
  timeSignature: string;
  intensity: number; // 1 - 100
  complexity: number; // 1 - 100
  drumsEnabled: boolean;
  bassEnabled: boolean;
}

export interface ProjectSnapshot {
  id: string;
  projectId: string;
  name: string;
  timestamp: number;
  description?: string;
  tracksSummary: string;
  snapshotData: string; // JSON serialized state
}

export interface ChordCorrection {
  songId: string;
  segmentId?: string;
  startTime: number;
  endTime: number;
  originalChord: string;
  correctedChord: string;
  confidence?: number;
  key?: string;
  analysisVersion?: string;
  timestamp: number;
}

export interface SongAnalysis {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  key?: string;
  tempo?: number;
  suggestedCapo?: number;
  difficulty?: "Beginner" | "Intermediate" | "Advanced" | string;
  tuning?: string;
  tuningDeviation?: number;
  timeSignature?: string;
  meterConfidence?: number;
  beatsPerBar?: number;
  downbeats?: number[];
  sectionKeys?: Record<number, string>;
  chords: string[];
  chordSegments?: ChordSegment[];
  waveformPeaks?: number[];
  audioUrl?: string;
  streamUrl?: string;
  imageUrl?: string;
  youtubeUrl?: string;
  sunoId?: string;
  sunoUrl?: string;
  clipId?: string;
  lyrics?: string;
  tags?: string | string[];
  tips?: string | string[];
  audioBlob?: Blob;
  beats?: number[];
  sections?: SongSection[];
  rawTimelinesForDebug?: any;
  confidence?: number;
  analysisVersion?: string;
  diagnostics?: any;
}

export interface ChordVoicing {
  id?: string;
  name?: string;
  root?: string;
  quality?: string;
  frets: (number | "x")[];
  fingers?: any;
  barres?: number[];
  barre?: any;
  baseFret?: number;
  position?: number;
  cagedShape?: any;
  voicingType?: string;
  difficulty?: "beginner" | "intermediate" | "advanced" | "Beginner" | "Intermediate" | "Advanced" | string;
  rootString?: number;
  description?: string;
  notes?: string[];
  intervals?: (number | string)[];
  voicingConfidence?: number;
}

export interface TunerResult {
  note: string;
  octave: number;
  frequency: number;
  targetFrequency: number;
  cents: number;
  inTune: boolean;
  clarity: number;
  stringIndex?: number;
  closestStringIndex?: number;
}

export interface ScaleDefinition {
  name: string;
  category: string;
  intervals: number[];
  formula: string[];
  description: string;
}

export interface GuitarTuning {
  name: string;
  notes: string[];
  frequencies: number[];
  description: string;
}

export interface SavedSong extends SongAnalysis {
  savedAt: number;
  lastPlayedAt?: number;
  isUserEdited?: boolean;
  transcriptionConfidence?: number;
  rawHarmonicData?: any;
}

export interface RecentSongItem {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  bpm?: number;
  key?: string;
  imageUrl?: string;
  audioUrl?: string;
  streamUrl?: string;
  playedAt?: number;
  playCount?: number;
}

export interface PedalParam {
  id: string;
  name: string;
  value: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  type?: "slider" | "switch" | "select" | "knob";
  options?: string[];
}

export interface PedalConfig {
  id: string;
  type: string;
  name: string;
  category?: "dynamics" | "drive" | "modulation" | "time" | "filter" | "amp" | "cab" | string;
  enabled: boolean;
  color?: string;
  icon?: string;
  params: { [key: string]: number | string | boolean };
}

export interface TonePreset {
  id: string;
  name: string;
  category: string;
  description: string;
  author?: string;
  pedals: PedalConfig[];
  favorite?: boolean;
  tags?: string[];
  createdAt?: number;
  scope?: "GUITAR_RIG" | "STUDIO_TRACK" | "MASTER";
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

export type ClipSourceType =
  | "USER_RECORDING"
  | "USER_UPLOAD"
  | "USER_GENERATED"
  | "PROTECTED_CATALOG"
  | "REMIXABLE_CATALOG";

export interface ClipTake {
  id: string;
  name: string;
  audioBuffer: AudioBuffer | null;
  audioBlob?: Blob;
  createdAt: number;
}

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
  // Source metadata for export and rights verification
  sourceAssetId?: string;
  sourceType?: ClipSourceType;
  sourceOwnershipType?: string;
  sourceOrigin?: string;
  // Take lane support
  takes?: ClipTake[];
  activeTakeId?: string;
}

export interface TrackEqConfig {
  lowGainDb: number;
  midGainDb: number;
  highGainDb: number;
}

export interface TrackDelayConfig {
  enabled: boolean;
  timeSec: number; // 0.05 to 1.0 (default 0.35s)
  feedback: number; // 0 to 0.85 (default 0.35)
  mix: number; // 0 to 1.0 (default 0.25)
}

export interface TrackChorusConfig {
  enabled: boolean;
  rateHz: number; // 0.1 to 6.0 (default 1.5 Hz)
  depth: number; // 0 to 1.0 (default 0.4)
  mix: number; // 0 to 1.0 (default 0.3)
}

export interface TrackDriveConfig {
  enabled: boolean;
  amount: number; // 0 to 100 (default 25)
  tone: number; // 0 to 100 (default 50)
  mix: number; // 0 to 1.0 (default 0.35)
}

export interface TrackInsertEffectsConfig {
  reverbSendLevel: number;
  compressorEnabled: boolean;
  compressorThresholdDb: number;
  compressorRatio: number;
  delay?: TrackDelayConfig;
  chorus?: TrackChorusConfig;
  drive?: TrackDriveConfig;
}

export const DEFAULT_TRACK_EQ: TrackEqConfig = {
  lowGainDb: 0,
  midGainDb: 0,
  highGainDb: 0,
};

export const DEFAULT_TRACK_DELAY: TrackDelayConfig = {
  enabled: false,
  timeSec: 0.35,
  feedback: 0.35,
  mix: 0.25,
};

export const DEFAULT_TRACK_CHORUS: TrackChorusConfig = {
  enabled: false,
  rateHz: 1.5,
  depth: 0.4,
  mix: 0.3,
};

export const DEFAULT_TRACK_DRIVE: TrackDriveConfig = {
  enabled: false,
  amount: 25,
  tone: 50,
  mix: 0.35,
};

export const DEFAULT_TRACK_INSERT_EFFECTS: TrackInsertEffectsConfig = {
  reverbSendLevel: 0,
  compressorEnabled: false,
  compressorThresholdDb: -24,
  compressorRatio: 4,
  delay: DEFAULT_TRACK_DELAY,
  chorus: DEFAULT_TRACK_CHORUS,
  drive: DEFAULT_TRACK_DRIVE,
};

export interface ToneMacroSettings {
  warmth: number; // 0 - 100: low-mid body, saturation
  brightness: number; // 0 - 100: high-end presence, shimmer
  punch: number; // 0 - 100: compressor bite, transient snap
  space: number; // 0 - 100: reverb decay & delay reflection
  width: number; // 0 - 100: stereo spread & chorus
  character: number; // 0 - 100: drive edge & harmonic tone
}

export const DEFAULT_TONE_MACROS: ToneMacroSettings = {
  warmth: 50,
  brightness: 55,
  punch: 45,
  space: 35,
  width: 40,
  character: 50,
};

export interface AutomationPoint {
  time: number;
  value: number;
}

export interface AutomationLane {
  id: string;
  parameter: "volume" | "pan" | "reverbSend" | "warmth" | "brightness";
  enabled: boolean;
  points: AutomationPoint[];
}

export interface DAWTrack {
  id: string;
  name: string;
  color: string;
  trackType?: "AUDIO" | "MIDI";
  midiNotes?: MidiNoteEvent[];
  midiInstrument?: "piano" | "pad" | "bass" | "guitar" | "drums" | "synth" | string;
  volume: number; // 0 to 1.5
  pan: number; // -1 to 1
  muted: boolean;
  soloed: boolean;
  armed?: boolean;
  monitoring?: boolean;
  clips: AudioClip[];
  eq?: TrackEqConfig;
  insertEffects?: TrackInsertEffectsConfig;
  toneMacros?: ToneMacroSettings; // Real per-track sound macros
  busId?: string; // "drums" | "bass" | "vocals" | "guitars" | "keys" | "master"
  automationLanes?: AutomationLane[];
  // Legacy / convenience fields
  audioBuffer?: AudioBuffer | null;
  audioBlob?: Blob;
  recording?: boolean;
  waveformPeaks?: number[];
  startTime?: number;
  duration?: number;
  inputSource?: "processed" | "dry";
}

export interface MasteringConfig {
  enabled: boolean;
  profile: "Natural" | "Warm" | "Punch" | "Bright" | "Wide";
  intensity: "Light" | "Normal" | "Strong";
  targetLufs?: number;
  ceilingDb?: number;
}

export const DEFAULT_MASTERING_CONFIG: MasteringConfig = {
  enabled: false,
  profile: "Natural",
  intensity: "Normal",
  targetLufs: -14,
  ceilingDb: -0.3,
};

export interface DAWProject {
  id: string;
  name: string;
  bpm: number;
  keySig: string;
  timeSig: string;
  tracks: DAWTrack[];
  mastering?: MasteringConfig;
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

export interface DrumPattern {
  id: string;
  name: string;
  genre: "rock" | "pop" | "funk" | "blues" | "jazz" | "metal" | "acoustic";
  timeSignature: "4/4" | "3/4" | "6/8";
  steps: DrumStep[];
}
