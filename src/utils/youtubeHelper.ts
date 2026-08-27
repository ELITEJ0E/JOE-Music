/**
 * YouTube Utility functions for URL parsing, ID extraction, metadata retrieval,
 * and synchronized embedded playback.
 */

export interface YoutubeTrackMetadata {
  videoId: string;
  title: string;
  artist: string;
  rawTitle: string;
  author: string;
  thumbnailUrl: string;
  cleanQuery: string;
  embedUrl: string;
}

/**
 * Extracts the 11-character YouTube video ID from various URL formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://music.youtube.com/watch?v=VIDEO_ID
 * - Or raw 11-character ID
 */
export function extractYoutubeVideoId(urlOrId: string): string | null {
  if (!urlOrId || typeof urlOrId !== "string") return null;
  const str = urlOrId.trim();

  // Direct 11-character alphanumeric ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }

  // Standard watch or music URL: ?v=XXXXXXXXXXX or &v=XXXXXXXXXXX
  const vParamMatch = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
  if (vParamMatch && vParamMatch[1]) {
    return vParamMatch[1];
  }

  // youtu.be/XXXXXXXXXXX
  const shortMatch = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (shortMatch && shortMatch[1]) {
    return shortMatch[1];
  }

  // embed/XXXXXXXXXXX or shorts/XXXXXXXXXXX or v/XXXXXXXXXXX
  const pathMatch = str.match(/youtube\.com\/(?:embed|shorts|v|live)\/([a-zA-Z0-9_-]{11})/i);
  if (pathMatch && pathMatch[1]) {
    return pathMatch[1];
  }

  return null;
}

/**
 * Returns true if the string is a valid YouTube URL or video ID
 */
export function isValidYoutubeUrl(input: string): boolean {
  return extractYoutubeVideoId(input) !== null;
}

/**
 * Returns the highest quality thumbnail URL for a given YouTube Video ID
 */
export function getYoutubeThumbnail(videoId: string, quality: "hq" | "max" | "mq" = "hq"): string {
  if (!videoId) return "";
  if (quality === "max") {
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }
  if (quality === "mq") {
    return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  }
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Generates an optimized embed URL for iframe embedding with API control
 */
export function getYoutubeEmbedUrl(videoId: string, options: { autoplay?: boolean; start?: number; origin?: string } = {}): string {
  if (!videoId) return "";
  const params = new URLSearchParams({
    enablejsapi: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3",
  });
  if (options.autoplay) params.set("autoplay", "1");
  if (options.start && options.start > 0) params.set("start", Math.floor(options.start).toString());
  if (options.origin) params.set("origin", options.origin);

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/**
 * Cleans YouTube video titles to isolate real Song Name and Artist
 * e.g. "Eagles - Hotel California (Official Audio)" -> Artist: "Eagles", Title: "Hotel California"
 */
export function cleanYoutubeMetadata(rawTitle: string, authorName: string = ""): { title: string; artist: string; cleanQuery: string } {
  let cleaned = rawTitle || "";
  let artist = authorName || "";

  // Strip standard video noise suffixes
  cleaned = cleaned
    .replace(/\(Official (Music )?Video\)/gi, "")
    .replace(/\[Official (Music )?Video\]/gi, "")
    .replace(/\(Official Audio\)/gi, "")
    .replace(/\[Official Audio\]/gi, "")
    .replace(/\(Audio\)/gi, "")
    .replace(/\[Audio\]/gi, "")
    .replace(/\(Lyric Video\)/gi, "")
    .replace(/\[Lyric Video\]/gi, "")
    .replace(/\(Lyrics\)/gi, "")
    .replace(/\[Lyrics\]/gi, "")
    .replace(/\(Visualizer\)/gi, "")
    .replace(/\[Visualizer\]/gi, "")
    .replace(/\(HD\)/gi, "")
    .replace(/\[HD\]/gi, "")
    .replace(/\(HQ\)/gi, "")
    .replace(/\[HQ\]/gi, "")
    .replace(/\(4K\)/gi, "")
    .replace(/\[4K\]/gi, "")
    .replace(/\(Remastered.*?\)/gi, "")
    .replace(/\[Remastered.*?\]/gi, "")
    .replace(/\(Live.*?\)/gi, "")
    .replace(/\[Live.*?\]/gi, "")
    .trim();

  // Clean author
  artist = artist
    .replace(/ - Topic$/i, "")
    .replace(/VEVO$/i, "")
    .replace(/ Official$/i, "")
    .trim();

  // Check if title has "Artist - Title" format
  if (cleaned.includes(" - ")) {
    const parts = cleaned.split(" - ");
    if (parts.length >= 2) {
      const parsedArtist = parts[0].trim();
      const parsedTitle = parts.slice(1).join(" - ").trim();
      if (parsedArtist && parsedTitle) {
        if (!artist || artist === "YouTube" || artist.toLowerCase().includes("records")) {
          artist = parsedArtist;
        }
        cleaned = parsedTitle;
      }
    }
  }

  // Remove surrounding quotes
  cleaned = cleaned.replace(/^["']+|["']+$/g, "").trim();

  const cleanQuery = artist ? `${cleaned} by ${artist}` : cleaned;

  return {
    title: cleaned || rawTitle,
    artist: artist,
    cleanQuery,
  };
}

/**
 * Fetches YouTube video metadata via YouTube oEmbed API / noembed API with fallback
 */
export async function fetchYoutubeMetadata(urlOrId: string): Promise<YoutubeTrackMetadata | null> {
  const videoId = extractYoutubeVideoId(urlOrId);
  if (!videoId) return null;

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let rawTitle = "";
  let author = "";

  // 1. Try official YouTube oEmbed API
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && data.title) {
        rawTitle = data.title;
        author = data.author_name || "";
      }
    }
  } catch {
    // try fallback
  }

  // 2. Fallback to Noembed if oEmbed failed
  if (!rawTitle) {
    try {
      const noembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`;
      const res = await fetch(noembedUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.title) {
          rawTitle = data.title;
          author = data.author_name || "";
        }
      }
    } catch {
      // ignore
    }
  }

  // If we couldn't fetch metadata (e.g. offline/CORS), use fallback defaults with videoId
  if (!rawTitle) {
    rawTitle = `YouTube Track (${videoId})`;
  }

  const { title, artist, cleanQuery } = cleanYoutubeMetadata(rawTitle, author);
  const thumbnailUrl = getYoutubeThumbnail(videoId, "hq");
  const embedUrl = getYoutubeEmbedUrl(videoId);

  return {
    videoId,
    title,
    artist,
    rawTitle,
    author,
    thumbnailUrl,
    cleanQuery,
    embedUrl,
  };
}
