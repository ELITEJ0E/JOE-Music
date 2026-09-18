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
    return envUrl.trim().replace(/\/+$/, "");
  }
  return DEFAULT_EXTRACTOR_API;
}

/**
 * Validates whether a string is a valid YouTube video URL.
 */
export function isValidYouTubeUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  // Checks for youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, youtube.com/embed/, or general youtube domain
  const ytRegex = /^(https?:\/\/)?((www|m)\.)?(youtube\.com\/(watch\?.*v=|shorts\/|embed\/|v\/)|youtu\.be\/)[\w-]{11}/i;
  const generalYt = /^(https?:\/\/)?((www|m)\.)?(youtube\.com|youtu\.be)\//i;
  return ytRegex.test(trimmed) || generalYt.test(trimmed);
}

export interface ExtractedYouTubeResult {
  blob: Blob;
  title: string;
  artist: string;
}

/**
 * Calls the Render YouTube extraction backend to extract audio as MP3 Blob.
 */
export async function extractYouTubeAudio(
  url: string,
  signal?: AbortSignal,
  baseUrl?: string
): Promise<ExtractedYouTubeResult> {
  if (!isValidYouTubeUrl(url)) {
    throw new Error("Invalid YouTube URL. Please enter a valid YouTube video link.");
  }

  const endpoint = `${(baseUrl || getExtractorApiUrl()).replace(/\/+$/, "")}/extract`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: url.trim() }),
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

  return { blob, title, artist };
}
