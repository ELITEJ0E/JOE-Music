import { useState, useEffect, useCallback, useRef } from "react";
import { SunoPlaylistResponse, SunoTrack, SUNO_PLAYLIST_ALIASES } from "../lib/suno-playlists";
import { SUNO_CATALOG_MASTER } from "../lib/suno-catalog-data";

interface CachedEntry {
  data: SunoPlaylistResponse;
  timestamp: number;
}

export interface UseSunoPlaylistResult {
  playlist: SunoPlaylistResponse | null;
  tracks: SunoTrack[];
  isLoading: boolean;
  isSyncing: boolean;
  isLoadingMore: boolean;
  error: string | null;
  lastSynced: number | null;
  page: number;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

const LOCAL_STORAGE_PREFIX = "guitar_studio_suno_cache_";
const MEMORY_CACHE = new Map<string, CachedEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes fresh window
const SYNCED_PLAYLISTS = new Set<string>();

/**
 * Synchronously retrieves cached playlist from Memory Map, LocalStorage, or Master Catalog.
 * Guarantees instantaneous song display with zero empty state flicker.
 */
export function getCachedPlaylist(playlistId: string): SunoPlaylistResponse {
  if (!playlistId) {
    const defaultMaster = SUNO_CATALOG_MASTER["ff247038-e0ae-4778-989d-0529e575027b"];
    return defaultMaster;
  }

  const normalizedId = SUNO_PLAYLIST_ALIASES[playlistId.trim()] || playlistId.trim();

  // 1. Check in-memory map
  const mem = MEMORY_CACHE.get(normalizedId);
  if (mem?.data?.tracks && mem.data.tracks.length > 0) {
    return mem.data;
  }

  // 2. Check persistent browser LocalStorage
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${normalizedId}`);
      if (raw) {
        const parsed: CachedEntry = JSON.parse(raw);
        if (parsed?.data?.tracks && parsed.data.tracks.length > 0) {
          // Sanitize any stale cdn1.suno.ai or forbidden URLs from legacy cache
          parsed.data.tracks = parsed.data.tracks.map((t: SunoTrack) => {
            if (!t.audioUrl || t.audioUrl.includes("cdn1.suno.ai") || t.audioUrl.includes("forbidden")) {
              const fixedUrl = `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${t.id}.m4a`;
              return { ...t, audioUrl: fixedUrl, audio_url: fixedUrl };
            }
            return t;
          });
          MEMORY_CACHE.set(normalizedId, parsed);
          return parsed.data;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  // 3. Fallback to pre-bundled Master Catalog (contains all 92+ songs)
  const master = SUNO_CATALOG_MASTER[normalizedId] || SUNO_CATALOG_MASTER["ff247038-e0ae-4778-989d-0529e575027b"];
  if (master?.tracks && master.tracks.length > 0) {
    MEMORY_CACHE.set(normalizedId, { data: master, timestamp: Date.now() });
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${normalizedId}`, JSON.stringify({ data: master, timestamp: Date.now() }));
      } catch {
        // Ignore quota errors
      }
    }
    return master;
  }

  return {
    id: normalizedId,
    name: "Joel's Music",
    title: "Joel's Music",
    description: "Original Songs & Arrangements",
    tracks: [],
    totalTracks: 0,
    hasMore: false,
  };
}

/**
 * Persists playlist data to both in-memory Map and LocalStorage.
 */
