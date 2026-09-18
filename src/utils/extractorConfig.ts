/**
 * Configuration and client for the external YouTube audio extraction backend.
 * Default backend URL: https://chord-extractor-7agu.onrender.com
 */

export const DEFAULT_EXTRACTOR_API = "https://chord-extractor-7agu.onrender.com";

/**
 * Returns the configured extractor backend base URL without trailing slashes.
 */
export function getExtractorApiUrl(): string {
  const envUrl =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_EXTRACTOR_API) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_AUDIO_EXTRACTOR_URL) ||
    (typeof process !== "undefined" && (process.env?.VITE_EXTRACTOR_API || process.env?.VITE_AUDIO_EXTRACTOR_URL || process.env?.AUDIO_EXTRACTOR_URL));

  if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
    const trimmed = envUrl.trim().replace(/\/+$/, "");
    // Automatically fallback to active Render service if an outdated/inaccessible Railway URL is set in environment variables
    if (trimmed.includes("chord-extractor-production.up.railway.app") || trimmed.includes("railway.app")) {
      return DEFAULT_EXTRACTOR_API;
    }
    return trimmed;
  }
  return DEFAULT_EXTRACTOR_API;
}

/**
 * Extracts the 11-character YouTube video ID from various YouTube URL formats.
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

  // youtu.be/<id>
  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (shortMatch) return shortMatch[1];

  // youtube.com/(shorts|embed|v)/<id>
  const pathMatch = trimmed.match(/youtube\.com\/(?:shorts|embed|v)\/([a-zA-Z0-9_-]{11})/i);
  if (pathMatch) return pathMatch[1];

  // youtube.com/watch?v=<id> or watch?...&v=<id>
  const queryMatch = trimmed.match(/youtube\.com\/watch\?[^#]*\bv=([a-zA-Z0-9_-]{11})/i);
  if (queryMatch) return queryMatch[1];

  return null;
}

/**
 * Normalizes any YouTube URL variant to a standard canonical watch URL.
 */
export function normalizeYouTubeUrl(url: string): string {
  if (!url || typeof url !== "string") return "";
  const videoId = extractYouTubeVideoId(url);
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  return url.trim();
}

/**
 * Validates whether a string is a valid YouTube video URL.
 */
export function isValidYouTubeUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const videoId = extractYouTubeVideoId(url);
  if (videoId) return true;
  const trimmed = url.trim();
  const generalYt = /^(https?:\/\/)?((www|m)\.)?(youtube\.com|youtu\.be)\//i;
  return generalYt.test(trimmed);
}

export type ExtractorWarmupState = "connecting" | "starting" | "ready" | "error";

export interface WarmupOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onStateChange?: (state: ExtractorWarmupState, message: string) => void;
  baseUrl?: string;
}

/**
 * Pings the Render audio extractor backend root to detect cold starts and warm up the service.
 */
export async function pingExtractorWarmup(options?: WarmupOptions): Promise<boolean> {
  const baseUrl = (options?.baseUrl || getExtractorApiUrl()).replace(/\/+$/, "");
  const signal = options?.signal;
  const onStateChange = options?.onStateChange;
  const timeoutMs = options?.timeoutMs || 45000;

  onStateChange?.("connecting", "Connecting to audio extractor...");

  let warmupTimer: any = null;
  // If connection takes more than 2.5 seconds, Render is likely undergoing a cold start
  if (onStateChange) {
    warmupTimer = setTimeout(() => {
      onStateChange("starting", "Starting extractor server (first load may take a moment)...");
    }, 2500);
  }

  const abortCtrl = new AbortController();
  const timer = setTimeout(() => abortCtrl.abort(), timeoutMs);

  const combinedSignal = signal
    ? (typeof AbortSignal.any === "function" ? AbortSignal.any([signal, abortCtrl.signal]) : signal)
    : abortCtrl.signal;

  try {
    const res = await fetch(`${baseUrl}/`, {
      method: "GET",
      signal: combinedSignal,
    });
    clearTimeout(timer);
    if (warmupTimer) clearTimeout(warmupTimer);

    if (res.ok || res.status === 404 || res.status === 200) {
      onStateChange?.("ready", "Extractor server ready.");
      return true;
    }
    return false;
  } catch (err: any) {
    clearTimeout(timer);
    if (warmupTimer) clearTimeout(warmupTimer);
    if (err.name === "AbortError" && signal?.aborted) {
      throw err;
    }
    console.warn("[YouTube Extractor] Warmup ping notice:", err?.message || err);
    onStateChange?.("error", "Extractor server warmup notice.");
    return false;
  }
}

export interface ExtractedYouTubeResult {
  blob: Blob;
  title: string;
  artist: string;
  videoId?: string;
}

export interface ExtractProgressEvent {
  stage: "connecting" | "starting" | "downloading" | "analyzing";
  message: string;
  pct?: number;
}

export interface ExtractYouTubeOptions {
  signal?: AbortSignal;
  baseUrl?: string;
  onProgress?: (event: ExtractProgressEvent) => void;
  skipWarmup?: boolean;
}

// Global in-flight extraction request lock map to prevent duplicate network calls
const inFlightExtractions = new Map<string, Promise<ExtractedYouTubeResult>>();

