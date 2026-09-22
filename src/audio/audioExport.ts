import { Mp3Encoder } from "@breezystack/lamejs";
import { DAWProject, DAWTrack } from "../types";
import { audioBufferToWavBlob } from "./wavEncoder";

export interface ExportFormatOptions {
  format: "wav" | "mp3";
  wavBitDepth?: 16 | 24 | 32;
  mp3Bitrate?: 128 | 192 | 256 | 320;
  sampleRate?: 44100 | 48000;
  normalize?: boolean; // Normalize peak to -0.3 dBFS
  targetPeakDb?: number; // default -0.3
}

/**
 * Normalizes an AudioBuffer to target peak dBFS (default: -0.3 dBFS ~ 0.966)
 * to prevent clipping and maximize audio fidelity.
 */
export function normalizeAudioBuffer(buffer: AudioBuffer, targetDb: number = -0.3): AudioBuffer {
  const targetLinear = Math.pow(10, targetDb / 20);
  let maxPeak = 0;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const absVal = Math.abs(data[i]);
      if (absVal > maxPeak) maxPeak = absVal;
    }
  }

  if (maxPeak < 0.00001 || Math.abs(maxPeak - targetLinear) < 0.001) {
    return buffer; // Already near target or silent
  }

  const gainFactor = targetLinear / maxPeak;
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const normalized = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dest = normalized.getChannelData(ch);
    for (let i = 0; i < src.length; i++) {
      dest[i] = src[i] * gainFactor;
    }
  }

  return normalized;
}

/**
 * Encodes an AudioBuffer into a pristine, high-fidelity MP3 Blob using LAME.
 */
export async function audioBufferToMp3Blob(
  buffer: AudioBuffer,
  bitrate: 128 | 192 | 256 | 320 = 320,
  onProgress?: (progressPercent: number) => void
): Promise<Blob> {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;

  const encoder = new Mp3Encoder(numChannels, sampleRate, bitrate);
  const mp3DataChunks: Uint8Array[] = [];

  const leftFloat = buffer.getChannelData(0);
  const rightFloat = numChannels > 1 ? buffer.getChannelData(1) : leftFloat;

  const blockSize = 1152;
  const numBlocks = Math.ceil(numSamples / blockSize);

  const leftInt16 = new Int16Array(blockSize);
  const rightInt16 = new Int16Array(blockSize);

  for (let block = 0; block < numBlocks; block++) {
    const offset = block * blockSize;
    const currentBlockSize = Math.min(blockSize, numSamples - offset);

    for (let i = 0; i < currentBlockSize; i++) {
      const idx = offset + i;
      // Clamp between -1 and 1 and convert to 16-bit signed integer
      const l = Math.max(-1, Math.min(1, leftFloat[idx]));
      const r = Math.max(-1, Math.min(1, rightFloat[idx]));
      leftInt16[i] = l < 0 ? l * 0x8000 : l * 0x7fff;
      rightInt16[i] = r < 0 ? r * 0x8000 : r * 0x7fff;
    }

    // Zero-fill tail of last block if incomplete
    for (let i = currentBlockSize; i < blockSize; i++) {
      leftInt16[i] = 0;
      rightInt16[i] = 0;
    }

    const mp3buf = encoder.encodeBuffer(
      currentBlockSize < blockSize ? leftInt16.subarray(0, currentBlockSize) : leftInt16,
      currentBlockSize < blockSize ? rightInt16.subarray(0, currentBlockSize) : rightInt16
    );

    if (mp3buf.length > 0) {
      mp3DataChunks.push(new Uint8Array(mp3buf));
    }

    if (onProgress && block % 50 === 0) {
      onProgress(Math.round((block / numBlocks) * 90));
    }
  }

  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) {
    mp3DataChunks.push(new Uint8Array(flushBuf));
  }

  if (onProgress) {
    onProgress(100);
  }

  return new Blob(mp3DataChunks, { type: "audio/mp3" });
}

/**
 * Encodes an AudioBuffer into 16-bit, 24-bit, or 32-bit float lossless WAV Blob.
 */
export function audioBufferToHighQualityWavBlob(
  buffer: AudioBuffer,
  bitDepth: 16 | 24 | 32 = 16
): Blob {
  if (bitDepth === 32) {
    return audioBufferToWavBlob(buffer, { float32: true });
  }

  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numSamples * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  if (bitDepth === 16) {
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = buffer.getChannelData(ch)[i];
        const clamped = Math.max(-1, Math.min(1, sample));
        const intSample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }
  } else if (bitDepth === 24) {
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = buffer.getChannelData(ch)[i];
        const clamped = Math.max(-1, Math.min(1, sample));
        const intSample = clamped < 0 ? clamped * 0x800000 : clamped * 0x7fffff;
        view.setUint8(offset, intSample & 0xff);
        view.setUint8(offset + 1, (intSample >> 8) & 0xff);
        view.setUint8(offset + 2, (intSample >> 16) & 0xff);
        offset += 3;
      }
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function createOfflineReverbImpulse(
  ctx: BaseAudioContext,
  durationSec: number = 2.2,
  decay: number = 2.5
): AudioBuffer {
  const sampleRate = ctx.sampleRate || 44100;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * decay);
    left[i] = (Math.random() * 2 - 1) * env;
    right[i] = (Math.random() * 2 - 1) * env;
  }
  return impulse;
}

