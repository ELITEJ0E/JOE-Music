import React, { useEffect, useRef, useState, useCallback } from "react";
import { Youtube, Eye, EyeOff, Volume2, Maximize2 } from "lucide-react";

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

let apiLoadedPromise: Promise<any> | null = null;

function loadYouTubeIframeApi(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window is not available"));
  }

  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }

  if (apiLoadedPromise) {
    return apiLoadedPromise;
  }

  apiLoadedPromise = new Promise((resolve) => {
    const existing = document.getElementById("youtube-iframe-api-script");
    if (!existing) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api-script";
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }

    const previousOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousOnReady === "function") {
        previousOnReady();
      }
      resolve(window.YT);
    };
  });

  return apiLoadedPromise;
}

interface YouTubeSyncPlayerProps {
  videoId: string;
  isPlaying: boolean;
  onPlayStateChange: (playing: boolean) => void;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  seekTime: { time: number; timestamp: number } | number | null;
  playbackRate: number;
  isRepeating: boolean;
  showVideo: boolean;
  onToggleVideo: () => void;
  title?: string;
  artist?: string;
}

export const YouTubeSyncPlayer: React.FC<YouTubeSyncPlayerProps> = ({
  videoId,
  isPlaying,
  onPlayStateChange,
  onTimeUpdate,
  onDurationChange,
  seekTime,
  playbackRate,
  isRepeating,
  showVideo,
  onToggleVideo,
  title,
  artist,
}) => {
  const containerIdRef = useRef(`yt-sync-player-${Math.random().toString(36).slice(2, 9)}`);
  const playerRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const lastEmittedTimeRef = useRef(-1);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const isSeekingRef = useRef(false);
  const seekTimeoutRef = useRef<any>(null);

  // Initialize YT Player
  useEffect(() => {
    let isCancelled = false;

    loadYouTubeIframeApi()
      .then((YT) => {
        if (isCancelled) return;

        const container = document.getElementById(containerIdRef.current);
        if (!container) return;

        // Destroy previous player instance if any
        if (playerRef.current && typeof playerRef.current.destroy === "function") {
          try {
            playerRef.current.destroy();
          } catch {
            // ignore
          }
          playerRef.current = null;
        }

        try {
          const player = new YT.Player(containerIdRef.current, {
            videoId,
            width: "100%",
            height: "100%",
            playerVars: {
              autoplay: 0,
              controls: 0, // Hides native YouTube duration/progress slider and player controls
              disablekb: 1, // Disables YouTube internal keyboard shortcuts to prevent arrow key conflicts
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
              origin: window.location.origin,
              enablejsapi: 1,
              iv_load_policy: 3,
              fs: 0,
            },
            events: {
              onReady: (event: any) => {
                if (isCancelled) return;
                playerRef.current = event.target;
                setIsReady(true);
                setPlayerError(null);
                const dur = event.target.getDuration();
                if (dur && dur > 0) {
                  onDurationChange(dur);
                }
                event.target.setPlaybackRate(playbackRate);
              },
              onStateChange: (event: any) => {
                if (isCancelled) return;
                // YT.PlayerState: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering, 5=video cued
                if (event.data === 1) {
                  isSeekingRef.current = false;
                  onPlayStateChange(true);
                  const dur = event.target.getDuration();
                  if (dur && dur > 0) {
                    onDurationChange(dur);
                  }
                } else if (event.data === 2) {
                  // Only update play state if not in a transient buffering seek state
                  if (!isSeekingRef.current) {
                    onPlayStateChange(false);
                  }
                } else if (event.data === 0) {
                  if (isRepeating) {
                    event.target.seekTo(0, true);
                    event.target.playVideo();
                  } else {
                    onPlayStateChange(false);
                  }
                }
              },
              onError: (event: any) => {
                console.warn("[YouTube Player] Error code:", event.data);
                // 101/150: Not embeddable, 2: Invalid param, 5: HTML5 error
                if (event.data === 101 || event.data === 150) {
                  setPlayerError("Video playback restricted by owner from embedding.");
                } else {
                  setPlayerError("Playback error on YouTube stream.");
                }
              },
            },
          });
        } catch (err: any) {
          console.warn("Failed to instantiate YT.Player:", err?.message);
        }
      })
      .catch((err) => {
        console.warn("Failed to load YouTube IFrame API:", err);
      });

    return () => {
      isCancelled = true;
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      if (playerRef.current && typeof playerRef.current.destroy === "function") {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [videoId]);

  // Synchronize play/pause commands from parent UI to YouTube player
  useEffect(() => {
    if (!playerRef.current || !isReady) return;
    try {
      const state = playerRef.current.getPlayerState();
      if (isPlaying && state !== 1 && state !== 3) {
        playerRef.current.playVideo();
      } else if (!isPlaying && state === 1) {
        playerRef.current.pauseVideo();
      }
    } catch {
      // player might still be initializing
    }
  }, [isPlaying, isReady]);

  // Synchronize playback rate changes (0.75x slow-down practice)
  useEffect(() => {
    if (!playerRef.current || !isReady) return;
    try {
      playerRef.current.setPlaybackRate(playbackRate);
    } catch {
      // ignore
    }
  }, [playbackRate, isReady]);

  // Handle external seek jumps from timeline scrubber, arrow keys, and skip buttons
  useEffect(() => {
    if (!playerRef.current || !isReady || seekTime === null || seekTime === undefined) return;
    const targetSeconds = typeof seekTime === "object" ? seekTime.time : seekTime;
    if (typeof targetSeconds !== "number" || isNaN(targetSeconds)) return;

    try {
      isSeekingRef.current = true;
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = setTimeout(() => {
        isSeekingRef.current = false;
      }, 350);

      playerRef.current.seekTo(targetSeconds, true);
      lastEmittedTimeRef.current = targetSeconds;

      if (isPlayingRef.current) {
        playerRef.current.playVideo();
      }
    } catch (err) {
      console.warn("YouTube player seek error:", err);
    }
  }, [seekTime, isReady]);

  // Continuous high-resolution time sync loop while playing
  useEffect(() => {
    if (!isReady || !isPlaying) return;

    let animId: number;
    const pollTime = () => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
        try {
          const t = playerRef.current.getCurrentTime();
          if (typeof t === "number" && !isNaN(t) && Math.abs(t - lastEmittedTimeRef.current) > 0.02) {
            lastEmittedTimeRef.current = t;
            onTimeUpdate(t);
          }
        } catch {
          // ignore
        }
      }
      animId = requestAnimationFrame(pollTime);
    };

    animId = requestAnimationFrame(pollTime);
    return () => cancelAnimationFrame(animId);
  }, [isReady, isPlaying, onTimeUpdate]);

  return (
    <div className="w-full rounded-2xl overflow-hidden bg-black/60 border border-white/10 shadow-lg transition-all duration-300">
      {/* Player Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-gradient-to-r from-red-500/10 via-white/5 to-transparent border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-red-600/90 flex items-center justify-center text-white shrink-0 shadow-sm">
            <Youtube className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-mono font-bold text-zinc-200 tracking-wide truncate">
            YouTube Audio & Video Sync
          </span>
          <span className="text-[9.5px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold shrink-0">
            JOE UI Controlled • Zero Conflicts
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleVideo}
            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-[11px] font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
            title={showVideo ? "Switch to Audio-Only Mode" : "Show Video Player"}
          >
            {showVideo ? (
              <>
                <EyeOff className="w-3 h-3 text-zinc-400" />
                <span className="hidden sm:inline">Hide Video</span>
              </>
            ) : (
              <>
                <Eye className="w-3 h-3 text-[#a3ff12]" />
                <span className="hidden sm:inline">Show Video</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Video Viewport / Hidden Audio Carrier */}
      <div
        className={`relative transition-all duration-300 ease-in-out ${
          showVideo
            ? "w-full aspect-video max-h-[340px] bg-black"
            : "h-[0px] opacity-0 overflow-hidden pointer-events-none"
        }`}
      >
        <div id={containerIdRef.current} className="w-full h-full" />
      </div>

      {/* Audio-only mode minimal indicator when video is hidden */}
      {!showVideo && (
        <div className="px-4 py-2.5 flex items-center justify-between bg-black/40 text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-2 truncate">
            <Volume2 className="w-3.5 h-3.5 text-[#a3ff12] shrink-0 animate-pulse" />
            <span className="truncate text-zinc-300">
              {title || "YouTube Track"} {artist ? `— ${artist}` : ""}
            </span>
          </div>
          <span className="text-[10px] text-zinc-500 shrink-0 ml-2">
            Audio synced with timeline
          </span>
        </div>
      )}

      {playerError && (
        <div className="p-2 bg-amber-500/15 border-t border-amber-500/30 text-[11px] font-mono text-amber-300 px-3 text-center">
          {playerError} Chords are still actively transcribed and playable below.
        </div>
      )}
    </div>
  );
};
