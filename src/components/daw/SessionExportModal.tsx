import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Download,
  Music,
  Disc,
  Play,
  Pause,
  Sliders,
  Check,
  AlertCircle,
  Sparkles,
  Layers,
  FileAudio,
  Radio,
  Volume2,
} from "lucide-react";
import { DAWProject, DAWTrack } from "../../types";
import {
  audioBufferToMp3Blob,
  audioBufferToHighQualityWavBlob,
  normalizeAudioBuffer,
  renderProjectMixdownBuffer,
  renderTrackStemBuffer,
} from "../../audio/audioExport";

interface SessionExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: DAWProject;
}

export const SessionExportModal: React.FC<SessionExportModalProps> = ({
  isOpen,
  onClose,
  project,
}) => {
  const [format, setFormat] = useState<"wav" | "mp3">("mp3");
  const [wavBitDepth, setWavBitDepth] = useState<16 | 24 | 32>(16);
  const [mp3Bitrate, setMp3Bitrate] = useState<128 | 192 | 256 | 320>(320);
  const [sampleRate, setSampleRate] = useState<44100 | 48000>(44100);
  const [normalize, setNormalize] = useState<boolean>(true);
  const [scope, setScope] = useState<"master" | "stems">("master");
  const [fileName, setFileName] = useState<string>(
    `${project.name.replace(/\s+/g, "_")}_${project.bpm}BPM_Mix`
  );

  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [renderedBuffer, setRenderedBuffer] = useState<AudioBuffer | null>(null);

  // Audio Preview Playback
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState<number>(0);
  const [previewDuration, setPreviewDuration] = useState<number>(0);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFileName(`${project.name.replace(/\s+/g, "_")}_${project.bpm}BPM_Mix`);
      setRenderedBlob(null);
      setRenderedBuffer(null);
      if (renderedUrl) {
        URL.revokeObjectURL(renderedUrl);
        setRenderedUrl(null);
      }
      setIsPlayingPreview(false);
      setRenderProgress(0);
      setStatusMessage("");
    }
  }, [isOpen, project.name, project.bpm]);

  useEffect(() => {
    return () => {
      if (renderedUrl) {
        URL.revokeObjectURL(renderedUrl);
      }
    };
  }, [renderedUrl]);

  if (!isOpen) return null;

  const handleStartRender = async () => {
    const hasAudio = project.tracks.some((t) => (t.clips || []).length > 0);
    if (!hasAudio) {
      setStatusMessage("No audio clips found in project to export.");
      return;
    }

    setIsRendering(true);
    setRenderProgress(10);
    setStatusMessage("Rendering high-precision audio mixdown...");

    try {
      if (scope === "master") {
        // 1. Render complete DAW project through OfflineAudioContext
        const buffer = await renderProjectMixdownBuffer(project, {
          sampleRate,
          onProgress: (p) => setRenderProgress(Math.round(p * 0.5)),
        });

        setRenderProgress(50);
        setStatusMessage(normalize ? "Normalizing peak dynamics to -0.3 dBFS..." : "Encoding audio stream...");

        const finalBuffer = normalize ? normalizeAudioBuffer(buffer, -0.3) : buffer;
        setRenderedBuffer(finalBuffer);
        setPreviewDuration(finalBuffer.duration);

        // 2. Encode to WAV or MP3
        let blob: Blob;
        if (format === "mp3") {
          setStatusMessage(`Encoding High-Fidelity MP3 (${mp3Bitrate} kbps)...`);
          blob = await audioBufferToMp3Blob(finalBuffer, mp3Bitrate, (pct) => {
            setRenderProgress(50 + Math.round(pct * 0.5));
          });
        } else {
          setStatusMessage(`Packaging Lossless WAV (${wavBitDepth}-bit PCM)...`);
          blob = audioBufferToHighQualityWavBlob(finalBuffer, wavBitDepth);
        }

        setRenderProgress(100);
        setRenderedBlob(blob);
        const url = URL.createObjectURL(blob);
        setRenderedUrl(url);
        setStatusMessage("Render complete! Audition below or download file.");
      } else {
        // Stems export
        setStatusMessage("Rendering track stems...");
        let maxDuration = 1.0;
        project.tracks.forEach((t) => {
          (t.clips || []).forEach((c) => {
            const end = c.startTime + c.duration;
            if (end > maxDuration) maxDuration = end;
          });
        });
        const durationWithTail = maxDuration + 1.5;

        const renderedStems: { name: string; blob: Blob }[] = [];

        for (let i = 0; i < project.tracks.length; i++) {
          const track = project.tracks[i];
          if ((track.clips || []).length === 0) continue;

          setStatusMessage(`Rendering Stem ${i + 1}/${project.tracks.length}: "${track.name}"...`);
          setRenderProgress(Math.round(((i + 1) / project.tracks.length) * 80));

          const stemBuffer = await renderTrackStemBuffer(track, durationWithTail, sampleRate);
          const finalStemBuf = normalize ? normalizeAudioBuffer(stemBuffer, -0.3) : stemBuffer;

          let stemBlob: Blob;
          if (format === "mp3") {
            stemBlob = await audioBufferToMp3Blob(finalStemBuf, mp3Bitrate);
          } else {
            stemBlob = audioBufferToHighQualityWavBlob(finalStemBuf, wavBitDepth);
          }

          renderedStems.push({
            name: `${fileName}_Stem_${track.name.replace(/\s+/g, "_")}.${format}`,
            blob: stemBlob,
          });
        }

        // Trigger stem downloads sequentially
        renderedStems.forEach((stem) => {
          const stemUrl = URL.createObjectURL(stem.blob);
          const a = document.createElement("a");
          a.href = stemUrl;
          a.download = stem.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(stemUrl), 5000);
        });

        setRenderProgress(100);
        setStatusMessage(`Successfully exported and downloaded ${renderedStems.length} track stems!`);
      }
    } catch (err) {
      console.error("Audio export error:", err);
      setStatusMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRendering(false);
    }
  };

  const handleDownload = () => {
    if (!renderedBlob || !renderedUrl) return;
    const a = document.createElement("a");
    a.href = renderedUrl;
    a.download = `${fileName}.${format}`;
    a.click();
  };

  const togglePreviewPlay = () => {
    if (!audioPreviewRef.current) return;
    if (isPlayingPreview) {
      audioPreviewRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      audioPreviewRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-[#0f1219] border border-white/15 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#a3ff12]/15 border border-[#a3ff12]/40 flex items-center justify-center text-[#a3ff12] shadow-[0_0_15px_rgba(163,255,18,0.2)]">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-mono font-bold text-white tracking-wide">
                Export Session Audio
              </h2>
              <p className="text-xs text-zinc-400 font-sans">
                Export recorded MultiTrack sessions as high-quality WAV or MP3 files.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* File Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono font-bold text-zinc-300">File Base Name</label>
            <div className="flex items-center bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono text-white focus-within:border-[#a3ff12]/50">
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full bg-transparent outline-none"
                placeholder="Session_Mixdown"
              />
              <span className="text-xs font-mono text-zinc-500 shrink-0">.{format}</span>
            </div>
          </div>

          {/* Export Scope: Master vs Stems */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono font-bold text-zinc-300">Export Scope</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setScope("master")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  scope === "master"
                    ? "bg-[#a3ff12]/10 border-[#a3ff12]/40 text-white"
                    : "bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-bold flex items-center gap-1.5">
                    <Music className="w-4 h-4 text-[#a3ff12]" /> Master Mixdown
                  </span>
                  {scope === "master" && <Check className="w-4 h-4 text-[#a3ff12]" />}
                </div>
                <p className="text-[11px] text-zinc-400 leading-tight">
                  Single stereo master file with all active tracks, volume, pan, EQ, and effects.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScope("stems")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  scope === "stems"
                    ? "bg-[#a3ff12]/10 border-[#a3ff12]/40 text-white"
                    : "bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-bold flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#a3ff12]" /> Individual Stems
                  </span>
                  {scope === "stems" && <Check className="w-4 h-4 text-[#a3ff12]" />}
                </div>
                <p className="text-[11px] text-zinc-400 leading-tight">
                  Separate audio files for each track with its individual processing applied.
                </p>
              </button>
            </div>
          </div>

          {/* Format Selection: WAV vs MP3 */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono font-bold text-zinc-300">Audio Format</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat("mp3")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  format === "mp3"
                    ? "bg-[#a3ff12]/10 border-[#a3ff12]/40 text-white"
                    : "bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-bold flex items-center gap-1.5">
                    <Radio className="w-4 h-4 text-[#a3ff12]" /> MP3 Audio
                  </span>
                  {format === "mp3" && <Check className="w-4 h-4 text-[#a3ff12]" />}
                </div>
                <p className="text-[11px] text-zinc-400 leading-tight">
                  Lightweight, high-fidelity MP3 for sharing, streaming, and mobile listening.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFormat("wav")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  format === "wav"
                    ? "bg-[#a3ff12]/10 border-[#a3ff12]/40 text-white"
                    : "bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-bold flex items-center gap-1.5">
                    <Disc className="w-4 h-4 text-[#a3ff12]" /> WAV Lossless
                  </span>
                  {format === "wav" && <Check className="w-4 h-4 text-[#a3ff12]" />}
                </div>
                <p className="text-[11px] text-zinc-400 leading-tight">
                  Uncompressed studio-quality PCM audio for mastering and archiving.
                </p>
              </button>
            </div>
          </div>

          {/* Quality Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-black/30 border border-white/10 rounded-2xl p-4">
            {format === "mp3" ? (
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold text-zinc-400">MP3 Bitrate</label>
                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                  {([192, 256, 320] as const).map((br) => (
                    <button
                      key={br}
                      type="button"
                      onClick={() => setMp3Bitrate(br)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        mp3Bitrate === br
                          ? "bg-[#a3ff12] text-black shadow-sm"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {br} kbps
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold text-zinc-400">WAV Bit Depth</label>
                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                  {([16, 24, 32] as const).map((bd) => (
                    <button
                      key={bd}
                      type="button"
                      onClick={() => setWavBitDepth(bd)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        wavBitDepth === bd
                          ? "bg-[#a3ff12] text-black shadow-sm"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {bd}-bit
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold text-zinc-400">Sample Rate</label>
              <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                {([44100, 48000] as const).map((sr) => (
                  <button
                    key={sr}
                    type="button"
                    onClick={() => setSampleRate(sr)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      sampleRate === sr
                        ? "bg-[#a3ff12] text-black shadow-sm"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {sr === 44100 ? "44.1 kHz (CD)" : "48.0 kHz (Pro)"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Normalization & Processing */}
          <div className="flex items-center justify-between p-3.5 bg-black/20 border border-white/10 rounded-2xl">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-[#a3ff12]" />
              <div>
                <div className="text-xs font-mono font-bold text-white">Peak Normalization (-0.3 dBFS)</div>
                <div className="text-[11px] text-zinc-400">
                  Optimizes mix loudness and prevents inter-sample clipping on streaming services.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNormalize(!normalize)}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                normalize ? "bg-[#a3ff12]" : "bg-white/20"
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full bg-black absolute top-1 transition-transform ${
                  normalize ? "left-6" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* Render Progress or Status */}
          {isRendering && (
            <div className="p-4 rounded-2xl bg-[#a3ff12]/5 border border-[#a3ff12]/30 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-[#a3ff12]">
                <span>{statusMessage}</span>
                <span>{renderProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-black/60 overflow-hidden border border-white/10">
                <div
                  className="h-full bg-[#a3ff12] transition-all duration-200"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* In-Modal Audio Player Preview (when rendered) */}
          {renderedUrl && (
            <div className="p-4 rounded-2xl bg-black/50 border border-white/15 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-zinc-300 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-[#a3ff12]" />
                  Rendered Audio Audition
                </span>
                {renderedBlob && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-[#a3ff12] font-bold">
                    {format.toUpperCase()} • {formatFileSize(renderedBlob.size)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePreviewPlay}
                  className="w-10 h-10 rounded-full bg-[#a3ff12] text-black flex items-center justify-center shadow-[0_0_15px_rgba(163,255,18,0.4)] hover:scale-105 transition-all cursor-pointer shrink-0"
                >
                  {isPlayingPreview ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </button>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                    <span>{formatDuration(previewCurrentTime)}</span>
                    <span>{formatDuration(previewDuration)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={previewDuration || 1}
                    step="0.05"
                    value={previewCurrentTime}
                    onChange={(e) => {
                      const t = parseFloat(e.target.value);
                      setPreviewCurrentTime(t);
                      if (audioPreviewRef.current) {
                        audioPreviewRef.current.currentTime = t;
                      }
                    }}
                    className="w-full accent-[#a3ff12] cursor-pointer"
                  />
                </div>
              </div>

              <audio
                ref={audioPreviewRef}
                src={renderedUrl}
                onTimeUpdate={() => {
                  if (audioPreviewRef.current) {
                    setPreviewCurrentTime(audioPreviewRef.current.currentTime);
                  }
                }}
                onEnded={() => setIsPlayingPreview(false)}
                className="hidden"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 px-6 py-4 border-t border-white/10 flex items-center justify-between bg-black/40">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {!renderedBlob ? (
              <button
                onClick={handleStartRender}
                disabled={isRendering}
                className="px-5 py-2.5 bg-[#a3ff12] hover:bg-[#b5ff38] disabled:opacity-50 text-black font-mono font-bold text-xs rounded-xl shadow-[0_0_20px_rgba(163,255,18,0.3)] transition-all flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                {isRendering ? "Rendering..." : `Render & Export ${format.toUpperCase()}`}
              </button>
            ) : (
              <button
                onClick={handleDownload}
                className="px-5 py-2.5 bg-[#a3ff12] hover:bg-[#b5ff38] text-black font-mono font-bold text-xs rounded-xl shadow-[0_0_20px_rgba(163,255,18,0.4)] transition-all flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Download {format.toUpperCase()} ({renderedBlob ? formatFileSize(renderedBlob.size) : ""})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
