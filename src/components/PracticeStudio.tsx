import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Target,
  Clock,
  Play,
  RotateCcw,
  Volume2,
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
} from "lucide-react";
import { guitarSynth } from "../audio/guitarSynth";
import { findChordByName } from "../data/chordDatabase";
import { savePracticeLog } from "../utils/storage";
import { SunoSong } from "./SongsLibraryView";

// --- Speed Drills Database ---
const PRACTICE_ROUTINES = [
  {
    id: "open-chords",
    title: "1-Minute Open Chord Change Drill",
    description: "Rapidly switch between G Major and C Major to build muscle memory.",
    chords: ["G", "C"],
    bpm: 80,
    durationSec: 60,
  },
  {
    id: "barre-ladder",
    title: "Barre Chord Endurance Ladder",
    description: "F Major to B Minor transitions across the neck.",
    chords: ["F", "Bm", "Am", "C"],
    bpm: 70,
    durationSec: 90,
  },
  {
    id: "jazz-ii-v-i",
    title: "Jazz ii-V-I Progression Workout",
    description: "Dm7 -> G7 -> Cmaj7 smooth finger transitions.",
    chords: ["Dm7", "G7", "Cmaj7"],
    bpm: 90,
    durationSec: 120,
  },
  {
    id: "pop-4-chords",
    title: "Pop Anthem 4-Chord Circuit",
    description: "Em -> C -> G -> D legendary 4-chord muscle training.",
    chords: ["Em", "C", "G", "D"],
    bpm: 95,
    durationSec: 120,
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

  // --- Speed Drills State ---
  const [selectedRoutine, setSelectedRoutine] = useState(PRACTICE_ROUTINES[0]);
  const [isDrillRunning, setIsDrillRunning] = useState(false);
  const [drillTimeLeft, setDrillTimeLeft] = useState(selectedRoutine.durationSec);
  const [drillChordIndex, setDrillChordIndex] = useState(0);

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

  const drillTimerRef = useRef<number | null>(null);

  // --- Speed Drill Loop ---
  useEffect(() => {
    if (!isDrillRunning) {
      if (drillTimerRef.current) clearInterval(drillTimerRef.current);
      return;
    }

    drillTimerRef.current = window.setInterval(() => {
      setDrillTimeLeft((prev) => {
        if (prev <= 1) {
          setIsDrillRunning(false);
          savePracticeLog({
            id: `log-${Date.now()}`,
            date: new Date().toISOString(),
            minutes: Math.ceil(selectedRoutine.durationSec / 60),
            mode: selectedRoutine.title,
            bpm: selectedRoutine.bpm,
            chordsPracticed: selectedRoutine.chords,
          });
          return 0;
        }

        const currentChord = selectedRoutine.chords[drillChordIndex % selectedRoutine.chords.length];
        const voicing = findChordByName(currentChord);
        if (prev % 2 === 0) {
          if (voicing) {
            guitarSynth.strumChord(voicing.frets, "down", 30, 0, 0.75);
          }
          setDrillChordIndex((c) => c + 1);
        }

        return prev - 1;
      });
    }, 1000);

    return () => {
      if (drillTimerRef.current) clearInterval(drillTimerRef.current);
    };
  }, [isDrillRunning, selectedRoutine, drillChordIndex]);

  const handleStartDrill = () => {
    setDrillTimeLeft(selectedRoutine.durationSec);
    setDrillChordIndex(0);
    setIsDrillRunning(true);
  };

  const handleStopDrill = () => {
    setIsDrillRunning(false);
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

  const currentChordPrompt =
    selectedRoutine.chords[drillChordIndex % selectedRoutine.chords.length];

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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Active Drill Machine */}
          <div className="lg:col-span-2 space-y-6">
            <div className="frosted-card rounded-3xl p-6 flex flex-col items-center justify-center space-y-6 text-center dot-matrix-bg">
              <div>
                <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                  Active Routine
                </span>
                <h3 className="text-xl font-extrabold font-mono text-white mt-1">
                  {selectedRoutine.title}
                </h3>
              </div>

              {/* Big Chord Flash Card */}
              <div className="w-48 h-48 rounded-3xl bg-[#0a0c0e]/80 border-2 border-[#a3ff12] flex flex-col items-center justify-center shadow-[0_0_30px_rgba(163,255,18,0.15)]">
                <span className="text-[11px] font-mono text-zinc-400 mb-1">
                  SWITCH TO
                </span>
                <span className="text-6xl font-black font-mono text-[#a3ff12] tracking-tighter">
                  {currentChordPrompt}
                </span>
              </div>

              {/* Countdown Clock & Targets */}
              <div className="flex items-center space-x-8">
                <div>
                  <div className="text-[10px] font-mono text-zinc-400">TIME REMAINING</div>
                  <div className="text-3xl font-extrabold font-mono text-white">
                    {drillTimeLeft}s
                  </div>
                </div>

                <div className="h-8 w-[1px] bg-white/5" />

                <div>
                  <div className="text-[10px] font-mono text-zinc-400">TARGET BPM</div>
                  <div className="text-3xl font-extrabold font-mono text-[#a3ff12]">
                    {selectedRoutine.bpm}
                  </div>
                </div>
              </div>

              {/* Drill Start / Stop Button */}
              <button
                id="btn-drill-toggle"
                onClick={isDrillRunning ? handleStopDrill : handleStartDrill}
                className={`flex items-center space-x-2 px-8 py-3 rounded-xl font-mono font-bold text-sm transition-all shadow-lg cursor-pointer ${
                  isDrillRunning
                    ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/30"
                    : "bg-[#a3ff12] hover:bg-[#92eb10] text-black shadow-[0_0_15px_rgba(163,255,18,0.3)]"
                }`}
              >
                {isDrillRunning ? <RotateCcw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isDrillRunning ? "STOP DRILL" : `START ${selectedRoutine.durationSec}s DRILL`}</span>
              </button>
            </div>
          </div>

          {/* Right Col: Routine Selection Menu */}
          <div className="frosted-card rounded-3xl p-5 space-y-4">
            <h3 className="font-mono font-bold text-sm text-white">
              SELECT WORKOUT ROUTINE
            </h3>

            <div className="space-y-3">
              {PRACTICE_ROUTINES.map((routine) => {
                const isSelected = selectedRoutine.id === routine.id;

                return (
                  <div
                    key={routine.id}
                    onClick={() => {
                      setSelectedRoutine(routine);
                      setDrillTimeLeft(routine.durationSec);
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-[#a3ff12]/15 border-[#a3ff12]/50 shadow-[0_0_12px_rgba(163,255,18,0.15)]"
                        : "bg-white/5 border border-white/5 hover:border-white/10"
                    }`}
                  >
                    <h4 className="font-mono font-bold text-sm text-white">
                      {routine.title}
                    </h4>
                    <p className="text-[11px] font-mono text-zinc-400 mt-1">
                      {routine.description}
                    </p>
                    <div className="flex items-center space-x-2 mt-3 text-[10px] font-mono text-[#a3ff12]">
                      <span>{routine.durationSec}s Drill</span>
                      <span>•</span>
                      <span>{routine.bpm} BPM</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
