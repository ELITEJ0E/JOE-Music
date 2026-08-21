import React, { useState, useRef, useEffect } from "react";

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

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPlayhead, setDragPlayhead] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Helper to calculate target time from pixel X coordinate
  const getTimeFromX = (clientX: number): number => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const targetTime = x / zoomPxPerSec;
    // Step resolution of 10ms (0.01 seconds)
    const step = 0.01;
    const steppedTime = Math.round(targetTime / step) * step;
    return Math.max(0, Math.min(totalDurationSec, steppedTime));
  };

  // Pointer event handlers for ultra-smooth drag
  const startDrag = (clientX: number) => {
    setIsDragging(true);
    const targetTime = getTimeFromX(clientX);
    setDragPlayhead(targetTime);
    onSeek(targetTime);

    // Apply document-level custom styling during active drag
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Left click only
    if (e.button !== 0) return;
    startDrag(e.clientX);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) {
      startDrag(e.touches[0].clientX);
    }
  };

  // Window-level tracking for flawless drag capture
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const targetTime = getTimeFromX(e.clientX);
      setDragPlayhead(targetTime);
      onSeek(targetTime);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        // Prevent window scrolling on touch devices during drag
        if (e.cancelable) {
          e.preventDefault();
        }
        const targetTime = getTimeFromX(e.touches[0].clientX);
        setDragPlayhead(targetTime);
        onSeek(targetTime);
      }
    };

    const stopDrag = () => {
      setIsDragging(false);
      setDragPlayhead(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", stopDrag);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopDrag);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", stopDrag);
    };
  }, [isDragging, zoomPxPerSec, totalDurationSec, onSeek]);

  // Handle Hover preview calculations
  const handleMouseMoveHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setHoverX(x);
    const targetTime = Math.max(0, x / zoomPxPerSec);
    setHoverTime(targetTime);
  };

  // Keyboard navigation accessibility handlers
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let newTime = isDragging && dragPlayhead !== null ? dragPlayhead : playheadTimeSec;
    const step = e.shiftKey ? 1.0 : 0.1; // 10x step on Shift key

    switch (e.key) {
      case "ArrowLeft":
        newTime = Math.max(0, newTime - step);
        break;
      case "ArrowRight":
        newTime = Math.min(totalDurationSec, newTime + step);
        break;
      case "Home":
        newTime = 0;
        break;
      case "End":
        newTime = totalDurationSec;
        break;
      default:
        return; // Ignore other keys
    }

    e.preventDefault();
    onSeek(newTime);
    if (isDragging) {
      setDragPlayhead(newTime);
    }
  };

  // Helper to format floating tooltips nicely
  const formatTime = (time: number) => {
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  const displayPlayhead = isDragging && dragPlayhead !== null ? dragPlayhead : playheadTimeSec;
  const showTooltip = isDragging || (isHovered && hoverTime !== null);
  const tooltipTime = isDragging && dragPlayhead !== null ? dragPlayhead : (hoverTime ?? 0);
  const tooltipX = isDragging && dragPlayhead !== null ? dragPlayhead * zoomPxPerSec : (hoverX ?? 0);

  return (
    <div
      ref={containerRef}
      id="daw-timeline-ruler"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onMouseMove={handleMouseMoveHover}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoverTime(null);
        setHoverX(null);
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={totalDurationSec}
      aria-valuenow={displayPlayhead}
      aria-label="Timeline Time Scrubber"
      className={`relative h-10 bg-[#0e1117] border-b border-white/10 select-none overflow-visible focus:outline-none focus:ring-1 focus:ring-[#a3ff12]/30 transition-all duration-300 ${
        isHovered || isDragging ? "cursor-grab h-11" : "cursor-pointer"
      } ${isDragging ? "cursor-grabbing" : ""}`}
      style={{ width: `${Math.max(800, (totalDurationSec + 4) * zoomPxPerSec)}px` }}
    >
      {/* Bars & Beats markers */}
      {Array.from({ length: totalBars }).map((_, barIdx) => {
        const barTime = barIdx * secondsPerBar;
        const barX = barTime * zoomPxPerSec;

        return (
          <div
            key={`bar-${barIdx}`}
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{ left: `${barX}px` }}
          >
            {/* Bar marker line */}
            <div className="w-[1px] h-full bg-white/20" />
            <span className="absolute top-1 left-1.5 text-[9px] font-mono font-bold text-zinc-500 uppercase">
              Bar {barIdx + 1}
            </span>

            {/* Sub-beat ticks */}
            {Array.from({ length: beatsPerBar - 1 }).map((_, beatIdx) => {
              const beatTime = (beatIdx + 1) * secondsPerBeat;
              const beatX = beatTime * zoomPxPerSec;
              return (
                <div
                  key={`beat-${beatIdx}`}
                  className="absolute top-5 bottom-0 w-[1px] bg-white/10"
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

      {/* Hover preview fill line */}
      {isHovered && hoverX !== null && !isDragging && (
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-white/15 pointer-events-none transition-opacity duration-150"
          style={{ left: `${hoverX}px` }}
        />
      )}

      {/* Smooth floating HUD tooltip displaying formatted playback time */}
      {showTooltip && (
        <div
          className="absolute -top-7 pointer-events-none z-50 transform -translate-x-1/2 transition-all duration-75 ease-out"
          style={{ left: `${tooltipX}px` }}
        >
          <div className="bg-[#121620] border border-white/20 text-white text-[10px] font-mono font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-[#a3ff12] animate-pulse" />
            <span>{formatTime(tooltipTime)}</span>
          </div>
        </div>
      )}

      {/* Optimistic zero-lag playhead pointer & line */}
      <div
        className="absolute top-0 bottom-0 w-4 -ml-2 pointer-events-none z-40 flex flex-col items-center"
        style={{ left: `${displayPlayhead * zoomPxPerSec}px` }}
      >
        {/* Playhead thumb triangle */}
        <div
          className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-[#a3ff12] transition-transform duration-100 ${
            isDragging ? "scale-125" : isHovered ? "scale-110" : "scale-100"
          }`}
          style={{
            filter: isDragging
              ? "drop-shadow(0 0 4px rgba(163,255,18,0.8))"
              : "drop-shadow(0 0 2px rgba(163,255,18,0.4))",
          }}
        />
        {/* Playhead vertical alignment line */}
        <div
          className={`w-[2px] h-full transition-all duration-100 ${
            isDragging ? "bg-[#a3ff12]" : "bg-[#a3ff12]/80"
          }`}
          style={{
            boxShadow: isDragging
              ? "0 0 16px #a3ff12, 0 0 8px #a3ff12"
              : "0 0 8px rgba(163,255,18,0.4)",
          }}
        />
      </div>
    </div>
  );
};
