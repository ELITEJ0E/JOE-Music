// Curated high-fidelity song database for Joel's tracks
const DEFAULT_PLAYLIST_DATA: Record<string, any> = {
  "ff247038-e0ae-4778-989d-0529e575027b": {
    title: "Joel's Originals",
    description: "Original songs, pop funk rhythms, and exclusive compositions",
    category: "Originals",
    imageUrl: "https://cdn2.suno.ai/1bc7ee09-ee52-487a-85c7-568e961bbc3d.jpeg",
    tracks: [
      {
        id: "bd216e5e-4604-48e2-ac6e-7f1698044908",
        title: "红唇转圈",
        artist: "ELITEJOE",
        album: "Joel's Originals",
        duration: 185,
        audioUrl: "https://cdn1.suno.ai/bd216e5e-4604-48e2-ac6e-7f1698044908.mp3",
        imageUrl: "https://cdn2.suno.ai/1bc7ee09-ee52-487a-85c7-568e961bbc3d.jpeg",
        tags: ["Pop Funk", "Phonk-Pop", "154 BPM", "Clean Bass"],
        lyrics: "[Intro]\n靠近一点 别眨眼\n我在这边 看清楚点"
      },
      {
        id: "269a9621-677f-4864-8193-4b2265cd73cc",
        title: "Light It Up Tonight",
        artist: "ELITEJOE",
        album: "Joel's Originals",
        duration: 210,
        audioUrl: "https://cdn1.suno.ai/269a9621-677f-4864-8193-4b2265cd73cc.mp3",
        imageUrl: "https://cdn2.suno.ai/cdea3ba4-5f38-4462-968f-1fb74ba5ac92.jpeg",
        tags: ["Electronic", "Synth Pop", "Driving Groove"],
        lyrics: "[Verse 1]\nNeon lights across the floor\nMoving close and wanting more"
      },
      {
        id: "aff5c48b-1c9a-48e1-8f3a-75e6dc9b6165",
        title: "Sweetheart Pulse",
        artist: "ELITEJOE",
        album: "Joel's Originals",
        duration: 198,
        audioUrl: "https://cdn1.suno.ai/aff5c48b-1c9a-48e1-8f3a-75e6dc9b6165.mp3",
        imageUrl: "https://cdn2.suno.ai/image_aff5c48b-1c9a-48e1-8f3a-75e6dc9b6165.jpeg",
        tags: ["R&B", "Melodic", "Warm Bass"],
        lyrics: "[Verse 1]\nEvery heartbeat keeping time\nKnowing that you are truly mine"
      },
      {
        id: "6234dc9e-ba8b-46f6-a071-67ade0b1da8c",
        title: "Blink Twice",
        artist: "ELITEJOE",
        album: "Joel's Originals",
        duration: 230,
        audioUrl: "https://cdn1.suno.ai/6234dc9e-ba8b-46f6-a071-67ade0b1da8c.mp3",
        imageUrl: "https://cdn2.suno.ai/1efe9cb2-dd3b-47c4-b0ad-c8efa5e4e139.jpeg",
        tags: ["K-Pop", "J-Pop Fusion", "124 BPM", "B Major"],
        lyrics: "[Intro]\n(Ooh-ah)\nYeah yeah\nBlink twice\nBlink twice"
      },
      {
        id: "37bc2d3a-a30d-4d27-9ca4-d8f727463931",
        title: "You Were There",
        artist: "ELITEJOE",
        album: "Joel's Originals",
        duration: 231,
        audioUrl: "https://cdn1.suno.ai/37bc2d3a-a30d-4d27-9ca4-d8f727463931.mp3",
        imageUrl: "https://cdn2.suno.ai/7697a8ed-b029-451b-b54f-e5ba5b947890.jpeg",
        tags: ["Worship", "Acoustic Anthem", "Piano Intro", "Emotional"],
        lyrics: "[Intro]\nOh… Yeah…\nI was searching through the quiet and the storm\nYou were there to keep me warm"
      }
    ]
  },
  "627c2d15-0cca-4c07-91b3-5f203c981e6e": {
    title: "Worship & Praise",
    description: "Devotional songs, acoustic guitar arrangements, and uplifting melodies",
    category: "Worship",
    imageUrl: "https://cdn2.suno.ai/7697a8ed-b029-451b-b54f-e5ba5b947890.jpeg",
    tracks: [
      {
        id: "37bc2d3a-a30d-4d27-9ca4-d8f727463931",
        title: "You Were There",
        artist: "ELITEJOE",
        album: "Worship & Praise",
        duration: 231,
        audioUrl: "https://cdn1.suno.ai/37bc2d3a-a30d-4d27-9ca4-d8f727463931.mp3",
        imageUrl: "https://cdn2.suno.ai/7697a8ed-b029-451b-b54f-e5ba5b947890.jpeg",
        tags: ["Worship", "Acoustic Anthem", "Piano Intro", "Emotional"],
        lyrics: "[Intro]\nOh… Yeah…\nI was searching through the quiet and the storm\nYou were there to keep me warm"
      },
      {
        id: "bd216e5e-4604-48e2-ac6e-7f1698044908-w",
        title: "Grace Overflowing",
        artist: "ELITEJOE",
        album: "Worship & Praise",
        duration: 215,
        audioUrl: "https://cdn1.suno.ai/269a9621-677f-4864-8193-4b2265cd73cc.mp3",
        imageUrl: "https://cdn2.suno.ai/7697a8ed-b029-451b-b54f-e5ba5b947890.jpeg",
        tags: ["Worship", "Electric Guitar", "Pad Ambience"],
        lyrics: "Your grace is enough for me\nStanding in your presence"
      }
    ]
  },
  "34ac065b-e68e-4dfa-9780-00c49bae047a": {
    title: "Upcoming Releases",
    description: "Fresh tracks, guitar vibes, and synth-pop arrangements",
    category: "Upcoming",
    imageUrl: "https://cdn2.suno.ai/1efe9cb2-dd3b-47c4-b0ad-c8efa5e4e139.jpeg",
    tracks: [
      {
        id: "6234dc9e-ba8b-46f6-a071-67ade0b1da8c",
        title: "Blink Twice",
        artist: "ELITEJOE",
        album: "Upcoming Releases",
        duration: 230,
        audioUrl: "https://cdn1.suno.ai/6234dc9e-ba8b-46f6-a071-67ade0b1da8c.mp3",
        imageUrl: "https://cdn2.suno.ai/1efe9cb2-dd3b-47c4-b0ad-c8efa5e4e139.jpeg",
        tags: ["K-Pop", "J-Pop Fusion", "124 BPM", "B Major"],
        lyrics: "[Intro]\n(Ooh-ah)\nYeah yeah\nBlink twice\nBlink twice"
      },
      {
        id: "aff5c48b-1c9a-48e1-8f3a-75e6dc9b6165-u",
        title: "Neon Horizon",
        artist: "ELITEJOE",
        album: "Upcoming Releases",
        duration: 198,
        audioUrl: "https://cdn1.suno.ai/aff5c48b-1c9a-48e1-8f3a-75e6dc9b6165.mp3",
        imageUrl: "https://cdn2.suno.ai/image_aff5c48b-1c9a-48e1-8f3a-75e6dc9b6165.jpeg",
        tags: ["Synthwave", "Guitar Solo", "Future Retro"],
        lyrics: "Driving into the neon horizon\nWhere the chords never fade"
      }
    ]
  }
};

