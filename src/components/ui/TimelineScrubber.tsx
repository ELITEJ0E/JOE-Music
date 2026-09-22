import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

export interface TimelineChordSegment {
  id: string | number;
  startTime: number;
  endTime: number;
  soundingChord: string;
  playShape?: string;
  hasCapoShape?: boolean;
}

export interface TimelineScrubberProps {
  currentTime: number;
  duration: number;
  min?: number;
  max?: number;
  step?: number;
  isPlaying?: boolean;
  playbackRate?: number;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  waveformPeaks?: number[];
  chordSegments?: TimelineChordSegment[];
  onChange?: (val: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: (val: number) => void;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode | ((activeTime: number, isDragging: boolean) => React.ReactNode);
  formatTime?: (seconds: number) => string;
}

// Fixed 48-bar waveform silhouette matching the previous aesthetic
const DEFAULT_BAR_HEIGHTS = Array.from({ length: 48 }, (_, wIdx) => 25 + ((wIdx * 23) % 65));

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  currentTime,
  duration,
  min = 0,
  max,
  step = 0.01,
  isPlaying = false,
  playbackRate = 1.0,
  audioRef,
  waveformPeaks,
  chordSegments,
  onChange,
  onScrubStart,
  onScrubEnd,
  disabled = false,
  className = "",
  children,
  formatTime,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragTooltipRef = useRef<HTMLDivElement>(null);
  const hoverContainerRef = useRef<HTMLDivElement>(null);
  const hoverTooltipRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState<string | number | null>(null);

  const isDraggingRef = useRef<boolean>(false);
  const dragValueRef = useRef<number>(currentTime);
  const rectCacheRef = useRef<{ left: number; width: number }>({ left: 0, width: 1 });
  const rafIdRef = useRef<number | null>(null);
  const pendingTimeRef = useRef<number | null>(null);

  const effectiveMin = min;
  const effectiveMax = max !== undefined ? max : duration > 0 ? duration : 100;
  const safeDuration = Math.max(0.1, duration || effectiveMax);

