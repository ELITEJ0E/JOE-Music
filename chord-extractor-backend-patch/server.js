import express from "express";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

const app = express();
app.use(express.json());

const MAX_DURATION_SECONDS = 600;
const MAX_CONCURRENT_EXTRACTIONS = 2;
let activeExtractions = 0;

// ===============================
// Health & Diagnostic Status
// ===============================
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "chord-extractor-backend",
    activeExtractions,
    maxDurationSeconds: MAX_DURATION_SECONDS,
  });
});

// ===============================
// Cookie handling
// ===============================
function getCookieFile() {
  if (!process.env.YOUTUBE_COOKIES) {
    return null;
  }
  const cookiePath = path.join(os.tmpdir(), "youtube-cookies.txt");
  try {
    fs.writeFileSync(cookiePath, process.env.YOUTUBE_COOKIES);
    return cookiePath;
  } catch (err) {
    console.error("Failed to write cookie file:", err);
    return null;
  }
}

// ===============================
// Single-Pass Audio + Metadata Extractor
// Eliminates duplicate yt-dlp invocations
// ===============================
function runSinglePassYtDlp(url, outputTemplate, onProcessStarted) {
  return new Promise((resolve, reject) => {
    const cookies = getCookieFile();
    const args = [
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "5",
      "--print-json",
      "--match-filter",
      `duration <= ${MAX_DURATION_SECONDS}`,
      "--extractor-args",
      "youtube:player_client=android,web",
      "--no-playlist",
      "--js-runtimes",
      "deno",
    ];

    if (cookies) {
      args.push("--cookies", cookies);
    }

    args.push("-o", outputTemplate, url);

    const proc = spawn("yt-dlp", args);
    onProcessStarted?.(proc);

    let stdoutData = "";
    let stderrData = "";

    proc.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        let meta = {};
        try {
          const firstLine = stdoutData.trim().split("\n")[0];
          meta = JSON.parse(firstLine);
        } catch {
          // Metadata JSON parse warning, non-fatal if audio file exists
        }

        resolve({
          title: meta.title || "YouTube Track",
          artist: meta.uploader || meta.artist || "YouTube Artist",
          duration: meta.duration || 0,
        });
      } else {
        const fullOutput = (stderrData + "\n" + stdoutData).trim();
        console.error(`yt-dlp exited with code ${code}:`, fullOutput);

        // Structured diagnostic classification
        if (
          fullOutput.includes("HTTP Error 429") ||
          fullOutput.includes("Too Many Requests")
        ) {
          const err = new Error("Upstream YouTube access restricted (HTTP 429 Rate Limit)");
          err.code = "YOUTUBE_RATE_LIMITED";
          err.status = 429;
          return reject(err);
        }

        if (
          fullOutput.includes("Sign in to confirm you're not a bot") ||
          fullOutput.includes("Sign in to confirm you’re not a bot") ||
          fullOutput.includes("bot verification")
        ) {
          const err = new Error("YouTube bot verification challenge active on cloud IP");
          err.code = "YOUTUBE_BOT_CHALLENGE";
          err.status = 403;
          return reject(err);
        }

        if (
          fullOutput.includes("HTTP Error 403") ||
          fullOutput.includes("Forbidden")
        ) {
          const err = new Error("Upstream YouTube access forbidden (HTTP 403)");
          err.code = "YOUTUBE_HTTP_403";
          err.status = 403;
          return reject(err);
        }

        if (
          fullOutput.includes("does not pass filter duration") ||
          fullOutput.includes("Video too long")
        ) {
          const err = new Error(`Video exceeds maximum duration limit of ${MAX_DURATION_SECONDS} seconds`);
          err.code = "VIDEO_TOO_LONG";
          err.status = 413;
          return reject(err);
        }

        if (
          fullOutput.includes("Video unavailable") ||
          fullOutput.includes("Private video")
        ) {
          const err = new Error("This YouTube video is unavailable or restricted");
          err.code = "VIDEO_UNAVAILABLE";
          err.status = 404;
          return reject(err);
        }

        const err = new Error(fullOutput || "Extraction failed");
        err.code = "EXTRACTION_FAILED";
        err.status = 500;
        reject(err);
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

// ===============================
// Extract endpoint
// ===============================
app.post("/extract", async (req, res) => {
  const { url } = req.body || {};
  if (!url || !/youtu\.?be/.test(url)) {
    return res.status(400).json({
      success: false,
      code: "INVALID_URL",
      stage: "audio_retrieval",
      retryable: false,
      source: "render_backend",
      message: "A valid YouTube URL is required.",
    });
  }

  // Enforce concurrency limit to prevent Render memory saturation
  if (activeExtractions >= MAX_CONCURRENT_EXTRACTIONS) {
    return res.status(429).json({
      success: false,
      code: "SERVER_BUSY",
      stage: "audio_retrieval",
      retryable: true,
      source: "render_backend",
      message: "Server is currently processing other extractions. Please retry in a few moments.",
    });
  }

  activeExtractions++;

  const jobId = crypto.randomBytes(8).toString("hex");
  const tmpDir = os.tmpdir();
  const outputTemplate = path.join(tmpDir, `${jobId}.%(ext)s`);
  const mp3Path = path.join(tmpDir, `${jobId}.mp3`);

  let currentProc = null;
  let isCleanedUp = false;

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    activeExtractions = Math.max(0, activeExtractions - 1);
    if (currentProc) {
      try {
        currentProc.kill("SIGTERM");
      } catch {}
    }
    // Delete any artifacts created for this job
    try {
      if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
    } catch {}
  };

  // Terminate process if client cancels or closes HTTP socket early
  req.on("close", () => {
    if (!res.writableEnded) {
      console.log(`[Job ${jobId}] Client aborted request, cleaning up...`);
      cleanup();
    }
  });

  try {
    console.log(`[Job ${jobId}] Starting single-pass extraction for:`, url);

    const meta = await runSinglePassYtDlp(url, outputTemplate, (p) => {
      currentProc = p;
    });

    if (!fs.existsSync(mp3Path)) {
      cleanup();
      return res.status(500).json({
        success: false,
        code: "AUDIO_FILE_MISSING",
        stage: "conversion",
        retryable: false,
        source: "render_backend",
        message: "Converted audio file could not be generated.",
      });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("X-Video-Title", encodeURIComponent(meta.title || ""));
    res.setHeader("X-Video-Artist", encodeURIComponent(meta.artist || ""));
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "X-Video-Title,X-Video-Artist");

    const stream = fs.createReadStream(mp3Path);
    stream.pipe(res);

    stream.on("close", () => {
      cleanup();
    });

    stream.on("error", (err) => {
      console.error(`[Job ${jobId}] Stream error:`, err);
      cleanup();
    });
  } catch (err) {
    cleanup();
    const status = err.status || 500;
    const code = err.code || "EXTRACTION_FAILED";
    console.error(`[Job ${jobId}] Failed:`, err.message);

    res.status(status).json({
      success: false,
      code,
      stage: "audio_retrieval",
      retryable: status === 429,
      source: "render_backend",
      message: err.message || "Failed to extract audio",
    });
  }
});

// ===============================
// CORS Preflight
// ===============================
app.options(["/extract", "/"], (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(200).end();
});

// ===============================
// Server Listen
// ===============================
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Extractor listening on ${PORT}`);
});
