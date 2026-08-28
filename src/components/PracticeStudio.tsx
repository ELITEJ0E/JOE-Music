import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Target,
  Clock,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  CheckCircle,
  XCircle,
  Sparkles,
  Award,
  Send,
  Flame,
  Zap,
  Check,
  ChevronRight,
  TrendingUp,
  BarChart2,
  Shuffle,
  Plus,
  Trash2,
  Filter,
  Layers,
  Music,
  Sliders,
  RefreshCw,
  X,
  ChevronLeft,
  ArrowRight,
  Activity,
  SlidersHorizontal,
  CheckSquare,
  Square,
} from "lucide-react";
import { guitarSynth } from "../audio/guitarSynth";
import { findChordByName, CHORD_DATABASE } from "../data/chordDatabase";
import { savePracticeLog } from "../utils/storage";
import { SunoSong } from "./SongsLibraryView";
import { ChordDiagram } from "./ChordDiagram";

// --- Comprehensive Speed Drills Catalog & Presets ---

export interface PracticeChordItem {
  name: string;
  root: string;
  quality: string;
  category: "maj" | "min" | "7" | "maj7" | "m7" | "sus" | "add9" | "5" | "dim-aug";
  isOpen?: boolean;
  isBarre?: boolean;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
}

export const MASTER_CHORD_CATALOG: PracticeChordItem[] = [
  // C Family
  { name: "C", root: "C", quality: "Major", category: "maj", isOpen: true, difficulty: "Beginner" },
  { name: "Cm", root: "C", quality: "Minor", category: "min", isBarre: true, difficulty: "Intermediate" },
  { name: "C7", root: "C", quality: "7", category: "7", isOpen: true, difficulty: "Beginner" },
  { name: "Cmaj7", root: "C", quality: "maj7", category: "maj7", isOpen: true, difficulty: "Beginner" },
  { name: "Cm7", root: "C", quality: "min7", category: "m7", isBarre: true, difficulty: "Intermediate" },
  { name: "Cadd9", root: "C", quality: "add9", category: "add9", isOpen: true, difficulty: "Beginner" },
  { name: "Csus2", root: "C", quality: "sus2", category: "sus", isOpen: true, difficulty: "Beginner" },
  { name: "Csus4", root: "C", quality: "sus4", category: "sus", isOpen: true, difficulty: "Intermediate" },
  { name: "C5", root: "C", quality: "5", category: "5", isBarre: true, difficulty: "Beginner" },
  { name: "Cmaj9", root: "C", quality: "maj9", category: "add9", isBarre: true, difficulty: "Advanced" },
  { name: "Cdim7", root: "C", quality: "dim7", category: "dim-aug", isBarre: true, difficulty: "Advanced" },
  { name: "Caug", root: "C", quality: "aug", category: "dim-aug", isBarre: true, difficulty: "Intermediate" },

  // C# / Db Family
  { name: "C#", root: "C#", quality: "Major", category: "maj", isBarre: true, difficulty: "Intermediate" },
  { name: "C#m", root: "C#", quality: "Minor", category: "min", isBarre: true, difficulty: "Intermediate" },
  { name: "C#7", root: "C#", quality: "7", category: "7", isBarre: true, difficulty: "Intermediate" },
  { name: "C#maj7", root: "C#", quality: "maj7", category: "maj7", isBarre: true, difficulty: "Intermediate" },
  { name: "C#m7", root: "C#", quality: "min7", category: "m7", isBarre: true, difficulty: "Intermediate" },
  { name: "C#5", root: "C#", quality: "5", category: "5", isBarre: true, difficulty: "Beginner" },
  { name: "Db", root: "C#", quality: "Major", category: "maj", isBarre: true, difficulty: "Intermediate" },
  { name: "Dbm", root: "C#", quality: "Minor", category: "min", isBarre: true, difficulty: "Intermediate" },

  // D Family
  { name: "D", root: "D", quality: "Major", category: "maj", isOpen: true, difficulty: "Beginner" },
  { name: "Dm", root: "D", quality: "Minor", category: "min", isOpen: true, difficulty: "Beginner" },
  { name: "D7", root: "D", quality: "7", category: "7", isOpen: true, difficulty: "Beginner" },
  { name: "Dmaj7", root: "D", quality: "maj7", category: "maj7", isOpen: true, difficulty: "Beginner" },
  { name: "Dm7", root: "D", quality: "min7", category: "m7", isOpen: true, difficulty: "Beginner" },
  { name: "Dsus2", root: "D", quality: "sus2", category: "sus", isOpen: true, difficulty: "Beginner" },
  { name: "Dsus4", root: "D", quality: "sus4", category: "sus", isOpen: true, difficulty: "Beginner" },
  { name: "Dadd9", root: "D", quality: "add9", category: "add9", isOpen: true, difficulty: "Beginner" },
  { name: "D5", root: "D", quality: "5", category: "5", isOpen: true, difficulty: "Beginner" },
  { name: "Dm9", root: "D", quality: "min9", category: "add9", isBarre: true, difficulty: "Advanced" },
  { name: "Daug", root: "D", quality: "aug", category: "dim-aug", isBarre: true, difficulty: "Intermediate" },

  // Eb / D# Family
  { name: "Eb", root: "Eb", quality: "Major", category: "maj", isBarre: true, difficulty: "Intermediate" },
  { name: "Ebm", root: "Eb", quality: "Minor", category: "min", isBarre: true, difficulty: "Intermediate" },
  { name: "Eb7", root: "Eb", quality: "7", category: "7", isBarre: true, difficulty: "Intermediate" },
  { name: "Ebmaj7", root: "Eb", quality: "maj7", category: "maj7", isBarre: true, difficulty: "Intermediate" },
  { name: "Ebm7", root: "Eb", quality: "min7", category: "m7", isBarre: true, difficulty: "Intermediate" },
  { name: "Eb5", root: "Eb", quality: "5", category: "5", isBarre: true, difficulty: "Beginner" },

  // E Family
  { name: "E", root: "E", quality: "Major", category: "maj", isOpen: true, difficulty: "Beginner" },
  { name: "Em", root: "E", quality: "Minor", category: "min", isOpen: true, difficulty: "Beginner" },
  { name: "E7", root: "E", quality: "7", category: "7", isOpen: true, difficulty: "Beginner" },
  { name: "Emaj7", root: "E", quality: "maj7", category: "maj7", isOpen: true, difficulty: "Beginner" },
  { name: "Em7", root: "E", quality: "min7", category: "m7", isOpen: true, difficulty: "Beginner" },
  { name: "Esus4", root: "E", quality: "sus4", category: "sus", isOpen: true, difficulty: "Beginner" },
  { name: "E7#9", root: "E", quality: "7#9", category: "add9", isBarre: true, difficulty: "Intermediate" },
  { name: "E5", root: "E", quality: "5", category: "5", isOpen: true, difficulty: "Beginner" },
  { name: "Em9", root: "E", quality: "min9", category: "add9", isOpen: true, difficulty: "Intermediate" },
  { name: "Eaug", root: "E", quality: "aug", category: "dim-aug", isOpen: true, difficulty: "Intermediate" },
  { name: "Edim7", root: "E", quality: "dim7", category: "dim-aug", isBarre: true, difficulty: "Advanced" },

  // F Family
  { name: "F", root: "F", quality: "Major", category: "maj", isBarre: true, difficulty: "Intermediate" },
  { name: "Fm", root: "F", quality: "Minor", category: "min", isBarre: true, difficulty: "Intermediate" },
  { name: "F7", root: "F", quality: "7", category: "7", isBarre: true, difficulty: "Intermediate" },
  { name: "Fmaj7", root: "F", quality: "maj7", category: "maj7", isOpen: true, difficulty: "Beginner" },
  { name: "Fm7", root: "F", quality: "min7", category: "m7", isBarre: true, difficulty: "Intermediate" },
  { name: "Fsus4", root: "F", quality: "sus4", category: "sus", isBarre: true, difficulty: "Intermediate" },
  { name: "F5", root: "F", quality: "5", category: "5", isBarre: true, difficulty: "Beginner" },
  { name: "Fdim7", root: "F", quality: "dim7", category: "dim-aug", isOpen: true, difficulty: "Advanced" },

  // F# / Gb Family
  { name: "F#", root: "F#", quality: "Major", category: "maj", isBarre: true, difficulty: "Intermediate" },
  { name: "F#m", root: "F#", quality: "Minor", category: "min", isBarre: true, difficulty: "Intermediate" },
  { name: "F#7", root: "F#", quality: "7", category: "7", isBarre: true, difficulty: "Intermediate" },
  { name: "F#maj7", root: "F#", quality: "maj7", category: "maj7", isBarre: true, difficulty: "Intermediate" },
  { name: "F#m7", root: "F#", quality: "min7", category: "m7", isBarre: true, difficulty: "Intermediate" },
  { name: "F#5", root: "F#", quality: "5", category: "5", isBarre: true, difficulty: "Beginner" },

  // G Family
  { name: "G", root: "G", quality: "Major", category: "maj", isOpen: true, difficulty: "Beginner" },
  { name: "Gm", root: "G", quality: "Minor", category: "min", isBarre: true, difficulty: "Intermediate" },
  { name: "G7", root: "G", quality: "7", category: "7", isOpen: true, difficulty: "Beginner" },
  { name: "Gmaj7", root: "G", quality: "maj7", category: "maj7", isOpen: true, difficulty: "Advanced" },
  { name: "Gm7", root: "G", quality: "min7", category: "m7", isBarre: true, difficulty: "Intermediate" },
  { name: "Gsus2", root: "G", quality: "sus2", category: "sus", isOpen: true, difficulty: "Beginner" },
  { name: "Gsus4", root: "G", quality: "sus4", category: "sus", isOpen: true, difficulty: "Beginner" },
  { name: "Gadd9", root: "G", quality: "add9", category: "add9", isOpen: true, difficulty: "Beginner" },
  { name: "G5", root: "G", quality: "5", category: "5", isBarre: true, difficulty: "Beginner" },
  { name: "Gmaj9", root: "G", quality: "maj9", category: "add9", isBarre: true, difficulty: "Advanced" },
  { name: "Gaug", root: "G", quality: "aug", category: "dim-aug", isBarre: true, difficulty: "Intermediate" },

  // Ab / G# Family
  { name: "Ab", root: "Ab", quality: "Major", category: "maj", isBarre: true, difficulty: "Intermediate" },
  { name: "Abm", root: "Ab", quality: "Minor", category: "min", isBarre: true, difficulty: "Intermediate" },
  { name: "Ab7", root: "Ab", quality: "7", category: "7", isBarre: true, difficulty: "Intermediate" },
  { name: "Abmaj7", root: "Ab", quality: "maj7", category: "maj7", isBarre: true, difficulty: "Intermediate" },
  { name: "Ab5", root: "Ab", quality: "5", category: "5", isBarre: true, difficulty: "Beginner" },
  { name: "G#m", root: "Ab", quality: "Minor", category: "min", isBarre: true, difficulty: "Intermediate" },

  // A Family
  { name: "A", root: "A", quality: "Major", category: "maj", isOpen: true, difficulty: "Beginner" },
  { name: "Am", root: "A", quality: "Minor", category: "min", isOpen: true, difficulty: "Beginner" },
  { name: "A7", root: "A", quality: "7", category: "7", isOpen: true, difficulty: "Beginner" },
  { name: "Amaj7", root: "A", quality: "maj7", category: "maj7", isOpen: true, difficulty: "Beginner" },
  { name: "Am7", root: "A", quality: "min7", category: "m7", isOpen: true, difficulty: "Beginner" },
  { name: "Asus2", root: "A", quality: "sus2", category: "sus", isOpen: true, difficulty: "Beginner" },
  { name: "Asus4", root: "A", quality: "sus4", category: "sus", isOpen: true, difficulty: "Beginner" },
  { name: "Aadd9", root: "A", quality: "add9", category: "add9", isOpen: true, difficulty: "Beginner" },
  { name: "A5", root: "A", quality: "5", category: "5", isOpen: true, difficulty: "Beginner" },
  { name: "Am9", root: "A", quality: "min9", category: "add9", isOpen: true, difficulty: "Advanced" },
  { name: "Aaug", root: "A", quality: "aug", category: "dim-aug", isOpen: true, difficulty: "Intermediate" },

  // Bb / A# Family
  { name: "Bb", root: "Bb", quality: "Major", category: "maj", isBarre: true, difficulty: "Intermediate" },
  { name: "Bbm", root: "Bb", quality: "Minor", category: "min", isBarre: true, difficulty: "Intermediate" },
  { name: "Bb7", root: "Bb", quality: "7", category: "7", isBarre: true, difficulty: "Intermediate" },
  { name: "Bbmaj7", root: "Bb", quality: "maj7", category: "maj7", isBarre: true, difficulty: "Intermediate" },
  { name: "Bbm7", root: "Bb", quality: "min7", category: "m7", isBarre: true, difficulty: "Intermediate" },
  { name: "Bb5", root: "Bb", quality: "5", category: "5", isBarre: true, difficulty: "Beginner" },

  // B Family
  { name: "B", root: "B", quality: "Major", category: "maj", isBarre: true, difficulty: "Intermediate" },
  { name: "Bm", root: "B", quality: "Minor", category: "min", isBarre: true, difficulty: "Intermediate" },
  { name: "B7", root: "B", quality: "7", category: "7", isOpen: true, difficulty: "Beginner" },
  { name: "Bmaj7", root: "B", quality: "maj7", category: "maj7", isBarre: true, difficulty: "Intermediate" },
  { name: "Bm7", root: "B", quality: "min7", category: "m7", isBarre: true, difficulty: "Intermediate" },
  { name: "Bm7b5", root: "B", quality: "min7b5", category: "dim-aug", isBarre: true, difficulty: "Advanced" },
  { name: "Bsus4", root: "B", quality: "sus4", category: "sus", isBarre: true, difficulty: "Intermediate" },
  { name: "B5", root: "B", quality: "5", category: "5", isBarre: true, difficulty: "Beginner" },
  { name: "Bdim", root: "B", quality: "dim", category: "dim-aug", isBarre: true, difficulty: "Advanced" },
];

