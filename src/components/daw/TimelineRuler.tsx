import React, { useState, useRef, useEffect, useCallback } from "react";

interface TimelineRulerProps {
  bpm: number;
  timeSig: string;
  zoomPxPerSec: number;
  totalDurationSec: number;
  playheadTimeSec: number;
  onSeek: (timeSec: number) => void;
  playheadLineRef?: React.RefObject<HTMLDivElement | null>;
  onScrubbingStateChange?: (isScrubbing: boolean) => void;
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({
  bpm,
  timeSig,
  zoomPxPerSec,
  totalDurationSec,
  playheadTimeSec,
  onSeek,
  playheadLineRef,
  onScrubbingStateChange,
}) => {
  const secondsPerBeat = 60.0 / bpm;
  const beatsPerBar = parseInt(timeSig.split("/")[0], 10) || 4;
  const secondsPerBar = secondsPerBeat * beatsPerBar;
  const totalBars = Math.ceil(totalDurationSec / secondsPerBar) + 2;

  const containerRef = useRef<HTMLDivElement>(null);
  const hoverContainerRef = useRef<HTMLDivElement>(null);
  const hoverTooltipRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isDraggingRef = useRef<boolean>(false);
  const rectCacheRef = useRef<{ left: number; width: number }>({ left: 0, width: 1 });
  const rafIdRef = useRef<number | null>(null);
  const pendingSeekTimeRef = useRef<number | null>(null);

  // Directly update unified playhead transform on GPU thread
  const updateVisualPlayhead = useCallback(
    (timeSec: number) => {
      const x = Math.max(0, timeSec * zoomPxPerSec);
      if (playheadLineRef?.current) {
        playheadLineRef.current.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      }
    },
    [zoomPxPerSec, playheadLineRef]
  );

  // Sync external playheadTimeSec when NOT actively dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      updateVisualPlayhead(playheadTimeSec);
    }
  }, [playheadTimeSec, updateVisualPlayhead]);

  // Helper to calculate target time from clientX with zero layout reflows
  const getTimeFromX = useCallback(
    (clientX: number): number => {
      const { left } = rectCacheRef.current;
      if (zoomPxPerSec <= 0) return 0;
      const rawX = Math.max(0, clientX - left);
      const rawTime = rawX / zoomPxPerSec;
      const step = 0.01;
      const steppedTime = Math.round(rawTime / step) * step;
      return Math.max(0, Math.min(totalDurationSec, steppedTime));
    },
    [zoomPxPerSec, totalDurationSec]
  );

  // Pointer Events API with setPointerCapture for 100% zero-lag instant scrubbing
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    rectCacheRef.current = { left: rect.left, width: rect.width };

    try {
      container.setPointerCapture(e.pointerId);
    } catch {}

    isDraggingRef.current = true;
    setIsDragging(true);
    document.body.style.cursor = "ew-resize";
    onScrubbingStateChange?.(true);

    const targetTime = getTimeFromX(e.clientX);
    pendingSeekTimeRef.current = targetTime;
    updateVisualPlayhead(targetTime);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      const targetTime = getTimeFromX(e.clientX);
      pendingSeekTimeRef.current = targetTime;
      updateVisualPlayhead(targetTime);
    } else if (hoverContainerRef.current && hoverTooltipRef.current && containerRef.current) {
      const { left } = rectCacheRef.current.left
        ? rectCacheRef.current
        : containerRef.current.getBoundingClientRect();
      const hoverX = Math.max(0, e.clientX - left);
      const targetTime = Math.max(0, hoverX / zoomPxPerSec);

      hoverContainerRef.current.style.transform = `translate3d(${hoverX.toFixed(2)}px, 0, 0)`;
      hoverTooltipRef.current.textContent = formatTime(targetTime);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (container && container.hasPointerCapture(e.pointerId)) {
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {}
    }

    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = "";
      onScrubbingStateChange?.(false);

      const finalTime =
        pendingSeekTimeRef.current !== null ? pendingSeekTimeRef.current : getTimeFromX(e.clientX);
      pendingSeekTimeRef.current = null;
      updateVisualPlayhead(finalTime);
      onSeek(finalTime);
    }
  };

  const handlePointerLeave = () => {
    if (!isDraggingRef.current) {
      setIsHovered(false);
    }
  };

  const handlePointerEnter = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      rectCacheRef.current = { left: rect.left, width: rect.width };
    }
    setIsHovered(true);
  };

  // Keyboard navigation accessibility handlers
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let newTime = playheadTimeSec;
    const step = e.shiftKey ? 1.0 : 0.1;

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
        return;
    }

    e.preventDefault();
    updateVisualPlayhead(newTime);
    onSeek(newTime);
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time < 0) return "0:00.00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  return (
    <div
      ref={containerRef}
      id="daw-timeline-ruler"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={totalDurationSec}
      aria-valuenow={playheadTimeSec}
      aria-label="Timeline Time Scrubber"
      className={`relative h-10 bg-[#0c0e15] border-b border-white/10 select-none overflow-visible focus:outline-none focus:ring-1 focus:ring-[#a3ff12]/30 touch-none [contain:layout_style] ${
        isHovered || isDragging ? "cursor-ew-resize" : "cursor-pointer"
      }`}
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

      {/* Hover preview fill line and time badge */}
      <div
        ref={hoverContainerRef}
        className={`absolute top-0 bottom-0 pointer-events-none z-30 transition-opacity duration-150 ${
          isHovered && !isDragging ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="w-[2px] h-full bg-white/40 border-l border-dashed border-white/60 -translate-x-1/2" />
        <div
          ref={hoverTooltipRef}
          className="absolute -top-7 -translate-x-1/2 bg-[#121620] border border-white/20 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap"
        >
          0:00.00
        </div>
      </div>
    </div>
  );
};
