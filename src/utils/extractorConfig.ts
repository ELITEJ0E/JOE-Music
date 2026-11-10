/**
 * Configuration and client for the external YouTube audio extraction backend.
 * Live extractor: blitz.cloud via Vercel same-origin rewrite in production.
 */

export const DEFAULT_EXTRACTOR_API = "https://chord-extractor.joel-tan.prod.page";

export interface YouTubeOEmbedData {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
}

/**
 * Fetches standard video metadata (title, author, thumbnail) via official YouTube oEmbed.
 * Only fetches metadata; this does not expose audio samples or chords.
 */
export async function fetchYouTubeOEmbed(url: string): Promise<YouTubeOEmbedData | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url.trim())}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("[YouTube oEmbed] Metadata fetch warning:", err);
  }
  return null;
}

/**
 * Returns the configured extractor backend base URL without trailing slashes.
 */
export function getExtractorApiUrl(): string {
  // Production browser requests use Vercel's rewrite to avoid cross-origin
  // restrictions and preserve the same /extract API contract.
  if (typeof window !== "undefined" &&
      !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return "/api/youtube";
  }
  const envUrl =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_EXTRACTOR_API) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_AUDIO_EXTRACTOR_URL) ||
    "";
  return typeof envUrl === "string" && envUrl.trim()
    ? envUrl.trim().replace(/\\/+$/, "")
    : DEFAULT_EXTRACTOR_API;
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
 * Returns high-quality thumbnail URL for a YouTube URL or video ID.
 */
export function getYouTubeThumbnailUrl(urlOrVideoId: string): string {
  if (!urlOrVideoId || typeof urlOrVideoId !== "string") return "";
  const trimmed = urlOrVideoId.trim();
  const videoId = extractYouTubeVideoId(trimmed) || (/^[a-zA-Z0-9_-]{11}$/.test(trimmed) ? trimmed : null);
  if (videoId) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }
  return "";
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
 * Pings the configured YouTube audio backend.
 */
