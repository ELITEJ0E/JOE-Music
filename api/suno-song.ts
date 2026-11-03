import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SUNO_CATALOG_MASTER } from '../src/lib/suno-catalog-data.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let rawParam = ((req.query.clipId || req.query.id || req.query.url || req.url?.split('/').pop()?.split('?')[0] || '') as string).trim();
  if (!rawParam) {
    return res.status(400).json({ error: 'clipId or url parameter is required' });
  }

  // 1. Extract UUID if directly present
  let uuidMatch = rawParam.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  let clipId = uuidMatch ? uuidMatch[1] : '';

  let resolvedUrl = rawParam.startsWith('http') ? rawParam : (clipId ? `https://suno.com/song/${clipId}` : `https://suno.com/s/${rawParam}`);

  // If no direct UUID (e.g. short link /s/ or /@user/), follow redirects to resolve canonical song page
  if (!clipId && rawParam.startsWith('http')) {
    try {
      const headRes = await fetch(rawParam, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html'
        }
      });
      resolvedUrl = headRes.url || rawParam;
      const redirectUuidMatch = resolvedUrl.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (redirectUuidMatch) {
        clipId = redirectUuidMatch[1];
      }
    } catch (e: any) {}
  }

  // 2. Check SUNO_CATALOG_MASTER
  if (clipId) {
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
          streamUrl: `/api/suno-audio/${clipId}?url=${encodeURIComponent(match.audioUrl || `https://cdn1.suno.ai/${clipId}.mp4`)}`,
          imageUrl: match.imageUrl || `https://cdn2.suno.ai/image_${clipId}.jpeg`,
          lyrics: match.lyrics,
          tags: match.tags,
          createdAt: match.createdAt
        });
      }
    }
  }

  try {
    let oembedTitle = '';
    let oembedAuthor = '';
    if (clipId) {
      try {
        const oembedRes = await fetch(`https://studio-api-prod.suno.com/api/oembed?url=https%3A%2F%2Fsuno.com%2Fsong%2F${clipId}`);
        if (oembedRes.ok) {
          const oembedData = await oembedRes.json();
          if (oembedData?.title) oembedTitle = oembedData.title;
          if (oembedData?.author_name) oembedAuthor = oembedData.author_name;
        }
      } catch (e) {}
    }

    const songPageTarget = clipId ? `https://suno.com/song/${clipId}` : resolvedUrl;
    const songPage = await fetch(songPageTarget, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html'
      }
    });

    if (songPage.ok) {
      if (!clipId) {
        const finalMatch = songPage.url.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        if (finalMatch) clipId = finalMatch[1];
      }

      const html = await songPage.text();
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const rawTitle = titleMatch ? titleMatch[1].replace(/ \| Suno/i, '').replace(/ - Suno/i, '').trim() : 'Suno Track';
      let title = oembedTitle || rawTitle;
      let artist = oembedAuthor || 'ELITEJOE';
      if (rawTitle.includes(' by ')) {
        const parts = rawTitle.split(' by ');
        title = oembedTitle || parts[0].trim();
        artist = oembedAuthor || parts.slice(1).join(' by ').trim();
      }

      const mediaMatches = html.match(/https:\\\/\\\/[a-z0-9\.\-_]+\.cloudfront\.net\\\/[^\s"\\]+/g) ||
                           html.match(/https:\/\/[a-z0-9\.\-_]+\.cloudfront\.net\/[^\s"\\]+/g) ||
                           html.match(/https:\/\/cdn[0-9]*\.suno\.ai\/[^\s"'\\]+\.(?:mp4|mp3|m4a)/gi);
      const audioUrl = mediaMatches?.[0]?.replace(/\\\//g, '/') || (clipId ? `https://cdn1.suno.ai/${clipId}.mp4` : "");

      const finalClipId = clipId || `suno-${Date.now()}`;
      return res.json({
        id: finalClipId,
        title: title && title !== "Suno" ? title : 'Suno Track',
        artist,
        audioUrl: audioUrl || (clipId ? `https://cdn1.suno.ai/${clipId}.mp4` : ""),
        streamUrl: `/api/suno-audio/${finalClipId}?url=${encodeURIComponent(audioUrl || `https://cdn1.suno.ai/${clipId}.mp4`)}`,
        imageUrl: clipId ? `https://cdn2.suno.ai/image_large_${clipId}.jpeg` : undefined
      });
    }
  } catch (e) {}

  const fallbackClipId = clipId || `suno-${Date.now()}`;
  const fallbackAudioUrl = clipId ? `https://cdn1.suno.ai/${clipId}.mp4` : `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${fallbackClipId}.m4a`;
  return res.json({
    id: fallbackClipId,
    title: 'Suno Track',
    artist: 'ELITEJOE',
    audioUrl: fallbackAudioUrl,
    streamUrl: `/api/suno-audio/${fallbackClipId}?url=${encodeURIComponent(fallbackAudioUrl)}`,
    imageUrl: clipId ? `https://cdn2.suno.ai/image_${clipId}.jpeg` : undefined
  });
}