function savePlaylistToCache(playlistId: string, data: SunoPlaylistResponse): void {
  const normalizedId = SUNO_PLAYLIST_ALIASES[playlistId.trim()] || playlistId.trim();
  const entry: CachedEntry = { data, timestamp: Date.now() };

  MEMORY_CACHE.set(normalizedId, entry);

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${normalizedId}`, JSON.stringify(entry));
    } catch {
      // Ignore storage errors
    }
  }
}

/**
 * Client-side direct CORS proxies fallback if Vercel /api/suno-playlist is unavailable
 */
async function fetchViaClientProxies(targetId: string): Promise<SunoPlaylistResponse | null> {
  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(`https://studio-api.prod.suno.com/api/playlist/${targetId}/?page=1`)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://studio-api.prod.suno.com/api/playlist/${targetId}/?page=1`)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(`https://studio-api.prod.suno.com/api/playlist/${targetId}/?page=1`)}`
  ];

  for (const proxyUrl of proxies) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) continue;

      let json: any;
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        json = parsed.contents ? JSON.parse(parsed.contents) : parsed;
      } catch {
        continue;
      }

      const clips = json.playlist_clips || json.clips || [];
      if (clips.length > 0) {
        const tracks: SunoTrack[] = clips.map((c: any) => {
          const clip = c.clip || c;
          const clipId = clip.id || `trk-${Math.random().toString(36).slice(2, 9)}`;
          const rawMedia = Array.isArray(clip.media_urls) && clip.media_urls.length > 0
            ? (clip.media_urls.find((m: any) => m.url && !m.url.includes("forbidden") && !m.url.includes("cdn1.suno.ai"))?.url || clip.media_urls[0]?.url)
            : null;
          const audioUrl = rawMedia || (clip.audio_url && !clip.audio_url.includes("forbidden") && !clip.audio_url.includes("cdn1.suno.ai") ? clip.audio_url : `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`);
          const imageUrl = clip.image_large_url || clip.image_url || `https://cdn2.suno.ai/image_${clipId}.jpeg`;
          return {
            id: clipId,
            title: clip.title || "Untitled Track",
            artist: clip.display_name || json.user_display_name || "ELITEJOE",
            album: json.name || "Joel's Music",
            duration: Math.round(clip.metadata?.duration || clip.duration || 185),
            audioUrl: audioUrl,
            imageUrl: imageUrl,
            lyrics: clip.metadata?.prompt || clip.prompt || clip.lyrics || "",
            tags: ["Guitar", "Original"],
            createdAt: clip.created_at || new Date().toISOString()
          };
        });

        return {
          id: targetId,
          name: json.name || "Joel's Music",
          title: json.name || "Joel's Music",
          description: json.description || "Original Music Collection",
          imageUrl: json.image_url || (tracks[0]?.imageUrl) || "",
          userDisplayName: json.user_display_name || "ELITEJOE",
          tracks: tracks,
          totalTracks: json.num_total_results || tracks.length,
          hasMore: false
        };
      }
    } catch {
      // try next proxy
    }
  }

  return null;
}

