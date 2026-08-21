import React from "react";

interface TimelineRulerProps {
  bpm: number;
  timeSig: string;
  zoomPxPerSec: number;
  totalDurationSec: number;
  playheadTimeSec: number;
  onSeek: (timeSec: number) => void;
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({
  bpm,
  timeSig,
  zoomPxPerSec,
  totalDurationSec,
  playheadTimeSec,
  onSeek,
}) => {
  const secondsPerBeat = 60.0 / bpm;
  const beatsPerBar = parseInt(timeSig.split("/")[0], 10) || 4;
  const secondsPerBar = secondsPerBeat * beatsPerBar;
  const totalBars = Math.ceil(totalDurationSec / secondsPerBar) + 2;

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const targetSec = Math.max(0, clickX / zoomPxPerSec);
    onSeek(targetSec);
  };

  return (
    <div
      id="daw-timeline-ruler"
      onClick={handleRulerClick}
      className="relative h-8 bg-[#0e1117] border-b border-white/10 select-none cursor-pointer overflow-hidden"
      style={{ width: `${Math.max(800, (totalDurationSec + 4) * zoomPxPerSec)}px` }}
    >
      {/* Bars & Beats markers */}
      {Array.from({ length: totalBars }).map((_, barIdx) => {
        const barTime = barIdx * secondsPerBar;
        const barX = barTime * zoomPxPerSec;

        return (
          <div key={`bar-${barIdx}`} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${barX}px` }}>
            {/* Bar marker line */}
            <div className="w-[1px] h-full bg-white/25" />
            <span className="absolute top-1 left-1.5 text-[10px] font-mono font-bold text-zinc-400">
              {barIdx + 1}
            </span>

            {/* Sub-beat ticks */}
            {Array.from({ length: beatsPerBar - 1 }).map((_, beatIdx) => {
              const beatTime = (beatIdx + 1) * secondsPerBeat;
              const beatX = beatTime * zoomPxPerSec;
              return (
                <div
                  key={`beat-${beatIdx}`}
                  className="absolute top-4 bottom-0 w-[1px] bg-white/10"
                  style={{ left: `${beatX}px` }}
                >
                  {zoomPxPerSec >= 70 && (
                    <span className="absolute -top-3 left-1 text-[8px] font-mono text-zinc-600">
                      .{beatIdx + 2}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Playhead marker in ruler */}
      <div
        className="absolute top-0 bottom-0 w-3 -ml-1.5 pointer-events-none z-30 flex flex-col items-center"
        style={{ left: `${playheadTimeSec * zoomPxPerSec}px` }}
      >
        <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[7px] border-t-[#a3ff12]" />
        <div className="w-[2px] h-full bg-[#a3ff12] shadow-[0_0_8px_#a3ff12]" />
      </div>
    </div>
  );
};
