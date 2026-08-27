// YouTube Audio Acquisition Provider & State Machine
// Provides explicit state management and real extraction backend integration

export type YouTubeAcquisitionState =
  | "IDLE"
  | "METADATA_LOADING"
  | "PLAYBACK_ONLY"
  | "AUDIO_ACQUISITION_AVAILABLE"
  | "DOWNLOADING_AUDIO"
  | "READY_FOR_ANALYSIS"
  | "ANALYZING"
  | "ERROR";

export interface YouTubeMetadata {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  duration?: number;
}

export interface YouTubeResolutionResult {
  audioBlob: Blob;
  fileName: string;
  title: string;
  artist: string;
  duration?: number;
}

/**
 * Resolves a YouTube video into a real audio Blob/File via server extraction endpoint.
 * Throws an explicit error if YouTube audio extraction is unavailable in the current deployment environment.
 * NEVER returns synthetic or faked audio.
 */
export async function resolveYouTubeAudio(videoId: string): Promise<YouTubeResolutionResult> {
  const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost:3000";
  const response = await fetch(`${origin}/api/youtube/audio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId }),
  });

  if (!response.ok) {
    let errMessage = "YouTube audio acquisition is unavailable in this deployment environment (yt-dlp server required).";
    try {
      const errData = await response.json();
      if (errData.error === "YOUTUBE_AUDIO_UNAVAILABLE" || errData.message) {
        errMessage = errData.message || errMessage;
      }
    } catch {}
    throw new Error(`YOUTUBE_AUDIO_UNAVAILABLE: ${errMessage}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    if (data.audioUrl) {
      const audioRes = await fetch(data.audioUrl);
      if (!audioRes.ok) {
        throw new Error("YOUTUBE_AUDIO_UNAVAILABLE: Failed to download extracted audio buffer.");
      }
      const blob = await audioRes.blob();
      return {
        audioBlob: blob,
        fileName: `${videoId}.mp3`,
        title: data.title || "YouTube Audio",
        artist: data.artist || "YouTube",
        duration: data.duration,
      };
    } else if (data.audioBase64) {
      const byteCharacters = atob(data.audioBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.mimeType || "audio/mpeg" });
      return {
        audioBlob: blob,
        fileName: `${videoId}.mp3`,
        title: data.title || "YouTube Audio",
        artist: data.artist || "YouTube",
        duration: data.duration,
      };
    }
  }

  // Direct binary audio response
  const blob = await response.blob();
  return {
    audioBlob: blob,
    fileName: `${videoId}.mp3`,
    title: `YouTube Video (${videoId})`,
    artist: "YouTube",
  };
}