export default async function handler(req: any, res: any) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const rawId = (req.query?.id as string) || "ff247038-e0ae-4778-989d-0529e575027b";
  const targetId = rawId.trim();

  // Try live fetch with headers if possible
  try {
    const sunoApiUrl = `https://studio-api.suno.ai/api/playlist/${targetId}/?page=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(sunoApiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const rawClips = data.playlist_clips || data.clips || data.items || [];
      if (rawClips.length > 0) {
        const tracks = rawClips.map((item: any) => {
          const clip = item.clip || item;
          const clipId = clip.id || clip.clip_id || `trk-${Math.random().toString(36).slice(2, 9)}`;
          const audioUrl = clip.audio_url || clip.audioUrl || `https://cdn1.suno.ai/${clipId}.mp3`;
          const rawImg = clip.image_large_url || clip.image_url || clip.imageUrl;
          const imageUrl = rawImg || `https://cdn2.suno.ai/image_${clipId}.jpeg`;

          return {
            id: clipId,
            title: clip.title || "Untitled Composition",
            artist: clip.display_name || clip.handle || data.user_display_name || "ELITEJOE",
            album: data.name || "Joel's Originals",
            duration: Math.round(clip.metadata?.duration || clip.duration || 185),
            audioUrl: audioUrl,
            audio_url: audioUrl,
            imageUrl: imageUrl,
            image_url: imageUrl,
            lyrics: clip.metadata?.prompt || clip.prompt || clip.lyrics || "",
            tags: ["Guitar", "Original"],
            createdAt: clip.created_at || new Date().toISOString(),
          };
        });

        return res.status(200).json({
          id: rawId,
          title: data.name || "Joel's Originals",
          name: data.name || "Joel's Originals",
          description: data.description || "Original music by ELITEJOE.",
          imageUrl: data.image_url || "https://cdn2.suno.ai/1bc7ee09-ee52-487a-85c7-568e961bbc3d.jpeg",
          userDisplayName: data.user_display_name || "ELITEJOE",
          tracks: tracks,
          totalTracks: data.num_total_results || tracks.length,
          hasMore: false,
        });
      }
    }
  } catch (err) {
    // Fall through to instant fallback
  }

  // Resilient static catalog fallback for Vercel
  const fallback = DEFAULT_PLAYLIST_DATA[targetId] || DEFAULT_PLAYLIST_DATA["ff247038-e0ae-4778-989d-0529e575027b"];
  return res.status(200).json({
    id: rawId,
    title: fallback.title,
    name: fallback.title,
    description: fallback.description,
    imageUrl: fallback.imageUrl,
    userDisplayName: "ELITEJOE",
    tracks: fallback.tracks,
    totalTracks: fallback.tracks.length,
    hasMore: false,
  });
}
