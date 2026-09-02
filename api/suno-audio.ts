// =========================================================================
// Vercel Serverless Function: /api/suno-audio
// Full server-side streaming proxy with Range support for Vercel deployments
// =========================================================================

interface CachedAudio {
  buffer: Buffer;
  mimeType: string;
  timestamp: number;
}

const audioBufferCache = new Map<string, CachedAudio>();
const pendingDecryptions = new Map<string, Promise<CachedAudio | null>>();

async function resolveAndDecryptSunoAudio(clipId: string): Promise<CachedAudio | null> {
  if (!clipId) return null;

  const cached = audioBufferCache.get(clipId);
  if (cached && Date.now() - cached.timestamp < 4 * 3600 * 1000) {
    return cached;
  }

  if (pendingDecryptions.has(clipId)) {
    return pendingDecryptions.get(clipId)!;
  }

  const decryptPromise = (async (): Promise<CachedAudio | null> => {
    try {
      const rightsHosts = [
        "https://studio-api-prod.suno.com",
        "https://studio-api.suno.ai",
        "https://suno.com"
      ];

      let rightsData: { key: string; iv: string; glt: string } | null = null;

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
              break;
            }
          }
        } catch (e: any) {}
      }

      // Download audio stream from CloudFront
      const mediaRes = await fetch(`https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Referer": "https://suno.com/"
        }
      });

      if (!mediaRes.ok) return null;
      const rawEncryptedBuffer = Buffer.from(await mediaRes.arrayBuffer());

      if (rightsData) {
        const { key: encKeyB64, iv: encIvB64, glt } = rightsData;

        // User key derivation (SHA-256 of glt -> AES-GCM)
        const gltBytes = new TextEncoder().encode(glt);
        const userKeyHash = await crypto.subtle.digest("SHA-256", gltBytes);
        const userKey = await crypto.subtle.importKey("raw", userKeyHash, { name: "AES-GCM" }, false, ["decrypt"]);

        // Decode content key & IV (AES-GCM with additionalData = clipId)
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

        // Decrypt full audio stream
        const decBuf = await crypto.subtle.decrypt(
          { name: "AES-CTR", counter: contentIv, length: 128 },
          contentKey,
          rawEncryptedBuffer
        );

        const decryptedBuffer = Buffer.from(decBuf);
        let mimeType = "audio/mp4";
        if (decryptedBuffer.length >= 4 && decryptedBuffer[0] === 0x1A && decryptedBuffer[1] === 0x45 && decryptedBuffer[2] === 0xDF && decryptedBuffer[3] === 0xA3) {
          mimeType = "audio/webm";
        }

        const result: CachedAudio = {
          buffer: decryptedBuffer,
          mimeType,
          timestamp: Date.now()
        };

        audioBufferCache.set(clipId, result);
        return result;
      }

      const result: CachedAudio = {
        buffer: rawEncryptedBuffer,
        mimeType: "audio/mp4",
        timestamp: Date.now()
      };
      audioBufferCache.set(clipId, result);
      return result;
    } catch (err) {
      console.error("[Vercel Audio] Decryption failed for", clipId, err);
      return null;
    } finally {
      pendingDecryptions.delete(clipId);
    }
  })();

  pendingDecryptions.set(clipId, decryptPromise);
  return decryptPromise;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
  res.setHeader("Accept-Ranges", "bytes");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const clipId = ((req.query?.clipId || req.query?.id || req.params?.clipId || "") as string).trim();
  if (!clipId) {
    return res.status(400).json({ error: "Missing clipId parameter" });
  }

  try {
    const audioData = await resolveAndDecryptSunoAudio(clipId);
    if (!audioData || !audioData.buffer || audioData.buffer.length === 0) {
      return res.status(404).json({ error: "Audio track unavailable or decryption failed", clipId });
    }

    const { buffer, mimeType } = audioData;
    const totalLength = buffer.length;
    const rangeHeader = req.headers?.range;

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=86400, immutable");

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
    console.error("[Vercel Audio] Error handling request:", err);
    return res.status(502).json({ error: "Streaming error", message: err?.message });
  }
}
