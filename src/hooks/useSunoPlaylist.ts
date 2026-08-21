import { useState, useEffect, useCallback, useRef } from "react";
import { SunoPlaylistResponse, SunoTrack } from "../lib/suno-playlists";

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

      const cacheKey = `${playlistId}-p-${targetPage}`;
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
        const res = await fetch(`/api/suno-playlist?id=${encodeURIComponent(playlistId)}&page=${targetPage}`);
        if (!res.ok) {
          throw new Error(`Failed to load Suno playlist (HTTP ${res.status})`);
        }

        const data: SunoPlaylistResponse = await res.json();

        if (isMountedRef.current) {
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
        }
      } catch (err: any) {
        if (isMountedRef.current) {
          console.error("useSunoPlaylist fetch error:", err);
          setError(err.message || "Failed to fetch playlist data from Suno API.");
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
