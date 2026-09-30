import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { extractEnhancedChromagram } from "./chromaExtractor";
import { trackBeatsFromOnsetEnvelope } from "./beatTracker";
import { analyzeBeatSynchronousHarmonics } from "./beatSynchronousAnalyzer";
import { stabilizeChordSegments } from "./harmonicStabilizer";
import { ChordSegment } from "../types";

/**
 * Pure TypeScript WAV PCM Parser for Node test environment
 */
function parseWavPCM(buffer: Buffer): { audioData: Float32Array; sampleRate: number } {
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);

  let dataOffset = 12;
  let chunkSize = 0;
  while (dataOffset < buffer.length - 8) {
    const chunkHeader = buffer.toString("ascii", dataOffset, dataOffset + 4);
    chunkSize = buffer.readUInt32LE(dataOffset + 4);
    if (chunkHeader === "data") {
      dataOffset += 8;
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  const numBytesPerSample = bitsPerSample / 8;
  const numSamples = Math.floor(chunkSize / numBytesPerSample);
  const audioData = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const val = buffer.readInt16LE(dataOffset + i * 2);
    audioData[i] = val / 32768.0;
  }

  return { audioData, sampleRate };
}

describe("MIR Real Audio Regression Suite - Suno Track (6edfba6a)", () => {
  const wavPath = path.resolve(process.cwd(), "test-assets/suno_target_6edfba6a.wav");
  const hasRealAudio = fs.existsSync(wavPath);

  let audioData: Float32Array | null = null;
  let sampleRate = 22050;
  let duration = 0;
  let spectralResult: any = null;
  let beatResult: any = null;
  let harmonicResult: any = null;
  let stabilizedResult: { segments: ChordSegment[] } | null = null;

  beforeAll(() => {
    if (!hasRealAudio) return;

    const fileBuf = fs.readFileSync(wavPath);
    const parsed = parseWavPCM(fileBuf);
    audioData = parsed.audioData;
    sampleRate = parsed.sampleRate;
    duration = audioData.length / sampleRate;

    spectralResult = extractEnhancedChromagram(audioData, sampleRate);
    beatResult = trackBeatsFromOnsetEnvelope(
      spectralResult.onsetEnvelope,
      sampleRate,
      duration,
      spectralResult.hopSize,
      spectralResult.fftSize
    );

    harmonicResult = analyzeBeatSynchronousHarmonics(
      spectralResult.chromagram,
      spectralResult.bassChromagram,
      {
        sampleRate,
        hopSize: spectralResult.hopSize,
        tempo: beatResult.estimatedBpm,
        beats: beatResult.beats,
        estimatedKey: "G Minor",
        totalDuration: duration
      }
    );

    stabilizedResult = stabilizeChordSegments(harmonicResult.segments, {
      keyContext: "G Minor",
      tempo: beatResult.estimatedBpm
    });
  });

  it("[REAL AUDIO TEST] Target Suno track (6edfba6a) decodes and runs full MIR pipeline", () => {
    if (!hasRealAudio || !audioData) {
      console.warn("Real audio fixture not found at " + wavPath + ", skipping real audio execution.");
      return;
    }

    expect(audioData.length).toBeGreaterThan(100000);
    expect(duration).toBeGreaterThan(140.0);
    expect(spectralResult.chromagram.length).toBeGreaterThan(100);
    expect(beatResult.estimatedBpm).toBeGreaterThan(100);
    expect(beatResult.estimatedBpm).toBeLessThan(140);
    expect(beatResult.beats.length).toBeGreaterThan(100);
    expect(harmonicResult.segments.length).toBeGreaterThan(10);
    expect(stabilizedResult!.segments.length).toBeGreaterThan(5);
  });

  it("[REAL AUDIO TEST] Detects core human-audited chord vocabulary (Gm, Bb, F, Dm, D)", () => {
    if (!hasRealAudio || !stabilizedResult) return;

    const chords = new Set(stabilizedResult.segments.map(s => s.chord));

    // Core human-listened chord vocabulary for validation
    expect(chords.has("Gm")).toBe(true);
    expect(chords.has("Bb")).toBe(true);
    expect(chords.has("F")).toBe(true);
    expect(chords.has("Dm")).toBe(true);
    expect(chords.has("D")).toBe(true); // Must distinguish D major (harmonic minor dominant)
  });

  it("[REAL AUDIO TEST] Evaluates true temporal bass persistence & third persistence diagnostics", () => {
    if (!hasRealAudio || !harmonicResult) return;

    let verifiedDiagnostics = 0;
    for (const unit of harmonicResult.beatUnits) {
      if (unit.candidates.length > 0) {
        const topCand = unit.candidates[0];
        expect(topCand.diagnostics).toBeDefined();
        expect(topCand.diagnostics.thirdMargin).toBeDefined();
        expect(topCand.diagnostics.thirdConfidence).toBeDefined();
        expect(topCand.diagnostics.maj3Persistence).toBeDefined();
        expect(topCand.diagnostics.min3Persistence).toBeDefined();
        expect(topCand.diagnostics.bassOccupancy).toBeDefined();
        expect(topCand.diagnostics.bassPersistence).toBeDefined();
        verifiedDiagnostics++;
      }
    }

    expect(verifiedDiagnostics).toBeGreaterThan(50);
  });

  it("[REAL AUDIO TEST] Prevents excessive non-diatonic false positives across full track", () => {
    if (!hasRealAudio || !stabilizedResult) return;

    const coreDiatonicChords = new Set(["Gm", "Bb", "F", "Dm", "D", "Cm", "Eb"]);
    let coreDuration = 0;
    let totalTrackDuration = 0;

    for (const seg of stabilizedResult.segments) {
      const segDur = seg.endTime - seg.startTime;
      totalTrackDuration += segDur;
      if (coreDiatonicChords.has(seg.chord)) {
        coreDuration += segDur;
      }
    }

    const coreRatio = coreDuration / Math.max(1, totalTrackDuration);
    // Core diatonic / harmonic-minor chords must account for > 85% of total song duration
    expect(coreRatio).toBeGreaterThan(0.85);
  });
});