/**
 * Returns whether an extraction is currently in flight for a given URL (or globally).
 */
export function isExtractionInFlight(url?: string): boolean {
  if (!url) return inFlightExtractions.size > 0;
  const videoId = extractYouTubeVideoId(url);
  const lockKey = videoId ? `yt:${videoId}` : normalizeYouTubeUrl(url);
  return inFlightExtractions.has(lockKey);
}

/**
 * Returns the count of active extraction requests in flight.
 */
export function getActiveExtractionCount(): number {
  return inFlightExtractions.size;
}

/**
 * Calls the Render YouTube extraction backend to extract audio as MP3 Blob.
 * Implements request locking, cold-start detection, and stage progress reporting.
 */
export async function extractYouTubeAudio(
  url: string,
  optionsOrSignal?: AbortSignal | ExtractYouTubeOptions,
  legacyBaseUrl?: string
): Promise<ExtractedYouTubeResult> {
  if (!isValidYouTubeUrl(url)) {
    throw new Error("Invalid YouTube URL. Please enter a valid YouTube video link.");
  }

  // Parse options supporting both legacy signature and options object
  let signal: AbortSignal | undefined;
  let baseUrl = legacyBaseUrl;
  let onProgress: ((event: ExtractProgressEvent) => void) | undefined;
  let skipWarmup = false;

  if (optionsOrSignal instanceof AbortSignal) {
    signal = optionsOrSignal;
  } else if (optionsOrSignal && typeof optionsOrSignal === "object") {
    signal = optionsOrSignal.signal;
    baseUrl = optionsOrSignal.baseUrl || baseUrl;
    onProgress = optionsOrSignal.onProgress;
    skipWarmup = !!optionsOrSignal.skipWarmup;
  }

  const normalizedUrl = normalizeYouTubeUrl(url);
  const videoId = extractYouTubeVideoId(url);
  const lockKey = videoId ? `yt:${videoId}` : normalizedUrl;

  // Request Locking: If a request for this YouTube URL is already in-flight, reuse it
  if (inFlightExtractions.has(lockKey)) {
    return inFlightExtractions.get(lockKey)!;
  }

  const extractionPromise = (async () => {
    const apiBase = (baseUrl || getExtractorApiUrl()).replace(/\/+$/, "");
    const endpoint = `${apiBase}/extract`;

    // 1. Warm-up stage (Connecting / Cold-Start Detection)
    if (!skipWarmup && onProgress) {
      onProgress({ stage: "connecting", message: "Connecting to audio extractor...", pct: 10 });
    }

    // 2. Download audio extraction from backend
    if (onProgress) {
      onProgress({ stage: "downloading", message: "Downloading audio...", pct: 25 });
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: normalizedUrl }),
        signal,
      });
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw err;
      }
      console.error("[YouTube Extractor] Network request failed:", err);
      throw new Error(
        "Unable to reach the YouTube audio extractor. The server may be starting up or temporarily offline. Please try again in a few moments."
      );
    }

    if (!response.ok) {
      if (response.status === 400) {
        throw new Error("Invalid YouTube URL provided. Please check the video link and try again.");
      }
      if (response.status === 413) {
        throw new Error("This video is too long. The YouTube audio extractor has a 10-minute maximum limit.");
      }
      if (response.status === 500) {
        throw new Error(
          "Unable to extract audio from this YouTube video. The video may be private, age-restricted, region-blocked, or unavailable."
        );
      }

      let detailMsg = "";
      try {
        const errJson = await response.json();
        if (errJson.error) detailMsg = errJson.error;
      } catch (_) {}

      throw new Error(detailMsg || "Unable to extract this YouTube video. Please try another URL.");
    }

    const rawTitle = response.headers.get("X-Video-Title");
    const rawArtist = response.headers.get("X-Video-Artist");

    let title = "YouTube Track";
    if (rawTitle) {
      try {
        title = decodeURIComponent(rawTitle).trim();
      } catch {
        title = rawTitle.trim();
      }
    }

    let artist = "";
    if (rawArtist) {
      try {
        artist = decodeURIComponent(rawArtist).trim();
      } catch {
        artist = rawArtist.trim();
      }
    }

    // Clean title noise commonly found in YouTube uploads
    title = title
      .replace(/\(Official (Music )?Video\)/gi, "")
      .replace(/\[Official (Music )?Video\]/gi, "")
      .replace(/\(Audio\)/gi, "")
      .replace(/\[Audio\]/gi, "")
      .replace(/\(Lyric Video\)/gi, "")
      .replace(/\[Lyric Video\]/gi, "")
      .replace(/\(Visualizer\)/gi, "")
      .trim();

    let blob: Blob;
    try {
      blob = await response.blob();
    } catch (err: any) {
      throw new Error("Failed to read audio stream from the extraction server.");
    }

    if (!blob || blob.size === 0) {
      throw new Error("Unable to extract this YouTube video. Please try another URL.");
    }

    return { blob, title, artist, videoId: videoId || undefined };
  })();

  // Register in-flight lock
  inFlightExtractions.set(lockKey, extractionPromise);

  try {
    const result = await extractionPromise;
    return result;
  } finally {
    // Release in-flight lock once completed or failed
    inFlightExtractions.delete(lockKey);
  }
}

