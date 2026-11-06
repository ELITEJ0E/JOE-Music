import { extractYouTubeVideoId } from "./extractorConfig";
import type { SavedSong } from "../types";

export interface VerifiedChordPayload {
  success: boolean;
  verified: boolean;
  videoId: string;
  source: string;
  engineVersion: string;
  song: SavedSong;
}

/**
 * Reads only curated audio-derived analyses from the shared Cloudflare D1 API.
 * No static guessed progressions or unverified browser-written cache fallbacks.
 */
export async function fetchVerifiedYouTubeChords(
  urlOrVideoId: string,
  signal?: AbortSignal
): Promise<SavedSong | null> {
  const videoId = extractYouTubeVideoId(urlOrVideoId) ||
    (/^[a-zA-Z0-9_-]{11}$/.test(urlOrVideoId.trim()) ? urlOrVideoId.trim() : null);
  if (!videoId) return null;

  try {
    const res = await fetch(`/api/verified-chords?videoId=${encodeURIComponent(videoId)}`, { signal });
    if (!res.ok) return null;
    const data: VerifiedChordPayload = await res.json();
    if (data?.verified && data.song?.analysisSource === "audio" &&
        Array.isArray(data.song.chordSegments) && data.song.chordSegments.length > 0) {
      return data.song;
    }
  } catch (err: any) {
    if (err?.name === "AbortError" || signal?.aborted) throw err;
    console.warn("[Verified Chords] Library lookup unavailable:", err?.message || err);
  }
  return null;
}

/**
 * Public users may keep analyses locally, but must not publish themselves into
 * a globally trusted library. The owner curates songs via the authenticated API.
 */
export async function publishVerifiedYouTubeChords(_song: SavedSong): Promise<boolean> {
  return false;
}
