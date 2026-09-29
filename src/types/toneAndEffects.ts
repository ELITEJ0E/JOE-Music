import {
  PedalConfig,
  ToneMacroSettings,
  DEFAULT_TONE_MACROS,
  TrackEqConfig,
  TrackInsertEffectsConfig,
} from "./index";

export { DEFAULT_TONE_MACROS };
export type { ToneMacroSettings };

/**
 * Sound Preset Scope distinguishes Guitar live rigs, DAW track sound presets, and Master chain presets.
 */
export type SoundPresetScope = "GUITAR_RIG" | "STUDIO_TRACK" | "MASTER";

/**
 * Unified Studio Track Sound Preset
 */
export interface StudioTrackPreset {
  id: string;
  name: string;
  category: "Vocal" | "Guitar" | "Bass" | "Drums" | "Keys" | "Acoustic" | "Creative";
  description: string;
  scope: "STUDIO_TRACK";
  macros: ToneMacroSettings;
  eq: TrackEqConfig;
  insertEffects: TrackInsertEffectsConfig;
  author?: string;
  favorite?: boolean;
}

/**
 * Maps per-track Tone Macros (0..100) directly into DAW Track DSP parameters.
 * Musically shapes EQ, Compression, Reverb send, Delay, Chorus, and Drive.
 */
export function mapToneMacrosToTrackDsp(
  macros: ToneMacroSettings,
  baseEq: TrackEqConfig,
  baseEffects: TrackInsertEffectsConfig
): {
  eq: TrackEqConfig;
  insertEffects: TrackInsertEffectsConfig;
} {
  // Warmth (0..100): low-shelf boost (+dB), mid warmth (+dB), subtle high softening
  const warmthLowAdd = (macros.warmth - 50) * 0.12; // -6dB to +6dB
  const warmthMidAdd = (macros.warmth - 50) * 0.08; // -4dB to +4dB

  // Brightness (0..100): high-shelf boost (+dB), air presence
  const brightnessHighAdd = (macros.brightness - 50) * 0.16; // -8dB to +8dB

  const updatedEq: TrackEqConfig = {
    lowGainDb: Math.max(-12, Math.min(12, baseEq.lowGainDb + warmthLowAdd)),
    midGainDb: Math.max(-12, Math.min(12, baseEq.midGainDb + warmthMidAdd)),
    highGainDb: Math.max(-12, Math.min(12, baseEq.highGainDb + brightnessHighAdd)),
  };

  // Punch (0..100): engages compressor with tighter ratio & threshold
  const punchCompressorRatio = Math.max(1, Math.min(10, (macros.punch / 100) * 8 + 1));
  const punchCompressorThreshold = -12 - (macros.punch / 100) * 24; // -12dB to -36dB

  // Space (0..100): controls reverb send level and delay blend
  const spaceReverbSend = Math.max(0, Math.min(1, (macros.space / 100) * 0.75));
  const spaceDelayMix = Math.max(0, Math.min(1, (macros.space / 100) * 0.5));

  // Width (0..100): controls chorus rate/depth and wet mix
  const widthChorusMix = Math.max(0, Math.min(1, (macros.width / 100) * 0.6));
  const widthChorusDepth = Math.max(0, Math.min(1, (macros.width / 100) * 0.8));

  // Character (0..100): controls overdrive saturation amount and mix
  const characterDriveAmount = Math.max(0, Math.min(100, macros.character));
  const characterDriveMix = Math.max(0, Math.min(1, (macros.character / 100) * 0.7));

  const updatedEffects: TrackInsertEffectsConfig = {
    ...baseEffects,
    reverbSendLevel: Math.max(baseEffects.reverbSendLevel, spaceReverbSend),
    compressorEnabled: macros.punch > 25 || baseEffects.compressorEnabled,
    compressorThresholdDb: baseEffects.compressorEnabled
      ? baseEffects.compressorThresholdDb
      : punchCompressorThreshold,
    compressorRatio: baseEffects.compressorEnabled
      ? baseEffects.compressorRatio
      : punchCompressorRatio,
    delay: {
      enabled: macros.space > 20 || !!baseEffects.delay?.enabled,
      timeSec: baseEffects.delay?.timeSec ?? 0.35,
      feedback: baseEffects.delay?.feedback ?? 0.35,
      mix: baseEffects.delay?.enabled ? baseEffects.delay.mix : spaceDelayMix,
    },
    chorus: {
      enabled: macros.width > 20 || !!baseEffects.chorus?.enabled,
      rateHz: baseEffects.chorus?.rateHz ?? 1.5,
      depth: baseEffects.chorus?.enabled ? baseEffects.chorus.depth : widthChorusDepth,
      mix: baseEffects.chorus?.enabled ? baseEffects.chorus.mix : widthChorusMix,
    },
    drive: {
      enabled: macros.character > 30 || !!baseEffects.drive?.enabled,
      amount: baseEffects.drive?.enabled ? baseEffects.drive.amount : characterDriveAmount,
      tone: baseEffects.drive?.tone ?? 50,
      mix: baseEffects.drive?.enabled ? baseEffects.drive.mix : characterDriveMix,
    },
  };

  return {
    eq: updatedEq,
    insertEffects: updatedEffects,
  };
}

