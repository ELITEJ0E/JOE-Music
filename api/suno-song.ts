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

  const clipId = (req.query.clipId as string) || (req.query.id as string) || (req.url?.split('/').pop()?.split('?')[0]);
  if (!clipId) {
    return res.status(400).json({ error: 'clipId parameter is required' });
  }

  // 1. Check SUNO_CATALOG_MASTER
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
    let oembedTitle = '';
    let oembedAuthor = '';
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
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html'
      }
    });

    if (songPage.ok) {
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
      const mediaMatches = html.match(/https:\\\/\\\/[a-z0-9\.\-_]+\.cloudfront\.net\\\/[^\s"\\]+/g) || html.match(/https:\/\/[a-z0-9\.\-_]+\.cloudfront\.net\/[^\s"\\]+/g);
      const audioUrl = mediaMatches?.[0]?.replace(/\\\//g, '/') || `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`;

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

  return res.json({
    id: clipId,
    title: 'Suno Track',
    artist: 'ELITEJOE',
    audioUrl: `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`,
    streamUrl: `/api/suno-audio/${clipId}`,
    imageUrl: `https://cdn2.suno.ai/image_${clipId}.jpeg`
  });
}
