import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { SUNO_CATALOG_MASTER } from "./src/lib/suno-catalog-data";
import { analyzeSong } from "./src/lib/analyzeSong";

dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // Expose ONLY the VITE_EXTRACTOR_API / VITE_AUDIO_EXTRACTOR_URL environment variable safely for client-side runtime recovery
  app.get("/api/extractor-url", (req, res) => {
    res.json({
      url: process.env.VITE_EXTRACTOR_API || process.env.VITE_AUDIO_EXTRACTOR_URL || process.env.AUDIO_EXTRACTOR_URL || "https://chord-extractor-7agu.onrender.com"
    });
  });

  // In-memory store for standalone external chord sheets
  const externalSheetsMap = new Map<string, { html: string; title: string; createdAt: number }>();

  // API to save external sheet HTML and generate standalone view URL
  app.post("/api/external-sheet", (req, res) => {
    try {
      const { html, id, title } = req.body;
      if (!html) {
        return res.status(400).json({ error: "Missing HTML content" });
      }
      const sheetId = id || `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      externalSheetsMap.set(sheetId, {
        html,
        title: title || "Guitar Lead Sheet",
        createdAt: Date.now(),
      });

      // Cleanup sheets older than 7 days
      if (externalSheetsMap.size > 200) {
        const now = Date.now();
        for (const [key, val] of externalSheetsMap.entries()) {
          if (now - val.createdAt > 7 * 24 * 60 * 60 * 1000) {
            externalSheetsMap.delete(key);
          }
        }
      }

      return res.json({ success: true, sheetId, url: `/sheet/${sheetId}` });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to store external sheet", message: err?.message });
    }
  });

  // Dedicated external standalone webpage endpoint for chord sheets
  app.get("/sheet/:sheetId", (req, res) => {
    const item = externalSheetsMap.get(req.params.sheetId);
    if (item) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(item.html);
    }
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>Chord Sheet Not Found</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0c0e12; color: #fff; text-align: center; padding: 60px 20px; }
            h2 { color: #f87171; margin-bottom: 8px; }
            p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
            a { display: inline-block; padding: 10px 20px; background: #a3ff12; color: #000; text-decoration: none; border-radius: 10px; font-weight: bold; font-family: monospace; }
          </style>
        </head>
        <body>
          <h2>Chord Sheet Expired or Not Found</h2>
          <p>Please open or re-export the chord sheet from JOE Guitar Studio.</p>
          <a href="/">Return to JOE Guitar Studio</a>
        </body>
      </html>
    `);
  });

  // AI Chord Lookup & Song Progression Analyzer (with YouTube oEmbed metadata resolver)
  app.post("/api/analyze-song", async (req, res) => {
    try {
      const { songQuery, artist, genre, capoPreference } = req.body;
      const data = await analyzeSong(songQuery, artist, genre, capoPreference);
      return res.json(data);
    } catch (err: any) {
      if (err.message === "Song title, artist, or YouTube URL is required.") {
        return res.status(400).json({ error: err.message });
      }
      console.error("AI chord analysis error:", err);
      return res.status(500).json({ error: "Failed to analyze song with AI", message: err?.message });
    }
  });

  // AI Guitar Coach / Custom Lick Generator / Theory Explainer
  app.post("/api/guitar-assistant", async (req, res) => {
    const { question, currentContext } = req.body;
    try {
      const ai = getAIClient();
      if (!ai) {
        return res.json({
          answer: `Here is a practice tip: When practicing the ${currentContext?.chord || 'progression'}, focus on economic finger movement. Keep your anchor fingers steady and practice transition at 60 BPM with the metronome before speeding up to full tempo.`
        });
      }

      const prompt = `You are a world-class professional guitar instructor and audio engineer.
User question: "${question}"
Current Workstation State: ${JSON.stringify(currentContext || {})}
Provide a concise, practical, high-value guitar instruction response. Mention specific fret positions, scale degrees, pick directions (Down/Up), tone settings (gain, EQ, delay), or practice methods where relevant.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      return res.json({ answer: response.text });
    } catch (err: any) {
      return res.status(500).json({ error: "Coach error", message: err?.message });
    }
  });

  // Suno Playlist API Proxy Integration (Joelify Architecture)
  // Multi-tier resolver: Primary API -> Studio API -> Next.js RSC Scraper -> Proxy Scrapers -> Fallbacks
  const PLAYLIST_ALIASES: Record<string, string> = {
    "7b5e949e-1d72-4685-9c7f-0fa5e5668190": "ff247038-e0ae-4778-989d-0529e575027b",
    "c013a793-e48c-47af-8451-fdfddf8405ca": "627c2d15-0cca-4c07-91b3-5f203c981e6e",
    "e3d7a82b-4567-4a89-9b12-8812cfa89012": "34ac065b-e68e-4dfa-9780-00c49bae047a",
  };

  const extractRSCClips = (html: string) => {
    let foundClips: any[] = [];
    let foundName = "My Suno Playlist";

    if (!html || typeof html !== "string") return { foundClips, foundName };

    const nameMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (nameMatch && nameMatch[1]) {
      const raw = nameMatch[1].replace(/ - Suno/i, "").replace(/ \| Suno/i, "").trim();
      if (raw && !raw.includes("Page Not Found") && !raw.includes("Suno")) {
        foundName = raw;
      }
    }

    const payloads: string[] = [];
    const pushIdx = html.search(/(?:self\.|window\.)?__next_f\.push\(/);
    let searchPos = 0;
    while (true) {
      const match = html.slice(searchPos).match(/(?:self\.|window\.)?__next_f\.push\(/);
      if (!match || match.index === undefined) break;

      const pushIdx = searchPos + match.index;
      const startIdx = pushIdx + match[0].length;
      let parenCount = 1;
      let inString = false;
      let stringChar = "";
      let isEscaped = false;
      let foundEnd = -1;

      for (let i = startIdx; i < html.length; i++) {
        const char = html[i];
        if (inString) {
          if (isEscaped) {
            isEscaped = false;
          } else if (char === "\\") {
            isEscaped = true;
          } else if (char === stringChar) {
            inString = false;
          }
        } else {
          if (char === '"' || char === "'") {
            inString = true;
            stringChar = char;
            isEscaped = false;
          } else if (char === "(") {
            parenCount++;
          } else if (char === ")") {
            parenCount--;
            if (parenCount === 0) {
              foundEnd = i;
              break;
            }
          }
        }
      }

      if (foundEnd !== -1) {
        const argumentStr = html.substring(startIdx, foundEnd).trim();
        try {
          const arr = JSON.parse(argumentStr);
          if (Array.isArray(arr) && typeof arr[1] === "string") {
            payloads.push(arr[1]);
          }
        } catch (e) {
          const strMatch = argumentStr.match(/^\[\s*\d+\s*,\s*"([\s\S]*)"\s*\]$/);
          if (strMatch) {
            try {
              const decoded = JSON.parse(`"${strMatch[1]}"`);
              payloads.push(decoded);
            } catch (err) {
              let s = strMatch[1]
                .replace(/\\"/g, '"')
                .replace(/\\n/g, "\n")
                .replace(/\\r/g, "\r")
                .replace(/\\t/g, "\t")
                .replace(/\\\\/g, "\\");
              payloads.push(s);
            }
          }
        }
        searchPos = foundEnd + 1;
      } else {
        searchPos = pushIdx + 1;
      }
    }

    const combinedDecodedText = payloads.join("");

    if (combinedDecodedText) {
      const playlistClipsIdx = combinedDecodedText.indexOf('"playlist_clips":');
      if (playlistClipsIdx !== -1) {
        const startArrIdx = combinedDecodedText.indexOf("[", playlistClipsIdx);
        if (startArrIdx !== -1) {
          let bracketCount = 0;
          for (let i = startArrIdx; i < combinedDecodedText.length; i++) {
            if (combinedDecodedText[i] === "[") bracketCount++;
            else if (combinedDecodedText[i] === "]") {
              bracketCount--;
              if (bracketCount === 0) {
                const arrayStr = combinedDecodedText.substring(startArrIdx, i + 1);
                try {
                  const arr = JSON.parse(arrayStr);
                  if (Array.isArray(arr) && arr.length > 0) {
                    foundClips = arr.map((item: any) => item.clip || item).filter(Boolean);
                  }
                } catch (e) {}
                break;
              }
            }
          }
        }
      }

      if (foundClips.length === 0) {
        const clipsIdx = combinedDecodedText.indexOf('"clips":');
        if (clipsIdx !== -1) {
          const startArrIdx = combinedDecodedText.indexOf("[", clipsIdx);
          if (startArrIdx !== -1) {
            let bracketCount = 0;
            for (let i = startArrIdx; i < combinedDecodedText.length; i++) {
              if (combinedDecodedText[i] === "[") bracketCount++;
              else if (combinedDecodedText[i] === "]") {
                bracketCount--;
                if (bracketCount === 0) {
                  const arrayStr = combinedDecodedText.substring(startArrIdx, i + 1);
                  try {
                    const arr = JSON.parse(arrayStr);
                    if (Array.isArray(arr) && arr.length > 0) {
                      foundClips = arr.map((item: any) => item.clip || item).filter(Boolean);
                    }
                  } catch (e) {}
                  break;
                }
              }
            }
          }
        }
      }
    }

    return { foundClips, foundName };
  };

  app.get("/api/suno-playlist", async (req, res) => {
    let rawId = ((req.query.id || req.query.playlist_id || "ff247038-e0ae-4778-989d-0529e575027b") as string).trim();
    const page = parseInt((req.query.page as string) || "1", 10);

    // Resolve aliases (e.g. placeholder IDs to real Joelify IDs)
    const targetId = PLAYLIST_ALIASES[rawId] || rawId;

    // Set CORS and Cache-Control headers
    const isForceRefresh = Boolean(req.query._t || req.query.refresh || req.query.nocache);
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (isForceRefresh) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    } else {
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120");
    }

    // Fast path: if requested ID is a curated catalog collection (and not the live main Suno playlist), return catalog instantly
    if (targetId !== "ff247038-e0ae-4778-989d-0529e575027b" && SUNO_CATALOG_MASTER[targetId]) {
      const fallback = SUNO_CATALOG_MASTER[targetId];
      return res.json({
        id: rawId,
        title: fallback.title,
        name: fallback.name || fallback.title,
        description: fallback.description,
        imageUrl: fallback.imageUrl,
        userDisplayName: fallback.userDisplayName || "ELITEJOE",
        tracks: fallback.tracks,
        totalTracks: fallback.tracks.length,
        hasMore: false,
        lastSynced: Date.now()
      });
    }

    const browserHeaders = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://suno.com/",
      "Origin": "https://suno.com"
    };

    let foundData: any = null;
    let is404 = false;

    // Step 1: Direct Suno Studio Prod API with multi-page support to fetch ALL tracks
    try {
      let currentPage = page;
      let allClips: any[] = [];
      let meta: any = null;

      // If requested page 1, fetch all pages up to 10 to get the full playlist
      const maxPages = page === 1 ? 10 : page;
      while (currentPage <= maxPages) {
        const prodApiUrl = `https://studio-api.prod.suno.com/api/playlist/${encodeURIComponent(targetId)}/?page=${currentPage}`;
        let response: any = null;

        for (let attempt = 1; attempt <= 2; attempt++) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4000);
          try {
            response = await fetch(prodApiUrl, { headers: browserHeaders, signal: controller.signal });
            clearTimeout(timeout);
            if (response) {
              if (response.status === 404) {
                is404 = true;
                break;
              }
              if (response.ok) break;
            }
          } catch (e: any) {
            clearTimeout(timeout);
            if (attempt === 1) {
              await new Promise((r) => setTimeout(r, 200));
            }
          }
        }

        if (is404 || !response || !response.ok) {
          break;
        }

        const json = await response.json();
        meta = json;
        const clips = json.playlist_clips || json.clips || [];
        if (clips.length > 0) {
          allClips = allClips.concat(clips);
        }

        const totalExpected = json.num_total_results || 0;
        // Stop if page returned 0 clips or if we accumulated all expected clips, or if specific page was requested
        if (clips.length === 0 || (totalExpected > 0 && allClips.length >= totalExpected) || page !== 1) {
          break;
        }
        currentPage++;
      }

      if (allClips.length > 0 && meta) {
        foundData = {
          ...meta,
          playlist_clips: allClips,
          num_total_results: Math.max(allClips.length, meta.num_total_results || 0)
        };
      }
    } catch (e: any) {
      // Step 1 failed, continue to fast fallback
    }

    // Step 2: Direct Suno Studio AI API (Only if not a definite 404)
    if (!foundData && !is404) {
      try {
        const studioAiUrl = `https://studio-api.suno.ai/api/playlist/${encodeURIComponent(targetId)}/?page=${page}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(studioAiUrl, { headers: browserHeaders, signal: controller.signal });
        clearTimeout(timeout);

        if (response.status === 404) {
          is404 = true;
        } else if (response.ok) {
          const json = await response.json();
          const clips = json.playlist_clips || json.clips || [];
          if (clips.length > 0 || json.name) {
            foundData = json;
          }
        }
      } catch (e: any) {
        // Continue
      }
    }

    // Step 3: Direct Suno.com Next.js RSC HTML Scraper (Only if not 404)
    if (!foundData && !is404) {
      try {
        const pageUrl = `https://suno.com/playlist/${targetId}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const response = await fetch(pageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5"
          },
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (response.status === 404) {
          is404 = true;
        } else if (response.ok) {
          const html = await response.text();
          const { foundClips, foundName } = extractRSCClips(html);
          if (foundClips.length > 0) {
            foundData = {
              name: foundName,
              playlist_clips: foundClips,
              num_total_results: foundClips.length,
            };
          }
        }
      } catch (e: any) {
        // Continue
      }
    }

    // Step 4: Process extracted live data if available
    if (foundData) {
      const rawClips = foundData.playlist_clips || foundData.clips || foundData.items || [];
      const playlistTitle = foundData.name || foundData.title || "Joel's Originals";
      const playlistDesc = foundData.description || "Original tracks and musical compositions by ELITEJOE.";
      const playlistImage = foundData.image_url || foundData.image_large_url || "https://cdn2.suno.ai/1bc7ee09-ee52-487a-85c7-568e961bbc3d.jpeg";
      const userDisplayName = foundData.user_display_name || foundData.user?.display_name || foundData.created_by || "ELITEJOE";
      const totalTracks = foundData.num_total_results || foundData.total_clips || rawClips.length || 0;
      const hasMore = Boolean(foundData.has_more ?? (rawClips.length >= 20));

      const tracks = rawClips.map((item: any) => {
        const clip = item.clip || item;
        const tagsStr = clip.metadata?.tags || clip.tags || clip.display_tags || "";
        const tags = typeof tagsStr === "string"
          ? tagsStr.split(",").map((t: string) => t.trim()).filter(Boolean)
          : Array.isArray(tagsStr) ? tagsStr : ["Guitar", "Original"];

        const clipId = clip.id || clip.clip_id || `trk-${Math.random().toString(36).slice(2, 9)}`;
        const streamUrl = `/api/suno-audio/${clipId}`;
        const rawImg = clip.image_large_url || clip.image_url || clip.imageUrl;
        const imageUrl = rawImg || `https://cdn2.suno.ai/image_${clipId}.jpeg`;

        const durationVal = typeof clip.metadata?.duration === "number"
          ? Math.round(clip.metadata.duration)
          : typeof clip.duration === "number" && clip.duration > 0
          ? Math.round(clip.duration)
          : 185;

        const dateStr = item.created_at || clip.created_at || clip.createdAt || new Date().toISOString();

        return {
          id: clipId,
          title: clip.title || "Untitled Composition",
          artist: clip.display_name || clip.handle || userDisplayName || "ELITEJOE",
          album: clip.album || playlistTitle,
          duration: durationVal,
          audioUrl: streamUrl,
          streamUrl: streamUrl,
          videoUrl: clip.video_url || clip.videoUrl || null,
          imageUrl: imageUrl,
          lyrics: clip.metadata?.prompt || clip.metadata?.text || clip.prompt || clip.lyrics || "[Instrumental Audio Track]",
          tags: tags,
          createdAt: dateStr,
          playCount: clip.play_count ?? clip.playCount ?? 1250,
          upvoteCount: clip.upvote_count ?? clip.upvoteCount ?? 88,
          // Compatibility aliases
          audio_url: streamUrl,
          image_url: imageUrl,
          created_at: dateStr,
        };
      });

      if (tracks.length > 0) {
        return res.json({
          id: rawId,
          title: playlistTitle,
          name: playlistTitle,
          description: playlistDesc,
          imageUrl: playlistImage,
          userDisplayName: userDisplayName,
          tracks: tracks,
          totalTracks: totalTracks,
          hasMore: hasMore,
          lastSynced: Date.now()
        });
      }
    }

    // Guaranteed Resilient Fallback containing ALL 93+ songs from SUNO_CATALOG_MASTER
    const fallback = SUNO_CATALOG_MASTER[targetId] || SUNO_CATALOG_MASTER["ff247038-e0ae-4778-989d-0529e575027b"];
    const fallbackTracks = [...fallback.tracks];

    res.json({
      id: rawId,
      title: fallback.title,
      name: fallback.name || fallback.title,
      description: fallback.description,
      imageUrl: fallback.imageUrl,
      userDisplayName: fallback.userDisplayName || "ELITEJOE",
      tracks: fallbackTracks,
      totalTracks: fallbackTracks.length,
      hasMore: false,
      lastSynced: Date.now()
    });
  });

  // =========================================================================
  // SUNO AUDIO DECRYPTION & STREAMING ENGINE (AES-CTR DRM RESOLVER)
  // Decrypts Suno CloudFront encrypted audio streams in real-time with caching
  // =========================================================================
  interface CachedAudio {
    buffer: Buffer;
    mimeType: string;
    timestamp: number;
  }

  const audioBufferCache = new Map<string, CachedAudio>();
  const pendingDecryptions = new Map<string, Promise<CachedAudio | null>>();
  const MAX_AUDIO_CACHE_ENTRIES = 60;

  function pruneAudioCache() {
    if (audioBufferCache.size > MAX_AUDIO_CACHE_ENTRIES) {
      const entries = Array.from(audioBufferCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < 15; i++) {
        if (entries[i]) audioBufferCache.delete(entries[i][0]);
      }
    }
  }

  async function resolveAndDecryptSunoAudio(clipId: string, directUrl?: string): Promise<CachedAudio | null> {
    const cacheKey = clipId || directUrl || "";
    if (!cacheKey) return null;

    // 1. Return from in-memory cache if available (valid for 4 hours)
    const cached = audioBufferCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 4 * 3600 * 1000) {
      return cached;
    }

    // 2. Deduplicate inflight decryption promises
    if (pendingDecryptions.has(cacheKey)) {
      return pendingDecryptions.get(cacheKey)!;
    }

    const decryptPromise = (async (): Promise<CachedAudio | null> => {
      try {
        console.log(`[Audio Engine] Starting DRM decryption for clip: ${clipId}`);

        // Step A: Fetch rights key and IV from Suno Studio API
        const rightsHosts = [
          "https://studio-api-prod.suno.com",
          "https://studio-api-prod.suno.ai",
          "https://suno.com"
        ];

        let rightsData: { key: string; iv: string; glt: string } | null = null;

        if (clipId) {
          for (const host of rightsHosts) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 6000);
              const rightsRes = await fetch(`${host}/api/mango/rights`, {
                method: "POST",
                signal: controller.signal,
                headers: {
                  "Content-Type": "application/json",
                  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                  "Origin": "https://suno.com",
                  "Referer": `https://suno.com/song/${clipId}`
                },
                body: JSON.stringify({
                  content_params: {
                    content_id: clipId,
                    content_type: "clip"
                  }
                })
              });
              clearTimeout(timeoutId);

              if (rightsRes.ok) {
                const json = await rightsRes.json();
                if (json && json.key && json.iv && json.glt) {
                  rightsData = json;
                  console.log(`[Audio Engine] Acquired rights successfully from ${host}`);
                  break;
                }
              }
            } catch (e: any) {
              console.warn(`[Audio Engine] Rights fetch error on ${host}:`, e?.message);
            }
          }
        }

        // Step B: Download the encrypted media file from CloudFront
        const candidateMediaUrls = [
          directUrl,
          clipId ? `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a` : null,
          clipId ? `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.mp3` : null,
        ].filter(Boolean) as string[];

        let rawEncryptedBuffer: Buffer | null = null;
        let matchedUrl = "";

        for (const mediaUrl of candidateMediaUrls) {
          try {
            const mediaRes = await fetch(mediaUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Referer": "https://suno.com/"
              }
            });
            if (mediaRes.ok) {
              const arr = await mediaRes.arrayBuffer();
              if (arr.byteLength > 1000) {
                rawEncryptedBuffer = Buffer.from(arr);
                matchedUrl = mediaUrl;
                break;
              }
            }
          } catch (e) {}
        }

        if (!rawEncryptedBuffer) {
          console.error(`[Audio Engine] Failed to download media bytes for clip: ${clipId}`);
          return null;
        }

        // If rights acquired, decrypt via AES-CTR (Suno DRM spec)
        if (rightsData) {
          const { key: encKeyB64, iv: encIvB64, glt } = rightsData;

          // 1. User key derivation (SHA-256 of glt -> AES-GCM)
          const gltBytes = new TextEncoder().encode(glt);
          const userKeyHash = await crypto.subtle.digest("SHA-256", gltBytes);
          const userKey = await crypto.subtle.importKey("raw", userKeyHash, { name: "AES-GCM" }, false, ["decrypt"]);

          // 2. Decode content key & IV (AES-GCM with iv = slice(0, 12), additionalData = clipId)
          const wrappedKey = Uint8Array.from(Buffer.from(encKeyB64, "base64"));
          const wrappedIv = Uint8Array.from(Buffer.from(encIvB64, "base64"));
          const additionalData = new TextEncoder().encode(clipId);

          const rawKey = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: wrappedKey.slice(0, 12), additionalData },
            userKey,
            wrappedKey.slice(12)
          );
          const contentKey = await crypto.subtle.importKey("raw", rawKey, { name: "AES-CTR" }, false, ["decrypt"]);

          const rawIv = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: wrappedIv.slice(0, 12), additionalData },
            userKey,
            wrappedIv.slice(12)
          );
          const contentIv = new Uint8Array(rawIv);

          // 3. Decrypt full audio stream
          const decBuf = await crypto.subtle.decrypt(
            { name: "AES-CTR", counter: contentIv, length: 128 },
            contentKey,
            rawEncryptedBuffer
          );

          const decryptedBuffer = Buffer.from(decBuf);

          // Sniff audio format
          let mimeType = "audio/mp4";
          if (decryptedBuffer.length >= 4 && decryptedBuffer[0] === 0x1A && decryptedBuffer[1] === 0x45 && decryptedBuffer[2] === 0xDF && decryptedBuffer[3] === 0xA3) {
            mimeType = "audio/webm";
          } else if (decryptedBuffer.length >= 3 && decryptedBuffer[0] === 0x49 && decryptedBuffer[1] === 0x44 && decryptedBuffer[2] === 0x33) {
            mimeType = "audio/mpeg";
          } else if (decryptedBuffer.length >= 2 && decryptedBuffer[0] === 0xFF && (decryptedBuffer[1] & 0xE0) === 0xE0) {
            mimeType = "audio/mpeg";
          }

          console.log(`[Audio Engine] Successfully decrypted ${clipId}: ${decryptedBuffer.length} bytes (${mimeType})`);

          const result: CachedAudio = {
            buffer: decryptedBuffer,
            mimeType,
            timestamp: Date.now()
          };

          pruneAudioCache();
          audioBufferCache.set(cacheKey, result);
          if (clipId && cacheKey !== clipId) audioBufferCache.set(clipId, result);
          return result;
        }

        // Fallback for unencrypted audio
        let mimeType = matchedUrl.endsWith(".mp3") ? "audio/mpeg" : "audio/mp4";
        const result: CachedAudio = {
          buffer: rawEncryptedBuffer,
          mimeType,
          timestamp: Date.now()
        };
        pruneAudioCache();
        audioBufferCache.set(cacheKey, result);
        return result;
      } catch (err: any) {
        console.error(`[Audio Engine] Decryption failed for ${clipId}:`, err);
        return null;
      } finally {
        pendingDecryptions.delete(cacheKey);
      }
    })();

    pendingDecryptions.set(cacheKey, decryptPromise);
    return decryptPromise;
  }

  // Strict validation helper to prevent SSRF
  function isAllowedAudioCdnUrl(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      if (parsed.protocol !== "https:") return false;
      const host = parsed.hostname.toLowerCase();
      // Allow only official media delivery domains
      const ALLOWED_CDN_HOSTS = [
        "d2lwuy8qc234o3.cloudfront.net",
        "cdn1.suno.ai",
        "cdn2.suno.ai",
        "audiopipe.suno.ai",
        "suno.com",
      ];
      return ALLOWED_CDN_HOSTS.some((allowed) => host === allowed || host.endsWith("." + allowed));
    } catch {
      return false;
    }
  }

  // Audio Streaming Proxy Endpoint with Full HTTP 206 Partial Content / Range Request Support
  app.get(["/api/suno-audio/:clipId", "/api/suno-audio", "/api/proxy-audio"], async (req, res) => {
    const clipId = ((req.params.clipId || req.query.id || req.query.clipId || "") as string).trim();
    let directUrl = (req.query.url as string)?.trim();

    // SSRF & Direct URL safety filtering
    if (directUrl && !isAllowedAudioCdnUrl(directUrl)) {
      console.warn(`[Security] Blocked unauthorized audio URL attempt: ${directUrl}`);
      directUrl = "";
    }

    // Set restricted streaming headers (avoid wildcard CORS for protected media)
    const requestOrigin = req.headers.origin;
    if (requestOrigin) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    }
    res.setHeader("Accept-Ranges", "bytes");

    try {
      const audioData = await resolveAndDecryptSunoAudio(clipId, directUrl);
      if (!audioData || !audioData.buffer || audioData.buffer.length === 0) {
        return res.status(404).json({ error: "Audio track not found or decryption failed", clipId });
      }

      const { buffer, mimeType } = audioData;
      const totalLength = buffer.length;
      const rangeHeader = req.headers.range;

      res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

        if (start >= totalLength || end >= totalLength || start > end) {
          res.setHeader("Content-Range", `bytes */${totalLength}`);
          return res.status(416).end();
        }

        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${totalLength}`);
        res.setHeader("Content-Length", chunkSize.toString());
        return res.end(buffer.subarray(start, end + 1));
      } else {
        res.status(200);
        res.setHeader("Content-Length", totalLength.toString());
        return res.end(buffer);
      }
    } catch (err: any) {
      console.error("[Audio API] Stream error:", err);
      return res.status(502).json({ error: "Audio streaming error", message: err?.message });
    }
  });

  // Authoritative Track Capabilities Server Endpoint
  app.get(["/api/track-capabilities/:clipId", "/api/track-capabilities"], (req, res) => {
    const clipId = ((req.params.clipId || req.query.id || req.query.clipId || "") as string).trim();
    
    // Server-side authoritative capabilities for protected catalog
    const capabilities = {
      canPlay: true,
      canDownload: false,
      canOpenInStudio: false,
      canRemix: false,
      canSeparateStems: false,
      canExport: false,
      canEdit: false,
      ownershipType: "JOE_CATALOG",
      clipId: clipId,
      protectionNotice: "Protected Joel / JOE artist catalog. Streaming and harmonic analysis only.",
    };

    res.json(capabilities);
  });

  // Suno Rights Proxy Endpoint (Fast JSON metadata token)
  app.get(["/api/suno-rights/:clipId", "/api/suno-rights"], async (req, res) => {
    const clipId = ((req.params.clipId || req.query.id || req.query.clipId || "") as string).trim();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=3600");

    if (!clipId) {
      return res.status(400).json({ error: "Missing clipId" });
    }

    const hosts = [
      "https://studio-api-prod.suno.com",
      "https://studio-api-prod.suno.ai",
      "https://suno.com"
    ];

    for (const host of hosts) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const response = await fetch(`${host}/api/mango/rights`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Origin": "https://suno.com",
            "Referer": `https://suno.com/song/${clipId}`
          },
          body: JSON.stringify({
            content_params: {
              content_id: clipId,
              content_type: "clip"
            }
          })
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          if (data && data.key && data.iv && data.glt) {
            return res.status(200).json(data);
          }
        }
      } catch (e) {}
    }

    return res.status(502).json({ error: "Failed to acquire rights token", clipId });
  });

  // Single Song Metadata Resolver endpoint
  app.get("/api/suno-song/:clipId", async (req, res) => {
    const clipId = req.params.clipId;
    res.setHeader("Access-Control-Allow-Origin", "*");

    // 1. Check SUNO_CATALOG_MASTER first for instant verified metadata
    for (const playlist of Object.values(SUNO_CATALOG_MASTER)) {
      const match = playlist.tracks?.find(t => t.id === clipId);
      if (match) {
        return res.json({
          id: clipId,
          title: match.title,
          artist: match.artist || "ELITEJOE",
          album: match.album || "Joel's Originals",
          duration: match.duration,
          audioUrl: match.audioUrl || `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`,
          streamUrl: `/api/suno-audio/${clipId}`,
          imageUrl: match.imageUrl || `https://cdn2.suno.ai/image_${clipId}.jpeg`,
          lyrics: match.lyrics,
          tags: match.tags,
          createdAt: match.createdAt
        });
      }
    }

    try {
      let oembedTitle = "";
      let oembedAuthor = "";
      try {
        const oembedRes = await fetch(`https://studio-api-prod.suno.com/api/oembed?url=https%3A%2F%2Fsuno.com%2Fsong%2F${clipId}`);
        if (oembedRes.ok) {
          const oembedData = await oembedRes.json();
          if (oembedData?.title) oembedTitle = oembedData.title;
          if (oembedData?.author_name) oembedAuthor = oembedData.author_name;
        }
      } catch (e) {}

      const songPage = await fetch(`https://suno.com/song/${clipId}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "text/html"
        }
      });
      if (songPage.ok) {
        const html = await songPage.text();
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        const rawTitle = titleMatch ? titleMatch[1].replace(/ \| Suno/i, "").replace(/ - Suno/i, "").trim() : "Suno Track";
        let title = oembedTitle || rawTitle;
        let artist = oembedAuthor || "ELITEJOE";
        if (rawTitle.includes(" by ")) {
          const parts = rawTitle.split(" by ");
          title = oembedTitle || parts[0].trim();
          artist = oembedAuthor || parts.slice(1).join(" by ").trim();
        }
        const mediaMatches = html.match(/https:\\\/\\\/[a-z0-9\.\-_]+\.cloudfront\.net\\\/[^\s"\\]+/g) || html.match(/https:\/\/[a-z0-9\.\-_]+\.cloudfront\.net\/[^\s"\\]+/g);
        const audioUrl = mediaMatches?.[0]?.replace(/\\\//g, "/") || `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`;
        
        return res.json({
          id: clipId,
          title,
          artist,
          audioUrl,
          streamUrl: `/api/suno-audio/${clipId}`,
          imageUrl: `https://cdn2.suno.ai/image_large_${clipId}.jpeg`
        });
      }
    } catch (e) {}

    res.json({
      id: clipId,
      title: "Suno Track",
      artist: "ELITEJOE",
      audioUrl: `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`,
      streamUrl: `/api/suno-audio/${clipId}`,
      imageUrl: `https://cdn2.suno.ai/image_${clipId}.jpeg`
    });
  });

  // Legacy Suno Feed endpoint for compatibility
  app.get("/api/suno/feed", async (req, res) => {
    try {
      const defaultPlaylistUrl = `${req.protocol}://${req.get("host")}/api/suno-playlist?id=7b5e949e-1d72-4685-9c7f-0fa5e5668190`;
      const response = await fetch(defaultPlaylistUrl);
      if (response.ok) {
        const data = await response.json();
        return res.json(data.tracks || []);
      }
      res.json([]);
    } catch (err: any) {
      res.json([]);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🎸 Guitar Studio Server ready!`);
    console.log(`   ➜ Local:   http://localhost:${PORT}/`);
    console.log(`   ➜ Network: http://127.0.0.1:${PORT}/`);
  });
}

startServer();
