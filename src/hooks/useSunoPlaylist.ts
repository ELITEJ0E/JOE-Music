import { useState, useEffect, useCallback, useRef } from "react";
import { SunoPlaylistResponse, SunoTrack, SUNO_PLAYLIST_ALIASES } from "../lib/suno-playlists";
import { SUNO_CATALOG_MASTER } from "../lib/suno-catalog-data";

interface UseSunoPlaylistResult {
  playlist: SunoPlaylistResponse | null;
  tracks: SunoTrack[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  page: number;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

// In-memory cache for fast responsive playlist switching
const playlistCache = new Map<string, { data: SunoPlaylistResponse; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

// Client-side direct CORS proxies fallback if Vercel /api/suno-playlist is unavailable
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
          const audioUrl = clip.audio_url || `https://cdn1.suno.ai/${clipId}.mp3`;
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
  const [playlist, setPlaylist] = useState<SunoPlaylistResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchPlaylistData = useCallback(
    async (targetPage: number = 1, append: boolean = false) => {
      if (!playlistId) return;

      const normalizedId = SUNO_PLAYLIST_ALIASES[playlistId] || playlistId;
      const cacheKey = `${normalizedId}-p-${targetPage}`;
      const cached = playlistCache.get(cacheKey);
      const isFresh = cached && Date.now() - cached.timestamp < CACHE_TTL_MS;

      if (isFresh && !append) {
        setPlaylist(cached.data);
        setIsLoading(false);
        setError(null);
        return;
      }

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const res = await fetch(`/api/suno-playlist?id=${encodeURIComponent(normalizedId)}&page=${targetPage}`);
        
        const contentType = res.headers.get("content-type") || "";
        if (!res.ok || !contentType.includes("application/json")) {
          throw new Error(`Endpoint returned status ${res.status}`);
        }

        const data: SunoPlaylistResponse = await res.json();

        if (isMountedRef.current && data?.tracks && data.tracks.length > 0) {
          playlistCache.set(cacheKey, { data, timestamp: Date.now() });

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
          setIsLoadingMore(false);
          return;
        }
        throw new Error("No tracks in API response");
      } catch (err: any) {
        console.warn("[Suno] Primary API proxy error, trying client proxies & master catalog:", err?.message);
        
        // Attempt client-side proxy fetch
        if (!append) {
          const clientData = await fetchViaClientProxies(normalizedId);
          if (isMountedRef.current && clientData && clientData.tracks.length > 0) {
            playlistCache.set(cacheKey, { data: clientData, timestamp: Date.now() });
            setPlaylist(clientData);
            setError(null);
            setIsLoading(false);
            setIsLoadingMore(false);
            return;
          }
        }

        // Resilient full fallback using complete 93-track SUNO_CATALOG_MASTER
        const masterFallback = SUNO_CATALOG_MASTER[normalizedId] || SUNO_CATALOG_MASTER["ff247038-e0ae-4778-989d-0529e575027b"];
        if (isMountedRef.current && masterFallback) {
          playlistCache.set(cacheKey, { data: masterFallback, timestamp: Date.now() });
          setPlaylist(masterFallback);
          setError(null);
        } else if (isMountedRef.current) {
          setError("Failed to fetch playlist data.");
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [playlistId]
  );

  useEffect(() => {
    setPage(1);
    fetchPlaylistData(1, false);
  }, [playlistId, fetchPlaylistData]);

  const refresh = useCallback(async () => {
    for (const key of playlistCache.keys()) {
      if (key.startsWith(playlistId)) {
        playlistCache.delete(key);
      }
    }
    setPage(1);
    await fetchPlaylistData(1, false);
  }, [playlistId, fetchPlaylistData]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore) return;
    const nextPage = page + 1;
    await fetchPlaylistData(nextPage, true);
  }, [isLoading, isLoadingMore, page, fetchPlaylistData]);

  return {
    playlist,
    tracks: playlist?.tracks || [],
    isLoading,
    isLoadingMore,
    error,
    page,
    hasMore: Boolean(playlist?.tracks && playlist.tracks.length >= 20),
    refresh,
    loadMore,
  };
}
