import React, { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2, Minimize2, ExternalLink, Sparkles, Youtube, RefreshCw } from "lucide-react";
import { getYoutubeThumbnail } from "../utils/youtubeHelper";

interface YouTubeSyncPlayerProps {
  videoId: string;
  title?: string;
  artist?: string;
  currentTime: number;
  isPlaying: boolean;
  seekTrigger?: { time: number; ts: number } | null;
  onTimeUpdate: (time: number) => void;
  onPlayStateChange: (playing: boolean) => void;
  onSeek: (time: number) => void;
  playbackRate?: number;
  onPlaybackRateChange?: (rate: number) => void;
}

export const YouTubeSyncPlayer: React.FC<YouTubeSyncPlayerProps> = ({
  videoId,
  title,
  artist,
  currentTime,
  isPlaying,
  seekTrigger,
  onTimeUpdate,
  onPlayStateChange,
  onSeek,
  playbackRate = 1.0,
  onPlaybackRateChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isIframeLoaded, setIsIframeLoaded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [lastEmittedTime, setLastEmittedTime] = useState(0);
  const [playerStateText, setPlayerStateText] = useState<string>("Ready");
  const iframeId = `yt-sync-iframe-${videoId}`;

  // Helper to send postMessage commands to YouTube Iframe
  const sendYTCommand = useCallback((func: string, args: any[] = []) => {
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            event: "command",
            func,
            args,
          }),
          "*"
        );
      } catch (err) {
        console.warn("Failed to send postMessage to YouTube iframe:", err);
      }
    }
  }, []);

  // When iframe loads, establish listening handshake
  const handleIframeLoad = () => {
    setIsIframeLoaded(true);
    // Send listening handshake to YouTube API
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: "listening", id: iframeId }),
        "*"
      );
      // Sync initial playback rate
      if (playbackRate !== 1.0) {
        sendYTCommand("setPlaybackRate", [playbackRate]);
      }
    }
  };

  // Sync isPlaying state from parent to YouTube IFrame
  useEffect(() => {
    if (!isIframeLoaded) return;
    if (isPlaying) {
      sendYTCommand("playVideo");
    } else {
      sendYTCommand("pauseVideo");
    }
  }, [isPlaying, isIframeLoaded, sendYTCommand]);

  // Sync seek requests from parent (timeline click, drag, chord select)
  useEffect(() => {
    if (!isIframeLoaded || !seekTrigger) return;
    sendYTCommand("seekTo", [seekTrigger.time, true]);
    // If playing, ensure it continues
    if (isPlaying) {
      sendYTCommand("playVideo");
    }
  }, [seekTrigger, isIframeLoaded, sendYTCommand, isPlaying]);

  // Sync playback rate from parent
  useEffect(() => {
    if (!isIframeLoaded) return;
    sendYTCommand("setPlaybackRate", [playbackRate]);
  }, [playbackRate, isIframeLoaded, sendYTCommand]);

  // Listen to incoming messages from YouTube Iframe (window postMessage)
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      // Filter or parse YouTube messages
      try {
        let payload: any = event.data;
        if (typeof payload === "string") {
          try {
            payload = JSON.parse(payload);
          } catch {
            return;
          }
        }

        if (!payload || typeof payload !== "object") return;

        // YouTube infoDelivery events (delivers real-time currentTime & playerState)
        if (payload.event === "infoDelivery" && payload.info) {
          const info = payload.info;
          if (typeof info.currentTime === "number" && !isNaN(info.currentTime)) {
            setLastEmittedTime(info.currentTime);
            onTimeUpdate(info.currentTime);
          }

          if (typeof info.playerState === "number") {
            // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
            if (info.playerState === 1) {
              setPlayerStateText("Playing");
              onPlayStateChange(true);
            } else if (info.playerState === 2) {
              setPlayerStateText("Paused");
              onPlayStateChange(false);
            } else if (info.playerState === 0) {
              setPlayerStateText("Ended");
              onPlayStateChange(false);
            } else if (info.playerState === 3) {
              setPlayerStateText("Buffering");
            }
          }
        }

        // Direct state change events
        if (payload.event === "onStateChange") {
          const state = payload.info;
          if (state === 1) {
            setPlayerStateText("Playing");
            onPlayStateChange(true);
          } else if (state === 2 || state === 0) {
            setPlayerStateText(state === 0 ? "Ended" : "Paused");
            onPlayStateChange(false);
          } else if (state === 3) {
            setPlayerStateText("Buffering");
          }
        }
      } catch (err) {
        // ignore non-youtube messages
      }
    };

    window.addEventListener("message", handleWindowMessage);
    return () => {
      window.removeEventListener("message", handleWindowMessage);
    };
  }, [onTimeUpdate, onPlayStateChange]);

  // Active polling loop while playing to ensure timeline advances at 100ms precision
  useEffect(() => {
    if (!isPlaying || !isIframeLoaded) return;

    // Send get info requests to YouTube periodically
    const pollInterval = window.setInterval(() => {
      sendYTCommand("getCurrentTime");
    }, 100);

    return () => {
      window.clearInterval(pollInterval);
    };
  }, [isPlaying, isIframeLoaded, sendYTCommand]);

  // Local play/pause toggle from inside YouTube HUD
  const handleTogglePlay = () => {
    if (isPlaying) {
      sendYTCommand("pauseVideo");
      onPlayStateChange(false);
    } else {
      sendYTCommand("playVideo");
      onPlayStateChange(true);
    }
  };

  const handleToggleMute = () => {
    if (isMuted) {
      sendYTCommand("unMute");
      setIsMuted(false);
    } else {
      sendYTCommand("mute");
      setIsMuted(true);
    }
  };

  const handleRestart = () => {
    sendYTCommand("seekTo", [0, true]);
    onTimeUpdate(0);
    if (!isPlaying) {
      sendYTCommand("playVideo");
      onPlayStateChange(true);
    }
  };

  const thumbnailUrl = getYoutubeThumbnail(videoId, "hq");
  const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(
    window.location.origin
  )}&widgetid=1&autoplay=0&rel=0&modestbranding=1&playsinline=1&controls=1`;

  return (
    <div
      ref={containerRef}
      className="frosted-card rounded-3xl overflow-hidden border border-[#a3ff12]/40 shadow-[0_0_30px_rgba(163,255,18,0.15)] transition-all bg-[#070c02]"
    >
      {/* Header Bar */}
      <div className="bg-[#0a1204] px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#a3ff12]/20">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-red-600/20 text-red-500 flex items-center justify-center shrink-0 border border-red-500/40 shadow-sm">
            <Youtube className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-black text-[#a3ff12] uppercase tracking-wider">
                SYNCHRONIZED YOUTUBE VIDEO
              </span>
              <span className={`w-2 h-2 rounded-full ${isPlaying ? "bg-[#a3ff12] animate-ping" : "bg-zinc-500"}`} />
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-zinc-300 border border-white/10">
                {playerStateText}
              </span>
            </div>
            <p className="text-xs sm:text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
              {title || "YouTube Video"} {artist ? `— ${artist}` : ""}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {/* Direct Play/Pause Button in Top Bar */}
          <button
            onClick={handleTogglePlay}
            className={`px-3 py-1.5 rounded-xl font-mono text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
              isPlaying
                ? "bg-amber-400 hover:bg-amber-300 text-black"
                : "bg-[#a3ff12] hover:bg-[#92eb10] text-black"
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-black ml-0.5" />}
            <span>{isPlaying ? "PAUSE VIDEO" : "PLAY VIDEO"}</span>
          </button>

          {/* Restart Button */}
          <button
            onClick={handleRestart}
            className="p-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
            title="Restart Video from 0:00"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Playback speed selector */}
          {onPlaybackRateChange && (
            <div className="flex items-center bg-white/5 rounded-xl p-0.5 border border-white/10">
              {[0.75, 1.0, 1.25].map((rate) => (
                <button
                  key={rate}
                  onClick={() => onPlaybackRateChange(rate)}
                  className={`px-2 py-1 text-[10px] font-mono font-bold rounded-lg transition-colors ${
                    playbackRate === rate
                      ? "bg-[#a3ff12] text-black"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          )}

          {/* Mute button */}
          <button
            onClick={handleToggleMute}
            className="p-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {/* Expand / Minimize */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
            title={isExpanded ? "Collapse Video" : "Expand Video"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* External Link */}
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
            title="Open in YouTube (New Tab)"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Video Viewport (IFrame with Enable JS API) */}
      <div className={`relative w-full bg-black transition-all ${isExpanded ? "aspect-video max-h-[380px]" : "hidden"}`}>
        <iframe
          ref={iframeRef}
          id={iframeId}
          src={embedUrl}
          title={title || "YouTube Video"}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          onLoad={handleIframeLoad}
        />
      </div>

      {/* Collapsed Bar Mode */}
      {!isExpanded && (
        <div className="p-3 bg-[#0d1405] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {thumbnailUrl && (
              <img
                src={thumbnailUrl}
                alt="Thumbnail"
                className="w-14 h-9 object-cover rounded-lg border border-white/10"
              />
            )}
            <div>
              <p className="text-xs font-bold text-white">{title || "YouTube Audio Stream"}</p>
              <p className="text-[10px] font-mono text-[#a3ff12]">Timeline & Chords Synced to YouTube</p>
            </div>
          </div>
          <button
            onClick={handleTogglePlay}
            className="px-4 py-2 bg-[#a3ff12] hover:bg-[#92eb10] text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 font-mono shadow-lg transition-all cursor-pointer"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-black ml-0.5" />}
            {isPlaying ? "PAUSE" : "PLAY"}
          </button>
        </div>
      )}

      {/* Timeline sync helper tip banner */}
      <div className="bg-black/60 px-4 py-1.5 flex items-center justify-between text-[10px] font-mono text-zinc-400 border-t border-white/5">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-[#a3ff12]" />
          <span>Click play on video or use timeline/spacebar — chords sync in real-time</span>
        </span>
        <span className="text-[#a3ff12] font-bold">
          {Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60)).toString().padStart(2, "0")}
        </span>
      </div>
    </div>
  );
};
