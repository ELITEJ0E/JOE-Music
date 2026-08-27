import { analyzeSongWithAI } from "../src/lib/songAnalyzerEngine";

export default async function handler(req: any, res: any) {
  // CORS & Methods
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

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    // Allow query parameters as fallback
    const songQuery = body?.songQuery || req.query?.songQuery || req.query?.q || "";
    const artist = body?.artist || req.query?.artist || "";
    const genre = body?.genre || req.query?.genre || "";
    const capoPreference = body?.capoPreference || req.query?.capoPreference;

    if (!songQuery) {
      return res.status(400).json({ error: "Song title, artist, or YouTube URL is required." });
    }

    const result = await analyzeSongWithAI({
      songQuery,
      artist,
      genre,
      capoPreference,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Vercel /api/analyze-song error:", error);
    return res.status(500).json({
      error: "Failed to analyze song with AI",
      message: error?.message || "Internal server error",
    });
  }
}
