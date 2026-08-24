import { SUNO_CATALOG_MASTER } from "../src/lib/suno-catalog-data";

const PLAYLIST_ALIASES: Record<string, string> = {
  "7b5e949e-1d72-4685-9c7f-0fa5e5668190": "ff247038-e0ae-4778-989d-0529e575027b",
  "c013a793-e48c-47af-8451-fdfddf8405ca": "627c2d15-0cca-4c07-91b3-5f203c981e6e",
  "e3d7a82b-4567-4a89-9b12-8812cfa89012": "34ac065b-e68e-4dfa-9780-00c49bae047a",
};

// Helper: Extract Next.js Server Components (RSC) payload clips
function extractRSCClips(html: string): { foundClips: any[]; foundName: string } {
  let foundClips: any[] = [];
  let foundName = "Joel's Originals";

  const nameMatch = html.match(/"name":"([^"]+)"/);
  if (nameMatch && nameMatch[1]) {
    foundName = nameMatch[1];
  }

  const rscMatches = html.matchAll(/self\.__next_f\.push\(\[1,"(.*)"\]\)/g);
  for (const match of rscMatches) {
    if (match[1]) {
      try {
        const decoded = JSON.parse(`"${match[1]}"`);
        if (decoded.includes("playlist_clips") || decoded.includes("audio_url")) {
          const clipIdMatches = [...decoded.matchAll(/"id":"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi)];
          const titleMatches = [...decoded.matchAll(/"title":"([^"]+)"/gi)];
          
          if (clipIdMatches.length > 0) {
            const seen = new Set<string>();
            clipIdMatches.forEach((m, idx) => {
              const id = m[1];
              if (!seen.has(id) && id.length === 36) {
                seen.add(id);
                foundClips.push({
                  id,
                  title: titleMatches[idx]?.[1] || "Original Track",
                  audio_url: `https://cdn1.suno.ai/${id}.mp3`,
                  image_url: `https://cdn2.suno.ai/image_${id}.jpeg`,
                  duration: 185
                });
              }
            });
          }
        }
      } catch (e) {
        // ignore parse error
      }
    }
  }

  return { foundClips, foundName };
}

export default async function handler(req: any, res: any) {
  // Enable CORS & Cache headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const rawId = (req.query?.id as string) || (req.query?.playlist_id as string) || "ff247038-e0ae-4778-989d-0529e575027b";
  const targetId = PLAYLIST_ALIASES[rawId.trim()] || rawId.trim();

  const browserHeaders = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://suno.com/",
    "Origin": "https://suno.com"
  };

  let foundData: any = null;

  // Step 1: Query Suno Prod API with multi-page support to fetch ALL tracks
  try {
    let page = 1;
    let allClips: any[] = [];
    let meta: any = null;

    while (page <= 5) {
      const prodApiUrl = `https://studio-api.prod.suno.com/api/playlist/${encodeURIComponent(targetId)}/?page=${page}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const response = await fetch(prodApiUrl, { headers: browserHeaders, signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) break;

      const json = await response.json();
      meta = json;
      const clips = json.playlist_clips || json.clips || [];
      if (clips.length > 0) {
        allClips = allClips.concat(clips);
      }

      if (clips.length < 20 || !json.has_more) {
        break;
      }
      page++;
    }

    if (allClips.length > 0 && meta) {
      foundData = {
        ...meta,
        playlist_clips: allClips,
        num_total_results: allClips.length
      };
    }
  } catch (e: any) {
    console.warn(`[Vercel API] studio-api.prod.suno.com failed for ${targetId}:`, e?.message);
  }

  // Step 2: Query Studio AI API
  if (!foundData) {
    try {
      const studioAiUrl = `https://studio-api.suno.ai/api/playlist/${encodeURIComponent(targetId)}/?page=1`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(studioAiUrl, { headers: browserHeaders, signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const json = await response.json();
        const clips = json.playlist_clips || json.clips || [];
        if (clips.length > 0) {
          foundData = json;
        }
      }
    } catch (e: any) {
      console.warn(`[Vercel API] studio-api.suno.ai failed:`, e?.message);
    }
  }

  // Step 3: Scrape Suno Next.js RSC HTML
  if (!foundData) {
    try {
      const pageUrl = `https://suno.com/playlist/${targetId}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(pageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (response.ok) {
        const html = await response.text();
        const { foundClips, foundName } = extractRSCClips(html);
        if (foundClips.length > 0) {
          foundData = {
            name: foundName,
            playlist_clips: foundClips,
            num_total_results: foundClips.length
          };
        }
      }
    } catch (e: any) {
      console.warn(`[Vercel API] RSC scrape failed:`, e?.message);
    }
  }

  // Step 4: Multi-proxy scraping fallback
  if (!foundData) {
    const proxies = [
      {
        name: "AllOrigins",
        url: (uid: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(`https://suno.com/playlist/${uid}`)}`,
        parse: (data: any) => data?.contents
      },
      {
        name: "CodeTabs",
        url: (uid: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://suno.com/playlist/${uid}`)}`,
        parse: (data: any) => (typeof data === "string" ? data : JSON.stringify(data))
      },
      {
        name: "CorsProxyIO",
        url: (uid: string) => `https://corsproxy.io/?url=${encodeURIComponent(`https://suno.com/playlist/${uid}`)}`,
        parse: (data: any) => (typeof data === "string" ? data : JSON.stringify(data))
      }
    ];

    for (const proxy of proxies) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const resProxy = await fetch(proxy.url(targetId), { signal: controller.signal });
        clearTimeout(timeout);

        if (!resProxy.ok) continue;

        let rawData: any;
        const contentType = resProxy.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          rawData = await resProxy.json();
        } else {
          rawData = await resProxy.text();
        }

        const html = proxy.parse(rawData);
        if (html && typeof html === "string") {
          const { foundClips, foundName } = extractRSCClips(html);
          if (foundClips.length > 0) {
            foundData = {
              name: foundName,
              playlist_clips: foundClips,
              num_total_results: foundClips.length
            };
            break;
          }
        }
      } catch (err: any) {
        // continue to next proxy
      }
    }
  }

  // Format and return found data if any network scraper succeeded
  if (foundData) {
    const rawClips = foundData.playlist_clips || foundData.clips || foundData.items || [];
    const playlistTitle = foundData.name || foundData.title || "Joel's Originals";
    const playlistDesc = foundData.description || "Original tracks and musical compositions by ELITEJOE.";
    const playlistImage = foundData.image_url || foundData.image_large_url || "https://cdn2.suno.ai/1bc7ee09-ee52-487a-85c7-568e961bbc3d.jpeg";
    const userDisplayName = foundData.user_display_name || foundData.user?.display_name || foundData.created_by || "ELITEJOE";
    const totalTracks = foundData.num_total_results || foundData.total_clips || rawClips.length || 0;

    const tracks = rawClips.map((item: any) => {
      const clip = item.clip || item;
      const tagsStr = clip.metadata?.tags || clip.tags || clip.display_tags || "";
      const tags = typeof tagsStr === "string"
        ? tagsStr.split(",").map((t: string) => t.trim()).filter(Boolean)
        : Array.isArray(tagsStr) ? tagsStr : ["Guitar", "Original"];

      const clipId = clip.id || clip.clip_id || `trk-${Math.random().toString(36).slice(2, 9)}`;
      const audioUrl = clip.audio_url || clip.audioUrl || `https://cdn1.suno.ai/${clipId}.mp3`;
      const rawImg = clip.image_large_url || clip.image_url || clip.imageUrl;
      const imageUrl = rawImg || `https://cdn2.suno.ai/image_${clipId}.jpeg`;

      const durationVal = typeof clip.metadata?.duration === "number"
        ? Math.round(clip.metadata.duration)
        : typeof clip.duration === "number" && clip.duration > 0
        ? Math.round(clip.duration)
        : 185;

      return {
        id: clipId,
        title: clip.title || "Untitled Composition",
        artist: clip.display_name || clip.handle || userDisplayName || "ELITEJOE",
        album: clip.album || playlistTitle,
        duration: durationVal,
        audioUrl: audioUrl,
        videoUrl: clip.video_url || clip.videoUrl || null,
        imageUrl: imageUrl,
        lyrics: clip.metadata?.prompt || clip.metadata?.text || clip.prompt || clip.lyrics || "[Instrumental Audio Track]",
        tags: tags,
        createdAt: clip.created_at || clip.createdAt || new Date().toISOString(),
        playCount: clip.play_count ?? clip.playCount ?? 1250,
        upvoteCount: clip.upvote_count ?? clip.upvoteCount ?? 88,
        audio_url: audioUrl,
        image_url: imageUrl,
        created_at: clip.created_at || clip.createdAt || new Date().toISOString()
      };
    });

    if (tracks.length > 0) {
      return res.status(200).json({
        id: rawId,
        title: playlistTitle,
        name: playlistTitle,
        description: playlistDesc,
        imageUrl: playlistImage,
        userDisplayName: userDisplayName,
        tracks: tracks,
        totalTracks: Math.max(totalTracks, tracks.length),
        hasMore: false
      });
    }
  }

  // Guaranteed Resilient Fallback containing ALL 93+ songs from SUNO_CATALOG_MASTER
  const fallback = SUNO_CATALOG_MASTER[targetId] || SUNO_CATALOG_MASTER["ff247038-e0ae-4778-989d-0529e575027b"];
  
  return res.status(200).json({
    id: rawId,
    title: fallback.title,
    name: fallback.name || fallback.title,
    description: fallback.description,
    imageUrl: fallback.imageUrl,
    userDisplayName: fallback.userDisplayName || "ELITEJOE",
    tracks: fallback.tracks,
    totalTracks: fallback.tracks.length,
    hasMore: false
  });
}