export function useSunoPlaylist(playlistId: string): UseSunoPlaylistResult {
  // 1. Instantly initialize state from synchronous cache (never shows 0 songs!)
  const [playlist, setPlaylist] = useState<SunoPlaylistResponse | null>(() => getCachedPlaylist(playlistId));
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(() => !playlist || playlist.tracks.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<number | null>(() => {
    const normalized = SUNO_PLAYLIST_ALIASES[playlistId?.trim()] || playlistId?.trim();
    return MEMORY_CACHE.get(normalized)?.timestamp || null;
  });
  const [page, setPage] = useState<number>(1);

  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Background Fetch & Resync Engine
   * Updates state seamlessly when new data arrives without flickering 0 songs
   */
  const fetchPlaylistData = useCallback(
    async (targetPage: number = 1, append: boolean = false, forceRefresh: boolean = false) => {
      if (!playlistId) return;

      const normalizedId = SUNO_PLAYLIST_ALIASES[playlistId.trim()] || playlistId.trim();

      if (append) {
        setIsLoadingMore(true);
      } else {
        // If we don't have tracks, show loading; otherwise, background sync
        const currentTracksCount = playlist?.tracks?.length || 0;
        if (currentTracksCount === 0) {
          setIsLoading(true);
        } else {
          setIsSyncing(true);
        }
      }
      setError(null);

      try {
        const cacheBuster = forceRefresh ? `&_t=${Date.now()}` : "";
        const res = await fetch(`/api/suno-playlist?id=${encodeURIComponent(normalizedId)}&page=${targetPage}${cacheBuster}`);
        
        const contentType = res.headers.get("content-type") || "";
        if (!res.ok || !contentType.includes("application/json")) {
          throw new Error(`Endpoint returned status ${res.status}`);
        }

        const data: SunoPlaylistResponse = await res.json();

        if (isMountedRef.current && data?.tracks && data.tracks.length > 0) {
          savePlaylistToCache(normalizedId, data);
          setLastSynced(Date.now());

          setPlaylist((prev) => {
            if (!prev || !append) {
              return data;
            }
            const existingIds = new Set(prev.tracks.map((t) => t.id));
            const newUniqueTracks = data.tracks.filter((t) => !existingIds.has(t.id));
            return {
              ...data,
              tracks: [...prev.tracks, ...newUniqueTracks],
            };
          });

          setPage(targetPage);
          setIsLoading(false);
          setIsSyncing(false);
          setIsLoadingMore(false);
          return;
        }
        throw new Error("No tracks in API response");
      } catch (err: any) {
        console.warn("[Suno] Background sync encountered an issue, checking fallback & proxies:", err?.message);
        
        // Attempt client-side proxy fetch if primary failed
        if (!append) {
          try {
            const clientData = await fetchViaClientProxies(normalizedId);
            if (isMountedRef.current && clientData && clientData.tracks.length > 0) {
              savePlaylistToCache(normalizedId, clientData);
              setPlaylist(clientData);
              setLastSynced(Date.now());
              setError(null);
              setIsLoading(false);
              setIsSyncing(false);
              setIsLoadingMore(false);
              return;
            }
          } catch {
            // Ignore proxy errors
          }
        }

        // Resilient fallback to cached/master data
        const cachedFallback = getCachedPlaylist(normalizedId);
        if (isMountedRef.current && cachedFallback?.tracks?.length > 0) {
          setPlaylist(cachedFallback);
          setError(null);
        } else if (isMountedRef.current) {
          setError("Failed to sync latest songs.");
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsSyncing(false);
          setIsLoadingMore(false);
        }
      }
    },
    [playlistId, playlist?.tracks?.length]
  );

  // When playlistId changes, immediately provide cached songs synchronously and trigger background resync
  useEffect(() => {
    const cached = getCachedPlaylist(playlistId);
    setPlaylist(cached);
    setIsLoading(false);
    setPage(1);

    // Call in background to update / resync ONLY if not synced during this app session
    const normalizedId = SUNO_PLAYLIST_ALIASES[playlistId?.trim()] || playlistId?.trim();
    if (!SYNCED_PLAYLISTS.has(normalizedId)) {
      SYNCED_PLAYLISTS.add(normalizedId);
      fetchPlaylistData(1, false, false);
    }
  }, [playlistId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    const normalizedId = SUNO_PLAYLIST_ALIASES[playlistId.trim()] || playlistId.trim();
    MEMORY_CACHE.delete(normalizedId);
    SYNCED_PLAYLISTS.delete(normalizedId); // Allow syncing again on manual refresh
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}${normalizedId}`);
      } catch {
        // ignore
      }
    }
    setPage(1);
    await fetchPlaylistData(1, false, true);
  }, [playlistId, fetchPlaylistData]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || isSyncing) return;
    const nextPage = page + 1;
    await fetchPlaylistData(nextPage, true, false);
  }, [isLoading, isLoadingMore, isSyncing, page, fetchPlaylistData]);

  return {
    playlist,
    tracks: playlist?.tracks || [],
    isLoading,
    isSyncing,
    isLoadingMore,
    error,
    lastSynced,
    page,
    hasMore: Boolean(playlist?.tracks && playlist.tracks.length >= 20),
    refresh,
    loadMore,
  };
}