export const ROOT_OPTIONS = [
  { id: "ALL", label: "All Roots" },
  { id: "C", label: "C" },
  { id: "C#", label: "C# / Db" },
  { id: "D", label: "D" },
  { id: "Eb", label: "Eb / D#" },
  { id: "E", label: "E" },
  { id: "F", label: "F" },
  { id: "F#", label: "F# / Gb" },
  { id: "G", label: "G" },
  { id: "Ab", label: "Ab / G#" },
  { id: "A", label: "A" },
  { id: "Bb", label: "Bb / A#" },
  { id: "B", label: "B" },
];

export const CATEGORY_OPTIONS = [
  { id: "ALL", label: "All Categories" },
  { id: "maj", label: "Major Triads" },
  { id: "min", label: "Minor Triads" },
  { id: "7", label: "Dominant 7ths" },
  { id: "maj7", label: "Major 7ths" },
  { id: "m7", label: "Minor 7ths" },
  { id: "sus", label: "Suspended (sus2/4)" },
  { id: "add9", label: "Add9 & 9ths" },
  { id: "5", label: "Power Chords (5)" },
  { id: "dim-aug", label: "Diminished / Aug" },
  { id: "open", label: "Open Chords Only" },
  { id: "barre", label: "Barre Chords Only" },
];

export interface SpeedDrillRoutine {
  id: string;
  title: string;
  description: string;
  chords: string[];
  bpm: number;
  durationSec: number;
  intervalSec: number;
  tags: string[];
}

// --- Curated Preset Routines ---
const PRACTICE_ROUTINES: SpeedDrillRoutine[] = [
  {
    id: "open-chords",
    title: "1-Minute Open Chord Change Drill",
    description: "Rapidly switch between G, C, D, and Em to build fundamental muscle memory.",
    chords: ["G", "C", "D", "Em"],
    bpm: 80,
    durationSec: 60,
    intervalSec: 2.0,
    tags: ["Beginner", "Open Chords"],
  },
  {
    id: "barre-ladder",
    title: "Barre Chord Endurance Ladder",
    description: "F Major to B Minor transitions across the neck to eliminate finger fatigue.",
    chords: ["F", "Bm", "Am", "C", "C#m", "F#m"],
    bpm: 70,
    durationSec: 90,
    intervalSec: 2.5,
    tags: ["Intermediate", "Barre"],
  },
  {
    id: "jazz-ii-v-i",
    title: "Jazz ii-V-I & Turnarounds Workout",
    description: "Dm7 -> G7 -> Cmaj7 -> Am7 smooth jazz voicing transitions.",
    chords: ["Dm7", "G7", "Cmaj7", "Am7", "D7", "Gmaj7"],
    bpm: 90,
    durationSec: 120,
    intervalSec: 2.0,
    tags: ["Advanced", "Jazz"],
  },
  {
    id: "pop-4-chords",
    title: "Pop Anthem 4-Chord Circuit",
    description: "Em -> C -> G -> D legendary 4-chord progression found in hundreds of hits.",
    chords: ["Em", "C", "G", "D", "Am", "F"],
    bpm: 95,
    durationSec: 120,
    intervalSec: 2.0,
    tags: ["Pop", "Progressions"],
  },
  {
    id: "neo-soul-9ths",
    title: "Neo-Soul & R&B Lush 9ths",
    description: "Cmaj9, Dm9, Em7, Fmaj7, and Am9 rich harmonic color training.",
    chords: ["Cmaj9", "Dm9", "Em7", "Fmaj7", "Am9", "Gmaj9"],
    bpm: 75,
    durationSec: 120,
    intervalSec: 2.5,
    tags: ["Neo-Soul", "9ths"],
  },
  {
    id: "blues-shuffle",
    title: "Blues Dominant 7th Shuffle",
    description: "E7 -> A7 -> B7 -> D7 -> G7 -> C7 blues turnaround mastery.",
    chords: ["E7", "A7", "B7", "D7", "G7", "C7"],
    bpm: 85,
    durationSec: 90,
    intervalSec: 2.0,
    tags: ["Blues", "7ths"],
  },
  {
    id: "rock-power",
    title: "Rock & Metal Power 5th Blitz",
    description: "E5 -> G5 -> A5 -> C5 -> D5 -> F5 high-speed root navigation.",
    chords: ["E5", "G5", "A5", "C5", "D5", "F5", "B5"],
    bpm: 110,
    durationSec: 60,
    intervalSec: 1.5,
    tags: ["Rock", "Power Chords"],
  },
  {
    id: "acoustic-sus",
    title: "Acoustic Sus & Add9 Harmonies",
    description: "Cadd9, Dsus4, Dsus2, Gsus4, and Asus4 modern shimmering acoustic chords.",
    chords: ["Cadd9", "Dsus4", "Dsus2", "Gsus4", "Asus4", "Asus2", "Gadd9"],
    bpm: 80,
    durationSec: 90,
    intervalSec: 2.0,
    tags: ["Acoustic", "Modern"],
  },
  {
    id: "flamenco-cadence",
    title: "Flamenco Andalusian Cadence",
    description: "Am -> G -> F -> E -> Dm -> E7 dramatic Spanish Phrygian motion.",
    chords: ["Am", "G", "F", "E", "Dm", "E7"],
    bpm: 85,
    durationSec: 90,
    intervalSec: 2.0,
    tags: ["Spanish", "Phrygian"],
  },
];

// --- Ear Training Exercise Types & Vocabularies ---
export type EarTrainingCategory =
  | "chord-quality"
  | "chord-id"
  | "root-id"
  | "interval"
  | "progression";