/**
 * Renders the entire DAW project into an AudioBuffer with all track routing,
 * EQ, dynamics compressor, reverb send, and bus levels.
 */
export async function renderProjectMixdownBuffer(
  project: DAWProject,
  options?: {
    sampleRate?: number;
    busVolumes?: Map<string, number>;
    onProgress?: (progressPercent: number) => void;
  }
): Promise<AudioBuffer> {
  const targetSampleRate = options?.sampleRate || 44100;
  let maxEndTime = 1.0;

  project.tracks.forEach((track) => {
    (track.clips || []).forEach((clip) => {
      const end = clip.startTime + clip.duration;
      if (end > maxEndTime) maxEndTime = end;
    });
  });

  // Add 1.5s reverb decay tail so endings don't abruptly cut off
  const renderDuration = maxEndTime + 1.5;
  const totalLengthSamples = Math.ceil(renderDuration * targetSampleRate);

  const offlineCtx = new OfflineAudioContext(2, totalLengthSamples, targetSampleRate);

  // Shared Reverb Convolver Bus
  const sharedReverb = offlineCtx.createConvolver();
  sharedReverb.buffer = createOfflineReverbImpulse(offlineCtx, 2.0, 2.2);

  const sharedReverbReturn = offlineCtx.createGain();
  sharedReverbReturn.gain.setValueAtTime(0.7, 0);
  sharedReverb.connect(sharedReverbReturn);
  sharedReverbReturn.connect(offlineCtx.destination);

  // Bus Gain Nodes
  const busNodes: Map<string, GainNode> = new Map();
  project.tracks.forEach((track) => {
    const bId = track.busId?.trim().toLowerCase();
    if (bId && bId !== "master" && bId !== "none" && !busNodes.has(bId)) {
      const busGain = offlineCtx.createGain();
      const vol = options?.busVolumes?.get(bId) ?? 1.0;
      busGain.gain.setValueAtTime(vol, 0);
      busGain.connect(offlineCtx.destination);
      busNodes.set(bId, busGain);
    }
  });

  const hasSolo = project.tracks.some((t) => t.soloed);

  // Process Each Track
  project.tracks.forEach((track) => {
    if (track.muted) return;
    if (hasSolo && !track.soloed) return;

    // 3-Band EQ
    const eqLow = offlineCtx.createBiquadFilter();
    eqLow.type = "lowshelf";
    eqLow.frequency.setValueAtTime(200, 0);
    eqLow.gain.setValueAtTime(track.eq?.lowGainDb ?? 0, 0);

    const eqMid = offlineCtx.createBiquadFilter();
    eqMid.type = "peaking";
    eqMid.frequency.setValueAtTime(1000, 0);
    eqMid.Q.setValueAtTime(1.0, 0);
    eqMid.gain.setValueAtTime(track.eq?.midGainDb ?? 0, 0);

    const eqHigh = offlineCtx.createBiquadFilter();
    eqHigh.type = "highshelf";
    eqHigh.frequency.setValueAtTime(4000, 0);
    eqHigh.gain.setValueAtTime(track.eq?.highGainDb ?? 0, 0);

    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);

    let postInsertNode: AudioNode = eqHigh;

    // Dynamics Compressor Insert
    if (track.insertEffects?.compressorEnabled) {
      const compNode = offlineCtx.createDynamicsCompressor();
      compNode.threshold.setValueAtTime(track.insertEffects.compressorThresholdDb ?? -24, 0);
      compNode.ratio.setValueAtTime(track.insertEffects.compressorRatio ?? 4, 0);
      compNode.attack.setValueAtTime(0.01, 0);
      compNode.release.setValueAtTime(0.2, 0);
      eqHigh.connect(compNode);
      postInsertNode = compNode;
    }

    // Track Volume & Pan
    const trackGain = offlineCtx.createGain();
    trackGain.gain.setValueAtTime(track.volume, 0);
    postInsertNode.connect(trackGain);

    let finalOutput: AudioNode = trackGain;
    if (offlineCtx.createStereoPanner) {
      const panner = offlineCtx.createStereoPanner();
      panner.pan.setValueAtTime(track.pan, 0);
      trackGain.connect(panner);
      finalOutput = panner;
    }

    // Bus Routing
    const bId = track.busId?.trim().toLowerCase();
    const busNode = bId && bId !== "master" && bId !== "none" ? busNodes.get(bId) : null;
    if (busNode) {
      finalOutput.connect(busNode);
    } else {
      finalOutput.connect(offlineCtx.destination);
    }

    // Parallel Reverb Send
    const sendLevel = Math.max(0, Math.min(1, track.insertEffects?.reverbSendLevel ?? 0));
    if (sendLevel > 0) {
      const sendGain = offlineCtx.createGain();
      sendGain.gain.setValueAtTime(sendLevel, 0);
      postInsertNode.connect(sendGain);
      sendGain.connect(sharedReverb);
    }

    // Clips
    (track.clips || []).forEach((clip) => {
      if (!clip.audioBuffer || clip.duration <= 0) return;

      const source = offlineCtx.createBufferSource();
      source.buffer = clip.audioBuffer;

      const clipGain = offlineCtx.createGain();
      const baseGain = clip.gain ?? 1.0;
      const fadeIn = Math.max(0, clip.fadeInSec ?? 0.005);
      const fadeOut = Math.max(0, clip.fadeOutSec ?? 0.005);

      const startTime = clip.startTime;
      const endTime = clip.startTime + clip.duration;

      if (fadeIn > 0 && fadeIn < clip.duration) {
        clipGain.gain.setValueAtTime(0.0001, startTime);
        clipGain.gain.linearRampToValueAtTime(baseGain, startTime + fadeIn);
      } else {
        clipGain.gain.setValueAtTime(baseGain, startTime);
      }

      if (fadeOut > 0 && fadeOut < clip.duration) {
        const fadeOutStart = Math.max(startTime + fadeIn, endTime - fadeOut);
        clipGain.gain.setValueAtTime(baseGain, fadeOutStart);
        clipGain.gain.linearRampToValueAtTime(0.0001, endTime);
      }

      source.connect(clipGain);
      clipGain.connect(eqLow);

      source.start(startTime, clip.trimStart ?? 0, clip.duration);
    });
  });

  return await offlineCtx.startRendering();
}

