import { audioEngine } from "./audioContext";
import { SongAnalysis } from "../types";
import { CURRENT_ANALYSIS_VERSION } from "./analysisVersion";
import AnalyzerWorker from "./analyzerWorker?worker";

/**
 * Analyzes decoded audio buffer and generates real SongAnalysis with synchronized sections and chord timestamps.
 * Accepts a File, Blob, or URL string (including blob: Object URLs).
 */
export async function analyzeAudioFile(
  source: File | Blob | string,
  onProgress?: (msg: string, pct: number) => void,
  abortSignal?: AbortSignal,
  metadata?: {
    title?: string;
    artist?: string;
    youtubeUrl?: string;
    sunoUrl?: string;
    sunoId?: string;
  }
): Promise<SongAnalysis> {
  const ctx = audioEngine.getContext();
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {}
  }

  let arrayBuffer: ArrayBuffer;
  let sourceBlob: Blob;
  let fallbackTitle = metadata?.title || "Audio Track";
  let fallbackArtist = metadata?.artist || "Audio Analysis";

  if (typeof source === "string") {
    if (onProgress) onProgress("Reading audio stream...", 1);
    const res = await fetch(source, { signal: abortSignal });
    if (!res.ok) {
      throw new Error(`Failed to load audio from source URL: ${res.status} ${res.statusText}`);
    }
    arrayBuffer = await res.arrayBuffer();
    sourceBlob = new Blob([arrayBuffer], { type: res.headers.get("content-type") || "audio/mpeg" });
  } else if (source instanceof File) {
    arrayBuffer = await source.arrayBuffer();
    sourceBlob = source;
    fallbackTitle = metadata?.title || source.name.replace(/\.[^/.]+$/, "");
    fallbackArtist = metadata?.artist || "Uploaded Audio Analysis";
  } else {
    arrayBuffer = await source.arrayBuffer();
    sourceBlob = source;
    fallbackArtist = metadata?.artist || "Audio Analysis";
  }
  
  if (onProgress) onProgress("Decoding audio data...", 2);
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch (decodeErr: any) {
    throw new Error(`Unable to decode audio data: ${decodeErr?.message || "unsupported codec or corrupted audio stream"}`);
  }

  const duration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;

  // Extract Mid ((L+R)/2) and Side ((L-R)/2) channels for stereo-aware MIR analysis.
  // Audio playback remains full pristine stereo; mid/side extraction ensures wide-panned
  // rhythm guitars, acoustic guitars, and keyboards are analyzed alongside center-panned bass.
  let monoAnalysisData: Float32Array;
  let sideAnalysisData: Float32Array | undefined = undefined;
  if (numChannels === 1) {
    monoAnalysisData = new Float32Array(audioBuffer.getChannelData(0));
  } else {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    monoAnalysisData = new Float32Array(length);
    sideAnalysisData = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      monoAnalysisData[i] = (left[i] + right[i]) * 0.5;
      sideAnalysisData[i] = (left[i] - right[i]) * 0.5;
    }
  }

  return new Promise((resolve, reject) => {
    const worker = new AnalyzerWorker();

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        worker.terminate();
        reject(new Error("Analysis cancelled by user."));
      });
    }

    worker.onmessage = (e) => {
      if (e.data.type === "progress") {
        if (onProgress) onProgress(e.data.message, e.data.percent);
      } else if (e.data.type === "result") {
        const { analysis } = e.data;
        
        const mainDiagnostics = {
          fileSize: sourceBlob.size,
          mimeType: sourceBlob.type || "audio/unknown",
          decodedDuration: duration,
          sampleRate: sampleRate,
          numChannels: audioBuffer.numberOfChannels,
          numSamples: audioBuffer.length,
          stereoMidSideAnalyzed: !!sideAnalysisData,
          workerStarted: true,
          workerReceivedSamples: true,
          analysisVersion: CURRENT_ANALYSIS_VERSION,
          ...analysis.diagnostics
        };

        const songResult: SongAnalysis = {
          id: `song-${Date.now()}`,
          title: fallbackTitle,
          artist: fallbackArtist,
          key: analysis.key,
          tempo: analysis.estimatedBpm,
          timeSignature: "4/4",
          suggestedCapo: 0,
          difficulty: analysis.uniqueChords.length > 5 ? "Intermediate" : "Beginner",
          chords: analysis.uniqueChords,
          chordSegments: analysis.chordSegments,
          rawTimelinesForDebug: analysis.rawTimelinesForDebug,
          tuning: "E A D G B E (Standard)",
          tuningDeviation: analysis.tuningDeviationCents,
          sections: analysis.sections,
          beats: analysis.beats,
          confidence: analysis.overallConfidence,
          tips: "Extracted using high-resolution STFT chromagrams with Viterbi decoding and beat-synchronous harmonic stabilization.",
          audioBlob: sourceBlob,
          audioUrl: typeof source === "string" && !source.startsWith("blob:") ? source : undefined,
          youtubeUrl: metadata?.youtubeUrl,
          sunoUrl: metadata?.sunoUrl,
          sunoId: metadata?.sunoId,
          duration: duration,
          analysisVersion: CURRENT_ANALYSIS_VERSION,
          diagnostics: mainDiagnostics
        };
        
        console.group(`=== MIR DIAGNOSTICS: ${songResult.title} ===`);
        console.log("Estimated Key:", songResult.key);
        console.log("Estimated Tuning Deviation (cents):", songResult.tuningDeviation);
        if (songResult.rawTimelinesForDebug && songResult.rawTimelinesForDebug.length > 0) {
            console.log("=== RAW MIR vs VITERBI vs FINAL ===");
            songResult.rawTimelinesForDebug.forEach((seg) => {
                const stabilized = songResult.chordSegments.find(s => s.startTime === seg.startTime);
                console.log(`[${seg.startTime.toFixed(2)}s - ${seg.endTime.toFixed(2)}s]: RAW=${seg.diagnostics?.rawMirWinner} | VITERBI=${seg.diagnostics?.viterbiChord} | FINAL_BEFORE_STAB=${seg.chord} | STABILIZED=${stabilized ? stabilized.chord : "merged/lost"}`);
                console.log(`  Top 5 Candidates:`, seg.diagnostics?.top5Candidates);
            });
        }
        console.groupEnd();

        resolve(songResult);
        worker.terminate();
      } else if (e.data.type === "error") {
        reject(new Error(e.data.error));
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };

    const transferBuffers: Transferable[] = [monoAnalysisData.buffer];
    if (sideAnalysisData) {
      transferBuffers.push(sideAnalysisData.buffer);
    }

    worker.postMessage(
      {
        channelData: monoAnalysisData,
        sideChannelData: sideAnalysisData,
        sampleRate,
        duration,
      },
      transferBuffers
    );
  });
}

