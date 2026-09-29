import React, { useState } from "react";
import { Sparkles, Wand2, Music, Lightbulb, Send, Loader2, Play, Check } from "lucide-react";
import { DAWProject } from "../../types";

interface StudioAIAssistantProps {
  project: DAWProject;
  onApplyBpm?: (bpm: number) => void;
  onApplyKey?: (key: string) => void;
}

export const StudioAIAssistant: React.FC<StudioAIAssistantProps> = ({
  project,
  onApplyBpm,
  onApplyKey,
}) => {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string; suggestion?: { bpm?: number; key?: string; chords?: string[] } }[]
  >([
    {
      role: "assistant",
      text: `Hello! I am your JOE Studio AI producer. I can assist with chord ideas, arrangement structures, harmonic transitions, and mix suggestions for "${project.name}" (Key: ${project.keySig || "Am"}, Tempo: ${project.bpm || 120} BPM).`,
    },
  ]);

  const handleSend = async (textToSend?: string) => {
    const q = textToSend || query;
    if (!q.trim() || isLoading) return;

    const userMsg = { role: "user" as const, text: q };
    setMessages((prev) => [...prev, userMsg]);
    setQuery("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/guitar-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          currentContext: {
            projectName: project.name,
            bpm: project.bpm,
            key: project.keySig,
            tracksCount: project.tracks.length,
            tracks: project.tracks.map((t) => ({ name: t.name, clipsCount: t.clips?.length || 0 })),
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: data.answer || "Here is a musical idea for your track: Try contrasting a clean fingerpicked verse with an overdriven chorus.",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: `Pro Tip for ${project.keySig || "Am"}: Try a progression like i - VI - III - VII (${project.keySig || "Am"} - F - C - G) at ${project.bpm} BPM with a subtle 1/8th note delay send on the lead track.`,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Practice idea: In ${project.keySig || "Am"}, start with open chords on the rhythm track and layer pentatonic fills on the lead track using 16th-note grid snapping.`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const QUICK_PROMPTS = [
    "Suggest a chord progression for verse & chorus",
    "How should I EQ my lead guitar against the rhythm track?",
    "Give me arrangement ideas for a 3-minute track",
    "What tempo and groove works best for pop-rock?",
  ];

  return (
    <div className="h-full flex flex-col bg-[#0b0e14] text-white p-3 sm:p-5 overflow-hidden font-mono select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#a3ff12]/15 border border-[#a3ff12]/30 flex items-center justify-center text-[#a3ff12]">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
              JOE Studio AI Producer
            </h3>
            <p className="text-[10px] text-zinc-500">
              Songwriting, chord progressions, harmonic advice, and mix guidance
            </p>
          </div>
        </div>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3 scrollbar-thin">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-3 sm:p-4 text-xs leading-relaxed ${
                m.role === "user"
                  ? "bg-[#a3ff12]/20 border border-[#a3ff12]/40 text-white rounded-br-none"
                  : "bg-[#12151d] border border-white/10 text-zinc-200 rounded-bl-none shadow-md"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-zinc-400 text-xs py-2">
            <Loader2 className="w-4 h-4 text-[#a3ff12] animate-spin" />
            <span>AI Producer analyzing project harmonics...</span>
          </div>
        )}
      </div>

      {/* Quick Prompts */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 shrink-0 scrollbar-none">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => handleSend(p)}
            className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] text-zinc-300 hover:text-white shrink-0 transition-colors cursor-pointer"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <div className="flex items-center gap-2 border-t border-white/10 pt-3 shrink-0">
        <input
          type="text"
          placeholder="Ask for songwriting advice, chords, or mixing tips..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          className="flex-1 bg-[#12151d] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#a3ff12]/50 font-mono"
        />
        <button
          onClick={() => handleSend()}
          disabled={!query.trim() || isLoading}
          className="px-4 py-2.5 bg-[#a3ff12] hover:bg-[#8ee60b] text-black font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Ask AI</span>
        </button>
      </div>
    </div>
  );
};
