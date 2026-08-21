export interface SunoPlaylistMeta {
  id: string; // The Suno Playlist UUID
  title: string;
  description: string;
  category: string;
  coverImage?: string;
}

export interface SunoTrack {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  videoUrl?: string | null;
  imageUrl: string;
  duration: number; // in seconds
  lyrics?: string;
  tags?: string[];
  // Backwards-compatible aliases
  audio_url?: string;
  image_url?: string;
  created_at?: string;
}

export interface SunoPlaylistResponse {
  id: string;
  name: string;
  title?: string;
  description: string;
  imageUrl?: string;
  tracks: SunoTrack[];
  totalTracks: number;
}

// User's specific Suno playlists configuration
export const MY_SUNO_PLAYLISTS: SunoPlaylistMeta[] = [
  {
    id: "7b5e949e-1d72-4685-9c7f-0fa5e5668190",
    title: "My Top Suno Tracks",
    description: "Original AI music tracks, guitar riffs, and hits",
    category: "Featured",
    coverImage: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80"
  },
  {
    id: "c013a793-e48c-47af-8451-fdfddf8405ca",
    title: "Worship & Praise",
    description: "Uplifting spiritual acoustic melodies & arrangements",
    category: "Worship",
    coverImage: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=600&q=80"
  },
  {
    id: "e3d7a82b-4567-4a89-9b12-8812cfa89012",
    title: "Chill & Ambient",
    description: "Relaxing atmospheric guitar vibes & lo-fi chord progressions",
    category: "Chill",
    coverImage: "https://images.unsplash.com/photo-1614113489855-66422ad300a4?w=600&q=80"
  }
];

export const MY_PLAYLIST_CATEGORIES = ["All", "Featured", "Worship", "Chill"];
