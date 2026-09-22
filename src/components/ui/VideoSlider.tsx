import React, { useRef, useState, useCallback, useEffect } from "react";

export interface VideoSliderProps {
  value: number; // in seconds
  duration: number; // in seconds
  buffered?: number; // in seconds
  onChange: (val: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: (val: number) => void;
  formatTime?: (seconds: number) => string;
  className?: string;
  disabled?: boolean;
}

export const VideoSlider: React.FC<VideoSliderProps> = ({
  value,
  duration,
  buffered = 0,
  onChange,
  onScrubStart,
  onScrubEnd,
  formatTime,
  className = "",
  disabled = false,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const localValueRef = useRef<number>(value);

  const safeDuration = Math.max(0.1, duration || 1);

  const defaultFormatTime = useCallback((seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const formatter = formatTime || defaultFormatTime;

  const calculateTime = useCallback(
    (clientX: number): number => {
      if (!trackRef.current || safeDuration <= 0) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * safeDuration;
    },
    [safeDuration]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || (e.button !== 0 && e.pointerType === "mouse")) return;
    const track = trackRef.current;
    if (!track) return;

    track.setPointerCapture(e.pointerId);
    setIsDragging(true);
    isDraggingRef.current = true;

    const time = calculateTime(e.clientX);
    localValueRef.current = time;
    onScrubStart?.();
    onChange(time);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const time = calculateTime(e.clientX);

    setHoverX(x);
    setHoverTime(time);

    if (isDraggingRef.current) {
      localValueRef.current = time;
      onChange(time);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (track && track.hasPointerCapture(e.pointerId)) {
      track.releasePointerCapture(e.pointerId);
    }

    if (isDraggingRef.current) {
      const time = calculateTime(e.clientX);
      isDraggingRef.current = false;
      setIsDragging(false);
      localValueRef.current = time;
      onChange(time);
      onScrubEnd?.(time);
    }
  };

  const handlePointerLeave = () => {
    if (!isDraggingRef.current) {
      setHoverTime(null);
    }
  };

  const displayTime = isDragging ? localValueRef.current : value;
  const progressPct = Math.min(100, Math.max(0, (displayTime / safeDuration) * 100));
  const bufferedPct = Math.min(100, Math.max(0, (buffered / safeDuration) * 100));

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Video Seek Slider"
      aria-valuemin={0}
      aria-valuemax={safeDuration}
      aria-valuenow={displayTime}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className={`relative group h-6 flex items-center select-none touch-none cursor-pointer ${
        disabled ? "opacity-40 pointer-events-none" : ""
      } ${className}`}
    >
      {/* Base Track */}
      <div className="w-full h-1.5 group-hover:h-2.5 bg-white/10 rounded-full transition-all duration-150 overflow-hidden relative">
        {/* Buffered progress bar */}
        {bufferedPct > 0 && (
          <div
            className="absolute top-0 bottom-0 left-0 bg-white/20 rounded-full pointer-events-none transition-all duration-200"
            style={{ width: `${bufferedPct}%` }}
          />
        )}

        {/* Played progress bar */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-[#00e676] to-[#a3ff12] rounded-full pointer-events-none"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Hover Preview Tooltip */}
      {hoverTime !== null && (
        <div
          className="absolute -top-7 pointer-events-none z-30 transform -translate-x-1/2"
          style={{ left: `${hoverX}px` }}
        >
          <div className="bg-[#161b22] border border-white/20 text-[#a3ff12] font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap">
            {formatter(hoverTime)}
          </div>
        </div>
      )}

      {/* Glowing Thumb Grip Indicator */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none transition-transform duration-100 ease-out"
        style={{ left: `${progressPct}%` }}
      >
        <div
          className={`w-3.5 h-3.5 rounded-full bg-[#a3ff12] border-2 border-black shadow-[0_0_10px_#a3ff12] ${
            isDragging ? "scale-125 ring-4 ring-[#a3ff12]/30" : "group-hover:scale-110"
          }`}
        />
      </div>
    </div>
  );
};
