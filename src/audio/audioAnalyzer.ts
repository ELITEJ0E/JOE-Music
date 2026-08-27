import { audioEngine } from "./audioContext";
import { SongAnalysis, SongSection } from "../types";
import AnalyzerWorker from "./analyzerWorker?worker";

/**
 * Analyzes decoded audio buffer and generates real SongAnalysis with synchronized sections and chord timestamps
 */
export async function analyzeAudioFile(
  file: File,
  onProgress?: (msg: string, pct: number) => void,
  abortSignal?: AbortSignal
): Promise<SongAnalysis> {
  const ctx = audioEngine.getContext();
  const arrayBuffer = await file.arrayBuffer();
  
  if (onProgress) onProgress("Decoding audio data...", 2);
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const duration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);

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
          fileSize: file.size,
          mimeType: file.type || "audio/unknown",
          decodedDuration: duration,
          sampleRate: sampleRate,
          numChannels: audioBuffer.numberOfChannels,
          numSamples: audioBuffer.length,
          workerStarted: true,
          workerReceivedSamples: true,
          ...analysis.diagnostics
        };

        const songResult: SongAnalysis = {
          id: `song-${Date.now()}`,
          title: file.name.replace(/\.[^/.]+$/, ""),
          artist: "Uploaded Audio Analysis",
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
          tips: "Extracted using Guitariz-inspired MIR (CQT + HPSS + Viterbi HMM).",
          audioBlob: file,
          duration: duration,
          analysisVersion: "1.0.0",
          diagnostics: mainDiagnostics
        };
        
        console.group(`=== MIR DIAGNOSTICS: ${songResult.title} ===`);
        console.log("Estimated Key:", songResult.key);
        console.log("Estimated Tuning Deviation (cents):", songResult.tuningDeviation);
        if (songResult.rawTimelinesForDebug && songResult.rawTimelinesForDebug.length > 0) {
            console.log("=== RAW MIR vs VITERBI vs FINAL ===");
            songResult.rawTimelinesForDebug.forEach((seg, i) => {
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

    worker.postMessage(
      { channelData, sampleRate, duration },
      [channelData.buffer]
    );
  });
}

