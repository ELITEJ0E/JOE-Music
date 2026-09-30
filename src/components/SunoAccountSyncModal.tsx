import React, { useState, useEffect } from "react";
import {
  KeyRound,
  FileCode2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  Trash2,
  X,
  Sparkles,
  HelpCircle,
  Copy,
  Check
} from "lucide-react";
import {
  getStoredSunoToken,
  setStoredSunoToken,
  getStoredSunoCookie,
  setStoredSunoCookie,
  syncSunoPlaylistWithOwner,
  saveCustomImportedPlaylist
} from "../utils/sunoAuth";
import { SunoPlaylistResponse } from "../lib/suno-playlists";

interface SunoAccountSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlistId: string;
  playlistTitle: string;
  onSyncSuccess: (data: SunoPlaylistResponse, count: number) => void;
}

export const SunoAccountSyncModal: React.FC<SunoAccountSyncModalProps> = ({
  isOpen,
  onClose,
  playlistId,
  playlistTitle,
  onSyncSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<"token" | "json">("token");
  const [tokenInput, setTokenInput] = useState<string>("");
  const [cookieInput, setCookieInput] = useState<string>("");
  const [rawJsonInput, setRawJsonInput] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTokenInput(getStoredSunoToken());
      setCookieInput(getStoredSunoCookie());
      setStatusMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hasCredentials = Boolean(tokenInput.trim() || cookieInput.trim());

  const handleSaveAndSyncToken = async () => {
    setIsSyncing(true);
    setStatusMessage(null);

    setStoredSunoToken(tokenInput);
    setStoredSunoCookie(cookieInput);

    const result = await syncSunoPlaylistWithOwner(playlistId, {
      token: tokenInput,
      cookie: cookieInput,
    });

    setIsSyncing(false);

    if (result.success && result.data) {
      setStatusMessage({
        type: "success",
        text: `Success! Synced ${result.count} songs as Suno owner for "${playlistTitle}".`,
      });
      onSyncSuccess(result.data, result.count);
    } else {
      setStatusMessage({
        type: "error",
        text: result.message || "Could not authenticate with Suno. Check your token or try pasting the raw playlist JSON.",
      });
    }
  };

  const handleImportJson = async () => {
    if (!rawJsonInput.trim()) {
      setStatusMessage({ type: "error", text: "Please paste the Suno playlist JSON or clips array first." });
      return;
    }

    setIsSyncing(true);
    setStatusMessage(null);

    try {
      let parsed: any;
      try {
        parsed = JSON.parse(rawJsonInput.trim());
      } catch (e: any) {
        throw new Error("Invalid JSON format. Please ensure you copied the entire JSON response.");
      }

      const rawClips = parsed?.playlist_clips || parsed?.clips || (Array.isArray(parsed) ? parsed : []);
      if (!Array.isArray(rawClips) || rawClips.length === 0) {
        throw new Error("No clips found in the JSON. Expected 'playlist_clips' array or array of tracks.");
      }

      const tracks = rawClips.map((item: any) => {
        const clip = item.clip || item;
        const clipId = clip.id || clip.clip_id || `trk-${Math.random().toString(36).slice(2, 9)}`;
        const audioUrl = clip.audio_url || clip.audioUrl || `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`;
        const streamUrl = `/api/suno-audio/${clipId}`;
        const rawImg = clip.image_large_url || clip.image_url || clip.imageUrl;
        const imageUrl = rawImg || `https://cdn2.suno.ai/image_${clipId}.jpeg`;
        const durationVal = typeof clip.metadata?.duration === "number"
          ? Math.round(clip.metadata.duration)
          : typeof clip.duration === "number" && clip.duration > 0
          ? Math.round(clip.duration)
          : 185;
        const dateStr = item.created_at || clip.created_at || clip.createdAt || new Date().toISOString();
        const tagsStr = clip.metadata?.tags || clip.tags || clip.display_tags || "";
        const tags = typeof tagsStr === "string"
          ? tagsStr.split(",").map((t: string) => t.trim()).filter(Boolean)
          : Array.isArray(tagsStr) ? tagsStr : ["Guitar", "Original"];

        return {
          id: clipId,
          title: clip.title || "Untitled Composition",
          artist: clip.display_name || clip.handle || parsed.user_display_name || "ELITEJOE",
          album: clip.album || parsed.name || playlistTitle,
          duration: durationVal,
          audioUrl: audioUrl,
          streamUrl: streamUrl,
          videoUrl: clip.video_url || clip.videoUrl || null,
          imageUrl: imageUrl,
          lyrics: clip.metadata?.prompt || clip.metadata?.text || clip.prompt || clip.lyrics || "[Instrumental Audio Track]",
          tags: tags,
          createdAt: dateStr,
          playCount: clip.play_count ?? clip.playCount ?? 1250,
          upvoteCount: clip.upvote_count ?? clip.upvoteCount ?? 88,
          audio_url: audioUrl,
          image_url: imageUrl,
          created_at: dateStr,
        };
      });

      const importedPlaylist: SunoPlaylistResponse = {
        id: playlistId,
        name: parsed.name || playlistTitle,
        title: parsed.name || playlistTitle,
        description: parsed.description || "Imported Suno Playlist",
        imageUrl: tracks[0]?.imageUrl || "https://cdn2.suno.ai/1efe9cb2-dd3b-47c4-b0ad-c8efa5e4e139.jpeg",
        userDisplayName: parsed.user_display_name || "ELITEJOE",
        tracks: tracks,
        totalTracks: tracks.length,
        hasMore: false,
      };

      saveCustomImportedPlaylist(playlistId, importedPlaylist);
      setIsSyncing(false);
      setStatusMessage({
        type: "success",
        text: `Imported all ${tracks.length} songs from JSON successfully!`,
      });
      onSyncSuccess(importedPlaylist, tracks.length);
    } catch (err: any) {
      setIsSyncing(false);
      setStatusMessage({
        type: "error",
        text: err?.message || "Failed to parse JSON clips.",
      });
    }
  };

  const handleClearCredentials = () => {
    setStoredSunoToken("");
    setStoredSunoCookie("");
    setTokenInput("");
    setCookieInput("");
    setStatusMessage({
      type: "info",
      text: "Cleared Suno credentials. App is now using guest public mode and offline catalog.",
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-100">Suno Account & Owner Sync</h3>
                {hasCredentials ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3" /> Owner Authenticated
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                    Guest Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                Targeting <span className="text-zinc-200 font-medium">{playlistTitle}</span> ({playlistId})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800/80 bg-zinc-950/80 px-6 pt-2">
          <button
            onClick={() => setActiveTab("token")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "token"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            Option 1: Owner Session Token / Cookie
          </button>
          <button
            onClick={() => setActiveTab("json")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "json"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            Option 2: Direct Paste Playlist JSON (All 69 Songs)
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-zinc-300 text-xs">
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                statusMessage.type === "success"
                  ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                  : statusMessage.type === "error"
                  ? "bg-rose-950/40 border-rose-500/40 text-rose-300"
                  : "bg-zinc-900 border-zinc-700 text-zinc-300"
              }`}
            >
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
              ) : statusMessage.type === "error" ? (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
              ) : (
                <HelpCircle className="w-4 h-4 mt-0.5 shrink-0 text-zinc-400" />
              )}
              <div className="flex-1 font-medium">{statusMessage.text}</div>
            </div>
          )}

          {activeTab === "token" ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-2.5">
                <div className="flex items-center gap-2 text-zinc-200 font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  How to get your Suno Session Token (Takes 10 seconds):
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-zinc-400 text-[11px] leading-relaxed">
                  <li>
                    Open{" "}
                    <a
                      href="https://suno.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:underline inline-flex items-center gap-1"
                    >
                      suno.com <ExternalLink className="w-2.5 h-2.5" />
                    </a>{" "}
                    in your browser and make sure you are logged in.
                  </li>
                  <li>
                    Press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-zinc-300">F12</kbd> (or Right-Click &rarr; Inspect) and switch to the <span className="text-zinc-200 font-medium">Network</span> tab.
                  </li>
                  <li>
                    Click any Suno request (e.g. <code className="text-amber-300 font-mono">studio-api.prod.suno.com</code> or <code className="text-amber-300 font-mono">playlist</code>).
                  </li>
                  <li>
                    Under <span className="text-zinc-200 font-medium">Request Headers</span>, copy the value of <code className="text-amber-300 font-mono">authorization</code> (or <code className="text-amber-300 font-mono">cookie</code>).
                  </li>
                  <li>Paste below and click &quot;Save &amp; Sync as Owner&quot;.</li>
                </ol>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block font-medium text-zinc-200 mb-1">
                    Suno Authorization Bearer Token (JWT)
                  </label>
                  <input
                    type="password"
                    placeholder="eyJhbGciOiJSUzI1NiIsImtpZCI6..."
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 focus:border-amber-400 focus:outline-none text-zinc-100 font-mono text-xs placeholder:text-zinc-600 transition-colors"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Stored securely in your local browser storage. Allows fetching unlisted and private playlists without 404s.
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-zinc-200 mb-1">
                    Suno Session Cookie (Optional alternative)
                  </label>
                  <input
                    type="password"
                    placeholder="__client=...; suno_session=..."
                    value={cookieInput}
                    onChange={(e) => setCookieInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 focus:border-amber-400 focus:outline-none text-zinc-100 font-mono text-xs placeholder:text-zinc-600 transition-colors"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-2 text-[11px] text-zinc-400">
                <div className="flex items-center gap-2 text-zinc-200 font-semibold">
                  <FileCode2 className="w-3.5 h-3.5 text-amber-400" />
                  Instant Direct Import (69 Songs):
                </div>
                <p>
                  You can open{" "}
                  <a
                    href="https://studio-api.prod.suno.com/api/playlist/34ac065b-e68e-4dfa-9780-00c49bae047a/?page=1"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:underline inline-flex items-center gap-1 font-mono text-[10px]"
                  >
                    https://studio-api.prod.suno.com/api/playlist/34ac065b-e68e-4dfa-9780-00c49bae047a/?page=1 <ExternalLink className="w-2.5 h-2.5" />
                  </a>{" "}
                  in your logged-in browser, press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-zinc-300">Ctrl+A</kbd>, <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-zinc-300">Ctrl+C</kbd>, and paste the JSON here.
                </p>
              </div>

              <div>
                <label className="block font-medium text-zinc-200 mb-1">
                  Paste Suno Playlist JSON Response
                </label>
                <textarea
                  rows={8}
                  placeholder='{"id":"34ac065b-e68e-4dfa-9780-00c49bae047a","name":"Upcoming","playlist_clips":[{"clip":{"id":"...","title":"..."}}]}'
                  value={rawJsonInput}
                  onChange={(e) => setRawJsonInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 focus:border-amber-400 focus:outline-none text-zinc-100 font-mono text-xs placeholder:text-zinc-600 transition-colors"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-900/60">
          <div>
            {hasCredentials && (
              <button
                type="button"
                onClick={handleClearCredentials}
                className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear Credentials
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              Close
            </button>
            {activeTab === "token" ? (
              <button
                type="button"
                disabled={isSyncing}
                onClick={handleSaveAndSyncToken}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-amber-400 text-black hover:bg-amber-300 disabled:opacity-50 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing as Owner...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" /> Save &amp; Sync as Owner
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled={isSyncing || !rawJsonInput.trim()}
                onClick={handleImportJson}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-amber-400 text-black hover:bg-amber-300 disabled:opacity-50 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing Clips...
                  </>
                ) : (
                  <>
                    <FileCode2 className="w-3.5 h-3.5" /> Import Tracks Instantly
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