export type DifficultyLevel = "beginner" | "intermediate" | "advanced";

interface EarQuizQuestion {
  category: EarTrainingCategory;
  prompt: string;
  subPrompt: string;
  correctAnswer: string;
  options: string[];
  explanation: string;
  playAudio: () => void;
}

// 1. Intervals data
const INTERVALS_DATA = [
  { name: "Unison / Root", semitones: 0, level: "beginner" },
  { name: "Minor 2nd", semitones: 1, level: "intermediate" },
  { name: "Major 2nd", semitones: 2, level: "intermediate" },
  { name: "Minor 3rd (Sad)", semitones: 3, level: "beginner" },
  { name: "Major 3rd (Happy)", semitones: 4, level: "beginner" },
  { name: "Perfect 4th (Here Comes The Bride)", semitones: 5, level: "intermediate" },
  { name: "Tritone (Dim 5th)", semitones: 6, level: "intermediate" },
  { name: "Perfect 5th (Power Chord)", semitones: 7, level: "beginner" },
  { name: "Minor 6th", semitones: 8, level: "advanced" },
  { name: "Major 6th", semitones: 9, level: "advanced" },
  { name: "Minor 7th", semitones: 10, level: "advanced" },
  { name: "Major 7th", semitones: 11, level: "advanced" },
  { name: "Octave (Somewhere Over Rainbow)", semitones: 12, level: "beginner" },
];

// 2. Chord Qualities
const QUALITY_VOCABULARY = [
  { quality: "Major", symbol: "Maj", frets: ["x", 3, 2, 0, 1, 0], level: "beginner", soundDesc: "Bright, resolved, triumphant" },
  { quality: "Minor", symbol: "m", frets: ["x", 0, 2, 2, 1, 0], level: "beginner", soundDesc: "Dark, moody, somber" },
  { quality: "Dominant 7th", symbol: "7", frets: ["x", 3, 2, 3, 1, 0], level: "beginner", soundDesc: "Bluesy, unresolved tension" },
  { quality: "Major 7th", symbol: "maj7", frets: ["x", 3, 2, 0, 0, 0], level: "intermediate", soundDesc: "Dreamy, lush, jazzy" },
  { quality: "Minor 7th", symbol: "m7", frets: ["x", 0, 2, 0, 1, 0], level: "intermediate", soundDesc: "Smooth, soulful, melancholic" },
  { quality: "Suspended 4th", symbol: "sus4", frets: ["x", "x", 0, 2, 3, 3], level: "intermediate", soundDesc: "Open, expectant, yearning" },
  { quality: "Suspended 2nd", symbol: "sus2", frets: ["x", "x", 0, 2, 3, 0], level: "intermediate", soundDesc: "Spacious, floating, modern" },
  { quality: "Diminished", symbol: "dim", frets: ["x", "x", 0, 1, 3, 1], level: "advanced", soundDesc: "Tense, anxious, cinematic" },
  { quality: "Augmented", symbol: "aug", frets: ["x", 3, 2, 1, 1, 0], level: "advanced", soundDesc: "Mysterious, dreamlike, unstable" },
  { quality: "Add9", symbol: "add9", frets: ["x", 3, 2, 0, 3, 0], level: "advanced", soundDesc: "Shimmering, rich, acoustic" },
];

// 3. Chord IDs - Comprehensive Canonical Set
const CHORDS_VOCABULARY = [
  { name: "C Major", short: "C", frets: ["x", 3, 2, 0, 1, 0], level: "beginner" },
  { name: "G Major", short: "G", frets: [3, 2, 0, 0, 0, 3], level: "beginner" },
  { name: "D Major", short: "D", frets: ["x", "x", 0, 2, 3, 2], level: "beginner" },
  { name: "A Major", short: "A", frets: ["x", 0, 2, 2, 2, 0], level: "beginner" },
  { name: "E Major", short: "E", frets: [0, 2, 2, 1, 0, 0], level: "beginner" },
  { name: "A Minor", short: "Am", frets: ["x", 0, 2, 2, 1, 0], level: "beginner" },
  { name: "E Minor", short: "Em", frets: [0, 2, 2, 0, 0, 0], level: "beginner" },
  { name: "D Minor", short: "Dm", frets: ["x", "x", 0, 2, 3, 1], level: "beginner" },
  { name: "F Major", short: "F", frets: [1, 3, 3, 2, 1, 1], level: "intermediate" },
  { name: "B Minor", short: "Bm", frets: ["x", 2, 4, 4, 3, 2], level: "intermediate" },
  { name: "G7", short: "G7", frets: [3, 2, 0, 0, 0, 1], level: "intermediate" },
  { name: "E7", short: "E7", frets: [0, 2, 0, 1, 0, 0], level: "intermediate" },
  { name: "A7", short: "A7", frets: ["x", 0, 2, 0, 2, 0], level: "intermediate" },
  { name: "D7", short: "D7", frets: ["x", "x", 0, 2, 1, 2], level: "intermediate" },
  { name: "C7", short: "C7", frets: ["x", 3, 2, 3, 1, 0], level: "intermediate" },
  { name: "B7", short: "B7", frets: ["x", 2, 1, 2, 0, 2], level: "intermediate" },
  { name: "F#m", short: "F#m", frets: [2, 4, 4, 2, 2, 2], level: "intermediate" },
  { name: "C#m", short: "C#m", frets: ["x", 4, 6, 6, 5, 4], level: "intermediate" },
  { name: "Cmaj7", short: "Cmaj7", frets: ["x", 3, 2, 0, 0, 0], level: "advanced" },
  { name: "Gmaj7", short: "Gmaj7", frets: [3, 2, 0, 0, 0, 2], level: "advanced" },
  { name: "Fmaj7", short: "Fmaj7", frets: ["x", "x", 3, 2, 1, 0], level: "advanced" },
  { name: "Amaj7", short: "Amaj7", frets: ["x", 0, 2, 1, 2, 0], level: "advanced" },
  { name: "Am7", short: "Am7", frets: ["x", 0, 2, 0, 1, 0], level: "advanced" },
  { name: "Dm7", short: "Dm7", frets: ["x", "x", 0, 2, 1, 1], level: "advanced" },
  { name: "Em7", short: "Em7", frets: [0, 2, 0, 0, 0, 0], level: "advanced" },
  { name: "Bm7", short: "Bm7", frets: ["x", 2, 0, 2, 0, 2], level: "advanced" },
  { name: "Cadd9", short: "Cadd9", frets: ["x", 3, 2, 0, 3, 0], level: "advanced" },
  { name: "Gsus4", short: "Gsus4", frets: [3, 3, 0, 0, 1, 3], level: "advanced" },
  { name: "Dsus4", short: "Dsus4", frets: ["x", "x", 0, 2, 3, 3], level: "advanced" },
];

// 4. Roots - All 12 Chromatic Pitch Classes
const ROOTS_VOCABULARY = [
  { root: "C", frets: ["x", 3, 2, 0, 1, 0], level: "beginner" },
  { root: "D", frets: ["x", "x", 0, 2, 3, 2], level: "beginner" },
  { root: "E", frets: [0, 2, 2, 1, 0, 0], level: "beginner" },
  { root: "F", frets: [1, 3, 3, 2, 1, 1], level: "intermediate" },
  { root: "G", frets: [3, 2, 0, 0, 0, 3], level: "beginner" },
  { root: "A", frets: ["x", 0, 2, 2, 2, 0], level: "beginner" },
  { root: "B", frets: ["x", 2, 4, 4, 4, 2], level: "intermediate" },
  { root: "C#", frets: ["x", 4, 6, 6, 6, 4], level: "advanced" },
  { root: "Eb", frets: ["x", 6, 8, 8, 8, 6], level: "advanced" },
  { root: "F#", frets: [2, 4, 4, 3, 2, 2], level: "advanced" },
  { root: "Ab", frets: [4, 6, 6, 5, 4, 4], level: "advanced" },
  { root: "Bb", frets: ["x", 1, 3, 3, 3, 1], level: "advanced" },
];

// 5. Progressions - Multi-Chord Cadences
const PROGRESSIONS_DATA = [
  {
    name: "I - IV - V (The Folk Triad)",
    roman: "I - IV - V",
    chords: ["C", "F", "G"],
    level: "beginner",
    desc: "The timeless backbone of folk, country, and classic rock.",
  },
  {
    name: "I - V - vi - IV (Pop Anthem 4-Chord)",
    roman: "I - V - vi - IV",
    chords: ["C", "G", "Am", "F"],
    level: "beginner",
    desc: "The 4-chord sensation behind hundreds of global modern hits.",
  },
  {
    name: "I - vi - IV - V (50s Doo-Wop Cadence)",
    roman: "I - vi - IV - V",
    chords: ["C", "Am", "F", "G"],
    level: "intermediate",
    desc: "The sweet, nostalgic ballad progression of classic 50s doo-wop.",
  },
  {
    name: "ii - V - I (Jazz Standard Cadence)",
    roman: "ii - V - I",
    chords: ["Dm7", "G7", "Cmaj7"],
    level: "intermediate",
    desc: "The essential jazz cadence driving swing and bossa nova standards.",
  },
  {
    name: "vi - IV - I - V (Emotional Minor Cadence)",
    roman: "vi - IV - I - V",
    chords: ["Am", "F", "C", "G"],
    level: "intermediate",
    desc: "Dramatic minor-driven modern rock and emotive pop progression.",
  },
  {
    name: "I - vi - ii - V (Circle of Fifths Turn)",
    roman: "I - vi - ii - V",
    chords: ["C", "Am", "Dm", "G"],
    level: "intermediate",
    desc: "Smooth standard progression with circle-of-fifths movement.",
  },
  {
    name: "12-Bar Blues Turnaround",
    roman: "I7 - IV7 - I7 - V7",
    chords: ["A7", "D7", "A7", "E7"],
    level: "advanced",
    desc: "The quintessential blues cadence with rich dominant seventh tension.",
  },
  {
    name: "i - VI - III - VII (Epic Andalusian Minor)",
    roman: "i - VI - III - VII",
    chords: ["Am", "F", "C", "G"],
    level: "advanced",
    desc: "Cinematic, epic minor progression common in metal and movie scores.",
  },
];

