// =========================================================================
// Client-Side Suno Audio Stream Resolver & Fallback Engine
// Provides zero-latency playback with automatic Vercel serverless failover
// =========================================================================

const blobUrlCache = new Map<string, string>();
const pendingBlobPromises = new Map<string, Promise<string | null>>();

/**
 * Derives the playable audio URL for a given Suno song or track ID.
 * Returns either the proxy endpoint or a decrypted Blob URL.
 */
export function getSunoStreamUrl(clipIdOrUrl: string): string {
  if (!clipIdOrUrl) return "";
  
  // If it is already a blob URL or data URL
  if (clipIdOrUrl.startsWith("blob:") || clipIdOrUrl.startsWith("data:")) {
    return clipIdOrUrl;
  }

  // Extract UUID if present
  const uuidMatch = clipIdOrUrl.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  const clipId = uuidMatch ? uuidMatch[1] : clipIdOrUrl;

  // Check if we have a cached client-side blob URL
  if (blobUrlCache.has(clipId)) {
    return blobUrlCache.get(clipId)!;
  }

  // Default to server-side streaming proxy endpoint
  return `/api/suno-audio/${clipId}`;
}

/**
 * Client-Side Browser Decryption Engine
 * Used as an instantaneous fallback when serverless edge functions on Vercel
 * or static hosts return 404/500/cold-start errors.
 */
export async function resolveClientDecryptedAudioBlob(clipId: string): Promise<string | null> {
  if (!clipId) return null;

  if (blobUrlCache.has(clipId)) {
    return blobUrlCache.get(clipId)!;
  }

  if (pendingBlobPromises.has(clipId)) {
    return pendingBlobPromises.get(clipId)!;
  }

  const promise = (async (): Promise<string | null> => {
    try {
      // Step 1: Obtain the session rights metadata
      let rightsData: { key: string; iv: string; glt: string } | null = null;

      // Try Vercel lightweight rights endpoint first
      try {
        const rightsRes = await fetch(`/api/suno-rights?clipId=${encodeURIComponent(clipId)}`);
        if (rightsRes.ok) {
          rightsData = await rightsRes.json();
        }
      } catch (e) {}

      // Fallback: Try studio-api-prod
      if (!rightsData) {
        try {
          const directRights = await fetch("https://studio-api-prod.suno.com/api/mango/rights", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content_params: { content_id: clipId, content_type: "clip" }
            })
          });
          if (directRights.ok) {
            rightsData = await directRights.json();
          }
        } catch (e) {}
      }

      // Step 2: Download the encrypted media file from CloudFront CDN (CORS is open: *)
      const mediaUrl = `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`;
      const mediaRes = await fetch(mediaUrl);
      if (!mediaRes.ok) return null;
      const encBuffer = await mediaRes.arrayBuffer();

      // Step 3: Decrypt using Web Crypto API if rights data is available
      if (rightsData && rightsData.key && rightsData.iv && rightsData.glt) {
        const { key: encKeyB64, iv: encIvB64, glt } = rightsData;

        const gltBytes = new TextEncoder().encode(glt);
        const userKeyHash = await window.crypto.subtle.digest("SHA-256", gltBytes);
        const userKey = await window.crypto.subtle.importKey("raw", userKeyHash, { name: "AES-GCM" }, false, ["decrypt"]);

        const wrappedKey = Uint8Array.from(atob(encKeyB64), (c) => c.charCodeAt(0));
        const wrappedIv = Uint8Array.from(atob(encIvB64), (c) => c.charCodeAt(0));
        const additionalData = new TextEncoder().encode(clipId);

        const rawKey = await window.crypto.subtle.decrypt(
          { name: "AES-GCM", iv: wrappedKey.slice(0, 12), additionalData },
          userKey,
          wrappedKey.slice(12)
        );
        const contentKey = await window.crypto.subtle.importKey("raw", rawKey, { name: "AES-CTR" }, false, ["decrypt"]);

        const rawIv = await window.crypto.subtle.decrypt(
          { name: "AES-GCM", iv: wrappedIv.slice(0, 12), additionalData },
          userKey,
          wrappedIv.slice(12)
        );
        const contentIv = new Uint8Array(rawIv);

        const decBuf = await window.crypto.subtle.decrypt(
          { name: "AES-CTR", counter: contentIv, length: 128 },
          contentKey,
          encBuffer
        );

        const uint8 = new Uint8Array(decBuf);
        let mimeType = "audio/mp4";
        if (uint8.length >= 4 && uint8[0] === 0x1A && uint8[1] === 0x45 && uint8[2] === 0xDF && uint8[3] === 0xA3) {
          mimeType = "audio/webm";
        }

        const blob = new Blob([decBuf], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        blobUrlCache.set(clipId, blobUrl);
        return blobUrl;
      }

      // If unencrypted stream
      const blob = new Blob([encBuffer], { type: "audio/mp4" });
      const blobUrl = URL.createObjectURL(blob);
      blobUrlCache.set(clipId, blobUrl);
      return blobUrl;
    } catch (err) {
      console.warn("[Suno Resolver] Client-side blob creation failed:", err);
      return null;
    } finally {
      pendingBlobPromises.delete(clipId);
    }
  })();

  pendingBlobPromises.set(clipId, promise);
  return promise;
}

