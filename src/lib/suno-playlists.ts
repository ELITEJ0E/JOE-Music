export interface SunoPlaylistMeta {
  id: string;
  title: string;
  description: string;
  category: string;
  coverImage?: string;
}

export interface SunoTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
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
  userDisplayName?: string;
  hasMore?: boolean;
  tracks: SunoTrack[];
  totalTracks: number;
}

// Joel's specific playlists configuration
export const SUNO_PLAYLIST_ALIASES: Record<string, string> = {
  "7b5e949e-1d72-4685-9c7f-0fa5e5668190": "ff247038-e0ae-4778-989d-0529e575027b",
  "c013a793-e48c-47af-8451-fdfddf8405ca": "627c2d15-0cca-4c07-91b3-5f203c981e6e",
  "e3d7a82b-4567-4a89-9b12-8812cfa89012": "34ac065b-e68e-4dfa-9780-00c49bae047a",
};

export const MY_SUNO_PLAYLISTS: SunoPlaylistMeta[] = [
  {
    id: "ff247038-e0ae-4778-989d-0529e575027b",
    title: "Joel's Originals",
    description: "Original songs, pop funk rhythms, and exclusive compositions",
    category: "Originals",
    coverImage: "https://cdn2.suno.ai/1bc7ee09-ee52-487a-85c7-568e961bbc3d.jpeg"
  },
  {
    id: "627c2d15-0cca-4c07-91b3-5f203c981e6e",
    title: "Worship & Praise",
    description: "Uplifting spiritual acoustic melodies & worship arrangements",
    category: "Worship",
    coverImage: "https://cdn2.suno.ai/7697a8ed-b029-451b-b54f-e5ba5b947890.jpeg"
  },
  {
    id: "34ac065b-e68e-4dfa-9780-00c49bae047a",
    title: "Upcoming Releases",
    description: "Fresh tracks, guitar vibes, and synth-pop arrangements",
    category: "Upcoming",
    coverImage: "https://cdn2.suno.ai/1efe9cb2-dd3b-47c4-b0ad-c8efa5e4e139.jpeg"
  }
];

export const MY_PLAYLIST_CATEGORIES = ["All", "Originals", "Worship", "Upcoming"];
