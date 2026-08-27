import { fetchYoutubeMetadata, extractYoutubeVideoId } from "../src/utils/youtubeHelper";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const query = req.query?.url || req.query?.videoId || req.query?.q || (req.body && req.body.url);
  if (!query) {
    return res.status(400).json({ error: "Missing YouTube URL or video ID parameter 'url'" });
  }

  try {
    const meta = await fetchYoutubeMetadata(query);
    if (!meta) {
      return res.status(404).json({ error: "Invalid or unfound YouTube video" });
    }
    return res.status(200).json(meta);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch YouTube info", message: err?.message });
  }
}