/**
 * Downloads and decrypts the audio stream into a valid, playable Blob.
 * Handles server proxy fallback to client-side Web Crypto decryption.
 */
export async function fetchDecryptedAudioBlob(
  clipIdOrUrl: string
): Promise<{ blob: Blob; mimeType: string } | null> {
  if (!clipIdOrUrl) return null;

  // Case 1: If it is already a blob: URL
  if (clipIdOrUrl.startsWith("blob:")) {
    try {
      const res = await fetch(clipIdOrUrl);
      if (res.ok) {
        const blob = await res.blob();
        return { blob, mimeType: blob.type || "audio/mp4" };
      }
    } catch (e) {
      console.warn("[Suno Resolver] Failed to fetch blob url directly:", e);
    }
  }

  // Extract UUID if present
  const uuidMatch = clipIdOrUrl.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  const clipId = uuidMatch ? uuidMatch[1] : null;

  // Case 2: Try server-side proxy endpoint first if clipId is present
  if (clipId) {
    try {
      const proxyRes = await fetch(`/api/suno-audio/${clipId}`);
      if (proxyRes.ok) {
        const ct = proxyRes.headers.get("content-type") || "audio/mp4";
        const buf = await proxyRes.arrayBuffer();
        if (buf.byteLength > 1000) {
          const blob = new Blob([buf], { type: ct });
          return { blob, mimeType: ct };
        }
      }
    } catch (proxyErr) {
      console.warn("[Suno Resolver] Server proxy fetch error, falling back to client decryption:", proxyErr);
    }

    // Case 3: Fallback to client-side Web Crypto decryption
    try {
      const blobUrl = await resolveClientDecryptedAudioBlob(clipId);
      if (blobUrl) {
        const blobRes = await fetch(blobUrl);
        if (blobRes.ok) {
          const blob = await blobRes.blob();
          return { blob, mimeType: blob.type || "audio/mp4" };
        }
      }
    } catch (clientErr) {
      console.warn("[Suno Resolver] Client-side decryption fallback error:", clientErr);
    }
  }

  // Case 4: Generic URL fetch
  try {
    const res = await fetch(clipIdOrUrl);
    if (res.ok) {
      const ct = res.headers.get("content-type") || "audio/mpeg";
      const blob = await res.blob();
      return { blob, mimeType: ct };
    }
  } catch (err) {
    console.error("[Suno Resolver] Failed to fetch audio stream:", err);
  }

  return null;
}

/**
 * Downloads and decrypts the audio stream into a File object suitable for analyzeAudioFile or Web Audio API.
 */
export async function fetchDecryptedAudioFile(
  clipIdOrUrl: string,
  title: string = "Suno Track"
): Promise<File | null> {
  const result = await fetchDecryptedAudioBlob(clipIdOrUrl);
  if (!result || !result.blob || result.blob.size === 0) return null;

  const sanitizedTitle = (title || "Track").replace(/[^\w\s-]/gi, "_").trim() || "Track";
  const ext = result.mimeType.includes("mp4") || result.mimeType.includes("m4a") ? "m4a" : (result.mimeType.includes("webm") ? "webm" : "mp3");

  return new File([result.blob], `${sanitizedTitle}.${ext}`, {
    type: result.mimeType,
    lastModified: Date.now(),
  });
}

