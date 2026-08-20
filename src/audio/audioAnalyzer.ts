import { audioEngine } from "./audioContext";
import { SongAnalysis, SongSection } from "../types";
import AnalyzerWorker from "./analyzerWorker?worker";

/**
 * Analyzes decoded audio buffer and generates real SongAnalysis with synchronized sections and chord timestamps
 */
export async function analyzeAudioFile(file: File): Promise<SongAnalysis> {
  const ctx = audioEngine.getContext();
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const duration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);

  return new Promise((resolve, reject) => {
    const worker = new AnalyzerWorker();

    worker.onmessage = (e) => {
      const { estimatedBpm, detectedChordSequence, sections, overallConfidence } = e.data;
      const distinctChords = Array.from(new Set(detectedChordSequence)) as string[];

      resolve({
        id: `song-${Date.now()}`,
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: "Uploaded Audio Analysis",
        key: `${detectedChordSequence[0] || "G"} Major`,
        tempo: estimatedBpm,
        timeSignature: "4/4",
        suggestedCapo: 0,
        difficulty: distinctChords.length > 5 ? "Intermediate" : "Beginner",
        chords: distinctChords,
        tuning: "E A D G B E (Standard)",
        sections,
        confidence: overallConfidence,
        tips: "Extracted using true Windowed FFT Chroma analysis.",
        audioBlob: file,
        duration: duration
      });
      worker.terminate();
    };

    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };

    // Transfer the ArrayBuffer of the Float32Array to avoid copying
    worker.postMessage(
      { channelData, sampleRate, duration },
      [channelData.buffer]
    );
  });
}

