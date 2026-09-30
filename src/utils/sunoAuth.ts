import { SunoPlaylistResponse, SunoTrack, SUNO_PLAYLIST_ALIASES } from "../lib/suno-playlists";
import { SUNO_CATALOG_MASTER } from "../lib/suno-catalog-data";

const TOKEN_KEY = "joel_suno_session_token";
const COOKIE_KEY = "joel_suno_session_cookie";
const CUSTOM_CATALOG_KEY = "joel_custom_suno_catalog_v2";

export function getStoredSunoToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setStoredSunoToken(token: string): void {
  if (typeof window === "undefined") return;
  if (token.trim()) {
    localStorage.setItem(TOKEN_KEY, token.trim());
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getStoredSunoCookie(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(COOKIE_KEY) || "";
}

export function setStoredSunoCookie(cookie: string): void {
  if (typeof window === "undefined") return;
  if (cookie.trim()) {
    localStorage.setItem(COOKIE_KEY, cookie.trim());
  } else {
    localStorage.removeItem(COOKIE_KEY);
  }
}

export function getCustomImportedCatalog(): Record<string, SunoPlaylistResponse> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CUSTOM_CATALOG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore parse errors
  }
  return {};
}

export function saveCustomImportedPlaylist(playlistId: string, data: SunoPlaylistResponse): void {
  if (typeof window === "undefined") return;
  try {
    const current = getCustomImportedCatalog();
    const normalized = SUNO_PLAYLIST_ALIASES[playlistId.trim()] || playlistId.trim();
    current[normalized] = data;
    localStorage.setItem(CUSTOM_CATALOG_KEY, JSON.stringify(current));
  } catch {
    // Ignore quota errors
  }
}

export interface SunoSyncResult {
  success: boolean;
  count: number;
  message: string;
  data?: SunoPlaylistResponse;
  isOwner?: boolean;
}

/**
 * Direct sync with optional credentials or JSON payload
 */
export async function syncSunoPlaylistWithOwner(
  playlistId: string,
  options?: {
    token?: string;
    cookie?: string;
    rawJson?: string;
  }
): Promise<SunoSyncResult> {
  const normalizedId = SUNO_PLAYLIST_ALIASES[playlistId.trim()] || playlistId.trim();
  const token = options?.token ?? getStoredSunoToken();
  const cookie = options?.cookie ?? getStoredSunoCookie();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    const cleanToken = token.replace(/^Bearer\s+/i, "").trim();
    headers["Authorization"] = `Bearer ${cleanToken}`;
    headers["x-suno-token"] = cleanToken;
  }
  if (cookie) {
    headers["x-suno-cookie"] = cookie.trim();
  }

  try {
    const res = await fetch(`/api/suno-playlist?id=${encodeURIComponent(normalizedId)}&_t=${Date.now()}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: normalizedId,
        sunoToken: token,
        sunoCookie: cookie,
        rawJson: options?.rawJson,
        forceRefresh: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Sync returned HTTP ${res.status}`);
    }

    const data: SunoPlaylistResponse & { isOwnerAuthenticated?: boolean } = await res.json();
    if (data?.tracks && data.tracks.length > 0) {
      saveCustomImportedPlaylist(normalizedId, data);
      return {
        success: true,
        count: data.tracks.length,
        message: `Successfully synced ${data.tracks.length} songs from Suno${token || cookie || options?.rawJson ? " (Owner Mode)" : ""}!`,
        data,
        isOwner: Boolean(token || cookie || data.isOwnerAuthenticated),
      };
    }
    throw new Error("No tracks returned");
  } catch (err: any) {
    return {
      success: false,
      count: 0,
      message: err?.message || "Sync failed",
    };
  }
}