  const defaultFormatTime = useCallback((seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const timeFormatter = formatTime || defaultFormatTime;

  // Process waveform bars: sample from peaks if provided, otherwise default heights
  const barHeights = useMemo(() => {
    if (waveformPeaks && waveformPeaks.length >= 32) {
      const count = 48;
      const step = waveformPeaks.length / count;
      const res: number[] = [];
      for (let i = 0; i < count; i++) {
        const peakIdx = Math.min(waveformPeaks.length - 1, Math.floor(i * step));
        const val = waveformPeaks[peakIdx];
        res.push(Math.max(20, Math.min(95, Math.round(val * 100))));
      }
      return res;
    }
    return DEFAULT_BAR_HEIGHTS;
  }, [waveformPeaks]);

  // Synchronize CSS custom property with progress percentage
  const setVisualProgress = useCallback(
    (time: number) => {
      if (!containerRef.current) return;
      const clampedTime = Math.max(effectiveMin, Math.min(effectiveMax, time));
      const pct =
        effectiveMax > effectiveMin ? ((clampedTime - effectiveMin) / (effectiveMax - effectiveMin)) * 100 : 0;
      containerRef.current.style.setProperty("--progress-pct", `${pct.toFixed(3)}%`);

      // Update active chord segment id if segments exist
      if (chordSegments && chordSegments.length > 0) {
        const currentSeg = chordSegments.find(
          (seg) => clampedTime >= seg.startTime && clampedTime <= seg.endTime
        );
        if (currentSeg && currentSeg.id !== activeSegmentId) {
          setActiveSegmentId(currentSeg.id);
        }
      }

      if (dragTooltipRef.current && isDraggingRef.current) {
        dragTooltipRef.current.textContent = timeFormatter(clampedTime);
      }
    },
    [effectiveMin, effectiveMax, chordSegments, activeSegmentId, timeFormatter]
  );

  // Sync external currentTime prop when NOT dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      setVisualProgress(currentTime);
    }
  }, [currentTime, setVisualProgress]);

  // High-Resolution Sub-Frame Audio Clock Interpolation during playback
  useEffect(() => {
    if (!isPlaying || isDraggingRef.current) return;

    let animId: number;
    let lastAudioTime = -1;
    let basePerfTime = performance.now();
    let baseAudioTime = currentTime;

    const tick = (now: number) => {
      if (isDraggingRef.current) return;

      if (audioRef?.current && audioRef.current.src && !isNaN(audioRef.current.duration)) {
        const curAudio = audioRef.current.currentTime;
        if (curAudio !== lastAudioTime) {
          lastAudioTime = curAudio;
          baseAudioTime = curAudio;
          basePerfTime = now;
        }

        const rate = playbackRate || audioRef.current.playbackRate || 1.0;
        const elapsedSec = ((now - basePerfTime) / 1000) * rate;
        const interpolated = Math.max(
          curAudio - 0.05,
          Math.min(curAudio + 0.12, baseAudioTime + elapsedSec)
        );

        setVisualProgress(interpolated);
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, audioRef, playbackRate, currentTime, setVisualProgress]);

  // Coordinate normalization without forced reflows during drag
  const calculateTimestamp = useCallback(
    (clientX: number): number => {
      const { left, width } = rectCacheRef.current;
      if (width <= 0 || effectiveMax <= effectiveMin) return effectiveMin;

      const rawRatio = (clientX - left) / width;
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

  // Pointer Events API with setPointerCapture for 100% reliable zero-lag dragging
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || (e.button !== 0 && e.pointerType === "mouse")) return;
    const container = containerRef.current;
    if (!container) return;

    // Cache layout bounding box to eliminate layout thrashing (forced reflows) during drag
    const rect = container.getBoundingClientRect();
    rectCacheRef.current = { left: rect.left, width: rect.width };

    container.setPointerCapture(e.pointerId);
    setIsDragging(true);
    isDraggingRef.current = true;

    const val = calculateTimestamp(e.clientX);
    dragValueRef.current = val;

    // Immediate visual update at 0ms latency
    setVisualProgress(val);

    onScrubStart?.();
    onChange?.(val);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    if (isDraggingRef.current) {
      const val = calculateTimestamp(e.clientX);
      dragValueRef.current = val;

      // Immediate direct GPU-bound visual update
      setVisualProgress(val);

      // Coalesce onChange calls using requestAnimationFrame to prevent React render bottleneck
      pendingTimeRef.current = val;
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (pendingTimeRef.current !== null && onChange) {
            onChange(pendingTimeRef.current);
          }
        });
      }
    } else {
      // Hover Line & Timestamp without triggering React component re-renders
      if (hoverContainerRef.current && hoverTooltipRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const hoverX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const hoverVal = calculateTimestamp(e.clientX);

        hoverContainerRef.current.style.display = "block";
        hoverContainerRef.current.style.transform = `translateX(${hoverX}px)`;
        hoverTooltipRef.current.textContent = timeFormatter(hoverVal);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (container && container.hasPointerCapture(e.pointerId)) {
      container.releasePointerCapture(e.pointerId);
    }

    if (isDraggingRef.current) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      const finalVal = calculateTimestamp(e.clientX);
      isDraggingRef.current = false;
      setIsDragging(false);
      dragValueRef.current = finalVal;

      setVisualProgress(finalVal);

      onChange?.(finalVal);
      onScrubEnd?.(finalVal);
    }
  };

  const handlePointerLeave = () => {
    if (!isDraggingRef.current && hoverContainerRef.current) {
      hoverContainerRef.current.style.display = "none";
    }
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
      setVisualProgress(nextVal);
      onChange?.(nextVal);
      onScrubEnd?.(nextVal);
    }
  };

  const activeDisplayTime = isDragging ? dragValueRef.current : currentTime;
  const initialPct =
    effectiveMax > effectiveMin ? ((currentTime - effectiveMin) / (effectiveMax - effectiveMin)) * 100 : 0;

  return (
    <div
      ref={containerRef}
      tabIndex={disabled ? -1 : 0}
      role="slider"
      aria-label="Audio Timeline Scrubber"
      aria-valuemin={effectiveMin}
      aria-valuemax={effectiveMax}
      aria-valuenow={activeDisplayTime}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
      style={{ "--progress-pct": `${initialPct.toFixed(3)}%` } as React.CSSProperties}
      className={`relative min-h-[44px] sm:min-h-[52px] flex items-center select-none touch-none cursor-ew-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a3ff12] rounded-xl transition-all [contain:layout_style] ${
        isDragging ? "ring-2 ring-[#a3ff12]/50 bg-white/[0.09]" : ""
      } ${className}`}
    >
      {/* Background Track Frame */}
      <div className="absolute inset-0 bg-white/5 hover:bg-white/[0.08] rounded-xl border border-white/10 overflow-hidden pointer-events-none">
        {/* Elapsed Progress Fill - GPU accelerated */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#a3ff12]/15 to-[#a3ff12]/25 pointer-events-none will-change-[width]"
          style={{ width: "var(--progress-pct, 0%)" }}
        />

        {/* Natively Rendered Waveform & Chord Markers for 120fps performance */}
        {chordSegments || waveformPeaks ? (
          <>
            {/* Waveform vertical bars with high-performance GPU clip-path overlay */}
            <div className="absolute inset-0 px-2 flex items-center justify-between pointer-events-none z-0">
              {/* Base inactive bars */}
              {barHeights.map((h, wIdx) => (
                <div
                  key={`base-${wIdx}`}
                  className="w-1 rounded-full bg-zinc-700/80 pointer-events-none"
                  style={{ height: `${h}%` }}
                />
              ))}

              {/* Active highlighted bars clipped smoothly by audio progress */}
              <div
                className="absolute inset-0 px-2 flex items-center justify-between pointer-events-none will-change-[clip-path]"
                style={{
                  clipPath: "inset(0 calc(100% - var(--progress-pct, 0%)) 0 0)",
                }}
              >
                {barHeights.map((h, wIdx) => (
                  <div
                    key={`act-${wIdx}`}
                    className="w-1 rounded-full bg-[#a3ff12] pointer-events-none"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            {/* Chord split markers and labels */}
            {chordSegments && chordSegments.length > 0 && (
              <div className="absolute inset-0 flex pointer-events-none z-10">
                {chordSegments.map((seg, idx) => {
                  const leftPct = safeDuration > 0 ? (seg.startTime / safeDuration) * 100 : 0;
                  const isCurrentSeg = seg.id === activeSegmentId;
                  return (
                    <div
                      key={seg.id || idx}
                      className={`absolute h-full border-l flex flex-col justify-end pb-0.5 pl-1 text-[9px] font-mono transition-colors ${
                        isCurrentSeg
                          ? "border-[#a3ff12]/60 text-[#a3ff12] font-bold"
                          : "border-white/10 text-zinc-400"
                      }`}
                      style={{ left: `${leftPct}%` }}
                    >
                      <span className="bg-[#0b0e12] border border-white/10 px-1 py-0.5 rounded flex items-center gap-1 shadow-sm">
                        <span className={isCurrentSeg ? "text-[#a3ff12]" : "text-zinc-200"}>
                          {seg.soundingChord}
                        </span>
                        {seg.hasCapoShape && seg.playShape && (
                          <span className="text-[8px] text-sky-400 font-semibold opacity-90">
                            ({seg.playShape})
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : null}

        {/* Fallback to custom children if passed */}
        {typeof children === "function" ? children(activeDisplayTime, isDragging) : children}
      </div>

      {/* Hover Scrubber Line & Timestamp Tooltip (Desktop) - Direct DOM position without React state reflow */}
      <div
        ref={hoverContainerRef}
        style={{ display: "none" }}
        className="absolute top-0 bottom-0 pointer-events-none z-20 will-change-transform"
      >
        <div className="w-px h-full bg-white/50 border-l border-dashed border-white/70 -translate-x-1/2" />
        <div
          ref={hoverTooltipRef}
          className="absolute -top-7 -translate-x-1/2 bg-zinc-900/95 border border-white/20 px-2 py-0.5 rounded text-[10px] font-mono text-zinc-100 shadow-lg whitespace-nowrap"
        >
          {timeFormatter(currentTime)}
        </div>
      </div>

      {/* Playhead Laser Line & Scrubber Thumb Handle */}
      {effectiveMax > 0 && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-30 will-change-[left]"
          style={{ left: "var(--progress-pct, 0%)" }}
        >
          {/* Vertical Playhead Needle */}
          <div className="w-[2px] h-full bg-[#a3ff12] -translate-x-1/2 shadow-[0_0_10px_#a3ff12]" />

          {/* Scrubber Thumb Grip Handle */}
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-7 bg-[#a3ff12] rounded-md border-2 border-black flex flex-col items-center justify-center shadow-[0_0_12px_rgba(163,255,18,0.9)] cursor-grab active:cursor-grabbing pointer-events-auto">
            <div className="w-0.5 h-3 bg-black/80 rounded-full" />
          </div>

          {/* Active Drag Floating Tooltip */}
          <div
            ref={dragTooltipRef}
            className={`absolute -top-8 -translate-x-1/2 bg-[#a3ff12] text-black font-bold font-mono px-2 py-0.5 rounded text-[10px] shadow-[0_0_12px_rgba(163,255,18,0.5)] whitespace-nowrap transition-opacity duration-150 ${
              isDragging ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            {timeFormatter(activeDisplayTime)}
          </div>
        </div>
      )}
    </div>
  );
};
