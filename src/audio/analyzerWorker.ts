// JOE-Music Next-Gen MIR Analysis Engine
// Features: Spectral Whitening, Peak Picking, Log Compression, Separated Bass/Harmonic Chroma,
// Beat-Synchronous & Multi-Resolution Segmentation, Two-Stage Root & Quality Decision,
// Dynamic Sequence Optimization, and Harmonic Stabilization.

import { NOTE_NAMES, extractEnhancedChromagram } from "./chromaExtractor";
import { trackBeatsFromOnsetEnvelope } from "./beatTracker";
import { analyzeBeatSynchronousHarmonics } from "./beatSynchronousAnalyzer";
import { stabilizeChordSegments } from "./harmonicStabilizer";

function reportProgress(message: string, percent: number): void {
  self.postMessage({ type: "progress", message, percent });
}

self.onmessage = function (e: MessageEvent) {
  try {
    const { channelData, sampleRate, duration } = e.data;
    if (!channelData || channelData.length === 0) {
      throw new Error("No audio channel data received for analysis.");
    }

    reportProgress("Preprocessing Audio & Analyzing Spectrum...", 10);

    // 1. High-Resolution Spectral & Chroma Analysis
    // Computes Hann windowing, log compression, local peak-picking, sub-bin interpolation,
    // separated harmonic chroma and bass chroma, tuning deviation, and key estimation.
    const fftSize = 8192;
    const hopSize = 2048;

    const spectralResult = extractEnhancedChromagram(channelData, sampleRate, {
      fftSize,
      hopSize,
      onProgress: (pct) => {
        reportProgress("Extracting Harmonic & Bass Chroma Features...", 10 + Math.round(pct * 40));
      }
    });

    const {
      chromagram,
      bassChromagram,
      onsetEnvelope,
      tuningDeviationCents,
      estimatedKey,
      numFrames
    } = spectralResult;

    if (numFrames < 4) {
      throw new Error(`Audio buffer is too short (${numFrames} frames). Minimum 4 frames required.`);
    }

    // 2. Beat Tracking & Tempo Estimation
    reportProgress("Tracking Beats & Tempo Grid...", 55);
    const beatTrackingResult = trackBeatsFromOnsetEnvelope(
      onsetEnvelope,
      sampleRate,
      duration,
      hopSize,
      fftSize
    );

    const {
      estimatedBpm,
      beatIntervalSec,
      bpmConfidence,
      beats
    } = beatTrackingResult;

    // 3. Beat-Synchronous & Multi-Resolution Harmonic Analysis
    // Builds musical time grid (adaptive 8th-note subdivisions for >= 115 BPM),
    // aggregates local and contextual chroma, runs Two-Stage Root/Quality decision,
    // and performs Dynamic Programming sequence optimization.
    reportProgress("Running Beat-Synchronous Harmonic Analysis...", 70);

    const beatHarmonicsResult = analyzeBeatSynchronousHarmonics(
      chromagram,
      bassChromagram,
      {
        sampleRate,
        hopSize,
        tempo: estimatedBpm,
        beats,
        estimatedKey,
        totalDuration: duration
      }
    );

    const { segments: rawBeatSegments, isFastMode, beatUnits } = beatHarmonicsResult;

    // 4. Post-MIR Harmonic Stabilization Layer
    // Filters transient glitches, rejects pick/acoustic transient slash chords,
    // enforces musical hysteresis, and merges consecutive chords.
    reportProgress("Stabilizing Harmonic Boundaries...", 85);

    const stabilizationResult = stabilizeChordSegments(rawBeatSegments, {
      beats,
      tempo: estimatedBpm,
      keyContext: estimatedKey,
      duration
    });

    const stabilizedSegments = stabilizationResult.segments;
    const stabDiag = stabilizationResult.diagnostics;

    // Compute diagnostics
    const segDurations = stabilizedSegments.map(s => s.endTime - s.startTime);
    const avgSegmentDuration = Number((segDurations.reduce((a, b) => a + b, 0) / (stabilizedSegments.length || 1)).toFixed(2));
    const sortedDurs = [...segDurations].sort((a, b) => a - b);
    const medianSegmentDuration = Number((sortedDurs[Math.floor(sortedDurs.length / 2)] || 0).toFixed(2));
    const minSegmentDuration = Number((sortedDurs[0] || 0).toFixed(2));
    const maxSegmentDuration = Number((sortedDurs[sortedDurs.length - 1] || 0).toFixed(2));
    const numChordChanges = Math.max(0, stabilizedSegments.length - 1);
    const changesPerMinute = Number((numChordChanges / ((duration / 60) || 1)).toFixed(1));
    const averageChordConfidence = Math.round(stabilizedSegments.reduce((a, b) => a + b.confidence, 0) / (stabilizedSegments.length || 1));
    const averageTransitionConfidence = Math.round(stabilizedSegments.reduce((a, b) => a + b.stability, 0) / (stabilizedSegments.length || 1));

    // 5. Group into logical musical sections for UI
    const sections = [];
    const sectionNames = ["Intro", "Verse 1", "Chorus", "Verse 2", "Bridge", "Outro"];
    let secIdx = 0;
    let currentSecChords: string[] = [];
    let currentSecStart = 0;

    stabilizedSegments.forEach(seg => {
      currentSecChords.push(seg.chord);
      if (seg.endTime - currentSecStart > 16 || seg.id === stabilizedSegments[stabilizedSegments.length - 1].id) {
        if (currentSecChords.length > 0) {
          sections.push({
            name: sectionNames[secIdx % sectionNames.length],
            startTime: currentSecStart,
            bars: Math.max(4, Math.floor(currentSecChords.length / 2)),
            chords: currentSecChords,
            strummingPattern: "D - D U - U D -",
            confidence: seg.confidence
          });
          secIdx++;
          currentSecChords = [];
          currentSecStart = seg.endTime;
        }
      }
    });

    const uniqueChords = Array.from(new Set(stabilizedSegments.map(s => s.chord)));
    const overallConfidence = stabilizedSegments.reduce((a, b) => a + b.confidence, 0) / (stabilizedSegments.length || 1);

    reportProgress("Analysis Complete", 100);

    self.postMessage({
      type: "result",
      analysis: {
        estimatedBpm,
        tuningDeviationCents,
        key: estimatedKey,
        sections,
        chordSegments: stabilizedSegments,
        rawTimelinesForDebug: rawBeatSegments,
        uniqueChords,
        overallConfidence: Math.min(99, Math.round(overallConfidence)),
        beats,
        diagnostics: {
          workerSampleCount: channelData.length,
          featureFrameCount: numFrames,
          chromaFrameCount: chromagram.length,
          bassFrameCount: bassChromagram.length,
          keyResult: estimatedKey,
          estimatedBpm,
          beatIntervalSec,
          bpmConfidence,
          isFastMode,
          totalBeatUnits: beatUnits.length,
          rawChordSegmentCount: rawBeatSegments.length,
          finalChordSegmentCount: stabilizedSegments.length,
          rawSegmentCount: stabDiag.rawSegmentCount,
          stabilizedSegmentCount: stabDiag.stabilizedSegmentCount,
          mergedSegments: stabDiag.mergedSegments,
          rejectedTransientSlashSegments: stabDiag.rejectedTransientSlashSegments,
          finalProgression: stabDiag.finalProgression,
          avgSegmentDuration,
          medianSegmentDuration,
          minSegmentDuration,
          maxSegmentDuration,
          numChordChanges,
          changesPerMinute,
          averageChordConfidence,
          averageTransitionConfidence
        }
      }
    });
  } catch (err: any) {
    self.postMessage({ type: "error", error: err?.message || String(err) });
  }
};
