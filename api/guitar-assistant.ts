import { getAIClient } from "../src/lib/songAnalyzerEngine";

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

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const { question, currentContext } = body || {};

    const ai = getAIClient();
    if (!ai) {
      return res.status(200).json({
        answer: `Here is a practice tip: When practicing the ${currentContext?.chord || "progression"}, focus on economic finger movement. Keep your anchor fingers steady and practice transition at 60 BPM with the metronome before speeding up to full tempo.`
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

    return res.status(200).json({ answer: response.text });
  } catch (err: any) {
    console.error("Coach error:", err);
    return res.status(500).json({ error: "Coach error", message: err?.message });
  }
}
