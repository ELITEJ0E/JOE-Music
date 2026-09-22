import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ZoomIn, ZoomOut, Maximize2, MoveHorizontal, Volume2 } from "lucide-react";

export interface ChordSegmentMarker {
  id: string;
  chord: string;
  startTime: number;
  endTime: number;
  displayChord?: string;
  shapeChord?: string;
  capo?: number;
}

export interface WaveformTimelineCanvasProps {
  currentTime: number;
  duration: number;
  isPlaying?: boolean;
  playbackRate?: number;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  waveformPeaks?: number[];
  chordSegments?: ChordSegmentMarker[];
  beats?: number[];
  tempo?: number;
  onSeek: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: (time: number) => void;
  formatTime?: (seconds: number) => string;
  className?: string;
  showControls?: boolean;
  showMiniMap?: boolean;
  height?: number;
  accentColor?: string; // default #a3ff12
  playedBarColor?: string; // default #00e676 / #a3ff12
  unplayedBarColor?: string; // default #2b3442
}

// Generate realistic synthetic peaks if audio buffer is not decoded yet
function generateDefaultPeaks(count: number = 600): number[] {
  const peaks: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const progress = i / count;
    // Musical envelope curve (intro, verse, chorus swells, outro)
    const section = Math.sin(progress * Math.PI * 4);
    const detail = Math.sin(i * 0.3) * 0.2 + Math.cos(i * 0.7) * 0.15;
    const noise = (Math.sin(i * 13.37) * 0.5 + 0.5) * 0.3;
    const raw = 0.25 + 0.45 * Math.abs(section) + detail + noise;
    peaks[i] = Math.max(0.08, Math.min(0.98, raw));
  }
  return peaks;
}

