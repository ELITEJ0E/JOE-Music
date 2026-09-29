import { PedalConfig, TonePreset } from "./index";

/**
 * Macro Tone parameters for quick, musical sound shaping
 * Each macro maps internally to multiple underlying DSP chain parameters.
 */
export interface ToneMacroSettings {
  warmth: number;    // 0 - 100: low-mid body, tube saturation, high-shelf damping
  brightness: number; // 0 - 100: presence, high-end shimmer, harmonic bite
  punch: number;     // 0 - 100: compressor attack/ratio, low-end transient snap
  space: number;     // 0 - 100: reverb decay, delay reflections, diffusion
  width: number;     // 0 - 100: stereo chorus spread, decorrelation
  character: number; // 0 - 100: amp saturation harmonics, cabinet resonance
}

export const DEFAULT_TONE_MACROS: ToneMacroSettings = {
  warmth: 50,
  brightness: 55,
  punch: 45,
  space: 35,
  width: 40,
  character: 50,
};

/**
 * Complete Studio Sound Preset combining Macro Tone + underlying Effects chain
 */
export interface StudioPreset {
  id: string;
  name: string;
  category: "Clean" | "Rock" | "Ambient" | "Metal" | "Blues" | "Acoustic" | "Funk";
  description: string;
  macros: ToneMacroSettings;
  effects: PedalConfig[];
}

/**
 * Maps macro values (0..100) to actual DSP parameter updates in PedalboardDSPChain
 */
export function mapMacrosToDspEffects(macros: ToneMacroSettings, basePedals: PedalConfig[]): PedalConfig[] {
  return basePedals.map((pedal) => {
    const updated = { ...pedal, params: { ...pedal.params } };

    switch (pedal.type) {
      case "ampHead": {
        // Warmth boosts bass & mid, trims harsh presence
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
        // Punch increases ratio & reduces threshold, adds subtle makeup
        const thresholdSub = (macros.punch - 50) * 0.2;
        const ratioAdd = (macros.punch - 50) * 0.08;
        updated.params.threshold = Math.max(-50, Math.min(-10, (Number(pedal.params.threshold) || -24) - thresholdSub));
        updated.params.ratio = Math.max(1, Math.min(16, (Number(pedal.params.ratio) || 4) + ratioAdd));
        break;
      }
      case "reverb": {
        // Space directly controls reverb mix & decay
        const mixAdd = (macros.space - 50) * 0.5;
        updated.params.mix = Math.max(0, Math.min(100, (Number(pedal.params.mix) || 25) + mixAdd));
        break;
      }
      case "delay": {
        // Space also controls subtle delay level
        const delayMixAdd = (macros.space - 50) * 0.3;
        updated.params.mix = Math.max(0, Math.min(100, (Number(pedal.params.mix) || 20) + delayMixAdd));
        break;
      }
      case "chorus": {
        // Width controls chorus depth and mix
        const widthMixAdd = (macros.width - 50) * 0.4;
        updated.params.depth = Math.max(0, Math.min(100, (Number(pedal.params.depth) || 30) + widthMixAdd));
        updated.params.mix = Math.max(0, Math.min(100, (Number(pedal.params.mix) || 25) + widthMixAdd));
        break;
      }
      case "overdrive": {
        // Character influences drive saturation
        const driveAdd = (macros.character - 50) * 0.4;
        updated.params.drive = Math.max(0, Math.min(100, (Number(pedal.params.drive) || 35) + driveAdd));
        break;
      }
    }

    return updated;
  });
}
