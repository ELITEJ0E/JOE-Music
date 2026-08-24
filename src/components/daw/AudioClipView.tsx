import React, { useRef, useEffect, useState } from "react";
import { Volume2, Scissors, Copy, Trash2, Sliders } from "lucide-react";
import { AudioClip } from "../../types";

interface AudioClipViewProps {
  clip: AudioClip;
  trackColor: string;
  zoomPxPerSec: number;
  isSelected: boolean;
  onSelect: (clipId: string) => void;
  onMove: (newStartTime: number) => void;
  onTrimLeft: (deltaSec: number) => void;
  onTrimRight: (deltaSec: number) => void;
  onOpenInspector: (clip: AudioClip) => void;
  onSplitAtPlayhead?: (clipId: string) => void;
  onDuplicate?: (clipId: string) => void;
  onDelete?: (clipId: string) => void;
}

export const AudioClipView: React.FC<AudioClipViewProps> = ({
  clip,
  trackColor,
  zoomPxPerSec,
  isSelected,
  onSelect,
  onMove,
  onTrimLeft,
  onTrimRight,
  onOpenInspector,
  onSplitAtPlayhead,
  onDuplicate,
  onDelete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragMode, setDragMode] = useState<"move" | "trim-left" | "trim-right" | null>(null);
  const [liveDeltaPx, setLiveDeltaPx] = useState<number>(0);
  const dragStartXRef = useRef<number>(0);
  const lastDeltaXRef = useRef<number>(0);
  const initialStartTimeRef = useRef<number>(0);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  const clipLeftPx = clip.startTime * zoomPxPerSec;
  const clipWidthPx = Math.max(16, clip.duration * zoomPxPerSec);
  const fadeInPx = Math.min(clipWidthPx, (clip.fadeInSec || 0.005) * zoomPxPerSec);
  const fadeOutPx = Math.min(clipWidthPx, (clip.fadeOutSec || 0.005) * zoomPxPerSec);

  let visualLeftPx = clipLeftPx;
  let visualWidthPx = clipWidthPx;

  if (isDragging) {
    if (dragMode === "move") {
      visualLeftPx = Math.max(0, clipLeftPx + liveDeltaPx);
    } else if (dragMode === "trim-left") {
      const maxLeftTrim = clipWidthPx - 16;
      const effectiveTrimPx = Math.max(-clipLeftPx, Math.min(maxLeftTrim, liveDeltaPx));
      visualLeftPx = clipLeftPx + effectiveTrimPx;
      visualWidthPx = Math.max(16, clipWidthPx - effectiveTrimPx);
    } else if (dragMode === "trim-right") {
      visualWidthPx = Math.max(16, clipWidthPx + liveDeltaPx);
    }
  }

  // Draw Waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = Math.floor(clipWidthPx);
    const height = 64;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    // Background fill with slight gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, "rgba(20, 24, 33, 0.95)");
    bgGrad.addColorStop(1, "rgba(11, 14, 20, 0.95)");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Waveform drawing
    const peaks = clip.waveformPeaks || [];
    const totalRawDuration = clip.audioBuffer ? clip.audioBuffer.duration : clip.duration;
    const trimOffsetPercent = totalRawDuration > 0 ? (clip.trimStart || 0) / totalRawDuration : 0;
    const playPercent = totalRawDuration > 0 ? clip.duration / totalRawDuration : 1;

    ctx.fillStyle = trackColor || "#a3ff12";
    ctx.strokeStyle = trackColor || "#a3ff12";
    ctx.lineWidth = 1.5;

    const centerY = height / 2;

    if (peaks.length > 0) {
      const startIndex = Math.floor(trimOffsetPercent * peaks.length);
      const visiblePeakCount = Math.max(4, Math.floor(playPercent * peaks.length));
      const endIndex = Math.min(peaks.length, startIndex + visiblePeakCount);
      const visiblePeaks = peaks.slice(startIndex, endIndex);

      const barWidth = Math.max(1, width / visiblePeaks.length);

      for (let i = 0; i < visiblePeaks.length; i++) {
        const peakVal = visiblePeaks[i] * (clip.gain ?? 1.0);
        const barHeight = Math.max(2, peakVal * (height * 0.82));
        const x = i * barWidth;
        const y = centerY - barHeight / 2;

        ctx.globalAlpha = 0.85;
        ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barHeight);
      }
      ctx.globalAlpha = 1.0;
    } else {
      // Placeholder smooth line
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();
    }

    // Draw Fade In visual curve overlay
    if (fadeInPx > 2) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(fadeInPx, 0);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();

      // Fade In guide line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(fadeInPx, 0);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Fade Out visual curve overlay
    if (fadeOutPx > 2) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.beginPath();
      ctx.moveTo(width - fadeOutPx, 0);
      ctx.lineTo(width, 0);
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();

      // Fade Out guide line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(width - fadeOutPx, 0);
      ctx.lineTo(width, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [clip, clipWidthPx, trackColor, fadeInPx, fadeOutPx]);

  // Drag handling
  const handleMouseDown = (e: React.MouseEvent, mode: "move" | "trim-left" | "trim-right") => {
    e.stopPropagation();
    onSelect(clip.id);
    setContextMenuPos(null);

    setIsDragging(true);
    setDragMode(mode);
    setLiveDeltaPx(0);
    dragStartXRef.current = e.clientX;
    lastDeltaXRef.current = 0;
    initialStartTimeRef.current = clip.startTime;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - dragStartXRef.current;
      lastDeltaXRef.current = deltaX;
      setLiveDeltaPx(deltaX);
    };

    const handleMouseUp = () => {
      const finalDeltaX = lastDeltaXRef.current;
      const finalDeltaSec = finalDeltaX / zoomPxPerSec;

      setIsDragging(false);
      setDragMode(null);
      setLiveDeltaPx(0);
      lastDeltaXRef.current = 0;

      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      if (Math.abs(finalDeltaX) >= 1) {
        if (mode === "move") {
          const newStart = Math.max(0, initialStartTimeRef.current + finalDeltaSec);
          onMove(newStart);
        } else if (mode === "trim-left") {
          onTrimLeft(finalDeltaSec);
        } else if (mode === "trim-right") {
          onTrimRight(finalDeltaSec);
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(clip.id);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        id={`daw-clip-${clip.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(clip.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onOpenInspector(clip);
        }}
        onContextMenu={handleContextMenu}
        className={`absolute top-1 bottom-1 rounded-lg overflow-hidden border select-none transition-shadow group ${
          isSelected
            ? "border-white shadow-[0_0_15px_rgba(163,255,18,0.4)] z-20"
            : "border-white/15 hover:border-white/40 z-10"
        } ${isDragging ? "cursor-grabbing opacity-90" : "cursor-grab"}`}
        style={{
          left: `${visualLeftPx}px`,
          width: `${visualWidthPx}px`,
        }}
      >
        {/* Waveform Canvas */}
        <canvas ref={canvasRef} className="w-full h-full block pointer-events-none" />

        {/* Clip Header Badge */}
        <div
          onMouseDown={(e) => handleMouseDown(e, "move")}
          className="absolute top-0 left-0 right-0 h-5 px-2 bg-black/50 backdrop-blur-xs flex items-center justify-between text-[10px] font-mono text-zinc-300 pointer-events-auto"
        >
          <span className="truncate font-bold text-white flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: trackColor }} />
            {clip.name}
          </span>
          <span className="text-zinc-400 text-[9px] shrink-0 ml-1">
            {clip.duration.toFixed(1)}s
            {clip.gain !== 1.0 && (
              <span className="ml-1 text-[#a3ff12] font-bold">
                {((clip.gain ?? 1) * 100).toFixed(0)}%
              </span>
            )}
          </span>
        </div>

        {/* Left Trim Handle */}
        <div
          onMouseDown={(e) => handleMouseDown(e, "trim-left")}
          className="absolute top-0 bottom-0 left-0 w-2.5 bg-white/0 hover:bg-white/30 active:bg-[#a3ff12] cursor-ew-resize transition-colors z-20 flex items-center justify-center"
          title="Drag to trim start"
        >
          <div className="w-[1.5px] h-4 bg-white/50 rounded-full" />
        </div>

        {/* Right Trim Handle */}
        <div
          onMouseDown={(e) => handleMouseDown(e, "trim-right")}
          className="absolute top-0 bottom-0 right-0 w-2.5 bg-white/0 hover:bg-white/30 active:bg-[#a3ff12] cursor-ew-resize transition-colors z-20 flex items-center justify-center"
          title="Drag to trim end"
        >
          <div className="w-[1.5px] h-4 bg-white/50 rounded-full" />
        </div>
      </div>

      {/* Clip Context Menu */}
      {contextMenuPos && (
        <div
          className="fixed z-50 bg-[#161922] border border-white/15 rounded-xl shadow-2xl py-1 w-44 text-xs font-mono text-zinc-200 animate-in fade-in zoom-in-95 duration-100"
          style={{ top: `${contextMenuPos.y}px`, left: `${contextMenuPos.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setContextMenuPos(null);
              onOpenInspector(clip);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center gap-2"
          >
            <Sliders className="w-3.5 h-3.5 text-[#a3ff12]" />
            <span>Clip Settings & Fades</span>
          </button>
          {onSplitAtPlayhead && (
            <button
              onClick={() => {
                setContextMenuPos(null);
                onSplitAtPlayhead(clip.id);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center gap-2"
            >
              <Scissors className="w-3.5 h-3.5 text-blue-400" />
              <span>Split at Playhead</span>
            </button>
          )}
          {onDuplicate && (
            <button
              onClick={() => {
                setContextMenuPos(null);
                onDuplicate(clip.id);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center gap-2"
            >
              <Copy className="w-3.5 h-3.5 text-amber-400" />
              <span>Duplicate Clip</span>
            </button>
          )}
          <div className="my-1 border-t border-white/10" />
          {onDelete && (
            <button
              onClick={() => {
                setContextMenuPos(null);
                onDelete(clip.id);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-rose-500/20 text-rose-400 flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Clip</span>
            </button>
          )}
        </div>
      )}
    </>
  );
};
