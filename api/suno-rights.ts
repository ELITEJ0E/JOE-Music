// =========================================================================
// Vercel Serverless Function: /api/suno-rights
// Fast, lightweight JSON proxy for Suno rights tokens (~300 bytes)
// =========================================================================

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=7200");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const clipId = ((req.query?.clipId || req.query?.id || req.body?.clipId || "") as string).trim();
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
    } catch (e: any) {
      console.warn(`[Vercel Rights API] Failed on ${host}:`, e?.message);
    }
  }

  return res.status(502).json({ error: "Failed to acquire rights token", clipId });
}
