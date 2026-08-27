import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeSong } from '../src/lib/analyzeSong.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Add CORS headers for Vercel
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { songQuery, artist, genre, capoPreference } = req.body || {};
    
    // Allow aborting/timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), 30000)
    );

    const data = await Promise.race([
      analyzeSong(songQuery, artist, genre, capoPreference),
      timeoutPromise
    ]);

    return res.status(200).json(data);
  } catch (err: any) {
    if (err.message === 'Song title, artist, or YouTube URL is required.') {
      return res.status(400).json({ error: err.message });
    }
    console.error('Vercel analyze-song error:', err);
    return res.status(500).json({ error: 'Failed to analyze song with AI', message: err?.message });
  }
}