/**
 * Maps macro values (0..100) to actual DSP parameter updates in PedalboardDSPChain
 */
export function mapMacrosToDspEffects(macros: ToneMacroSettings, basePedals: PedalConfig[]): PedalConfig[] {
  return basePedals.map((pedal) => {
    const updated = { ...pedal, params: { ...pedal.params } };

    switch (pedal.type) {
      case "ampHead": {
        const bassAdd = (macros.warmth - 50) * 0.12;
        const midAdd = (macros.warmth - 50) * 0.08;
        const trebleAdd = (macros.brightness - 50) * 0.15;
        const presenceAdd = (macros.brightness - 50) * 0.12;
        const gainAdd = (macros.character - 50) * 0.3;

        updated.params.bass = Math.max(0, Math.min(10, (Number(pedal.params.bass) || 5) + bassAdd));
        updated.params.mid = Math.max(0, Math.min(10, (Number(pedal.params.mid) || 5) + midAdd));
        updated.params.treble = Math.max(0, Math.min(10, (Number(pedal.params.treble) || 5) + trebleAdd));
        updated.params.presence = Math.max(0, Math.min(10, (Number(pedal.params.presence) || 5) + presenceAdd));
        updated.params.gain = Math.max(0, Math.min(100, (Number(pedal.params.gain) || 40) + gainAdd));
        break;
      }
      case "compressor": {
        const thresholdSub = (macros.punch - 50) * 0.2;
        const ratioAdd = (macros.punch - 50) * 0.08;
        updated.params.threshold = Math.max(-50, Math.min(-10, (Number(pedal.params.threshold) || -24) - thresholdSub));
        updated.params.ratio = Math.max(1, Math.min(16, (Number(pedal.params.ratio) || 4) + ratioAdd));
        break;
      }
      case "reverb": {
        const mixAdd = (macros.space - 50) * 0.5;
        updated.params.mix = Math.max(0, Math.min(100, (Number(pedal.params.mix) || 25) + mixAdd));
        break;
      }
      case "delay": {
        const delayMixAdd = (macros.space - 50) * 0.3;
        updated.params.mix = Math.max(0, Math.min(100, (Number(pedal.params.mix) || 20) + delayMixAdd));
        break;
      }
      case "chorus": {
        const widthMixAdd = (macros.width - 50) * 0.4;
        updated.params.depth = Math.max(0, Math.min(100, (Number(pedal.params.depth) || 30) + widthMixAdd));
        updated.params.mix = Math.max(0, Math.min(100, (Number(pedal.params.mix) || 25) + widthMixAdd));
        break;
      }
      case "overdrive": {
        const driveAdd = (macros.character - 50) * 0.4;
        updated.params.drive = Math.max(0, Math.min(100, (Number(pedal.params.drive) || 35) + driveAdd));
        break;
      }
    }

    return updated;
  });
}
