import React, { useState, useEffect } from "react";
import { Cpu, Sliders, ChevronDown } from "lucide-react";
import { midiManager, MidiDevice, MidiMessageEvent } from "../../audio/midiManager";
import { MidiMappingModal } from "./MidiMappingModal";

interface MidiControllerBarProps {
  category?: "tone" | "looper" | "all";
  compact?: boolean;
}

export const MidiControllerBar: React.FC<MidiControllerBarProps> = ({
  category = "all",
  compact = false,
}) => {
  const [devices, setDevices] = useState<MidiDevice[]>(midiManager.getDevices());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasRecentActivity, setHasRecentActivity] = useState(false);
  const [lastEventText, setLastEventText] = useState<string>("");

  useEffect(() => {
    // Initialize Web MIDI API
    midiManager.init().then(() => {
      setDevices(midiManager.getDevices());
    });

    const unsubConn = midiManager.subscribeConnections((devs) => {
      setDevices([...devs]);
    });

    let timeoutId: any = null;
    const unsubActivity = midiManager.subscribeActivity((evt: MidiMessageEvent) => {
      setHasRecentActivity(true);
      if (evt.type === "cc") {
        setLastEventText(`CC #${evt.cc}: ${evt.rawValue}`);
      } else if (evt.type === "noteon") {
        setLastEventText(`Note #${evt.note}`);
      } else if (evt.type === "programchange") {
        setLastEventText(`Prog #${evt.program}`);
      }

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setHasRecentActivity(false);
      }, 350);
    });

    return () => {
      unsubConn();
      unsubActivity();
      clearTimeout(timeoutId);
    };
  }, []);

  const deviceCount = devices.length;
  const primaryName = deviceCount > 0 ? devices[0].name : "No MIDI Device";

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setIsModalOpen(true)}
          className={`flex items-center gap-2 px-2.5 py-1 rounded-xl border transition-all cursor-pointer select-none ${
            deviceCount > 0
              ? "bg-black/40 border-white/15 hover:border-[#a3ff12]/50 text-zinc-300 hover:text-white"
              : "bg-black/20 border-white/10 text-zinc-500 hover:text-zinc-400"
          }`}
          title={deviceCount > 0 ? `MIDI Controller Connected: ${primaryName}` : "Click to setup MIDI controllers"}
        >
          {/* Activity indicator LED */}
          <div className="relative flex items-center justify-center">
            <span
              className={`w-2 h-2 rounded-full transition-all duration-75 ${
                hasRecentActivity
                  ? "bg-[#a3ff12] shadow-[0_0_8px_#a3ff12] scale-125"
                  : deviceCount > 0
                  ? "bg-[#a3ff12]/60"
                  : "bg-zinc-600"
              }`}
            />
          </div>

          <Cpu className="w-3.5 h-3.5 text-zinc-400" />

          {!compact && (
            <span className="text-[11px] font-mono font-medium max-w-[130px] truncate">
              {deviceCount > 0 ? primaryName : "MIDI"}
            </span>
          )}

          {hasRecentActivity && lastEventText && (
            <span className="text-[10px] font-mono text-[#a3ff12] bg-[#a3ff12]/10 px-1 rounded animate-fade-in">
              {lastEventText}
            </span>
          )}

          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-zinc-400">
            Map
          </span>
        </button>
      </div>

      <MidiMappingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        defaultCategory={category}
      />
    </>
  );
};
