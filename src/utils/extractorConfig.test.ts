import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_EXTRACTOR_API,
  getExtractorApiUrl,
  isValidYouTubeUrl,
  extractYouTubeVideoId,
  normalizeYouTubeUrl,
  pingExtractorWarmup,
  isExtractionInFlight,
  getActiveExtractionCount,
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

  describe("extractYouTubeVideoId & normalizeYouTubeUrl", () => {
    it("extracts video ID from standard watch URL", () => {
      expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
      expect(extractYouTubeVideoId("https://youtube.com/watch?v=dQw4w9WgXcQ&t=45s")).toBe("dQw4w9WgXcQ");
    });

    it("extracts video ID from short URLs and shorts", () => {
      expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
      expect(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
      expect(extractYouTubeVideoId("https://youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("normalizes various URL formats to standard canonical URL", () => {
      expect(normalizeYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?si=test1234")).toBe(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      );
      expect(normalizeYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      );
    });

    it("returns null or empty for non-YouTube strings", () => {
      expect(extractYouTubeVideoId("https://example.com/audio.mp3")).toBeNull();
      expect(extractYouTubeVideoId("")).toBeNull();
      expect(normalizeYouTubeUrl("")).toBe("");
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

  describe("pingExtractorWarmup", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("reports connecting and ready states during successful ping", async () => {
      const states: string[] = [];
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const ready = await pingExtractorWarmup({
        baseUrl: "https://chord-extractor-7agu.onrender.com",
        onStateChange: (state) => states.push(state),
      });

      expect(ready).toBe(true);
      expect(states).toContain("connecting");
      expect(states).toContain("ready");
    });
  });

  describe("extractYouTubeAudio client & Request Locking", () => {
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
      expect(result.videoId).toBe("dQw4w9WgXcQ");
    });

    it("locks concurrent requests to the same video URL so only 1 network fetch fires", async () => {
      const mockBlob = new Blob(["fake-bytes"], { type: "audio/mpeg" });
      const mockHeaders = new Headers({
        "Content-Type": "audio/mpeg",
        "X-Video-Title": encodeURIComponent("Test Song"),
      });

      let fetchResolve: any;
      const delayedFetch = new Promise<any>((resolve) => {
        fetchResolve = resolve;
      });

      globalThis.fetch = vi.fn().mockReturnValue(
        delayedFetch.then(() => ({
          ok: true,
          status: 200,
          headers: mockHeaders,
          blob: async () => mockBlob,
        }))
      );

      // Trigger two concurrent extractions with different URL formats pointing to the same video ID
      const req1 = extractYouTubeAudio("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      const req2 = extractYouTubeAudio("https://youtu.be/dQw4w9WgXcQ");

      expect(isExtractionInFlight("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
      expect(getActiveExtractionCount()).toBe(1);

      // Resolve the delayed backend response
      fetchResolve();

      const [res1, res2] = await Promise.all([req1, req2]);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1); // Locked into single call!
      expect(res1.blob).toBe(res2.blob);
      expect(res1.title).toBe("Test Song");
      expect(isExtractionInFlight()).toBe(false);
    });

    it("calls onProgress callbacks during extraction lifecycle", async () => {
      const mockBlob = new Blob(["fake-audio"], { type: "audio/mpeg" });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        blob: async () => mockBlob,
      });

      const stages: string[] = [];
      await extractYouTubeAudio("https://www.youtube.com/watch?v=dQw4w9WgXcQ", {
        onProgress: (evt) => stages.push(evt.stage),
      });

      expect(stages).toContain("connecting");
      expect(stages).toContain("downloading");
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

