import React, { useState, useEffect, useRef, useCallback } from "react";

export interface TimelineScrubberProps {
  currentTime: number;
  duration: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (val: number) => void;
  onScrubEnd?: (val: number) => void;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  formatTime?: (seconds: number) => string;
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  currentTime,
  duration,
  min = 0,
  max,
  step = 0.05,
  onChange,
  onScrubEnd,
  disabled = false,
  className = "",
  children,
  formatTime,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  const effectiveMin = min;
  const effectiveMax = max !== undefined ? max : duration > 0 ? duration : 100;

  const defaultFormatTime = useCallback((seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${tenths}`;
  }, []);

  const timeFormatter = formatTime || defaultFormatTime;

  // Coordinate Normalization & Math
  const getTimestampFromClientX = useCallback(
    (clientX: number): number => {
      if (!containerRef.current || effectiveMax <= effectiveMin) return effectiveMin;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return effectiveMin;

      const rawRatio = (clientX - rect.left) / rect.width;
      const clampedRatio = Math.max(0, Math.min(1, rawRatio));
      let value = effectiveMin + clampedRatio * (effectiveMax - effectiveMin);

      if (step && step > 0) {
        const steps = Math.round((value - effectiveMin) / step);
        value = effectiveMin + steps * step;
      }

      return Math.max(effectiveMin, Math.min(effectiveMax, value));
    },
    [effectiveMin, effectiveMax, step]
  );

  // Keep track of active drag value in ref for smooth updates
  const dragValueRef = useRef<number>(currentTime);
  const isDraggingRef = useRef<boolean>(false);
  isDraggingRef.current = isDragging;

  // Unified Mouse & Touch Handlers bound to window during drag
  useEffect(() => {
    if (!isDragging) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const val = getTimestampFromClientX(e.clientX);
      dragValueRef.current = val;
      onChange(val);
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
      const val = getTimestampFromClientX(e.clientX);
      setIsDragging(false);
      onChange(val);
      if (onScrubEnd) {
        onScrubEnd(val);
      }
    };

    const handleWindowTouchMove = (e: TouchEvent) => {
      // Prevent overscrolling, bounce, or pull-to-refresh on mobile devices
      if (e.cancelable) {
        e.preventDefault();
      }
      if (e.touches && e.touches.length > 0) {
        const val = getTimestampFromClientX(e.touches[0].clientX);
        dragValueRef.current = val;
        onChange(val);
      }
    };

    const handleWindowTouchEnd = (e: TouchEvent) => {
      let clientX = 0;
      if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
      }
      const val = clientX ? getTimestampFromClientX(clientX) : dragValueRef.current;
      setIsDragging(false);
      onChange(val);
      if (onScrubEnd) {
        onScrubEnd(val);
      }
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    // Attach touchmove with { passive: false } to allow e.preventDefault()
    window.addEventListener("touchmove", handleWindowTouchMove, { passive: false });
    window.addEventListener("touchend", handleWindowTouchEnd);
    window.addEventListener("touchcancel", handleWindowTouchEnd);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("touchmove", handleWindowTouchMove);
      window.removeEventListener("touchend", handleWindowTouchEnd);
      window.removeEventListener("touchcancel", handleWindowTouchEnd);
    };
  }, [isDragging, getTimestampFromClientX, onChange, onScrubEnd]);

  // Initiation Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return; // Left click only
    e.preventDefault();
    const val = getTimestampFromClientX(e.clientX);
    dragValueRef.current = val;
    setIsDragging(true);
    onChange(val);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.touches && e.touches.length > 0) {
      const val = getTimestampFromClientX(e.touches[0].clientX);
      dragValueRef.current = val;
      setIsDragging(true);
      onChange(val);
    }
  };

  // Hover preview handling on desktop
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const val = getTimestampFromClientX(e.clientX);
    setHoverX(x);
    setHoverTime(val);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
  };

  // Keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || effectiveMax <= effectiveMin) return;
    const baseStep = step || 1;
    const multiplier = e.shiftKey ? 10 : 1;
    const delta = baseStep * multiplier;

    let nextVal: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      nextVal = Math.max(effectiveMin, currentTime - delta);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      nextVal = Math.min(effectiveMax, currentTime + delta);
    } else if (e.key === "Home") {
      nextVal = effectiveMin;
    } else if (e.key === "End") {
      nextVal = effectiveMax;
    }

    if (nextVal !== null) {
      e.preventDefault();
      onChange(nextVal);
      if (onScrubEnd) {
        onScrubEnd(nextVal);
      }
    }
  };

  const progressPct =
    effectiveMax > effectiveMin
      ? Math.min(100, Math.max(0, ((currentTime - effectiveMin) / (effectiveMax - effectiveMin)) * 100))
      : 0;

  return (
    <div
      ref={containerRef}
      tabIndex={disabled ? -1 : 0}
      role="slider"
      aria-label="Audio Timeline Scrubber"
      aria-valuemin={effectiveMin}
      aria-valuemax={effectiveMax}
      aria-valuenow={currentTime}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      className={`relative min-h-[44px] flex items-center select-none touch-none cursor-ew-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a3ff12] rounded-xl transition-all ${
        isDragging ? "ring-2 ring-[#a3ff12]/50 bg-white/[0.09]" : ""
      } ${className}`}
    >
      {/* Background Track Frame */}
      <div className="absolute inset-0 bg-white/5 hover:bg-white/[0.08] rounded-xl border border-white/10 overflow-hidden pointer-events-none">
        {/* Elapsed Progress Fill */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#a3ff12]/15 to-[#a3ff12]/25"
          style={{ width: `${progressPct}%` }}
        />
        {/* Children (e.g. Waveforms, Chord Split Markers) */}
        {children}
      </div>

      {/* Hover Scrubber Line & Timestamp Tooltip (Desktop) */}
      {hoverTime !== null && !isDragging && effectiveMax > 0 && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-20"
          style={{ left: `${hoverX}px` }}
        >
          <div className="w-px h-full bg-white/50 border-l border-dashed border-white/70 -translate-x-1/2" />
          <div className="absolute -top-7 -translate-x-1/2 bg-zinc-900/95 border border-white/20 px-2 py-0.5 rounded text-[10px] font-mono text-zinc-100 shadow-lg whitespace-nowrap">
            {timeFormatter(hoverTime)}
          </div>
        </div>
      )}

      {/* Playhead Laser Line & Drag Handle */}
      {effectiveMax > 0 && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-30"
          style={{ left: `${progressPct}%` }}
        >
          {/* Vertical Playhead Needle */}
          <div className="w-[2px] h-full bg-[#a3ff12] -translate-x-1/2 shadow-[0_0_10px_#a3ff12]" />

          {/* Scrubber Thumb Grip Handle */}
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-7 bg-[#a3ff12] rounded-md border-2 border-black flex flex-col items-center justify-center shadow-[0_0_12px_rgba(163,255,18,0.9)] cursor-grab active:cursor-grabbing pointer-events-auto">
            <div className="w-0.5 h-3 bg-black/80 rounded-full" />
          </div>

          {/* Active Drag Floating Tooltip */}
          {isDragging && (
            <div className="absolute -top-8 -translate-x-1/2 bg-[#a3ff12] text-black font-bold font-mono px-2 py-0.5 rounded text-[10px] shadow-[0_0_12px_rgba(163,255,18,0.5)] whitespace-nowrap">
              {timeFormatter(currentTime)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
