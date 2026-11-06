import type { VercelRequest, VercelResponse } from '@vercel/node';

// Legacy compatibility: extractor service is disabled; never advertise an expired Render host.
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(200).json({ url: null, enabled: false, message: 'Use verified chord library or analyze authorized uploaded audio.' });
}
