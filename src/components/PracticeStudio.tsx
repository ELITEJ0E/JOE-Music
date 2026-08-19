import React, { useState, useEffect, useRef } from "react";
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
  MessageSquare,
} from "lucide-react";
import { guitarSynth } from "../audio/guitarSynth";
import { findChordByName } from "../data/chordDatabase";
import { savePracticeLog } from "../utils/storage";

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
];

const INTERVAL_QUIZ_DATA = [
  { name: "Unison / Root", semitones: 0 },
  { name: "Minor 3rd (Sad)", semitones: 3 },
  { name: "Major 3rd (Happy)", semitones: 4 },
  { name: "Perfect 4th (Here Comes the Bride)", semitones: 5 },
  { name: "Tritone / Dim 5th", semitones: 6 },
  { name: "Perfect 5th (Power Chord / Star Wars)", semitones: 7 },
  { name: "Octave (Somewhere Over the Rainbow)", semitones: 12 },
];

export const PracticeStudio: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"drills" | "ear" | "ai-coach">("drills");

  // Drills state
  const [selectedRoutine, setSelectedRoutine] = useState(PRACTICE_ROUTINES[0]);
  const [isDrillRunning, setIsDrillRunning] = useState(false);
  const [drillTimeLeft, setDrillTimeLeft] = useState(selectedRoutine.durationSec);
  const [drillChordIndex, setDrillChordIndex] = useState(0);
  const [changesCount, setChangesCount] = useState(0);

  // Ear training state
  const [currentIntervalIdx, setCurrentIntervalIdx] = useState<number>(2);
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 });
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);

  // AI Coach Chat
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

  // Drill Timer Loop
  useEffect(() => {
    if (!isDrillRunning) {
      if (drillTimerRef.current) clearInterval(drillTimerRef.current);
      return;
    }

    drillTimerRef.current = window.setInterval(() => {
      setDrillTimeLeft((prev) => {
        if (prev <= 1) {
          setIsDrillRunning(false);
          // Save practice record
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

        // Switch chord prompt every 2 beats
        const currentChord = selectedRoutine.chords[drillChordIndex % selectedRoutine.chords.length];
        const voicing = findChordByName(currentChord);
        if (voicing && prev % 2 === 0) {
          guitarSynth.strumChord(voicing.frets, "down", 30, 0, 0.75);
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
    setChangesCount(0);
    setIsDrillRunning(true);
  };

  const handleStopDrill = () => {
    setIsDrillRunning(false);
  };

  // Ear training: Play interval reference note + interval note
  const playQuizInterval = (intervalIndex = currentIntervalIdx) => {
    guitarSynth.playFretNote(4, 0, 0, 0.9); // Root A
    setTimeout(() => {
      const targetSemitone = INTERVAL_QUIZ_DATA[intervalIndex].semitones;
      guitarSynth.playFretNote(4, targetSemitone, 0, 0.9);
    }, 600);
  };

  const handleAnswerInterval = (idx: number) => {
    const isCorrect = idx === currentIntervalIdx;
    setQuizScore((prev) => ({
      correct: isCorrect ? prev.correct + 1 : prev.correct,
      total: prev.total + 1,
    }));

    setQuizFeedback(
      isCorrect
        ? `Correct! That was ${INTERVAL_QUIZ_DATA[idx].name}.`
        : `Incorrect! It was ${INTERVAL_QUIZ_DATA[currentIntervalIdx].name}.`
    );

    setTimeout(() => {
      setQuizFeedback(null);
      const nextIdx = Math.floor(Math.random() * INTERVAL_QUIZ_DATA.length);
      setCurrentIntervalIdx(nextIdx);
      playQuizInterval(nextIdx);
    }, 1600);
  };

  // Ask AI Guitar Mentor
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

  return (
    <div id="panel-practice-studio" className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Navigation sub-tabs */}
      <div className="flex items-center space-x-2 border-b border-[#20202c] pb-3">
        <button
          onClick={() => setActiveTab("drills")}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
            activeTab === "drills"
              ? "bg-[#2ae500] text-black shadow-md shadow-[#2ae500]/20"
              : "bg-[#14141c] text-gray-400 hover:text-white"
          }`}
        >
          <Target className="w-4 h-4" />
          <span>SPEED DRILLS</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("ear");
            playQuizInterval();
          }}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
            activeTab === "ear"
              ? "bg-[#2ae500] text-black shadow-md shadow-[#2ae500]/20"
              : "bg-[#14141c] text-gray-400 hover:text-white"
          }`}
        >
          <Award className="w-4 h-4" />
          <span>EAR TRAINING QUIZ</span>
        </button>

        <button
          onClick={() => setActiveTab("ai-coach")}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
            activeTab === "ai-coach"
              ? "bg-[#2ae500] text-black shadow-md shadow-[#2ae500]/20"
              : "bg-[#14141c] text-gray-400 hover:text-white"
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
            <div className="metal-chassis p-6 rounded-2xl flex flex-col items-center justify-center space-y-6 text-center">
              <div>
                <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">
                  Active Routine
                </span>
                <h3 className="text-xl font-bold font-mono text-white mt-1">
                  {selectedRoutine.title}
                </h3>
              </div>

              {/* Big Chord Flash Card */}
              <div className="w-48 h-48 rounded-3xl bg-[#0a0a0f] border-2 border-[#2ae500] flex flex-col items-center justify-center shadow-[0_0_30px_rgba(42,229,0,0.15)]">
                <span className="text-[11px] font-mono text-gray-400 mb-1">
                  SWITCH TO
                </span>
                <span className="text-6xl font-black font-mono text-[#2ae500] tracking-tighter">
                  {currentChordPrompt}
                </span>
              </div>

              {/* Countdown Clock & Changes Counter */}
              <div className="flex items-center space-x-8">
                <div>
                  <div className="text-[10px] font-mono text-gray-400">TIME REMAINING</div>
                  <div className="text-3xl font-extrabold font-mono text-white">
                    {drillTimeLeft}s
                  </div>
                </div>

                <div className="h-8 w-[1px] bg-[#2a2a3c]" />

                <div>
                  <div className="text-[10px] font-mono text-gray-400">TARGET BPM</div>
                  <div className="text-3xl font-extrabold font-mono text-[#2ae500]">
                    {selectedRoutine.bpm}
                  </div>
                </div>
              </div>

              {/* Drill Start / Stop Button */}
              <button
                id="btn-drill-toggle"
                onClick={isDrillRunning ? handleStopDrill : handleStartDrill}
                className={`flex items-center space-x-2 px-8 py-3 rounded-xl font-mono font-bold text-sm transition-all shadow-lg ${
                  isDrillRunning
                    ? "bg-red-500 text-white shadow-red-500/30"
                    : "bg-[#2ae500] text-black shadow-[#2ae500]/30 hover:bg-[#25ca00]"
                }`}
              >
                {isDrillRunning ? <RotateCcw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isDrillRunning ? "STOP DRILL" : "START 60s DRILL"}</span>
              </button>
            </div>
          </div>

          {/* Right Col: Routine Selection Menu */}
          <div className="glass-panel p-5 rounded-2xl space-y-4">
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
                        ? "metal-chassis border-[#2ae500]/50 shadow-[0_0_12px_rgba(42,229,0,0.15)]"
                        : "bg-[#121218] border-[#20202c] hover:border-[#38384e]"
                    }`}
                  >
                    <h4 className="font-mono font-bold text-sm text-white">
                      {routine.title}
                    </h4>
                    <p className="text-[11px] font-mono text-gray-400 mt-1">
                      {routine.description}
                    </p>
                    <div className="flex items-center space-x-2 mt-3 text-[10px] font-mono text-[#2ae500]">
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

      {/* Tab 2: Ear Training Quiz */}
      {activeTab === "ear" && (
        <div className="max-w-3xl mx-auto glass-panel p-6 sm:p-8 rounded-2xl space-y-6">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold font-mono text-white">
              GUITAR INTERVAL EAR TRAINING
            </h3>
            <p className="text-xs font-mono text-gray-400">
              Listen to the two notes and identify the musical interval
            </p>
          </div>

          {/* Play Interval Audio Button */}
          <div className="flex justify-center my-4">
            <button
              onClick={() => playQuizInterval()}
              className="flex items-center space-x-2 px-6 py-3.5 rounded-2xl bg-[#2ae500] text-black font-mono font-bold text-sm hover:bg-[#25ca00] shadow-lg shadow-[#2ae500]/25 transition-transform hover:scale-105"
            >
              <Volume2 className="w-5 h-5" />
              <span>REPLAY INTERVAL SOUND</span>
            </button>
          </div>

          {/* Feedback message */}
          {quizFeedback && (
            <div className="p-3 rounded-xl bg-[#141420] border border-[#2ae500]/40 text-center font-mono font-bold text-sm text-[#2ae500] animate-bounce">
              {quizFeedback}
            </div>
          )}

          {/* Multiple Choice Option Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {INTERVAL_QUIZ_DATA.map((interval, idx) => (
              <button
                key={idx}
                onClick={() => handleAnswerInterval(idx)}
                className="p-3.5 rounded-xl bg-[#12121a] hover:bg-[#1c1c28] border border-[#242436] hover:border-[#2ae500] text-left font-mono transition-all text-xs text-white flex justify-between items-center"
              >
                <span>{interval.name}</span>
                <span className="text-[10px] text-gray-500">+{interval.semitones} st</span>
              </button>
            ))}
          </div>

          {/* Score Counter */}
          <div className="flex justify-between items-center text-xs font-mono text-gray-400 border-t border-[#20202c] pt-4">
            <span>
              Score: <strong className="text-[#2ae500]">{quizScore.correct}</strong> / {quizScore.total}
            </span>
            <span>
              Accuracy: {quizScore.total > 0 ? Math.round((quizScore.correct / quizScore.total) * 100) : 0}%
            </span>
          </div>
        </div>
      )}

      {/* Tab 3: AI Guitar Mentor */}
      {activeTab === "ai-coach" && (
        <div className="max-w-4xl mx-auto glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-[#2ae500]" />
            <h3 className="font-mono font-bold text-base text-white">
              AI GUITAR MASTER MENTOR
            </h3>
          </div>

          {/* Messages list */}
          <div className="space-y-3 max-h-[380px] overflow-y-auto p-3 bg-[#0a0a0f] rounded-xl border border-[#20202c]">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl text-xs font-mono leading-relaxed ${
                  m.role === "assistant"
                    ? "bg-[#141420] text-gray-200 border border-[#28283c]"
                    : "bg-[#2ae500]/15 text-[#2ae500] border border-[#2ae500]/30 ml-8"
                }`}
              >
                <div className="font-bold mb-1 text-[10px] uppercase text-gray-400">
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
              className="flex-1 bg-[#101018] text-white text-xs font-mono border border-[#2e2e42] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#2ae500]"
            />
            <button
              type="submit"
              disabled={isAskingAI}
              className="px-5 py-2.5 rounded-xl bg-[#2ae500] text-black font-mono font-bold text-xs hover:bg-[#25ca00] disabled:opacity-50 flex items-center space-x-1.5"
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
