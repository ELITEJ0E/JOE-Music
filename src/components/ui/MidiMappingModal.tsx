import React, { useState, useEffect } from "react";
import {
  X,
  Radio,
  Sliders,
  Check,
  RotateCcw,
  Sparkles,
  Zap,
  Info,
  Footprints,
  Music,
  Trash2,
  Activity,
  Cpu,
} from "lucide-react";
import {
  midiManager,
  MidiDevice,
  MidiMappingRule,
  MidiMessageEvent,
  DEFAULT_MIDI_MAPPINGS,
} from "../../audio/midiManager";

interface MidiMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategory?: "tone" | "looper" | "all";
}

export const MidiMappingModal: React.FC<MidiMappingModalProps> = ({
  isOpen,
  onClose,
  defaultCategory = "all",
}) => {
  const [devices, setDevices] = useState<MidiDevice[]>(midiManager.getDevices());
  const [mappings, setMappings] = useState<MidiMappingRule[]>(midiManager.getMappings());
  const [activeCategory, setActiveCategory] = useState<"all" | "tone" | "looper">(defaultCategory);
  const [learningActionId, setLearningActionId] = useState<string | null>(midiManager.getLearningActionId());
  const [recentEvents, setRecentEvents] = useState<MidiMessageEvent[]>([]);
  const [lastTriggeredAction, setLastTriggeredAction] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    midiManager.init().then(() => {
      setDevices(midiManager.getDevices());
    });

    const unsubConn = midiManager.subscribeConnections((devs) => {
      setDevices([...devs]);
    });

    const unsubActivity = midiManager.subscribeActivity((evt) => {
      setRecentEvents((prev) => [evt, ...prev.slice(0, 7)]);

      // Check which action this matches
      const currentMappings = midiManager.getMappings();
      const matched = currentMappings.find((m) => {
        if (m.type === "note" && evt.type === "noteon" && m.number === evt.note) return true;
        if (m.type === "cc" && evt.type === "cc" && m.number === evt.cc) return true;
        if (m.type === "program" && evt.type === "programchange" && m.number === evt.program) return true;
        return false;
      });

      if (matched) {
        setLastTriggeredAction(matched.actionId);
        setTimeout(() => setLastTriggeredAction(null), 1200);
      }

      setLearningActionId(midiManager.getLearningActionId());
      setMappings(midiManager.getMappings());
    });

    return () => {
      unsubConn();
      unsubActivity();
      midiManager.stopLearning();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartLearn = (actionId: string) => {
    midiManager.startLearning(actionId);
    setLearningActionId(actionId);
  };

  const handleCancelLearn = () => {
    midiManager.stopLearning();
    setLearningActionId(null);
  };

  const handleClearMapping = (actionId: string) => {
    midiManager.removeMapping(actionId);
    setMappings(midiManager.getMappings());
  };

  const handleResetDefaults = () => {
    midiManager.resetDefaultMappings();
    setMappings(midiManager.getMappings());
  };

  const filteredMappings = mappings.filter((m) => {
    if (activeCategory === "all") return true;
    return m.category === activeCategory;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#10131a] border border-white/15 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#a3ff12]/15 border border-[#a3ff12]/40 flex items-center justify-center text-[#a3ff12] shadow-[0_0_15px_rgba(163,255,18,0.2)]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-mono font-bold text-white tracking-wide">
                  MIDI Hardware Setup & Mapping
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#a3ff12]/10 border border-[#a3ff12]/30 text-[#a3ff12] font-semibold">
                  Web MIDI
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-sans">
                Trigger guitar pedalboards, looper recording, and presets via external hardware controllers.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Learning alert banner */}
        {learningActionId && (
          <div className="shrink-0 bg-amber-500/15 border-b border-amber-500/30 px-6 py-3 flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-2.5 text-amber-300 text-xs font-mono font-semibold">
              <Radio className="w-4 h-4 animate-spin text-amber-400" />
              <span>
                WAITING FOR MIDI INPUT: Press any footswitch, knob, or pad on your controller to bind...
              </span>
            </div>
            <button
              onClick={handleCancelLearn}
              className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg text-xs font-mono font-bold cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Connected Hardware Devices */}
          <div className="bg-black/30 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                <Footprints className="w-4 h-4 text-[#a3ff12]" />
                Connected Controllers ({devices.length})
              </span>
              <button
                onClick={() => midiManager.init().then(() => setDevices(midiManager.getDevices()))}
                className="text-[11px] font-mono text-zinc-400 hover:text-[#a3ff12] flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Rescan Devices
              </button>
            </div>

            {devices.length === 0 ? (
              <div className="p-4 rounded-xl bg-white/5 border border-dashed border-white/10 text-center">
                <p className="text-xs font-mono text-zinc-400">
                  No external MIDI controllers detected via USB/Bluetooth.
                </p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Connect a USB MIDI foot controller (e.g. Behringer FCB1010, Line 6 FBV, Morningstar, Boss FS, or MIDI keyboard) and click Rescan.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {devices.map((dev) => (
                  <div
                    key={dev.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-bold text-white truncate">
                        {dev.name}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">
                        {dev.manufacturer} • State: {dev.state}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#a3ff12]/15 text-[#a3ff12] border border-[#a3ff12]/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#a3ff12] animate-pulse" />
                      Active
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Category Tabs & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 w-fit">
              {(["all", "tone", "looper"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold capitalize transition-colors cursor-pointer ${
                    activeCategory === cat
                      ? "bg-[#a3ff12] text-black shadow-sm"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {cat === "all" ? "All Mappings" : cat === "tone" ? "Tone Studio" : "Looper"}
                </button>
              ))}
            </div>

            <button
              onClick={handleResetDefaults}
              className="text-xs font-mono text-zinc-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer w-fit"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Guitar Defaults
            </button>
          </div>

          {/* Mappings Table */}
          <div className="border border-white/10 rounded-2xl overflow-hidden bg-black/20 divide-y divide-white/5">
            <div className="grid grid-cols-12 px-4 py-2.5 bg-white/5 text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
              <div className="col-span-5 sm:col-span-4">Function / Action</div>
              <div className="col-span-4 sm:col-span-5">Hardware Assignment</div>
              <div className="col-span-3 text-right">Learn / Config</div>
            </div>

            {filteredMappings.map((rule) => {
              const isLearning = learningActionId === rule.actionId;
              const isTriggered = lastTriggeredAction === rule.actionId;

              return (
                <div
                  key={rule.actionId}
                  className={`grid grid-cols-12 items-center px-4 py-3 transition-colors ${
                    isTriggered
                      ? "bg-[#a3ff12]/20"
                      : isLearning
                      ? "bg-amber-500/10"
                      : "hover:bg-white/5"
                  }`}
                >
                  <div className="col-span-5 sm:col-span-4 pr-2">
                    <div className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                      {rule.label}
                      {isTriggered && (
                        <span className="w-2 h-2 rounded-full bg-[#a3ff12] animate-ping" />
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500 capitalize">
                      {rule.category} studio
                    </div>
                  </div>

                  <div className="col-span-4 sm:col-span-5 font-mono text-xs">
                    {rule.description ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 text-[#a3ff12] border border-white/10 font-bold">
                        <Zap className="w-3 h-3 text-[#a3ff12]" />
                        {rule.description}
                      </span>
                    ) : (
                      <span className="text-zinc-500 italic text-[11px]">Unassigned</span>
                    )}
                  </div>

                  <div className="col-span-3 flex items-center justify-end gap-1.5">
                    {isLearning ? (
                      <button
                        onClick={handleCancelLearn}
                        className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-mono font-bold cursor-pointer"
                      >
                        Listening...
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartLearn(rule.actionId)}
                        className="px-2.5 py-1 bg-white/5 hover:bg-[#a3ff12]/20 text-zinc-300 hover:text-[#a3ff12] border border-white/10 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer"
                      >
                        Learn
                      </button>
                    )}

                    <button
                      onClick={() => handleClearMapping(rule.actionId)}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                      title="Clear Mapping"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Real-Time Live MIDI Activity Monitor */}
          <div className="bg-black/40 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[#a3ff12]" />
                Hardware MIDI Live Monitor
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                Press any pedal to inspect incoming data
              </span>
            </div>

            {recentEvents.length === 0 ? (
              <p className="text-[11px] font-mono text-zinc-600 italic">
                Awaiting incoming hardware MIDI messages...
              </p>
            ) : (
              <div className="space-y-1 font-mono text-[11px]">
                {recentEvents.map((evt, idx) => (
                  <div
                    key={`evt-${idx}-${evt.timestamp}`}
                    className="flex items-center justify-between px-2.5 py-1 rounded bg-white/5 text-zinc-300 border border-white/5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[#a3ff12] font-bold uppercase">
                        [{evt.type}]
                      </span>
                      <span>Ch {evt.channel}</span>
                      {evt.cc !== undefined && <span>CC #{evt.cc} (Val: {evt.rawValue})</span>}
                      {evt.note !== undefined && <span>Note #{evt.note} (Vel: {evt.rawValue})</span>}
                      {evt.program !== undefined && <span>Program #{evt.program}</span>}
                    </div>
                    <span className="text-zinc-500 text-[10px]">
                      {evt.deviceName || "MIDI Input"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-white/10 flex items-center justify-between bg-black/30">
          <span className="text-xs font-mono text-zinc-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Mappings automatically persist in local storage.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#a3ff12] hover:bg-[#b5ff38] text-black font-mono font-bold text-xs rounded-xl shadow-[0_0_15px_rgba(163,255,18,0.3)] transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
