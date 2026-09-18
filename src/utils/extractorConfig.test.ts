import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_EXTRACTOR_API,
  getExtractorApiUrl,
  isValidYouTubeUrl,
  extractYouTubeAudio,
} from "./extractorConfig";

describe("extractorConfig & extractYouTubeAudio", () => {
  describe("getExtractorApiUrl", () => {
    it("returns default Render backend URL when no env override is present", () => {
      const url = getExtractorApiUrl();
      expect(url).toBe(DEFAULT_EXTRACTOR_API);
      expect(url).not.toMatch(/\/$/); // no trailing slash
    });
  });

  describe("isValidYouTubeUrl", () => {
    it("recognizes standard youtube.com watch URLs", () => {
      expect(isValidYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
      expect(isValidYouTubeUrl("http://youtube.com/watch?v=dQw4w9WgXcQ&t=10s")).toBe(true);
      expect(isValidYouTubeUrl("www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    });

    it("recognizes youtu.be shortlinks", () => {
      expect(isValidYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
      expect(isValidYouTubeUrl("http://youtu.be/dQw4w9WgXcQ?si=1234")).toBe(true);
    });

    it("recognizes YouTube shorts and embed URLs", () => {
      expect(isValidYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
      expect(isValidYouTubeUrl("https://youtube.com/embed/dQw4w9WgXcQ")).toBe(true);
    });

    it("rejects non-YouTube or invalid URLs", () => {
      expect(isValidYouTubeUrl("")).toBe(false);
      expect(isValidYouTubeUrl("https://example.com/audio.mp3")).toBe(false);
      expect(isValidYouTubeUrl("random song title query")).toBe(false);
      expect(isValidYouTubeUrl(null as any)).toBe(false);
    });
  });

  describe("extractYouTubeAudio client", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("throws a validation error immediately if URL is invalid without network call", async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await expect(extractYouTubeAudio("not-a-youtube-url")).rejects.toThrow(
        /Invalid YouTube URL/i
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("successfully requests the backend and decodes audio blob and metadata headers", async () => {
      const mockBlob = new Blob(["fake-mp3-bytes"], { type: "audio/mpeg" });
      const mockHeaders = new Headers({
        "Content-Type": "audio/mpeg",
        "X-Video-Title": encodeURIComponent("Hotel California (Official Video)"),
        "X-Video-Artist": encodeURIComponent("Eagles"),
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: mockHeaders,
        blob: async () => mockBlob,
      });

      const result = await extractYouTubeAudio(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        undefined,
        "https://chord-extractor-7agu.onrender.com"
      );

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://chord-extractor-7agu.onrender.com/extract",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
        })
      );

      expect(result.title).toBe("Hotel California");
      expect(result.artist).toBe("Eagles");
      expect(result.blob).toBe(mockBlob);
    });

    it("handles 400 Bad Request with a clear user-friendly message", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid YouTube URL" }),
      });

      await expect(
        extractYouTubeAudio("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
      ).rejects.toThrow("Invalid YouTube URL provided. Please check the video link and try again.");
    });

    it("handles 413 Payload Too Large (video > 10 min) with appropriate error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 413,
        json: async () => ({ error: "Video exceeds 10 minutes" }),
      });

      await expect(
        extractYouTubeAudio("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
      ).rejects.toThrow(
        "This video is too long. The YouTube audio extractor has a 10-minute maximum limit."
      );
    });

    it("handles 500 Internal Server Error without leaking raw backend errors", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "yt-dlp exited with code 1" }),
      });

      await expect(
        extractYouTubeAudio("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
      ).rejects.toThrow(
        "Unable to extract audio from this YouTube video. The video may be private, age-restricted, region-blocked, or unavailable."
      );
    });

    it("handles network failure / connection refusal gracefully", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(
        extractYouTubeAudio("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
      ).rejects.toThrow(
        "Unable to reach the YouTube audio extractor. The server may be starting up or temporarily offline. Please try again in a few moments."
      );
    });

    it("handles empty response blob as extraction failure", async () => {
      const emptyBlob = new Blob([], { type: "audio/mpeg" });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        blob: async () => emptyBlob,
      });

      await expect(
        extractYouTubeAudio("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
      ).rejects.toThrow("Unable to extract this YouTube video. Please try another URL.");
    });
  });
});