/**
 * Renders an isolated track stem to an AudioBuffer.
 */
export async function renderTrackStemBuffer(
  track: DAWTrack,
  targetDuration: number,
  sampleRate: number = 44100
): Promise<AudioBuffer> {
  const totalLengthSamples = Math.ceil(targetDuration * sampleRate);
  const offlineCtx = new OfflineAudioContext(2, totalLengthSamples, sampleRate);

  const eqLow = offlineCtx.createBiquadFilter();
  eqLow.type = "lowshelf";
  eqLow.frequency.setValueAtTime(200, 0);
  eqLow.gain.setValueAtTime(track.eq?.lowGainDb ?? 0, 0);

  const eqMid = offlineCtx.createBiquadFilter();
  eqMid.type = "peaking";
  eqMid.frequency.setValueAtTime(1000, 0);
  eqMid.Q.setValueAtTime(1.0, 0);
  eqMid.gain.setValueAtTime(track.eq?.midGainDb ?? 0, 0);

  const eqHigh = offlineCtx.createBiquadFilter();
  eqHigh.type = "highshelf";
  eqHigh.frequency.setValueAtTime(4000, 0);
  eqHigh.gain.setValueAtTime(track.eq?.highGainDb ?? 0, 0);

  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);

  let postInsertNode: AudioNode = eqHigh;

  if (track.insertEffects?.compressorEnabled) {
    const compNode = offlineCtx.createDynamicsCompressor();
    compNode.threshold.setValueAtTime(track.insertEffects.compressorThresholdDb ?? -24, 0);
    compNode.ratio.setValueAtTime(track.insertEffects.compressorRatio ?? 4, 0);
    compNode.attack.setValueAtTime(0.01, 0);
    compNode.release.setValueAtTime(0.2, 0);
    eqHigh.connect(compNode);
    postInsertNode = compNode;
  }

  const trackGain = offlineCtx.createGain();
  trackGain.gain.setValueAtTime(track.volume, 0);
  postInsertNode.connect(trackGain);

  let finalOutput: AudioNode = trackGain;
  if (offlineCtx.createStereoPanner) {
    const panner = offlineCtx.createStereoPanner();
    panner.pan.setValueAtTime(track.pan, 0);
    trackGain.connect(panner);
    finalOutput = panner;
  }

  finalOutput.connect(offlineCtx.destination);

  (track.clips || []).forEach((clip) => {
    if (!clip.audioBuffer || clip.duration <= 0) return;

    const source = offlineCtx.createBufferSource();
    source.buffer = clip.audioBuffer;

    const clipGain = offlineCtx.createGain();
    const baseGain = clip.gain ?? 1.0;
    const fadeIn = Math.max(0, clip.fadeInSec ?? 0.005);
    const fadeOut = Math.max(0, clip.fadeOutSec ?? 0.005);

    const startTime = clip.startTime;
    const endTime = clip.startTime + clip.duration;

    if (fadeIn > 0 && fadeIn < clip.duration) {
      clipGain.gain.setValueAtTime(0.0001, startTime);
      clipGain.gain.linearRampToValueAtTime(baseGain, startTime + fadeIn);
    } else {
      clipGain.gain.setValueAtTime(baseGain, startTime);
    }

    if (fadeOut > 0 && fadeOut < clip.duration) {
      const fadeOutStart = Math.max(startTime + fadeIn, endTime - fadeOut);
      clipGain.gain.setValueAtTime(baseGain, fadeOutStart);
      clipGain.gain.linearRampToValueAtTime(0.0001, endTime);
    }

    source.connect(clipGain);
    clipGain.connect(eqLow);

    source.start(startTime, clip.trimStart ?? 0, clip.duration);
  });

  return await offlineCtx.startRendering();
}