interface PracticeStudioProps {
  initialSong?: SunoSong | null;
}

export const PracticeStudio: React.FC<PracticeStudioProps> = ({ initialSong }) => {
  const [activeTab, setActiveTab] = useState<"drills" | "ear" | "ai-coach">("drills");

  // --- Speed Drills Mode & Customization State ---
  const [drillTabMode, setDrillTabMode] = useState<"presets" | "custom">("presets");
  const [selectedRoutine, setSelectedRoutine] = useState<SpeedDrillRoutine>(PRACTICE_ROUTINES[0]);
  
  // Custom Drill Filter & Queue State
  const [selectedRootFilter, setSelectedRootFilter] = useState<string>("ALL");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("ALL");
  const [activeCustomChords, setActiveCustomChords] = useState<string[]>(["C", "G", "Am", "F", "Em", "D"]);
  const [customChordInput, setCustomChordInput] = useState<string>("");
  const [customChordInputError, setCustomChordInputError] = useState<string | null>(null);

  // Drill Settings
  const [switchIntervalSec, setSwitchIntervalSec] = useState<number>(2.0);
  const [drillDurationSec, setDrillDurationSec] = useState<number>(60);
  const [isShuffleMode, setIsShuffleMode] = useState<boolean>(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(true);

  // Active Running Drill State
  const [isDrillRunning, setIsDrillRunning] = useState<boolean>(false);
  const [drillTimeLeft, setDrillTimeLeft] = useState<number>(60);
  const [drillChordIndex, setDrillChordIndex] = useState<number>(0);
  const [switchProgressPercent, setSwitchProgressPercent] = useState<number>(100);
  const [userSwitches, setUserSwitches] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [bestStreak, setBestStreak] = useState<number>(0);
  const [showSummaryModal, setShowSummaryModal] = useState<boolean>(false);
  const [lastDrillSummary, setLastDrillSummary] = useState<{
    routineTitle: string;
    totalSwitches: number;
    spm: number;
    durationSec: number;
    chords: string[];
  } | null>(null);

  // --- Ear Training State ---
  const [earCategory, setEarCategory] = useState<EarTrainingCategory>("chord-quality");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("beginner");
  const [currentQuestion, setCurrentQuestion] = useState<EarQuizQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState<boolean>(false);
  const [earStats, setEarStats] = useState({
    correct: 0,
    total: 0,
    streak: 0,
    bestStreak: 0,
  });
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [lastResponseTime, setLastResponseTime] = useState<number | null>(null);

  // --- AI Coach Chat ---
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([
    {
      role: "assistant",
      text: "Hey guitarist! I'm your AI Guitar Coach. Ask me about fingerpicking posture, memorizing the fretboard, mastering barre chords, or custom practice routines.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isAskingAI, setIsAskingAI] = useState(false);

  // Refs for High Precision Timing
  const drillTickRef = useRef<number | null>(null);
  const drillStartTimestampRef = useRef<number>(0);
  const lastChordSwitchTimestampRef = useRef<number>(0);
  const userSwitchesRef = useRef<number>(0);
  const streakRef = useRef<number>(0);

  // Current active playlist of chords based on mode
  const activeDrillChords = useMemo(() => {
    if (drillTabMode === "presets") {
      return selectedRoutine.chords && selectedRoutine.chords.length > 0
        ? selectedRoutine.chords
        : ["G", "C"];
    }
    return activeCustomChords.length > 0 ? activeCustomChords : ["C", "G"];
  }, [drillTabMode, selectedRoutine, activeCustomChords]);

  // Filtered catalog of chords based on root & category filters
  const filteredCatalog = useMemo(() => {
    return MASTER_CHORD_CATALOG.filter((item) => {
      const matchesRoot =
        selectedRootFilter === "ALL" ||
        item.root === selectedRootFilter ||
        (selectedRootFilter === "C#" && item.root === "Db") ||
        (selectedRootFilter === "Eb" && item.root === "D#") ||
        (selectedRootFilter === "F#" && item.root === "Gb") ||
        (selectedRootFilter === "Ab" && item.root === "G#") ||
        (selectedRootFilter === "Bb" && item.root === "A#");

      const matchesCategory =
        selectedCategoryFilter === "ALL" ||
        (selectedCategoryFilter === "open" ? item.isOpen : false) ||
        (selectedCategoryFilter === "barre" ? item.isBarre : false) ||
        item.category === selectedCategoryFilter;

      return matchesRoot && matchesCategory;
    });
  }, [selectedRootFilter, selectedCategoryFilter]);

  // Current chord being prompted
  const currentChordPrompt = useMemo(() => {
    if (!activeDrillChords.length) return "C";
    return activeDrillChords[drillChordIndex % activeDrillChords.length];
  }, [activeDrillChords, drillChordIndex]);

  // Next chord upcoming
  const nextChordPrompt = useMemo(() => {
    if (activeDrillChords.length <= 1) return activeDrillChords[0] || "C";
    const nextIdx = (drillChordIndex + 1) % activeDrillChords.length;
    return activeDrillChords[nextIdx];
  }, [activeDrillChords, drillChordIndex]);

  // Current Chord Voicing for diagram
  const currentVoicing = useMemo(() => {
    return findChordByName(currentChordPrompt);
  }, [currentChordPrompt]);

  // --- Start & Stop Drill Handlers ---
  const handleStartDrill = useCallback(() => {
    if (activeDrillChords.length === 0) return;

    const duration = drillTabMode === "presets" ? selectedRoutine.durationSec : drillDurationSec;
    const interval = drillTabMode === "presets" ? selectedRoutine.intervalSec : switchIntervalSec;

    setDrillTimeLeft(duration);
    setDrillChordIndex(0);
    setUserSwitches(0);
    setStreak(0);
    userSwitchesRef.current = 0;
    streakRef.current = 0;
    setIsDrillRunning(true);
    setShowSummaryModal(false);

    drillStartTimestampRef.current = Date.now();
    lastChordSwitchTimestampRef.current = Date.now();

    // Strum first chord if audio enabled
    if (isAudioEnabled) {
      const v = findChordByName(activeDrillChords[0]);
      if (v) {
        guitarSynth.strumChord(v.frets, "down", 35, 0, 0.85);
      }
    }
  }, [activeDrillChords, drillTabMode, selectedRoutine, drillDurationSec, switchIntervalSec, isAudioEnabled]);

  const handleStopDrill = useCallback(() => {
    setIsDrillRunning(false);
    if (drillTickRef.current) {
      window.clearInterval(drillTickRef.current);
      drillTickRef.current = null;
    }

    const elapsedMs = Date.now() - drillStartTimestampRef.current;
    const elapsedSec = Math.max(1, Math.round(elapsedMs / 1000));
    const totalSwitches = userSwitchesRef.current;
    const spm = Math.round((totalSwitches / Math.max(1, elapsedSec)) * 60);

    const summaryData = {
      routineTitle: drillTabMode === "presets" ? selectedRoutine.title : "Custom Chord Workout",
      totalSwitches,
      spm,
      durationSec: elapsedSec,
      chords: activeDrillChords,
    };

    setLastDrillSummary(summaryData);
    if (totalSwitches > 0) {
      setShowSummaryModal(true);
      savePracticeLog({
        id: `log-${Date.now()}`,
        date: new Date().toISOString(),
        minutes: Math.ceil(elapsedSec / 60),
        mode: summaryData.routineTitle,
        bpm: summaryData.spm,
        chordsPracticed: activeDrillChords,
      });
    }
  }, [drillTabMode, selectedRoutine, activeDrillChords]);

  // Handle Recording a User Switch (Keyboard or Button)
  const handleRecordSwitch = useCallback(() => {
    if (!isDrillRunning) return;
    setUserSwitches((prev) => {
      const next = prev + 1;
      userSwitchesRef.current = next;
      return next;
    });
    setStreak((prev) => {
      const next = prev + 1;
      streakRef.current = next;
      setBestStreak((b) => Math.max(b, next));
      return next;
    });

    // Play subtle plucked click confirmation
    guitarSynth.playFretNote(0, 7, 0, 0.45);
  }, [isDrillRunning]);

  // High Precision Interval Loop
  useEffect(() => {
    if (!isDrillRunning) {
      if (drillTickRef.current) {
        window.clearInterval(drillTickRef.current);
        drillTickRef.current = null;
      }
      return;
    }

    const intervalMs = (drillTabMode === "presets" ? selectedRoutine.intervalSec : switchIntervalSec) * 1000;
    const totalDurationSec = drillTabMode === "presets" ? selectedRoutine.durationSec : drillDurationSec;

    drillTickRef.current = window.setInterval(() => {
      const now = Date.now();
      const elapsedSinceStart = (now - drillStartTimestampRef.current) / 1000;
      const elapsedInInterval = now - lastChordSwitchTimestampRef.current;

      // Update remaining overall time (if not endless)
      if (totalDurationSec > 0) {
        const remaining = Math.max(0, Math.ceil(totalDurationSec - elapsedSinceStart));
        setDrillTimeLeft(remaining);

        if (remaining <= 0) {
          handleStopDrill();
          return;
        }
      } else {
        // Endless mode counts upward
        setDrillTimeLeft(Math.floor(elapsedSinceStart));
      }

      // Update progress bar within the current interval
      const progress = Math.max(0, Math.min(100, 100 - (elapsedInInterval / intervalMs) * 100));
      setSwitchProgressPercent(progress);

      // Check if it's time to switch chords
      if (elapsedInInterval >= intervalMs) {
        lastChordSwitchTimestampRef.current = now;
        setDrillChordIndex((prevIdx) => {
          let nextIdx: number;
          if (isShuffleMode && activeDrillChords.length > 1) {
            do {
              nextIdx = Math.floor(Math.random() * activeDrillChords.length);
            } while (nextIdx === prevIdx);
          } else {
            nextIdx = (prevIdx + 1) % activeDrillChords.length;
          }

          // Strum audio on switch
          if (isAudioEnabled) {
            const nextChordName = activeDrillChords[nextIdx];
            const v = findChordByName(nextChordName);
            if (v) {
              guitarSynth.strumChord(v.frets, "down", 35, 0, 0.85);
            }
          }

          return nextIdx;
        });
      }
    }, 50);

    return () => {
      if (drillTickRef.current) {
        window.clearInterval(drillTickRef.current);
        drillTickRef.current = null;
      }
    };
  }, [
    isDrillRunning,
    drillTabMode,
    selectedRoutine,
    switchIntervalSec,
    drillDurationSec,
    activeDrillChords,
    isShuffleMode,
    isAudioEnabled,
    handleStopDrill,
  ]);

  // Spacebar and Enter global shortcut listener during drill
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isDrillRunning) return;
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handleRecordSwitch();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrillRunning, handleRecordSwitch]);

  // --- Custom Chord Add & Filter Actions ---
  const handleToggleChordInDrill = (chordName: string) => {
    setActiveCustomChords((prev) => {
      if (prev.includes(chordName)) {
        if (prev.length <= 1) return prev; // Keep at least one
        return prev.filter((c) => c !== chordName);
      } else {
        return [...prev, chordName];
      }
    });
  };

  const handleSelectAllFiltered = () => {
    const names = filteredCatalog.map((c) => c.name);
    setActiveCustomChords((prev) => Array.from(new Set([...prev, ...names])));
  };

  const handleDeselectFiltered = () => {
    const names = new Set(filteredCatalog.map((c) => c.name));
    setActiveCustomChords((prev) => {
      const remaining = prev.filter((c) => !names.has(c));
      return remaining.length > 0 ? remaining : [filteredCatalog[0]?.name || "C"];
    });
  };

  const handleSelectCategoryPreset = (categoryPreset: "open" | "barre" | "jazz" | "power" | "sus" | "all-root", root?: string) => {
    if (categoryPreset === "open") {
      setActiveCustomChords(["G", "C", "D", "Em", "Am", "E", "A", "Dm"]);
    } else if (categoryPreset === "barre") {
      setActiveCustomChords(["F", "Bm", "F#m", "C#m", "Gm", "B", "Bbm"]);
    } else if (categoryPreset === "jazz") {
      setActiveCustomChords(["Cmaj7", "Dm7", "Em7", "Fmaj7", "G7", "Am7", "Bm7b5"]);
    } else if (categoryPreset === "power") {
      setActiveCustomChords(["E5", "A5", "D5", "G5", "C5", "F5", "B5"]);
    } else if (categoryPreset === "sus") {
      setActiveCustomChords(["Cadd9", "Dsus4", "Dsus2", "Gsus4", "Asus4", "Asus2", "Gadd9"]);
    } else if (categoryPreset === "all-root" && root) {
      const rootChords = MASTER_CHORD_CATALOG.filter((c) => c.root === root).map((c) => c.name);
      if (rootChords.length > 0) {
        setActiveCustomChords(rootChords);
      }
    }
  };

  const handleAddCustomChord = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customChordInput.trim();
    if (!clean) return;

    const voicing = findChordByName(clean);
    if (!voicing) {
      setCustomChordInputError(`Could not resolve chord shape for "${clean}".`);
      return;
    }

    setCustomChordInputError(null);
    setActiveCustomChords((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    setCustomChordInput("");
  };

  const handlePickRandom = (count: number) => {
    const pool = filteredCatalog.length >= count ? filteredCatalog : MASTER_CHORD_CATALOG;
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
    setActiveCustomChords(shuffled.map((c) => c.name));
  };

  const handlePreviewChordSound = (chordName: string) => {
    const v = findChordByName(chordName);
    if (v) {
      guitarSynth.strumChord(v.frets, "down", 30, 0, 0.85);
    }
  };

  // --- Ear Training Question Generator ---
  const generateQuestion = useCallback(
    (category: EarTrainingCategory, diff: DifficultyLevel): EarQuizQuestion => {
      if (category === "interval") {
        const filtered = INTERVALS_DATA.filter((i) =>
          diff === "beginner" ? i.level === "beginner" : diff === "intermediate" ? i.level !== "advanced" : true
        );
        const target = filtered[Math.floor(Math.random() * filtered.length)];
        // generate 4 options
        const otherOptions = INTERVALS_DATA.filter((i) => i.name !== target.name)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3)
          .map((i) => i.name);
        const options = [target.name, ...otherOptions].sort(() => Math.random() - 0.5);

        return {
          category: "interval",
          prompt: "Identify Musical Interval",
          subPrompt: "Listen to the two notes played by guitar strings",
          correctAnswer: target.name,
          options,
          explanation: `${target.name} spans ${target.semitones} semitone(s).`,
          playAudio: () => {
            guitarSynth.playFretNote(4, 0, 0, 0.85); // A Root
            setTimeout(() => {
              guitarSynth.playFretNote(4, target.semitones, 0, 0.85);
            }, 600);
          },
        };
      }

      if (category === "chord-quality") {
        const filtered = QUALITY_VOCABULARY.filter((q) =>
          diff === "beginner" ? q.level === "beginner" : diff === "intermediate" ? q.level !== "advanced" : true
        );
        const target = filtered[Math.floor(Math.random() * filtered.length)];
        const otherOptions = QUALITY_VOCABULARY.filter((q) => q.quality !== target.quality)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3)
          .map((q) => q.quality);
        const options = [target.quality, ...otherOptions].sort(() => Math.random() - 0.5);

        return {
          category: "chord-quality",
          prompt: "Identify Chord Quality",
          subPrompt: "Listen to the harmonic color of the chord",
          correctAnswer: target.quality,
          options,
          explanation: `${target.quality} has a ${target.soundDesc.toLowerCase()} sonic character.`,
          playAudio: () => {
            guitarSynth.strumChord(target.frets as (number | "x")[], "down", 35, 0, 0.85);
          },
        };
      }

      if (category === "chord-id") {
        const filtered = CHORDS_VOCABULARY.filter((c) =>
          diff === "beginner" ? c.level === "beginner" : diff === "intermediate" ? c.level !== "advanced" : true
        );
        const target = filtered[Math.floor(Math.random() * filtered.length)];
        const otherOptions = CHORDS_VOCABULARY.filter((c) => c.short !== target.short)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3)
          .map((c) => c.short);
        const options = [target.short, ...otherOptions].sort(() => Math.random() - 0.5);

        return {
          category: "chord-id",
          prompt: "Identify the Chord",
          subPrompt: "Listen to the guitar chord voicing",
          correctAnswer: target.short,
          options,
          explanation: `The chord is ${target.name} (${target.short}).`,
          playAudio: () => {
            guitarSynth.strumChord(target.frets as (number | "x")[], "down", 30, 0, 0.85);
          },
        };
      }

      if (category === "root-id") {
        const filtered = ROOTS_VOCABULARY.filter((r) =>
          diff === "beginner" ? r.level === "beginner" : diff === "intermediate" ? r.level !== "advanced" : true
        );
        const target = filtered[Math.floor(Math.random() * filtered.length)];
        const otherOptions = ROOTS_VOCABULARY.filter((r) => r.root !== target.root)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3)
          .map((r) => r.root);
        const options = [target.root, ...otherOptions].sort(() => Math.random() - 0.5);

        return {
          category: "root-id",
          prompt: "Identify Chord Root Note",
          subPrompt: "Listen to the fundamental bass root pitch",
          correctAnswer: target.root,
          options,
          explanation: `The root pitch class of this chord is ${target.root}.`,
          playAudio: () => {
            guitarSynth.strumChord(target.frets as (number | "x")[], "down", 40, 0, 0.85);
          },
        };
      }

      // Progression Recognition
      const filtered = PROGRESSIONS_DATA.filter((p) =>
        diff === "beginner" ? p.level === "beginner" : diff === "intermediate" ? p.level !== "advanced" : true
      );
      const target = filtered[Math.floor(Math.random() * filtered.length)];
      const otherOptions = PROGRESSIONS_DATA.filter((p) => p.name !== target.name)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((p) => p.name);
      const options = [target.name, ...otherOptions].sort(() => Math.random() - 0.5);

      return {
        category: "progression",
        prompt: "Identify Chord Progression",
        subPrompt: `Listen to the sequence of ${target.chords.length} chords`,
        correctAnswer: target.name,
        options,
        explanation: `${target.name}: ${target.desc}`,
        playAudio: () => {
          target.chords.forEach((cName, idx) => {
            const v = findChordByName(cName);
            if (v) {
              setTimeout(() => {
                guitarSynth.strumChord(v.frets, "down", 35, 0, 0.85);
              }, idx * 950);
            }
          });
        },
      };
    },
    []
  );

  const startNextQuestion = useCallback(() => {
    const q = generateQuestion(earCategory, difficulty);
    setCurrentQuestion(q);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setQuestionStartTime(Date.now());
    setTimeout(() => {
      q.playAudio();
    }, 200);
  }, [earCategory, difficulty, generateQuestion]);

  useEffect(() => {
    if (activeTab === "ear") {
      startNextQuestion();
    }
  }, [activeTab, earCategory, difficulty, startNextQuestion]);

  const handleAnswer = (option: string) => {
    if (isAnswered || !currentQuestion) return;

    const responseSec = ((Date.now() - questionStartTime) / 1000).toFixed(1);
    setLastResponseTime(parseFloat(responseSec));
    setSelectedAnswer(option);
    setIsAnswered(true);

    const isCorrect = option === currentQuestion.correctAnswer;
    setEarStats((prev) => {
      const newStreak = isCorrect ? prev.streak + 1 : 0;
      return {
        correct: isCorrect ? prev.correct + 1 : prev.correct,
        total: prev.total + 1,
        streak: newStreak,
        bestStreak: Math.max(prev.bestStreak, newStreak),
      };
    });
  };

  // --- AI Coach Handler ---
  const handleSendCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userQ = chatInput;
    setMessages((prev) => [...prev, { role: "user", text: userQ }]);
    setChatInput("");
    setIsAskingAI(true);

    try {
      const res = await fetch("/api/guitar-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userQ }),
      });

      if (!res.ok) throw new Error("Coach request failed");
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.advice || "Keep practicing your fundamentals!" },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "When practicing chord transitions, focus on pivot fingers and slow, relaxed motion rather than rushing speed.",
        },
      ]);
    } finally {
      setIsAskingAI(false);
    }
  };

  const accuracyPercent = earStats.total > 0 ? Math.round((earStats.correct / earStats.total) * 100) : 0;

  return (
    <div id="panel-practice-studio" className="max-w-6xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Navigation Sub-Tabs */}
      <div className="flex items-center space-x-2 border-b border-white/5 pb-3">
        <button
          onClick={() => setActiveTab("drills")}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
            activeTab === "drills"
              ? "bg-[#a3ff12] text-black shadow-[0_0_12px_rgba(163,255,18,0.3)]"
              : "bg-white/5 text-zinc-400 hover:text-white border border-white/5"
          }`}
        >
          <Target className="w-4 h-4" />
          <span>SPEED DRILLS</span>
        </button>

        <button
          onClick={() => setActiveTab("ear")}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
            activeTab === "ear"
              ? "bg-[#a3ff12] text-black shadow-[0_0_12px_rgba(163,255,18,0.3)]"
              : "bg-white/5 text-zinc-400 hover:text-white border border-white/5"
          }`}
        >
          <Award className="w-4 h-4" />
          <span>EAR TRAINING MASTER</span>
        </button>

        <button
          onClick={() => setActiveTab("ai-coach")}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
            activeTab === "ai-coach"
              ? "bg-[#a3ff12] text-black shadow-[0_0_12px_rgba(163,255,18,0.3)]"
              : "bg-white/5 text-zinc-400 hover:text-white border border-white/5"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>AI GUITAR MENTOR</span>
        </button>
      </div>

      {/* Tab 1: Speed Drills */}
      {activeTab === "drills" && (
        <div className="space-y-6">
          {/* Top Control Bar: Mode Toggle & Drill Settings */}
          <div className="frosted-card rounded-3xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Mode Toggle Tabs */}
            <div className="flex items-center gap-2">
              <button
                id="btn-drill-mode-presets"
                onClick={() => setDrillTabMode("presets")}
                className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  drillTabMode === "presets"
                    ? "bg-[#a3ff12] text-black shadow-md"
                    : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>PRESET ROUTINES ({PRACTICE_ROUTINES.length})</span>
              </button>

              <button
                id="btn-drill-mode-custom"
                onClick={() => setDrillTabMode("custom")}
                className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  drillTabMode === "custom"
                    ? "bg-[#a3ff12] text-black shadow-md"
                    : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>CUSTOM DRILL BUILDER ({activeCustomChords.length} CHORDS)</span>
              </button>
            </div>

            {/* Quick Drill Global Settings */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Pacing / Interval */}
              <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                <Clock className="w-3.5 h-3.5 text-[#a3ff12]" />
                <span className="text-[10px] font-mono text-zinc-400 uppercase mr-1">Switch Pace:</span>
                {[1.5, 2.0, 2.5, 3.0, 4.0].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => {
                      setSwitchIntervalSec(sec);
                      if (drillTabMode === "presets") {
                        setSelectedRoutine((prev) => ({ ...prev, intervalSec: sec }));
                      }
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                      (drillTabMode === "presets" ? selectedRoutine.intervalSec : switchIntervalSec) === sec
                        ? "bg-[#a3ff12] text-black"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>

              {/* Duration */}
              <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                <span className="text-[10px] font-mono text-zinc-400 uppercase mr-1">Timer:</span>
                {[30, 60, 90, 120, 0].map((dur) => (
                  <button
                    key={dur}
                    onClick={() => {
                      setDrillDurationSec(dur);
                      if (drillTabMode === "presets") {
                        setSelectedRoutine((prev) => ({ ...prev, durationSec: dur }));
                      }
                      if (!isDrillRunning) setDrillTimeLeft(dur);
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                      (drillTabMode === "presets" ? selectedRoutine.durationSec : drillDurationSec) === dur
                        ? "bg-white/20 text-white border border-white/20"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {dur === 0 ? "∞" : `${dur}s`}
                  </button>
                ))}
              </div>

              {/* Shuffle & Sound Toggles */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsShuffleMode((prev) => !prev)}
                  title="Randomize chord order"
                  className={`p-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    isShuffleMode
                      ? "bg-[#a3ff12]/20 text-[#a3ff12] border border-[#a3ff12]/40"
                      : "bg-white/5 text-zinc-500 hover:text-white border border-white/5"
                  }`}
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setIsAudioEnabled((prev) => !prev)}
                  title={isAudioEnabled ? "Mute audio strum" : "Unmute audio strum"}
                  className={`p-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    isAudioEnabled
                      ? "bg-[#a3ff12]/20 text-[#a3ff12] border border-[#a3ff12]/40"
                      : "bg-white/5 text-zinc-500 hover:text-white border border-white/5"
                  }`}
                >
                  {isAudioEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Main Stage Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Active Drill Machine & Live Diagram (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              <div className="frosted-card rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-between text-center dot-matrix-bg relative overflow-hidden min-h-[520px]">
                {/* Header Information */}
                <div className="w-full flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="text-left">
                    <span className="text-[10px] font-mono text-[#a3ff12] uppercase tracking-wider font-bold">
                      {drillTabMode === "presets" ? "PRESET WORKOUT" : "CUSTOM DRILL"}
                    </span>
                    <h3 className="text-base sm:text-lg font-bold font-mono text-white mt-0.5">
                      {drillTabMode === "presets" ? selectedRoutine.title : "Custom Chord Switching Routine"}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-white/5 text-zinc-300 border border-white/10">
                      {activeDrillChords.length} Chords
                    </span>
                  </div>
                </div>

                {/* Center Arena: Flashcard + Diagram Side by Side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center justify-center my-4 w-full max-w-md">
                  {/* Left: Big Flashcard */}
                  <div className="relative group">
                    <div
                      className={`w-full aspect-square rounded-3xl bg-[#0a0c0e]/90 border-2 flex flex-col items-center justify-center p-4 transition-all duration-200 shadow-2xl ${
                        isDrillRunning
                          ? "border-[#a3ff12] shadow-[0_0_35px_rgba(163,255,18,0.25)] scale-[1.02]"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full text-[10px] font-mono text-zinc-400 px-2 mb-1">
                        <span>TARGET</span>
                        {currentVoicing?.difficulty && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-300">
                            {currentVoicing.difficulty}
                          </span>
                        )}
                      </div>

                      {/* Giant Chord Title */}
                      <span className="text-5xl sm:text-6xl font-black font-mono text-[#a3ff12] tracking-tighter my-auto drop-shadow-md">
                        {currentChordPrompt}
                      </span>

                      {/* Voicing Category / Open / Barre badge */}
                      <div className="w-full flex items-center justify-between text-[10px] font-mono text-zinc-400 mt-2 px-1">
                        <span className="text-zinc-500">
                          {currentVoicing?.cagedShape ? `Shape ${currentVoicing.cagedShape}` : "Guitar Voicing"}
                        </span>
                        <button
                          onClick={() => handlePreviewChordSound(currentChordPrompt)}
                          className="text-[#a3ff12] hover:text-white flex items-center gap-1 cursor-pointer transition-colors p-1"
                          title="Preview strum audio"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span className="text-[9px]">Strum</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right: Live Chord Voicing Diagram */}
                  <div className="w-full aspect-square rounded-3xl bg-[#0a0c0e]/80 border border-white/10 p-3 flex flex-col items-center justify-center relative shadow-inner">
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">
                      Fretboard Shape
                    </span>
                    {currentVoicing ? (
                      <div className="transform scale-90 sm:scale-95 origin-center">
                        <ChordDiagram
                          frets={currentVoicing.frets}
                          fingers={currentVoicing.fingers}
                          barre={currentVoicing.barre}
                          position={currentVoicing.position}
                          size="md"
                          cagedShape={currentVoicing.cagedShape}
                        />
                      </div>
                    ) : (
                      <div className="text-xs font-mono text-zinc-500">No diagram available</div>
                    )}
                  </div>
                </div>

                {/* UP NEXT Anticipation Bar with Animated Countdown Meter */}
                <div className="w-full max-w-md bg-white/5 rounded-2xl p-3 border border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <span className="text-zinc-500 uppercase text-[10px]">UP NEXT:</span>
                      <span className="font-bold text-white text-xs">{nextChordPrompt}</span>
                    </div>

                    <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-[#a3ff12]" />
                      <span>{isDrillRunning ? "Next Switch Soon" : "Ready"}</span>
                    </div>
                  </div>

                  {/* Visual Progress Countdown Bar */}
                  <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-[#a3ff12] rounded-full transition-all duration-75 ease-linear"
                      style={{ width: `${isDrillRunning ? switchProgressPercent : 100}%` }}
                    />
                  </div>
                </div>

                {/* Live Stats Row */}
                <div className="grid grid-cols-3 gap-3 w-full max-w-md my-3 font-mono">
                  <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 text-center">
                    <div className="text-[9px] text-zinc-400 uppercase">TIME LEFT</div>
                    <div className="text-xl sm:text-2xl font-black text-white mt-0.5">
                      {drillDurationSec === 0 && isDrillRunning ? `${drillTimeLeft}s` : `${drillTimeLeft}s`}
                    </div>
                  </div>

                  <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 text-center">
                    <div className="text-[9px] text-zinc-400 uppercase">SWITCHES</div>
                    <div className="text-xl sm:text-2xl font-black text-[#a3ff12] mt-0.5">
                      {userSwitches}
                    </div>
                  </div>

                  <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 text-center">
                    <div className="text-[9px] text-zinc-400 uppercase flex items-center justify-center gap-1">
                      <Flame className="w-3 h-3 text-orange-400" /> STREAK
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-orange-400 mt-0.5">
                      {streak}
                    </div>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md pt-2">
                  {isDrillRunning ? (
                    <>
                      <button
                        id="btn-drill-switch-tap"
                        onClick={handleRecordSwitch}
                        className="flex-1 w-full py-3.5 px-6 rounded-2xl bg-[#a3ff12] hover:bg-[#92eb10] active:scale-95 text-black font-mono font-black text-sm shadow-[0_0_20px_rgba(163,255,18,0.4)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Zap className="w-4 h-4 fill-black" />
                        <span>SWITCHED! (Spacebar)</span>
                      </button>

                      <button
                        id="btn-drill-stop"
                        onClick={handleStopDrill}
                        className="py-3.5 px-6 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-mono font-bold text-xs border border-rose-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>FINISH</span>
                      </button>
                    </>
                  ) : (
                    <button
                      id="btn-drill-start"
                      onClick={handleStartDrill}
                      className="w-full py-4 px-8 rounded-2xl bg-[#a3ff12] hover:bg-[#92eb10] active:scale-95 text-black font-mono font-black text-sm shadow-[0_0_25px_rgba(163,255,18,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Play className="w-5 h-5 fill-black" />
                      <span>START SPEED WORKOUT ({activeDrillChords.length} CHORDS)</span>
                    </button>
                  )}
                </div>

                {/* Active Chord Queue Tray (Mini Carousel) */}
                <div className="w-full mt-4 pt-3 border-t border-white/5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mb-2 px-1">
                    <span>ACTIVE CHORD SEQUENCE:</span>
                    <span>Click chord to preview audio</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-center">
                    {activeDrillChords.map((cName, idx) => {
                      const isCurrent = isDrillRunning && currentChordPrompt === cName;
                      return (
                        <div
                          key={`${cName}-${idx}`}
                          onClick={() => handlePreviewChordSound(cName)}
                          className={`px-3 py-1 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            isCurrent
                              ? "bg-[#a3ff12] text-black shadow-[0_0_12px_rgba(163,255,18,0.5)] scale-110"
                              : "bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10"
                          }`}
                        >
                          <span>{cName}</span>
                          {drillTabMode === "custom" && !isDrillRunning && activeDrillChords.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleChordInDrill(cName);
                              }}
                              className="text-zinc-500 hover:text-rose-400 transition-colors ml-0.5"
                              title={`Remove ${cName}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Routine Selector (Presets) OR Custom Drill Builder (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              {drillTabMode === "presets" ? (
                /* Presets Workout List */
                <div className="frosted-card rounded-3xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <h3 className="font-mono font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-[#a3ff12]" />
                      <span>CURATED PRACTICE ROUTINES</span>
                    </h3>
                    <span className="text-[10px] font-mono text-zinc-500">{PRACTICE_ROUTINES.length} Presets</span>
                  </div>

                  <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
                    {PRACTICE_ROUTINES.map((routine) => {
                      const isSelected = selectedRoutine.id === routine.id;

                      return (
                        <div
                          key={routine.id}
                          onClick={() => {
                            setSelectedRoutine(routine);
                            setDrillTimeLeft(routine.durationSec);
                          }}
                          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                            isSelected
                              ? "bg-[#a3ff12]/15 border-[#a3ff12]/50 shadow-[0_0_15px_rgba(163,255,18,0.15)]"
                              : "bg-white/5 border border-white/5 hover:border-white/15 hover:bg-white/[0.08]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-mono font-bold text-xs sm:text-sm text-white">
                              {routine.title}
                            </h4>
                            {isSelected && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[#a3ff12] text-black">
                                ACTIVE
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] font-mono text-zinc-400 mt-1 leading-relaxed">
                            {routine.description}
                          </p>

                          {/* Chords preview pills */}
                          <div className="flex items-center gap-1 flex-wrap mt-2.5">
                            {routine.chords.map((c) => (
                              <span
                                key={c}
                                className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-black/40 text-zinc-300 border border-white/5"
                              >
                                {c}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5 text-[10px] font-mono text-[#a3ff12]">
                            <div className="flex items-center space-x-2">
                              <span>{routine.durationSec}s Duration</span>
                              <span>•</span>
                              <span>{routine.intervalSec}s Switch Pace</span>
                            </div>
                            <span className="text-zinc-500">{routine.tags.join(", ")}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Custom Drill Builder & Chord Filter Studio */
                <div className="frosted-card rounded-3xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <h3 className="font-mono font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                      <SlidersHorizontal className="w-4 h-4 text-[#a3ff12]" />
                      <span>CHORD SELECTION & FILTER ENGINE</span>
                    </h3>
                    <span className="text-[10px] font-mono text-[#a3ff12] font-bold">
                      {activeCustomChords.length} Selected
                    </span>
                  </div>

                  {/* 1. Quick Category Presets Toolbar */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
                      Quick Training Presets
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => handleSelectCategoryPreset("open")}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 hover:border-[#a3ff12]/40 transition-all cursor-pointer"
                      >
                        🎸 Open Chords (8)
                      </button>
                      <button
                        onClick={() => handleSelectCategoryPreset("barre")}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 hover:border-[#a3ff12]/40 transition-all cursor-pointer"
                      >
                        🪵 Barre Ladder (7)
                      </button>
                      <button
                        onClick={() => handleSelectCategoryPreset("jazz")}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 hover:border-[#a3ff12]/40 transition-all cursor-pointer"
                      >
                        🎷 Jazz 7ths (7)
                      </button>
                      <button
                        onClick={() => handleSelectCategoryPreset("power")}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 hover:border-[#a3ff12]/40 transition-all cursor-pointer"
                      >
                        ⚡ Power 5ths (7)
                      </button>
                      <button
                        onClick={() => handleSelectCategoryPreset("sus")}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 hover:border-[#a3ff12]/40 transition-all cursor-pointer"
                      >
                        🌊 Pop Add9/Sus (7)
                      </button>
                    </div>
                  </div>

                  {/* 2. Filter by Root Note Family */}
                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                        Filter by Root Pitch Class
                      </span>
                      {selectedRootFilter !== "ALL" && (
                        <button
                          onClick={() => handleSelectCategoryPreset("all-root", selectedRootFilter)}
                          className="text-[10px] font-mono text-[#a3ff12] hover:underline cursor-pointer"
                        >
                          ⚡ Train All {selectedRootFilter} Chords
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-5 sm:grid-cols-7 gap-1">
                      {ROOT_OPTIONS.map((root) => (
                        <button
                          key={root.id}
                          onClick={() => setSelectedRootFilter(root.id)}
                          className={`py-1 px-1 rounded-lg text-[10px] font-mono font-bold text-center transition-all cursor-pointer ${
                            selectedRootFilter === root.id
                              ? "bg-[#a3ff12] text-black shadow-sm font-black"
                              : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5"
                          }`}
                        >
                          {root.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Filter by Category & Quality */}
                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
                      Filter by Quality & Structure
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {CATEGORY_OPTIONS.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategoryFilter(cat.id)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                            selectedCategoryFilter === cat.id
                              ? "bg-white/25 text-white border border-white/40 shadow-sm"
                              : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5"
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4. Custom Search / Add Chord Bar */}
                  <form onSubmit={handleAddCustomChord} className="pt-2 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Type any chord (e.g. C#m7, F#5, Gadd9, Baug)..."
                        value={customChordInput}
                        onChange={(e) => {
                          setCustomChordInput(e.target.value);
                          setCustomChordInputError(null);
                        }}
                        className="flex-1 bg-black/40 text-white text-xs font-mono border border-white/10 rounded-xl px-3 py-2 focus:outline-none focus:border-[#a3ff12]/50 placeholder:text-zinc-600"
                      />
                      <button
                        type="submit"
                        className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-[#a3ff12] hover:text-black text-white font-mono font-bold text-xs flex items-center gap-1 transition-all cursor-pointer shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                    {customChordInputError && (
                      <p className="text-[10px] font-mono text-rose-400 mt-1">{customChordInputError}</p>
                    )}
                  </form>

                  {/* 5. Matrix of Matching Available Chords */}
                  <div className="space-y-2 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                      <span>Available Chords ({filteredCatalog.length})</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSelectAllFiltered}
                          className="hover:text-white text-[#a3ff12] cursor-pointer"
                        >
                          Select All
                        </button>
                        <span>•</span>
                        <button
                          onClick={handleDeselectFiltered}
                          className="hover:text-white text-zinc-500 cursor-pointer"
                        >
                          Deselect
                        </button>
                        <span>•</span>
                        <button
                          onClick={() => handlePickRandom(4)}
                          className="hover:text-[#a3ff12] text-zinc-400 cursor-pointer"
                        >
                          Random 4
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                      {filteredCatalog.map((chordItem) => {
                        const isIncluded = activeCustomChords.includes(chordItem.name);
                        return (
                          <button
                            key={chordItem.name}
                            onClick={() => handleToggleChordInDrill(chordItem.name)}
                            className={`p-2 rounded-xl text-center font-mono transition-all text-xs flex flex-col items-center justify-center cursor-pointer ${
                              isIncluded
                                ? "bg-[#a3ff12]/20 border border-[#a3ff12]/60 text-[#a3ff12] font-black shadow-[0_0_10px_rgba(163,255,18,0.15)]"
                                : "bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 font-medium"
                            }`}
                          >
                            <span className="text-xs font-bold">{chordItem.name}</span>
                            <span className="text-[9px] text-zinc-500 font-normal mt-0.5">
                              {chordItem.quality}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Performance Summary Modal on Completion */}
          {showSummaryModal && lastDrillSummary && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="frosted-card rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 border border-[#a3ff12]/30 shadow-[0_0_40px_rgba(163,255,18,0.2)] text-center relative">
                <div className="w-16 h-16 rounded-3xl bg-[#a3ff12]/20 border border-[#a3ff12] flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(163,255,18,0.3)]">
                  <Award className="w-8 h-8 text-[#a3ff12]" />
                </div>

                <div>
                  <span className="text-[10px] font-mono text-[#a3ff12] uppercase tracking-widest font-bold">
                    WORKOUT COMPLETED!
                  </span>
                  <h3 className="text-2xl font-black font-mono text-white mt-1">
                    {lastDrillSummary.routineTitle}
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                    <span className="text-[10px] text-zinc-400 block uppercase">Total Switches</span>
                    <span className="text-3xl font-black text-[#a3ff12] mt-0.5">
                      {lastDrillSummary.totalSwitches}
                    </span>
                  </div>

                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                    <span className="text-[10px] text-zinc-400 block uppercase">Pace (SPM)</span>
                    <span className="text-3xl font-black text-white mt-0.5">
                      {lastDrillSummary.spm}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 text-left bg-white/5 p-3.5 rounded-2xl border border-white/5 font-mono">
                  <span className="text-[10px] text-zinc-400 uppercase block">Chords Practiced:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {lastDrillSummary.chords.map((c) => (
                      <span
                        key={c}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#a3ff12]/15 text-[#a3ff12] border border-[#a3ff12]/30"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowSummaryModal(false);
                      handleStartDrill();
                    }}
                    className="flex-1 py-3 px-6 rounded-2xl bg-[#a3ff12] hover:bg-[#92eb10] text-black font-mono font-black text-xs cursor-pointer shadow-lg transition-all"
                  >
                    PRACTICE AGAIN
                  </button>

                  <button
                    onClick={() => setShowSummaryModal(false)}
                    className="py-3 px-6 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-mono font-bold text-xs cursor-pointer transition-all"
                  >
                    CLOSE
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Ear Training Master Suite */}
      {activeTab === "ear" && (
        <div className="space-y-5">
          {/* Header Controls: Exercise Category & Difficulty */}
          <div className="frosted-card rounded-3xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Categories */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: "chord-quality", label: "Chord Quality" },
                { id: "chord-id", label: "Chord ID" },
                { id: "root-id", label: "Root Note" },
                { id: "interval", label: "Intervals" },
                { id: "progression", label: "Progressions" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setEarCategory(cat.id as EarTrainingCategory)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    earCategory === cat.id
                      ? "bg-[#a3ff12] text-black shadow-md"
                      : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Difficulty Pill */}
            <div className="flex items-center gap-1.5 self-start md:self-auto">
              <span className="text-[10px] font-mono text-zinc-500 uppercase mr-1">Level:</span>
              {(["beginner", "intermediate", "advanced"] as DifficultyLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setDifficulty(lvl)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase transition-all cursor-pointer ${
                    difficulty === lvl
                      ? "bg-white/20 text-white border border-white/30"
                      : "bg-white/5 text-zinc-500 hover:text-zinc-300 border border-transparent"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Main Quiz Area & Scoreboard */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Col: Quiz Card (8 cols) */}
            <div className="lg:col-span-8 frosted-card rounded-3xl p-6 sm:p-8 space-y-6 flex flex-col justify-between">
              {currentQuestion ? (
                <>
                  <div className="text-center space-y-1">
                    <span className="text-[10px] font-mono text-[#a3ff12] uppercase tracking-widest font-bold">
                      {currentQuestion.prompt}
                    </span>
                    <h3 className="text-lg sm:text-xl font-bold font-mono text-white">
                      {currentQuestion.subPrompt}
                    </h3>
                  </div>

                  {/* Audio Trigger Center */}
                  <div className="flex flex-col items-center justify-center py-4">
                    <button
                      onClick={() => currentQuestion.playAudio()}
                      className="group flex items-center space-x-3 px-8 py-4 rounded-2xl bg-[#a3ff12] hover:bg-[#92eb10] text-black font-mono font-black text-sm shadow-[0_0_25px_rgba(163,255,18,0.3)] transition-transform hover:scale-105 cursor-pointer"
                    >
                      <Volume2 className="w-6 h-6 animate-pulse" />
                      <span>REPLAY AUDIO</span>
                    </button>
                    <span className="text-[11px] font-mono text-zinc-500 mt-2">
                      Listen closely to harmonic intervals and voicing color
                    </span>
                  </div>

                  {/* Answer Options Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {currentQuestion.options.map((option, idx) => {
                      const isSelected = selectedAnswer === option;
                      const isCorrect = option === currentQuestion.correctAnswer;

                      let btnStyle = "bg-white/5 hover:bg-white/10 border-white/10 text-white";
                      if (isAnswered) {
                        if (isCorrect) {
                          btnStyle = "bg-emerald-500/20 border-emerald-500 text-emerald-400 font-black shadow-[0_0_15px_rgba(16,185,129,0.2)]";
                        } else if (isSelected) {
                          btnStyle = "bg-rose-500/20 border-rose-500 text-rose-400 font-bold";
                        } else {
                          btnStyle = "bg-white/[0.02] border-white/5 text-zinc-600 opacity-50";
                        }
                      }

                      return (
                        <button
                          key={idx}
                          onClick={() => handleAnswer(option)}
                          disabled={isAnswered}
                          className={`p-4 rounded-2xl border text-left font-mono transition-all text-xs flex justify-between items-center cursor-pointer ${btnStyle}`}
                        >
                          <span className="font-bold">{option}</span>
                          {isAnswered && isCorrect && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
                          {isAnswered && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Answer Feedback & Next Button */}
                  {isAnswered && (
                    <div className="pt-2 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in">
                      <div className="text-xs font-mono text-zinc-300 flex items-center gap-2">
                        {selectedAnswer === currentQuestion.correctAnswer ? (
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <Check className="w-4 h-4" /> Correct!
                          </span>
                        ) : (
                          <span className="text-rose-400 font-bold flex items-center gap-1">
                            <XCircle className="w-4 h-4" /> Incorrect.
                          </span>
                        )}
                        <span className="text-zinc-400">{currentQuestion.explanation}</span>
                      </div>

                      <button
                        onClick={startNextQuestion}
                        className="px-6 py-2.5 rounded-xl bg-[#a3ff12] hover:bg-[#92eb10] text-black font-mono font-black text-xs flex items-center gap-1 cursor-pointer transition-all shadow-md shrink-0"
                      >
                        <span>NEXT QUESTION</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Right Col: Performance Stats & Mastery (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="frosted-card rounded-3xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <h4 className="font-mono font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-[#a3ff12]" />
                    <span>SESSION STATS</span>
                  </h4>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">{difficulty}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <span className="text-[10px] text-zinc-400 block">ACCURACY</span>
                    <span className="text-2xl font-black text-[#a3ff12]">{accuracyPercent}%</span>
                    <span className="text-[9px] text-zinc-500 block mt-0.5">
                      {earStats.correct} / {earStats.total} correct
                    </span>
                  </div>

                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <span className="text-[10px] text-zinc-400 block flex items-center gap-1">
                      <Flame className="w-3 h-3 text-orange-400" /> STREAK
                    </span>
                    <span className="text-2xl font-black text-orange-400">{earStats.streak}</span>
                    <span className="text-[9px] text-zinc-500 block mt-0.5">
                      Best: {earStats.bestStreak} in a row
                    </span>
                  </div>
                </div>

                {lastResponseTime !== null && (
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-2 border-t border-white/5">
                    <span>Response Time:</span>
                    <span className="text-white font-bold">{lastResponseTime}s</span>
                  </div>
                )}
              </div>

              {/* Ear Training Tips */}
              <div className="frosted-card rounded-3xl p-5 space-y-2 text-xs font-mono text-zinc-400">
                <span className="font-bold text-white uppercase text-[10px] tracking-wider block">
                  Acoustic Listening Tip
                </span>
                <p className="text-[11px] leading-relaxed">
                  Focus first on the lowest vibrating bass string to pin down the root note, then listen for the 3rd and 7th interval colors to identify major vs. minor or 7th extensions.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: AI Guitar Mentor */}
      {activeTab === "ai-coach" && (
        <div className="max-w-4xl mx-auto frosted-card rounded-3xl p-6 space-y-4">
          <div className="flex items-center space-x-2.5">
            <Sparkles className="w-5 h-5 text-[#a3ff12]" />
            <h3 className="font-mono font-bold text-base text-white tracking-tight">
              AI GUITAR MASTER MENTOR
            </h3>
          </div>

          {/* Messages List */}
          <div className="space-y-3 max-h-[380px] overflow-y-auto p-3 bg-[#0a0c0e]/80 rounded-xl border border-white/5">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl text-xs font-mono leading-relaxed ${
                  m.role === "assistant"
                    ? "bg-white/5 text-zinc-200 border border-white/5"
                    : "bg-[#a3ff12]/15 text-[#a3ff12] border border-[#a3ff12]/30 ml-8"
                }`}
              >
                <div className="font-bold mb-1 text-[10px] uppercase text-zinc-400">
                  {m.role === "assistant" ? "AI Coach" : "You"}
                </div>
                {m.text}
              </div>
            ))}
          </div>

          {/* Chat Form */}
          <form onSubmit={handleSendCoach} className="flex gap-2">
            <input
              type="text"
              placeholder="Ask your guitar coach anything..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 bg-[#0a0c0e]/85 text-white text-xs font-mono border border-white/10 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#a3ff12]/50"
            />
            <button
              type="submit"
              disabled={isAskingAI}
              className="px-5 py-2.5 rounded-xl bg-[#a3ff12] hover:bg-[#92eb10] text-black font-extrabold text-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>ASK</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
