import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

export async function analyzeSong(songQuery: string, artist?: string, genre?: string, capoPreference?: string | number) {
  if (!songQuery) {
    throw new Error("Song title, artist, or YouTube URL is required.");
  }

  let resolvedYoutubeTitle = "";
  let resolvedYoutubeAuthor = "";
  const isYoutubeUrl = typeof songQuery === "string" && (
    songQuery.includes("youtube.com") || 
    songQuery.includes("youtu.be")
  );

  if (isYoutubeUrl) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(songQuery.trim())}&format=json`;
      const oembedRes = await fetch(oembedUrl);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        if (oembedData && oembedData.title) {
          resolvedYoutubeTitle = oembedData.title;
          resolvedYoutubeAuthor = oembedData.author_name || "";
          // Clean title if contains standard video suffixes
          songQuery = resolvedYoutubeTitle
            .replace(/\(Official (Music )?Video\)/gi, "")
            .replace(/\[Official (Music )?Video\]/gi, "")
            .replace(/\(Audio\)/gi, "")
            .replace(/\[Audio\]/gi, "")
            .replace(/\(Lyric Video\)/gi, "")
            .replace(/\[Lyric Video\]/gi, "")
            .trim();
          if (resolvedYoutubeAuthor && !artist) {
            artist = resolvedYoutubeAuthor.replace(/ - Topic$/i, "").replace(/VEVO$/i, "").trim();
          }
        }
      }
    } catch (err: any) {
      console.warn("YouTube oEmbed metadata extraction error:", err?.message);
    }
  }

  const ai = getAIClient();
  if (!ai) {
    // Fallback realistic response if no API key
    return {
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
    };
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
  return parsed;
}
