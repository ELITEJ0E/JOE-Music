import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Verified chord timelines live in Cloudflare D1, not in Vercel's ephemeral filesystem.
 * No pre-seeded or browser-asserted transcription is considered verified.
 *
 * Required Vercel environment variables:
 * CF_D1_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_D1_API_TOKEN
 * Optional for curated publishing: CHORD_PUBLISH_TOKEN
 */
const isVideoId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(value);

const configured = () => Boolean(
  process.env.CF_D1_ACCOUNT_ID &&
  process.env.CF_D1_DATABASE_ID &&
  process.env.CF_D1_API_TOKEN
);

type D1Row = { song_json?: string };
async function queryD1(sql: string, params: Array<string | number> = []): Promise<D1Row[]> {
  const account = process.env.CF_D1_ACCOUNT_ID!;
  const database = process.env.CF_D1_DATABASE_ID!;
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(database)}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CF_D1_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!response.ok) throw new Error(`D1 request failed: HTTP ${response.status}`);
  const body = await response.json() as {
    success?: boolean;
    errors?: unknown[];
    result?: Array<{ success?: boolean; results?: D1Row[] }>;
  };
  if (!body.success || !body.result?.[0]?.success) {
    throw new Error('D1 SQL query failed');
  }
  return body.result[0].results || [];
}

function validSegments(value: unknown): value is Array<{chord: string; startTime: number; endTime: number}> {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10000) return false;
  let previousEnd = -1;
  for (const segment of value) {
    if (!segment || typeof segment.chord !== 'string' || !segment.chord ||
        segment.chord.length > 32 || !Number.isFinite(segment.startTime) ||
        !Number.isFinite(segment.endTime) || segment.startTime < 0 ||
        segment.endTime <= segment.startTime || segment.endTime > 86400 ||
        segment.startTime < previousEnd - 0.05) return false;
    previousEnd = segment.endTime;
  }
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!configured()) {
    return res.status(503).json({
      success: false,
      verified: false,
      code: 'CHORD_LIBRARY_NOT_CONFIGURED',
      message: 'Cloudflare D1 chord library is not configured.',
    });
  }

  try {
    if (req.method === 'GET') {
      const videoId = req.query.videoId || req.query.id;
      if (!isVideoId(videoId)) {
        return res.status(400).json({ error: 'A valid 11-character videoId is required' });
      }
      const rows = await queryD1(
        'SELECT song_json FROM verified_chords WHERE video_id = ? LIMIT 1',
        [videoId]
      );
      if (!rows.length || !rows[0].song_json) {
        return res.status(404).json({ success: false, verified: false, videoId });
      }
      const song = JSON.parse(rows[0].song_json);
      if (!validSegments(song.chordSegments) || song.analysisSource !== 'audio') {
        return res.status(404).json({ success: false, verified: false, videoId });
      }
      return res.status(200).json({
        success: true,
        verified: true,
        source: 'curated_audio_analysis',
        videoId,
        engineVersion: song.analysisVersion || 'unknown',
        song,
      });
    }

    // Only the owner can curate records. A browser-provided 'analysisSource'
    // field is not evidence of real transcription.
    const publishSecret = process.env.CHORD_PUBLISH_TOKEN;
    const authHeader = req.headers.authorization || '';
    if (!publishSecret || authHeader !== `Bearer ${publishSecret}`) {
      return res.status(401).json({ error: 'Authorized publishing required' });
    }

    const { videoId, song } = req.body || {};
    if (!isVideoId(videoId) || !song || song.analysisSource !== 'audio' ||
        !validSegments(song.chordSegments)) {
      return res.status(400).json({ error: 'Invalid curated audio-derived chord analysis' });
    }

    const { audioBlob: _audioBlob, audioUrl: _audioUrl, ...rest } = song;
    const cleanSong = {
      ...rest,
      id: `yt-${videoId}`,
      videoId,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      analysisSource: 'audio',
      verifiedAt: Date.now(),
    };
    const serialized = JSON.stringify(cleanSong);
    if (serialized.length > 300000) {
      return res.status(413).json({ error: 'Chord data is too large' });
    }
    await queryD1(
      'INSERT INTO verified_chords (video_id, song_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(video_id) DO UPDATE SET song_json=excluded.song_json, updated_at=excluded.updated_at',
      [videoId, serialized, Date.now()]
    );
    return res.status(200).json({ success: true, verified: true, videoId });
  } catch (error) {
    console.error('[Verified Chords] D1 error:', error);
    return res.status(502).json({
      success: false,
      verified: false,
      code: 'CHORD_DATABASE_UNAVAILABLE',
      message: 'Shared chord library is temporarily unavailable.',
    });
  }
}
