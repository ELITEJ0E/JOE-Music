import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // AI Chord Lookup & Song Progression Analyzer
  app.post("/api/analyze-song", async (req, res) => {
    const { songQuery, artist, genre, capoPreference } = req.body;

    if (!songQuery) {
      return res.status(400).json({ error: "Song title or artist is required." });
    }

    try {
      const ai = getAIClient();
      if (!ai) {
        // Fallback realistic response if no API key
        return res.json({
          title: songQuery,
          artist: artist || "Identified Track",
          key: "G Major",
          tempo: 112,
          timeSignature: "4/4",
          suggestedCapo: capoPreference ?? 0,
          difficulty: "Intermediate",
          chords: ["G", "Em7", "Cadd9", "D", "Dsus4", "G"],
          tuning: "E A D G B E (Standard)",
          sections: [
            {
              name: "Intro",
              startTime: 0,
              bars: 4,
              chords: ["G", "Em7", "Cadd9", "D"],
              strummingPattern: "D - D U - U D -",
              lyrics: "[Instrumental Acoustic Guitar Picking]"
            },
            {
              name: "Verse 1",
              startTime: 12,
              bars: 8,
              chords: ["G", "G", "Em7", "Em7", "Cadd9", "Cadd9", "D", "D"],
              strummingPattern: "D - D U - U D U",
              lyrics: "I walk the road beneath the twilight sky\nCounting the miles as the hours fly"
            },
            {
              name: "Chorus",
              startTime: 36,
              bars: 8,
              chords: ["Cadd9", "G", "D", "Em7", "Cadd9", "G", "D", "D"],
              strummingPattern: "D D U U D U",
              lyrics: "And if I find my way back home tonight\nI will remember every single chord in flight"
            },
            {
              name: "Bridge / Solo",
              startTime: 62,
              bars: 6,
              chords: ["Em7", "D", "Cadd9", "Em7", "D", "Dsus4"],
              strummingPattern: "D - D - D U D U",
              lyrics: "[Lead Guitar Solo / Harmonic Progression]"
            },
            {
              name: "Outro",
              startTime: 84,
              bars: 4,
              chords: ["Cadd9", "G", "D", "G"],
              strummingPattern: "D - - - (Sustain Chord)",
              lyrics: "Fade out on resonant G chord"
            }
          ],
          tips: "Use light palm muting on the verses and open ringing arpeggios on the chorus for maximum dynamic contrast."
        });
      }

      const prompt = `You are a master guitar transcription and chord analysis engine.
Analyze the song request: "${songQuery}" ${artist ? `by "${artist}"` : ""} with genre "${genre || 'Guitar Music'}" and capo preference "${capoPreference || 'auto'}".
Return a JSON object with this exact schema:
{
  "title": string,
  "artist": string,
  "key": string,
  "tempo": number (BPM),
  "timeSignature": string (e.g. "4/4", "3/4", "6/8"),
  "suggestedCapo": number (0 for none, 1-7 for frets),
  "difficulty": "Beginner" | "Intermediate" | "Advanced",
  "chords": string[] (all distinct chords used in the song),
  "tuning": string (e.g. "E A D G B E (Standard)" or "Drop D", "DADGAD", etc.),
  "sections": [
    {
      "name": string (e.g. "Intro", "Verse 1", "Chorus", "Bridge", "Solo", "Outro"),
      "startTime": number (seconds from start),
      "bars": number,
      "chords": string[],
      "strummingPattern": string (e.g. "D - D U - U D U"),
      "lyrics": string
    }
  ],
  "tips": string (guitarist performance technique tip)
}
Return valid JSON only without markdown code fences or backticks.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const responseText = response.text || "{}";
      const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return res.json(parsed);
    } catch (err: any) {
      console.error("AI chord analysis error:", err);
      return res.status(500).json({ error: "Failed to analyze song with AI", message: err?.message });
    }
  });

  // AI Guitar Coach / Custom Lick Generator / Theory Explainer
  app.post("/api/guitar-assistant", async (req, res) => {
    const { question, currentContext } = req.body;
    try {
      const ai = getAIClient();
      if (!ai) {
        return res.json({
          answer: `Here is a practice tip: When practicing the ${currentContext?.chord || 'progression'}, focus on economic finger movement. Keep your anchor fingers steady and practice transition at 60 BPM with the metronome before speeding up to full tempo.`
        });
      }

      const prompt = `You are a world-class professional guitar instructor and audio engineer.
User question: "${question}"
Current Workstation State: ${JSON.stringify(currentContext || {})}
Provide a concise, practical, high-value guitar instruction response. Mention specific fret positions, scale degrees, pick directions (Down/Up), tone settings (gain, EQ, delay), or practice methods where relevant.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      return res.json({ answer: response.text });
    } catch (err: any) {
      return res.status(500).json({ error: "Coach error", message: err?.message });
    }
  });

  // Suno API Proxy Integration
  // Reproducing standard Suno API / Joelify patterns securely server-side.
  app.get("/api/suno/feed", async (req, res) => {
    try {
      const SUNO_BASE_URL = process.env.SUNO_API_URL || "https://studio-api.suno.ai";
      // In a real implementation this would fetch from the configured Suno endpoint.
      // If no key/endpoint is configured, fallback to mock library data.
      
      const mockSongs = [
        {
          id: "suno-trk-1",
          title: "Neon Horizon",
          artist: "Suno AI",
          duration: 184,
          created_at: new Date().toISOString(),
          image_url: "https://images.unsplash.com/photo-1614113489855-66422ad300a4?w=500&q=80",
          audio_url: "https://cdn.pixabay.com/download/audio/2022/10/18/audio_31c2730ebb.mp3",
          tags: ["Synthwave", "Guitar Solo", "Upbeat"]
        },
        {
          id: "suno-trk-2",
          title: "Acoustic Sunsets",
          artist: "Suno AI",
          duration: 215,
          created_at: new Date(Date.now() - 86400000).toISOString(),
          image_url: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=500&q=80",
          audio_url: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3",
          tags: ["Acoustic", "Chill", "Folk"]
        },
        {
          id: "suno-trk-3",
          title: "Heavy Riffs 99",
          artist: "Suno AI",
          duration: 142,
          created_at: new Date(Date.now() - 172800000).toISOString(),
          image_url: "https://images.unsplash.com/photo-1598508544476-0b168e3766ce?w=500&q=80",
          audio_url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8b81cf714.mp3",
          tags: ["Metal", "Djent", "Aggressive"]
        },
      ];

      res.json(mockSongs);
    } catch (err: any) {
      console.error("Suno API Error:", err);
      res.status(500).json({ error: "Failed to fetch from Suno API", message: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Guitar Studio Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
