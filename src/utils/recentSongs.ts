import { SunoTrack } from "../lib/suno-playlists";

export interface RecentSongItem {
  id: string;
  title: string;
  artist: string;
  album?: string;
  audioUrl: string;
  imageUrl: string;
  duration: number; // in seconds
  bpm?: number;
  key?: string;
  timeSignature?: string;
  lastPlayedAt: number; // timestamp
  playCount: number;
  lyrics?: string;
  tags?: string[];
}

const STORAGE_KEY = "guitar_studio_recent_songs";

// Curated starter list from Joel's original library
export const DEFAULT_RECENT_SONGS: RecentSongItem[] = [
  {
    id: "bd216e5e-4604-48e2-ac6e-7f1698044908",
    title: "红唇转圈",
    artist: "ELITEJOE",
    album: "Joel's Originals",
    audioUrl: "https://cdn1.suno.ai/bd216e5e-4604-48e2-ac6e-7f1698044908.mp3",
    imageUrl: "https://cdn2.suno.ai/1bc7ee09-ee52-487a-85c7-568e961bbc3d.jpeg",
    duration: 185,
    bpm: 154,
    key: "F# Minor",
    timeSignature: "4/4",
    lastPlayedAt: Date.now() - 1000 * 60 * 8, // 8 mins ago
    playCount: 14,
    tags: ["Pop Funk", "Phonk-Pop", "Clean Bass"],
    lyrics: "[Intro]\n靠近一点 别眨眼\n我在这边 看清楚点"
  },
  {
    id: "269a9621-677f-4864-8193-4b2265cd73cc",
    title: "Light It Up Tonight",
    artist: "ELITEJOE",
    album: "Joel's Originals",
    audioUrl: "https://cdn1.suno.ai/269a9621-677f-4864-8193-4b2265cd73cc.mp3",
    imageUrl: "https://cdn2.suno.ai/cdea3ba4-5f38-4462-968f-1fb74ba5ac92.jpeg",
    duration: 210,
    bpm: 120,
    key: "A Major",
    timeSignature: "4/4",
    lastPlayedAt: Date.now() - 1000 * 60 * 45, // 45 mins ago
    playCount: 9,
    tags: ["Electronic", "Synth Pop", "Driving Groove"],
    lyrics: "[Verse 1]\nNeon lights across the floor\nMoving close and wanting more"
  },
  {
    id: "aff5c48b-1c9a-48e1-8f3a-75e6dc9b6165",
    title: "Sweetheart Pulse",
    artist: "ELITEJOE",
    album: "Joel's Originals",
    audioUrl: "https://cdn1.suno.ai/aff5c48b-1c9a-48e1-8f3a-75e6dc9b6165.mp3",
    imageUrl: "https://cdn2.suno.ai/image_aff5c48b-1c9a-48e1-8f3a-75e6dc9b6165.jpeg",
    duration: 198,
    bpm: 104,
    key: "D Major",
    timeSignature: "4/4",
    lastPlayedAt: Date.now() - 1000 * 60 * 60 * 3, // 3 hours ago
    playCount: 6,
    tags: ["R&B", "Melodic", "Warm Bass"],
    lyrics: "[Verse 1]\nEvery heartbeat keeping time\nKnowing that you are truly mine"
  },
  {
    id: "6234dc9e-ba8b-46f6-a071-67ade0b1da8c",
    title: "Blink Twice",
    artist: "ELITEJOE",
    album: "Upcoming Releases",
    audioUrl: "https://cdn1.suno.ai/6234dc9e-ba8b-46f6-a071-67ade0b1da8c.mp3",
    imageUrl: "https://cdn2.suno.ai/1efe9cb2-dd3b-47c4-b0ad-c8efa5e4e139.jpeg",
    duration: 230,
    bpm: 124,
    key: "B Major",
    timeSignature: "4/4",
    lastPlayedAt: Date.now() - 1000 * 60 * 60 * 24, // Yesterday
    playCount: 11,
    tags: ["K-Pop", "J-Pop Fusion", "124 BPM"],
    lyrics: "[Intro]\n(Ooh-ah)\nYeah yeah\nBlink twice"
  },
  {
    id: "37bc2d3a-a30d-4d27-9ca4-d8f727463931",
    title: "You Were There",
    artist: "ELITEJOE",
    album: "Worship & Praise",
    audioUrl: "https://cdn1.suno.ai/37bc2d3a-a30d-4d27-9ca4-d8f727463931.mp3",
    imageUrl: "https://cdn2.suno.ai/7697a8ed-b029-451b-b54f-e5ba5b947890.jpeg",
    duration: 231,
    bpm: 72,
    key: "G Major",
    timeSignature: "4/4",
    lastPlayedAt: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
    playCount: 18,
    tags: ["Worship", "Acoustic Anthem", "Piano Intro"],
    lyrics: "[Intro]\nOh… Yeah…\nI was searching through the quiet and the storm"
  }
];

export function getRecentSongs(): RecentSongItem[] {
  if (typeof window === "undefined") return DEFAULT_RECENT_SONGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_RECENT_SONGS));
      return DEFAULT_RECENT_SONGS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_RECENT_SONGS;
  } catch (err) {
    console.warn("Failed to load recent songs from storage:", err);
    return DEFAULT_RECENT_SONGS;
  }
}

export function recordRecentSongPlay(track: SunoTrack | RecentSongItem): RecentSongItem[] {
  try {
    const current = getRecentSongs();
    const existingIndex = current.findIndex((s) => s.id === track.id || s.title === track.title);
    
    let updatedItem: RecentSongItem;
    if (existingIndex >= 0) {
      const existing = current[existingIndex];
      updatedItem = {
        ...existing,
        title: track.title || existing.title,
        artist: track.artist || existing.artist,
        album: (track as any).album || existing.album,
        audioUrl: track.audioUrl || (track as any).audio_url || existing.audioUrl,
        imageUrl: track.imageUrl || (track as any).image_url || existing.imageUrl,
        duration: track.duration || existing.duration,
        lastPlayedAt: Date.now(),
        playCount: (existing.playCount || 0) + 1,
      };
      // Move to top
      const filtered = current.filter((_, idx) => idx !== existingIndex);
      const newList = [updatedItem, ...filtered].slice(0, 15);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
      window.dispatchEvent(new CustomEvent("recent_songs_updated", { detail: newList }));
      return newList;
    } else {
      updatedItem = {
        id: track.id || `track-${Date.now()}`,
        title: track.title || "Untitled Song",
        artist: track.artist || "ELITEJOE",
        album: (track as any).album || "Originals",
        audioUrl: track.audioUrl || (track as any).audio_url || "",
        imageUrl: track.imageUrl || (track as any).image_url || "https://cdn2.suno.ai/1bc7ee09-ee52-487a-85c7-568e961bbc3d.jpeg",
        duration: track.duration || 180,
        bpm: 120,
        key: "A Major",
        timeSignature: "4/4",
        lastPlayedAt: Date.now(),
        playCount: 1,
        tags: track.tags || ["Guitar", "Original"],
        lyrics: track.lyrics,
      };
      const newList = [updatedItem, ...current].slice(0, 15);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
      window.dispatchEvent(new CustomEvent("recent_songs_updated", { detail: newList }));
      return newList;
    }
  } catch (err) {
    console.warn("Failed to record recent song:", err);
    return getRecentSongs();
  }
}

export function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ${diffHour === 1 ? "hour" : "hours"} ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return `${Math.floor(diffDay / 7)} weeks ago`;
}