export const WaveformTimelineCanvas: React.FC<WaveformTimelineCanvasProps> = ({
  currentTime,
  duration,
  isPlaying = false,
  playbackRate = 1.0,
  audioRef,
  waveformPeaks,
  chordSegments = [],
  beats = [],
  tempo = 120,
  onSeek,
  onScrubStart,
  onScrubEnd,
  formatTime,
  className = "",
  showControls = true,
  showMiniMap = true,
  height = 96,
  accentColor = "#a3ff12",
  playedBarColor = "#00e676",
  unplayedBarColor = "#2b3442",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniMapCanvasRef = useRef<HTMLCanvasElement>(null);

  // Dynamic zoom & panning state
  const [zoom, setZoom] = useState<number>(1.0); // 1.0x to 16.0x
  const [scrollOffset, setScrollOffset] = useState<number>(0); // in seconds

  // Immediate mutable dragging refs for ZERO-LAG scrubbing (no React state lag)
  const isDraggingPlayheadRef = useRef<boolean>(false);
  const isDraggingMarkerRef = useRef<number | null>(null);
  const isDraggingMiniMapRef = useRef<boolean>(false);
  const isPanningRef = useRef<boolean>(false);
  const lastPanXRef = useRef<number>(0);

  // High-resolution audio clock interpolation refs
  const lastAudioTimeRef = useRef<number>(currentTime);
  const lastPerfTimeRef = useRef<number>(performance.now());
  const preciseTimeRef = useRef<number>(currentTime);
  const hoverTimeRef = useRef<number | null>(null);
  const hoverXRef = useRef<number | null>(null);

  // Sync incoming currentTime prop into local high-precision ref
  useEffect(() => {
    if (!isDraggingPlayheadRef.current) {
      preciseTimeRef.current = currentTime;
      lastAudioTimeRef.current = currentTime;
      lastPerfTimeRef.current = performance.now();
    }
  }, [currentTime]);

  const safeDuration = Math.max(0.1, duration || 1);
  const visibleDuration = safeDuration / zoom;

  // Keep scroll offset within valid bounds when zoom or duration changes
  useEffect(() => {
    setScrollOffset((prev) => Math.max(0, Math.min(safeDuration - visibleDuration, prev)));
  }, [zoom, safeDuration, visibleDuration]);

  // Auto-follow playhead during playback if zoomed in
  useEffect(() => {
    if (isPlaying && zoom > 1.0 && !isDraggingPlayheadRef.current && !isPanningRef.current) {
      const cur = preciseTimeRef.current;
      if (cur < scrollOffset || cur > scrollOffset + visibleDuration) {
        // Center playhead in visible window
        const targetOffset = Math.max(0, Math.min(safeDuration - visibleDuration, cur - visibleDuration * 0.3));
        setScrollOffset(targetOffset);
      }
    }
  }, [currentTime, isPlaying, zoom, scrollOffset, safeDuration, visibleDuration]);

  // Compute or fallback peaks
  const peaks = useMemo(() => {
    if (waveformPeaks && waveformPeaks.length >= 64) {
      return waveformPeaks;
    }
    return generateDefaultPeaks(800);
  }, [waveformPeaks]);

  const defaultFormatTime = useCallback((seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "0:00.0";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${tenths}`;
  }, []);

  const timeFormatter = formatTime || defaultFormatTime;

  // High-Precision Audio Clock Interpolation (Eliminating the 250ms HTML5 audio stutter)
  const getPreciseCurrentTime = useCallback((): number => {
    if (isDraggingPlayheadRef.current) {
      return preciseTimeRef.current;
    }

    if (audioRef?.current && !audioRef.current.paused && !isNaN(audioRef.current.currentTime)) {
      const hardwareTime = audioRef.current.currentTime;
      const now = performance.now();

      // If hardware audio element ticked, calibrate baseline
      if (hardwareTime !== lastAudioTimeRef.current) {
        lastAudioTimeRef.current = hardwareTime;
        lastPerfTimeRef.current = now;
      }

      const dt = (now - lastPerfTimeRef.current) / 1000;
      const rate = audioRef.current.playbackRate || playbackRate || 1.0;
      const extrapolated = lastAudioTimeRef.current + dt * rate;

      // 120ms safety drift guard to prevent desynchronization
      const bounded = Math.max(hardwareTime - 0.05, Math.min(hardwareTime + 0.12, extrapolated));
      preciseTimeRef.current = bounded;
      return bounded;
    }

    return preciseTimeRef.current;
  }, [audioRef, playbackRate]);

  // Core Waveform Drawing Function (Viewport-Clipped, Sub-Millisecond Execution)
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const heightPx = canvas.height;
    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = width / dpr;
    const logicalHeight = heightPx / dpr;

    ctx.save();
    ctx.clearRect(0, 0, width, heightPx);
    ctx.scale(dpr, dpr);

    const activeTime = getPreciseCurrentTime();
    const startSec = scrollOffset;
    const endSec = scrollOffset + visibleDuration;
    const pxPerSec = logicalWidth / visibleDuration;

    // 1. Draw subtle background timecode grid lines and labels
    // Choose dynamic time interval based on zoom
    let gridInterval = 10;
    if (visibleDuration <= 5) gridInterval = 0.5;
    else if (visibleDuration <= 12) gridInterval = 1;
    else if (visibleDuration <= 30) gridInterval = 2;
    else if (visibleDuration <= 60) gridInterval = 5;
    else if (visibleDuration <= 120) gridInterval = 10;
    else if (visibleDuration <= 300) gridInterval = 15;
    else gridInterval = 30;

    const firstGridSec = Math.floor(startSec / gridInterval) * gridInterval;
    ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';

    for (let t = firstGridSec; t <= endSec + gridInterval; t += gridInterval) {
      if (t < 0) continue;
      const x = (t - startSec) * pxPerSec;
      if (x < -20 || x > logicalWidth + 20) continue;

      // Grid line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, logicalHeight);
      ctx.stroke();

      // Timestamp label in bottom header area
      ctx.fillStyle = "rgba(161, 161, 170, 0.6)";
      const mins = Math.floor(t / 60);
      const secs = (t % 60).toFixed(gridInterval < 1 ? 1 : 0);
      const label = `${mins}:${secs.padStart(gridInterval < 1 ? 4 : 2, "0")}`;
      ctx.fillText(label, x + 3, logicalHeight - 4);
    }

    // 2. Draw Chord Region Markers (Top 24% of Canvas)
    const chordHeaderHeight = 26;
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillRect(0, 0, logicalWidth, chordHeaderHeight);

    // Divider line between chord headers and waveform
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    ctx.moveTo(0, chordHeaderHeight);
    ctx.lineTo(logicalWidth, chordHeaderHeight);
    ctx.stroke();

    chordSegments.forEach((seg, idx) => {
      if (seg.endTime < startSec || seg.startTime > endSec) return;
      const x1 = Math.max(0, (seg.startTime - startSec) * pxPerSec);
      const x2 = Math.min(logicalWidth, (seg.endTime - startSec) * pxPerSec);
      const segWidth = Math.max(2, x2 - x1);
      const isCurrent = activeTime >= seg.startTime && activeTime <= seg.endTime;

      // Segment boundary vertical rule
      ctx.strokeStyle = isCurrent ? "rgba(163, 255, 18, 0.6)" : "rgba(255, 255, 255, 0.12)";
      ctx.setLineDash(isCurrent ? [] : [3, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, logicalHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // Chord badge pill in header
      if (segWidth > 18) {
        const badgeX = x1 + 3;
        const badgeY = 4;
        const badgeW = Math.min(segWidth - 6, 48);
        const badgeH = 18;

        ctx.fillStyle = isCurrent ? "rgba(163, 255, 18, 0.2)" : "rgba(255, 255, 255, 0.08)";
        ctx.strokeStyle = isCurrent ? "#a3ff12" : "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;

        // Rounded rect for badge
        ctx.beginPath();
        const r = 4;
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, r);
        ctx.fill();
        ctx.stroke();

        // Chord name text
        ctx.fillStyle = isCurrent ? "#a3ff12" : "#ffffff";
        ctx.font = 'bold 10px "JetBrains Mono", ui-monospace, monospace';
        const chordName = seg.displayChord || seg.chord || "-";
        ctx.fillText(chordName, badgeX + 4, badgeY + 13);
      }
    });

    // 3. Viewport-Clipped Waveform Peaks Rendering (Sub-Millisecond Drawing)
    const totalPeaks = peaks.length;
    const startPeakIdx = Math.max(0, Math.floor((startSec / safeDuration) * totalPeaks));
    const endPeakIdx = Math.min(totalPeaks - 1, Math.ceil((endSec / safeDuration) * totalPeaks));

    const waveformTop = chordHeaderHeight + 2;
    const waveformBottom = logicalHeight - 12;
    const waveformHeight = waveformBottom - waveformTop;
    const centerY = waveformTop + waveformHeight / 2;

    const visiblePeakCount = Math.max(1, endPeakIdx - startPeakIdx);
    const barSpacing = logicalWidth / visiblePeakCount;
    const barWidth = Math.max(1.5, Math.min(4.5, barSpacing * 0.75));

    for (let i = startPeakIdx; i <= endPeakIdx; i++) {
      const peakTime = (i / totalPeaks) * safeDuration;
      const x = (peakTime - startSec) * pxPerSec;
      if (x < -5 || x > logicalWidth + 5) continue;

      const peakVal = peaks[i];
      const barH = Math.max(3, peakVal * (waveformHeight * 0.88));
      const isPlayed = peakTime <= activeTime;

      // Color scheme: vibrant accent for played, dark slate for unplayed
      if (isPlayed) {
        ctx.fillStyle = playedBarColor || accentColor;
      } else {
        ctx.fillStyle = unplayedBarColor;
      }

      // Draw mirrored top/bottom bar with rounded edges
      const topY = centerY - barH / 2;
      ctx.beginPath();
      ctx.roundRect(x - barWidth / 2, topY, barWidth, barH, 2);
      ctx.fill();
    }

    // 4. Draw Beat Dots along bottom bar
    if (beats && beats.length > 0) {
      ctx.fillStyle = "rgba(163, 255, 18, 0.45)";
      for (const beatSec of beats) {
        if (beatSec < startSec || beatSec > endSec) continue;
        const bx = (beatSec - startSec) * pxPerSec;
        ctx.beginPath();
        ctx.arc(bx, logicalHeight - 5, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 5. Hover Indicator Line & Timestamp Badge
    if (hoverXRef.current !== null && hoverTimeRef.current !== null) {
      const hx = hoverXRef.current;
      const ht = hoverTimeRef.current;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(hx, logicalHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // Floating hover tooltip on top
      const tooltipText = timeFormatter(ht);
      ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
      const textWidth = ctx.measureText(tooltipText).width;
      const pad = 4;
      const boxW = textWidth + pad * 2;
      const boxH = 16;
      const boxX = Math.max(2, Math.min(logicalWidth - boxW - 2, hx - boxW / 2));
      const boxY = 2;

      ctx.fillStyle = "rgba(18, 18, 22, 0.95)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.fillText(tooltipText, boxX + pad, boxY + 12);
    }

    // 6. Draw 1.5px Vertical Laser Playhead Line with Top Needle Arrow
    const playheadX = (activeTime - startSec) * pxPerSec;
    if (playheadX >= -2 && playheadX <= logicalWidth + 2) {
      // Glow effect around playhead
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, logicalHeight);
      ctx.stroke();

      // Top Needle Indicator (inverted triangle badge)
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(playheadX - 6, 0);
      ctx.lineTo(playheadX + 6, 0);
      ctx.lineTo(playheadX, 8);
      ctx.closePath();
      ctx.fill();

      // Bottom Needle Indicator
      ctx.beginPath();
      ctx.moveTo(playheadX - 4, logicalHeight);
      ctx.lineTo(playheadX + 4, logicalHeight);
      ctx.lineTo(playheadX, logicalHeight - 6);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0; // Reset shadow
    }

    ctx.restore();
  }, [
    getPreciseCurrentTime,
    scrollOffset,
    visibleDuration,
    safeDuration,
    peaks,
    chordSegments,
    beats,
    timeFormatter,
    accentColor,
    playedBarColor,
    unplayedBarColor,
  ]);

  // Mini-map drawing function
  const drawMiniMap = useCallback(() => {
    const canvas = miniMapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const heightPx = canvas.height;
    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = width / dpr;
    const logicalHeight = heightPx / dpr;

    ctx.save();
    ctx.clearRect(0, 0, width, heightPx);
    ctx.scale(dpr, dpr);

    const activeTime = getPreciseCurrentTime();
    const totalPeaks = peaks.length;
    const step = logicalWidth / totalPeaks;

    // Draw full song background peaks
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    for (let i = 0; i < totalPeaks; i++) {
      const x = i * step;
      const h = peaks[i] * (logicalHeight * 0.8);
      ctx.fillRect(x, (logicalHeight - h) / 2, Math.max(1, step * 0.8), h);
    }

    // Draw played peaks in accent color
    const playedIdx = Math.floor((activeTime / safeDuration) * totalPeaks);
    ctx.fillStyle = accentColor;
    for (let i = 0; i <= playedIdx && i < totalPeaks; i++) {
      const x = i * step;
      const h = peaks[i] * (logicalHeight * 0.8);
      ctx.fillRect(x, (logicalHeight - h) / 2, Math.max(1, step * 0.8), h);
    }

    // Highlight current visible viewport box
    const viewportX1 = (scrollOffset / safeDuration) * logicalWidth;
    const viewportX2 = ((scrollOffset + visibleDuration) / safeDuration) * logicalWidth;
    const viewportW = Math.max(4, viewportX2 - viewportX1);

    ctx.fillStyle = "rgba(163, 255, 18, 0.15)";
    ctx.strokeStyle = "rgba(163, 255, 18, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(viewportX1, 1, viewportW, logicalHeight - 2, 3);
    ctx.fill();
    ctx.stroke();

    // Playhead line
    const px = (activeTime / safeDuration) * logicalWidth;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, logicalHeight);
    ctx.stroke();

    ctx.restore();
  }, [getPreciseCurrentTime, peaks, safeDuration, scrollOffset, visibleDuration, accentColor]);

  // Resize observer to ensure 1:1 pixel crispness on Retina/Hi-DPI
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = height;

      if (w > 0) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      const miniCanvas = miniMapCanvasRef.current;
      if (miniCanvas) {
        miniCanvas.width = w * dpr;
        miniCanvas.height = 16 * dpr;
        miniCanvas.style.width = `${w}px`;
        miniCanvas.style.height = `16px`;
      }

      drawWaveform();
      drawMiniMap();
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [height, drawWaveform, drawMiniMap]);

  // Global Continuous 60fps/120fps requestAnimationFrame Playback Render Loop
  useEffect(() => {
    let animId: number;
    const renderLoop = () => {
      drawWaveform();
      drawMiniMap();
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [drawWaveform, drawMiniMap]);

  // Trackpad & Non-Passive Wheel Gestures: Smooth Exponential Zoom + Horizontal Panning
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault(); // Prevent page scrolling

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseRatio = Math.max(0, Math.min(1, mouseX / rect.width));
      const currentMouseSec = scrollOffset + mouseRatio * visibleDuration;

      // Pinch or Ctrl/Cmd + Wheel = Exponential Zoom
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 2) {
        const zoomFactor = Math.pow(1.002, -e.deltaY * 1.5);
        setZoom((prevZoom) => {
          const nextZoom = Math.max(1.0, Math.min(16.0, prevZoom * zoomFactor));
          if (nextZoom === prevZoom) return prevZoom;

          const newVisible = safeDuration / nextZoom;
          // Keep mouse position anchored in time
          const nextOffset = Math.max(0, Math.min(safeDuration - newVisible, currentMouseSec - mouseRatio * newVisible));
          setScrollOffset(nextOffset);
          return nextZoom;
        });
      } else {
        // Horizontal Trackpad Panning
        const deltaSec = (e.deltaX / rect.width) * visibleDuration;
        setScrollOffset((prev) => Math.max(0, Math.min(safeDuration - visibleDuration, prev + deltaSec)));
      }
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [scrollOffset, visibleDuration, safeDuration]);

  // Direct Time Calculation from Mouse / Touch Coordinate
  const calculateTimeFromClientX = useCallback(
    (clientX: number): number => {
      const canvas = canvasRef.current;
      if (!canvas) return 0;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0) return 0;

      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const time = scrollOffset + ratio * visibleDuration;
      return Math.max(0, Math.min(safeDuration, time));
    },
    [scrollOffset, visibleDuration, safeDuration]
  );

  // Instant Pointer Down Handler with Pointer Capture for Butter-Smooth Zero-Lag Tracking
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return; // Left-click only
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const targetTime = calculateTimeFromClientX(e.clientX);

    // Dual-Zone Hit Detection:
    // Top 24% of canvas = Chord marker pin handle zone
    if (mouseY < 26) {
      // Find nearest chord segment marker
      const pxPerSec = rect.width / visibleDuration;
      let matchedIdx = -1;
      for (let i = 0; i < chordSegments.length; i++) {
        const seg = chordSegments[i];
        const segX = (seg.startTime - scrollOffset) * pxPerSec;
        if (Math.abs(e.clientX - rect.left - segX) < 14) {
          matchedIdx = i;
          break;
        }
      }

      if (matchedIdx !== -1) {
        isDraggingMarkerRef.current = matchedIdx;
      } else {
        // Clicked in top bar to jump directly to chord start
        isDraggingPlayheadRef.current = true;
        preciseTimeRef.current = targetTime;
        onScrubStart?.();
        onSeek(targetTime);
        if (audioRef?.current) {
          audioRef.current.currentTime = targetTime;
        }
      }
    } else {
      // Bottom 76% of canvas = High-Performance Instant Playhead Scrub
      isDraggingPlayheadRef.current = true;
      preciseTimeRef.current = targetTime;
      onScrubStart?.();
      onSeek(targetTime);
      if (audioRef?.current) {
        audioRef.current.currentTime = targetTime;
      }
    }

    drawWaveform();
    drawMiniMap();
  };

  // High-Frequency Pointer Move Handler (120Hz/240Hz direct dispatch)
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const hoverX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const targetTime = calculateTimeFromClientX(e.clientX);

    hoverXRef.current = hoverX;
    hoverTimeRef.current = targetTime;

    if (isDraggingPlayheadRef.current) {
      preciseTimeRef.current = targetTime;
      // Direct seek dispatch with zero-lag
      onSeek(targetTime);
      if (audioRef?.current) {
        audioRef.current.currentTime = targetTime;
      }
      drawWaveform();
      drawMiniMap();
    } else if (isDraggingMarkerRef.current !== null) {
      // Dragging marker boundary (can snap or adjust time)
      drawWaveform();
    }
  };

  // Pointer Up / Pointer Cancel Handler
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    if (isDraggingPlayheadRef.current) {
      const finalTime = calculateTimeFromClientX(e.clientX);
      isDraggingPlayheadRef.current = false;
      preciseTimeRef.current = finalTime;
      onSeek(finalTime);
      if (audioRef?.current) {
        audioRef.current.currentTime = finalTime;
      }
      onScrubEnd?.(finalTime);
    }

    isDraggingMarkerRef.current = null;
    isPanningRef.current = false;
    drawWaveform();
    drawMiniMap();
  };

  const handlePointerLeave = () => {
    if (!isDraggingPlayheadRef.current) {
      hoverXRef.current = null;
      hoverTimeRef.current = null;
    }
  };

  // Mini-map Pointer Dragging for quick navigation
  const handleMiniMapPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = miniMapCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    isDraggingMiniMapRef.current = true;

    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetCenter = ratio * safeDuration;
    const targetOffset = Math.max(0, Math.min(safeDuration - visibleDuration, targetCenter - visibleDuration / 2));
    setScrollOffset(targetOffset);
  };

  const handleMiniMapPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingMiniMapRef.current) return;
    const canvas = miniMapCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetCenter = ratio * safeDuration;
    const targetOffset = Math.max(0, Math.min(safeDuration - visibleDuration, targetCenter - visibleDuration / 2));
    setScrollOffset(targetOffset);
  };

  const handleMiniMapPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = miniMapCanvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    isDraggingMiniMapRef.current = false;
  };

  // Zoom helpers
  const handleZoomIn = () => setZoom((z) => Math.min(16.0, z * 1.5));
  const handleZoomOut = () => setZoom((z) => Math.max(1.0, z / 1.5));
  const handleZoomReset = () => {
    setZoom(1.0);
    setScrollOffset(0);
  };

  return (
    <div
      ref={containerRef}
      className={`relative select-none flex flex-col space-y-1.5 w-full ${className}`}
      style={{ touchAction: "none" }}
    >
      {/* Top Toolbar / Zoom & Overview Bar */}
      {showControls && (
        <div className="flex items-center justify-between px-1 text-[11px] font-mono text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-zinc-300 font-bold">
              <MoveHorizontal className="w-3.5 h-3.5 text-[#a3ff12]" />
              <span>TIMELINE</span>
            </span>
            {zoom > 1.05 && (
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-[#a3ff12] font-semibold">
                {zoom.toFixed(1)}x ZOOM
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#a3ff12] font-bold">
              {timeFormatter(currentTime)} / {timeFormatter(duration)}
            </span>

            <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-lg border border-white/5">
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 1.0}
                className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
                title="Zoom Out (Trackpad pinch / Ctrl+Scroll)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleZoomReset}
                className="px-1.5 py-0.5 rounded hover:bg-white/10 text-[10px] text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Fit to Song (1.0x)"
              >
                Fit
              </button>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 16.0}
                className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
                title="Zoom In (Trackpad pinch / Ctrl+Scroll)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Interactive HTML5 Waveform Canvas */}
      <div className="relative w-full rounded-xl overflow-hidden bg-[#0d1117] border border-white/10 shadow-inner group">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          className="w-full block cursor-crosshair touch-none select-none"
          style={{ height: `${height}px` }}
        />
      </div>

      {/* Mini-Map Overview Bar (Shows entire song overview when zoomed in) */}
      {showMiniMap && zoom > 1.05 && (
        <div className="relative w-full h-4 rounded-md overflow-hidden bg-[#080b0e] border border-white/5">
          <canvas
            ref={miniMapCanvasRef}
            onPointerDown={handleMiniMapPointerDown}
            onPointerMove={handleMiniMapPointerMove}
            onPointerUp={handleMiniMapPointerUp}
            onPointerCancel={handleMiniMapPointerUp}
            className="w-full h-full block cursor-pointer touch-none"
          />
        </div>
      )}
    </div>
  );
};