export async function pingExtractorWarmup(options?: WarmupOptions): Promise<boolean> {
  const baseUrl = (options?.baseUrl || getExtractorApiUrl()).replace(/\/+$/, "");
  if (!baseUrl) return false;
  const signal = options?.signal;
  const onStateChange = options?.onStateChange;
  const timeoutMs = options?.timeoutMs || 45000;

  onStateChange?.("connecting", "Connecting to audio extractor...");

  let warmupTimer: any = null;
  // Free-tier hosts may need additional time after inactivity.
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
  thumbnailUrl?: string;
  imageUrl?: string;
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

export type ExtractorErrorCode =
  | "YOUTUBE_RATE_LIMITED"
  | "YOUTUBE_BOT_CHALLENGE"
  | "YOUTUBE_HTTP_403"
  | "VIDEO_TOO_LONG"
  | "VIDEO_UNAVAILABLE"
  | "NETWORK_ERROR"
  | "EXTRACTION_FAILED";

export class YouTubeExtractionError extends Error {
  code: ExtractorErrorCode;
  stage: "connecting" | "audio_retrieval" | "conversion";
  retryable: boolean;
  source: "render_backend" | "vercel_proxy" | "client_network";
  status?: number;

  constructor(
    code: ExtractorErrorCode,
    message: string,
    options?: {
      stage?: "connecting" | "audio_retrieval" | "conversion";
      retryable?: boolean;
      source?: "render_backend" | "vercel_proxy" | "client_network";
      status?: number;
    }
  ) {
    super(message);
    this.name = "YouTubeExtractionError";
    this.code = code;
    this.stage = options?.stage || "audio_retrieval";
    this.retryable = options?.retryable ?? false;
    this.source = options?.source || "render_backend";
    this.status = options?.status;
  }
}

/**
 * Extracts audio from the configured backend for actual harmonic analysis.
 * Implements request locking, cold-start detection, and stage progress reporting.
 */
export async function extractYouTubeAudio(
  url: string,
  optionsOrSignal?: AbortSignal | ExtractYouTubeOptions,
  legacyBaseUrl?: string
): Promise<ExtractedYouTubeResult> {
  if (!isValidYouTubeUrl(url)) {
    throw new YouTubeExtractionError(
      "EXTRACTION_FAILED",
      "Invalid YouTube URL. Please enter a valid YouTube video link.",
      { stage: "connecting" }
    );
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
    if (!apiBase) {
      throw new YouTubeExtractionError("EXTRACTION_FAILED", "No automatic YouTube audio backend is configured. Use curated chord data or an authorized audio upload.");
    }
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
      console.warn("[YouTube Extractor] Backend request failed:", err?.message || err);
      // If same-origin proxy or custom baseUrl failed, try direct DEFAULT_EXTRACTOR_API as secondary attempt
      if (DEFAULT_EXTRACTOR_API && endpoint !== `${DEFAULT_EXTRACTOR_API}/extract`) {
        try {
          response = await fetch(`${DEFAULT_EXTRACTOR_API}/extract`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: normalizedUrl }),
            signal,
          });
        } catch (fallbackErr: any) {
          if (fallbackErr.name === "AbortError") throw fallbackErr;
          console.error("[YouTube Extractor] Fallback network request failed:", fallbackErr);
          throw new YouTubeExtractionError(
            "NETWORK_ERROR",
            "Unable to reach the YouTube audio extractor backend. The server may be waking up from cold start or temporarily offline. You can upload an authorized audio file directly.",
            { stage: "connecting", retryable: true, source: "client_network" }
          );
        }
      } else {
        throw new YouTubeExtractionError(
          "NETWORK_ERROR",
          "Unable to reach the YouTube audio extractor backend. The server may be waking up from cold start or temporarily offline. You can upload an authorized audio file directly.",
          { stage: "connecting", retryable: true, source: "client_network" }
        );
      }
    }

    if (!response.ok) {
      let detailMsg = "";
      let errCode = "";
      try {
        const errJson = await response.json();
        if (errJson.code) errCode = errJson.code;
        if (errJson.message) detailMsg = errJson.message;
        else if (errJson.error) detailMsg = errJson.error;
      } catch (_) {}

      const isBotChallenge =
        errCode === "YOUTUBE_BOT_CHALLENGE" ||
        detailMsg.includes("Sign in to confirm you're not a bot") ||
        detailMsg.includes("Sign in to confirm you’re not a bot") ||
        detailMsg.includes("bot verification") ||
        detailMsg.includes("Failed to extract any player response");

      const isRateLimited =
        response.status === 429 ||
        errCode === "YOUTUBE_RATE_LIMITED" ||
        detailMsg.includes("429") ||
        detailMsg.includes("Too Many Requests") ||
        detailMsg.includes("rate-limiting");

      const isForbidden = response.status === 403 || errCode === "YOUTUBE_HTTP_403";

      if (isBotChallenge) {
        throw new YouTubeExtractionError(
          "YOUTUBE_BOT_CHALLENGE",
          "YouTube bot verification is required for automated cloud downloads. Because the YouTube iframe player API cannot supply decoded audio samples across origins, you can upload an authorized audio file to analyze chords accurately.",
          { stage: "audio_retrieval", retryable: false, source: "vercel_proxy", status: response.status }
        );
      }

      if (isRateLimited) {
        throw new YouTubeExtractionError(
          "YOUTUBE_RATE_LIMITED",
          "YouTube is temporarily restricting automated audio streams from this cloud IP (HTTP 429 Rate Limit). Because the YouTube iframe player cannot provide raw audio samples, upload the song's audio file directly for instant harmonic analysis.",
          { stage: "audio_retrieval", retryable: false, source: "vercel_proxy", status: 429 }
        );
      }

      if (isForbidden) {
        throw new YouTubeExtractionError(
          "YOUTUBE_HTTP_403",
          "YouTube streaming access was forbidden (HTTP 403). Uploading an authorized audio file allows instant chord analysis.",
          { stage: "audio_retrieval", retryable: false, source: "vercel_proxy", status: 403 }
        );
      }

      if (response.status === 400) {
        throw new YouTubeExtractionError(
          "EXTRACTION_FAILED",
          "Invalid YouTube URL provided. Please check the video link and try again.",
          { stage: "audio_retrieval", retryable: false, status: 400 }
        );
      }

      if (response.status === 413) {
        throw new YouTubeExtractionError(
          "VIDEO_TOO_LONG",
          "This video exceeds the 10-minute extraction limit. Please select a shorter video or upload the audio directly.",
          { stage: "audio_retrieval", retryable: false, status: 413 }
        );
      }

      throw new YouTubeExtractionError(
        "EXTRACTION_FAILED",
        detailMsg || "Unable to extract audio from this YouTube video. The video may be private, age-restricted, or region-blocked.",
        { stage: "audio_retrieval", retryable: false, status: response.status }
      );
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

    const thumbUrl = getYouTubeThumbnailUrl(normalizedUrl) || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined);

    return {
      blob,
      title,
      artist,
      videoId: videoId || undefined,
      thumbnailUrl: thumbUrl,
      imageUrl: thumbUrl,
    };
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

