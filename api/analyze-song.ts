export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  return res.status(501).json({
    error: "Server-side YouTube audio acquisition is technically restricted in this deployment environment (Cloud Run / Vercel) due to IP blocking. Real MIR analysis requires an audio file. Please upload a local audio file or select a sample song."
  });
}
