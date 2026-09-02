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

  // Expose ONLY the VITE_AUDIO_EXTRACTOR_URL environment variable safely for client-side runtime recovery
  app.get("/api/extractor-url", (req, res) => {
    res.json({
      url: process.env.VITE_AUDIO_EXTRACTOR_URL || process.env.AUDIO_EXTRACTOR_URL || ""
    });
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
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=180, s-maxage=300");

    const browserHeaders = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://suno.com/",
      "Origin": "https://suno.com"
    };

    let foundData: any = null;

    // Step 1: Direct Suno Studio Prod API (Proven Joelify Endpoint)
    try {
      let currentPage = page;
      let allClips: any[] = [];
      let meta: any = null;

      // If requested page 1, fetch all pages up to 5 to get full playlist
      const maxPages = page === 1 ? 5 : page;
      while (currentPage <= maxPages) {
        const prodApiUrl = `https://studio-api.prod.suno.com/api/playlist/${encodeURIComponent(targetId)}/?page=${currentPage}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500); // fast timeout
        let response;
        try {
          response = await fetch(prodApiUrl, { headers: browserHeaders, signal: controller.signal });
        } catch (e: any) {
          clearTimeout(timeout);
          console.warn(`studio-api.prod.suno.com timeout or network error on page ${currentPage}`);
          break; // Fail fast, don't keep looping
        }
        
        clearTimeout(timeout);

        if (!response.ok) {
           console.warn(`studio-api.prod.suno.com returned status ${response.status}`);
           break; // Fail fast on 403, 500, etc.
        }

        const json = await response.json();
        meta = json;
        const clips = json.playlist_clips || json.clips || [];
        if (clips.length > 0) {
          allClips = allClips.concat(clips);
        }

        if (clips.length < 20 || !json.has_more || page !== 1) {
          break;
        }
        currentPage++;
      }

      if (allClips.length > 0 && meta) {
        foundData = {
          ...meta,
          playlist_clips: allClips,
          num_total_results: allClips.length
        };
      }
    } catch (e: any) {
      console.warn(`studio-api.prod.suno.com attempt failed for ${targetId}:`, e?.message);
    }

    // Step 2: Direct Suno Studio AI API
    if (!foundData) {
      try {
        const studioAiUrl = `https://studio-api.suno.ai/api/playlist/${encodeURIComponent(targetId)}/?page=${page}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(studioAiUrl, { headers: browserHeaders, signal: controller.signal });
        clearTimeout(timeout);

        if (response.ok) {
          const json = await response.json();
          const clips = json.playlist_clips || json.clips || [];
          if (clips.length > 0 || json.name) {
            foundData = json;
          }
        }
      } catch (e: any) {
        console.warn(`studio-api.suno.ai attempt failed for ${targetId}:`, e?.message);
      }
    }

    // Step 3: Direct Suno.com Next.js RSC HTML Scraper
    if (!foundData) {
      try {
        const pageUrl = `https://suno.com/playlist/${targetId}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(pageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5"
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
              num_total_results: foundClips.length,
            };
          }
        }
      } catch (e: any) {
        console.warn(`Direct scraper failed for ${targetId}:`, e?.message);
      }
    }

    // Step 4: Proxy Fallback Scrapers (Joelify proxy pipeline)
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

      try {
        const proxyPromises = proxies.map(async (proxy) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000); // 3s max for proxies
          try {
            const resProxy = await fetch(proxy.url(targetId), { signal: controller.signal });
            clearTimeout(timeout);

            if (!resProxy.ok) throw new Error("Proxy response not ok");

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
                return {
                  name: foundName,
                  playlist_clips: foundClips,
                  num_total_results: foundClips.length
                };
              }
            }
          } catch (e) {
            clearTimeout(timeout);
            throw e; 
          }
          throw new Error("No clips found via proxy");
        });

        foundData = await Promise.any(proxyPromises);
      } catch (err: any) {
        console.warn(`[Express API] All proxies failed.`);
      }
    }

    // Step 5: Process extracted data if available
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
        const cloudfrontUrl = `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`;
        const rawMediaUrl = Array.isArray(clip.media_urls) && clip.media_urls.length > 0
          ? (clip.media_urls.find((m: any) => m.url && !m.url.includes("forbidden") && !m.url.includes("cdn1.suno.ai"))?.url || clip.media_urls[0]?.url)
          : null;
        const audioUrl = (rawMediaUrl && !rawMediaUrl.includes("forbidden") && !rawMediaUrl.includes("cdn1.suno.ai"))
          ? rawMediaUrl
          : (clip.audio_url && !clip.audio_url.includes("forbidden") && !clip.audio_url.includes("cdn1.suno.ai"))
          ? clip.audio_url
          : cloudfrontUrl;
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
          streamUrl: `/api/suno-audio/${clipId}`,
          videoUrl: clip.video_url || clip.videoUrl || null,
          imageUrl: imageUrl,
          lyrics: clip.metadata?.prompt || clip.metadata?.text || clip.prompt || clip.lyrics || "[Instrumental Audio Track]",
          tags: tags,
          createdAt: clip.created_at || clip.createdAt || new Date().toISOString(),
          playCount: clip.play_count ?? clip.playCount ?? 1250,
          upvoteCount: clip.upvote_count ?? clip.upvoteCount ?? 88,
          // Compatibility aliases
          audio_url: audioUrl,
          image_url: imageUrl,
          created_at: clip.created_at || clip.createdAt || new Date().toISOString(),
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
          hasMore: hasMore
        });
      }
    }

    // Guaranteed Resilient Fallback containing ALL 93+ songs from SUNO_CATALOG_MASTER
    const fallback = SUNO_CATALOG_MASTER[targetId] || SUNO_CATALOG_MASTER["ff247038-e0ae-4778-989d-0529e575027b"];
    res.json({
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
          "https://studio-api.suno.ai",
          "https://suno.com"
        ];

        let rightsData: { key: string; iv: string; glt: string } | null = null;

        if (clipId) {
          for (const host of rightsHosts) {
            try {
              const rightsRes = await fetch(`${host}/api/mango/rights`, {
                method: "POST",
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

  // Audio Streaming Proxy Endpoint with Full HTTP 206 Partial Content / Range Request Support
  app.get(["/api/suno-audio/:clipId", "/api/suno-audio", "/api/proxy-audio"], async (req, res) => {
    const clipId = ((req.params.clipId || req.query.id || req.query.clipId || "") as string).trim();
    const directUrl = (req.query.url as string)?.trim();

    res.setHeader("Access-Control-Allow-Origin", "*");
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
      "https://studio-api.suno.ai",
      "https://suno.com"
    ];

    for (const host of hosts) {
      try {
        const response = await fetch(`${host}/api/mango/rights`, {
          method: "POST",
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
    try {
      const songPage = await fetch(`https://suno.com/song/${clipId}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "text/html"
        }
      });
      if (songPage.ok) {
        const html = await songPage.text();
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/ \| Suno/i, "").replace(/ - Suno/i, "").trim() : "Suno Track";
        const mediaMatches = html.match(/https:\\\/\\\/[a-z0-9\.\-_]+\.cloudfront\.net\\\/[^\s"\\]+/g) || html.match(/https:\/\/[a-z0-9\.\-_]+\.cloudfront\.net\/[^\s"\\]+/g);
        const audioUrl = mediaMatches?.[0]?.replace(/\\\//g, "/") || `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`;
        
        return res.json({
          id: clipId,
          title,
          audioUrl,
          streamUrl: `/api/suno-audio/${clipId}`,
          imageUrl: `https://cdn2.suno.ai/image_${clipId}.jpeg`
        });
      }
    } catch (e) {}

    res.json({
      id: clipId,
      title: "Suno Track",
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
