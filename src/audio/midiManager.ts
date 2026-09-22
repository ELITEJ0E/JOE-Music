/**
 * Web MIDI API Manager for Guitar Tone Studio & Hardware Looper.
 * Connects physical MIDI foot controllers, MIDI pedalboards, expression pedals,
 * USB keyboards, and pad controllers.
 */

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
  type: "input" | "output";
}

export type MidiMessageType = "noteon" | "noteoff" | "cc" | "programchange" | "pitchbend";

export interface MidiMessageEvent {
  type: MidiMessageType;
  channel: number; // 1-16
  note?: number; // 0-127
  velocity?: number; // 0-1
  cc?: number; // 0-127
  value?: number; // 0-1
  rawValue?: number; // 0-127
  program?: number; // 0-127
  timestamp: number;
  deviceName?: string;
}

export interface MidiMappingRule {
  actionId: string;
  label: string;
  category: "tone" | "looper" | "global";
  type: "note" | "cc" | "program";
  number: number; // Note #, CC #, or Program #
  channel?: number; // 1-16 or undefined for all channels
  description?: string;
}

// Built-in standard guitar footcontroller mappings
export const DEFAULT_MIDI_MAPPINGS: MidiMappingRule[] = [
  // Looper Hardware Functions
  { actionId: "looper:record_overdub", label: "Looper: Record / Overdub", category: "looper", type: "cc", number: 64, description: "CC 64 (Sustain / Footswitch 1)" },
  { actionId: "looper:play_stop", label: "Looper: Play / Stop", category: "looper", type: "cc", number: 80, description: "CC 80 (Footswitch 2)" },
  { actionId: "looper:undo", label: "Looper: Undo Layer", category: "looper", type: "cc", number: 81, description: "CC 81 (Footswitch 3)" },
  { actionId: "looper:clear_active", label: "Looper: Clear Active Layer", category: "looper", type: "cc", number: 82, description: "CC 82 (Footswitch 4)" },
  { actionId: "looper:clear_all", label: "Looper: Clear All Layers", category: "looper", type: "cc", number: 83, description: "CC 83 (Footswitch 5)" },
  { actionId: "looper:track_next", label: "Looper: Next Track Layer", category: "looper", type: "cc", number: 84, description: "CC 84 (Bank Up / Next)" },
  { actionId: "looper:track_prev", label: "Looper: Prev Track Layer", category: "looper", type: "cc", number: 85, description: "CC 85 (Bank Down / Prev)" },
  { actionId: "looper:track_1_toggle", label: "Looper: Mute Layer 1", category: "looper", type: "note", number: 36, description: "Note C1 / Pad 1" },
  { actionId: "looper:track_2_toggle", label: "Looper: Mute Layer 2", category: "looper", type: "note", number: 38, description: "Note D1 / Pad 2" },
  { actionId: "looper:track_3_toggle", label: "Looper: Mute Layer 3", category: "looper", type: "note", number: 40, description: "Note E1 / Pad 3" },
  { actionId: "looper:track_4_toggle", label: "Looper: Mute Layer 4", category: "looper", type: "note", number: 41, description: "Note F1 / Pad 4" },
  { actionId: "looper:volume_master", label: "Looper: Master Volume", category: "looper", type: "cc", number: 7, description: "CC 7 (Volume Pedal)" },

  // Tone Studio Pedalboard Functions
  { actionId: "tone:pedal_toggle:0", label: "Tone: Toggle Pedal 1", category: "tone", type: "cc", number: 20, description: "CC 20 (Pedal 1 Footswitch)" },
  { actionId: "tone:pedal_toggle:1", label: "Tone: Toggle Pedal 2", category: "tone", type: "cc", number: 21, description: "CC 21 (Pedal 2 Footswitch)" },
  { actionId: "tone:pedal_toggle:2", label: "Tone: Toggle Pedal 3", category: "tone", type: "cc", number: 22, description: "CC 22 (Pedal 3 Footswitch)" },
  { actionId: "tone:pedal_toggle:3", label: "Tone: Toggle Pedal 4", category: "tone", type: "cc", number: 23, description: "CC 23 (Pedal 4 Footswitch)" },
  { actionId: "tone:pedal_toggle:4", label: "Tone: Toggle Pedal 5", category: "tone", type: "cc", number: 24, description: "CC 24 (Pedal 5 Footswitch)" },
  { actionId: "tone:preset_next", label: "Tone: Next Preset", category: "tone", type: "cc", number: 25, description: "CC 25 (Preset Up)" },
  { actionId: "tone:preset_prev", label: "Tone: Prev Preset", category: "tone", type: "cc", number: 26, description: "CC 26 (Preset Down)" },
  { actionId: "tone:master_bypass", label: "Tone: Master FX Bypass", category: "tone", type: "cc", number: 27, description: "CC 27 (All FX Bypass)" },
  { actionId: "tone:live_mic_toggle", label: "Tone: Live Guitar Input On/Off", category: "tone", type: "cc", number: 28, description: "CC 28 (Input Mute)" },
  { actionId: "tone:expression_wah", label: "Tone: Wah / Primary Expression", category: "tone", type: "cc", number: 1, description: "CC 1 (Mod Wheel / Expression Pedal)" },
  { actionId: "tone:master_volume", label: "Tone: Master Output Volume", category: "tone", type: "cc", number: 11, description: "CC 11 (Expression / Vol Pedal)" },
];

const STORAGE_KEY = "guitar_station_midi_mappings_v1";

class MidiManager {
  private midiAccess: any = null;
  private isSupported: boolean = false;
  private isEnabled: boolean = true;
  private connectedInputs: MidiDevice[] = [];
  private mappings: Map<string, MidiMappingRule> = new Map();
  private learningActionId: string | null = null;

  private rawListeners: Set<(event: MidiMessageEvent) => void> = new Set();
  private actionListeners: Map<string, Set<(event: MidiMessageEvent) => void>> = new Map();
  private connectionListeners: Set<(devices: MidiDevice[]) => void> = new Set();
  private activityListeners: Set<(event: MidiMessageEvent) => void> = new Set();

  constructor() {
    this.loadMappings();
  }

  public async init(): Promise<boolean> {
    if (typeof navigator !== "undefined" && (navigator as any).requestMIDIAccess) {
      try {
        this.midiAccess = await (navigator as any).requestMIDIAccess({ sysex: false });
        this.isSupported = true;
        this.updateDevices();

        this.midiAccess.onstatechange = () => {
          this.updateDevices();
        };

        return true;
      } catch (err) {
        console.warn("MIDI Access not granted or unsupported:", err);
        this.isSupported = false;
        return false;
      }
    }
    this.isSupported = false;
    return false;
  }

  public getIsSupported(): boolean {
    return this.isSupported;
  }

  public getIsEnabled(): boolean {
    return this.isEnabled;
  }

  public setIsEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  public getDevices(): MidiDevice[] {
    return this.connectedInputs;
  }

  public getLearningActionId(): string | null {
    return this.learningActionId;
  }

  public startLearning(actionId: string) {
    this.learningActionId = actionId;
  }

  public stopLearning() {
    this.learningActionId = null;
  }

  public getMappings(): MidiMappingRule[] {
    return Array.from(this.mappings.values());
  }

  public getMappingForAction(actionId: string): MidiMappingRule | undefined {
    return this.mappings.get(actionId);
  }

  public setMapping(rule: MidiMappingRule) {
    this.mappings.set(rule.actionId, rule);
    this.saveMappings();
  }

  public removeMapping(actionId: string) {
    this.mappings.delete(actionId);
    this.saveMappings();
  }

  public resetDefaultMappings() {
    this.mappings.clear();
    DEFAULT_MIDI_MAPPINGS.forEach((rule) => {
      this.mappings.set(rule.actionId, { ...rule });
    });
    this.saveMappings();
  }

  private loadMappings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: MidiMappingRule[] = JSON.parse(saved);
        parsed.forEach((m) => this.mappings.set(m.actionId, m));
      } else {
        DEFAULT_MIDI_MAPPINGS.forEach((rule) => {
          this.mappings.set(rule.actionId, { ...rule });
        });
      }
    } catch (_) {
      DEFAULT_MIDI_MAPPINGS.forEach((rule) => {
        this.mappings.set(rule.actionId, { ...rule });
      });
    }
  }

  private saveMappings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.mappings.values())));
    } catch (_) {}
  }

  public subscribeMidi(cb: (event: MidiMessageEvent) => void) {
    this.rawListeners.add(cb);
    return () => {
      this.rawListeners.delete(cb);
    };
  }

  public subscribeActivity(cb: (event: MidiMessageEvent) => void) {
    this.activityListeners.add(cb);
    return () => {
      this.activityListeners.delete(cb);
    };
  }

  public subscribeConnections(cb: (devices: MidiDevice[]) => void) {
    this.connectionListeners.add(cb);
    return () => {
      this.connectionListeners.delete(cb);
    };
  }

  public onAction(actionId: string, cb: (event: MidiMessageEvent) => void) {
    if (!this.actionListeners.has(actionId)) {
      this.actionListeners.set(actionId, new Set());
    }
    this.actionListeners.get(actionId)!.add(cb);
    return () => {
      this.actionListeners.get(actionId)?.delete(cb);
    };
  }

  private updateDevices() {
    if (!this.midiAccess) return;
    const inputs: MidiDevice[] = [];
    const inputEntries = this.midiAccess.inputs.values();

    for (const input of inputEntries) {
      inputs.push({
        id: input.id,
        name: input.name || "MIDI Device",
        manufacturer: input.manufacturer || "Generic",
        state: input.state,
        type: "input",
      });

      input.onmidimessage = (msg: any) => this.handleMidiMessage(msg, input.name || "MIDI Controller");
    }

    this.connectedInputs = inputs;
    this.connectionListeners.forEach((cb) => cb(this.connectedInputs));
  }

  private handleMidiMessage(event: any, deviceName: string) {
    if (!this.isEnabled) return;
    const data = event.data;
    if (!data || data.length < 2) return;

    const statusByte = data[0];
    const command = statusByte >> 4;
    const channel = (statusByte & 0xf) + 1; // 1-16
    const byte1 = data[1];
    const byte2 = data.length > 2 ? data[2] : 0;
    const now = Date.now();

    let midiEvt: MidiMessageEvent | null = null;

    // Note On (command 9)
    if (command === 9 && byte2 > 0) {
      midiEvt = {
        type: "noteon",
        channel,
        note: byte1,
        velocity: byte2 / 127,
        rawValue: byte2,
        timestamp: now,
        deviceName,
      };
    }
    // Note Off (command 8 or note-on with 0 velocity)
    else if (command === 8 || (command === 9 && byte2 === 0)) {
      midiEvt = {
        type: "noteoff",
        channel,
        note: byte1,
        velocity: 0,
        rawValue: 0,
        timestamp: now,
        deviceName,
      };
    }
    // Control Change (command 11 / 0xB)
    else if (command === 11) {
      midiEvt = {
        type: "cc",
        channel,
        cc: byte1,
        value: byte2 / 127,
        rawValue: byte2,
        timestamp: now,
        deviceName,
      };
    }
    // Program Change (command 12 / 0xC)
    else if (command === 12) {
      midiEvt = {
        type: "programchange",
        channel,
        program: byte1,
        rawValue: byte1,
        timestamp: now,
        deviceName,
      };
    }
    // Pitch Bend (command 14 / 0xE)
    else if (command === 14) {
      const bendVal = (byte2 << 7) + byte1; // 0..16383
      midiEvt = {
        type: "pitchbend",
        channel,
        value: (bendVal - 8192) / 8192,
        rawValue: bendVal,
        timestamp: now,
        deviceName,
      };
    }

    if (!midiEvt) return;

    // Notify raw listeners & visual activity
    this.rawListeners.forEach((cb) => cb(midiEvt!));
    this.activityListeners.forEach((cb) => cb(midiEvt!));

    // Handle MIDI Learn
    if (this.learningActionId) {
      if (midiEvt.type === "noteon" && midiEvt.note !== undefined) {
        const existing = this.mappings.get(this.learningActionId);
        this.setMapping({
          actionId: this.learningActionId,
          label: existing?.label || this.learningActionId,
          category: existing?.category || "global",
          type: "note",
          number: midiEvt.note,
          channel: midiEvt.channel,
          description: `Note #${midiEvt.note} (Ch ${midiEvt.channel})`,
        });
        this.learningActionId = null;
        return;
      } else if (midiEvt.type === "cc" && midiEvt.cc !== undefined) {
        const existing = this.mappings.get(this.learningActionId);
        this.setMapping({
          actionId: this.learningActionId,
          label: existing?.label || this.learningActionId,
          category: existing?.category || "global",
          type: "cc",
          number: midiEvt.cc,
          channel: midiEvt.channel,
          description: `CC #${midiEvt.cc} (Ch ${midiEvt.channel})`,
        });
        this.learningActionId = null;
        return;
      } else if (midiEvt.type === "programchange" && midiEvt.program !== undefined) {
        const existing = this.mappings.get(this.learningActionId);
        this.setMapping({
          actionId: this.learningActionId,
          label: existing?.label || this.learningActionId,
          category: existing?.category || "global",
          type: "program",
          number: midiEvt.program,
          channel: midiEvt.channel,
          description: `Program #${midiEvt.program} (Ch ${midiEvt.channel})`,
        });
        this.learningActionId = null;
        return;
      }
    }

    // Match Action Rules
    this.mappings.forEach((rule) => {
      let isMatch = false;

      // Channel check (if rule specifies channel, must match)
      if (rule.channel && rule.channel !== midiEvt!.channel) {
        return;
      }

      if (rule.type === "note" && midiEvt!.type === "noteon" && midiEvt!.note === rule.number) {
        isMatch = true;
      } else if (rule.type === "cc" && midiEvt!.type === "cc" && midiEvt!.cc === rule.number) {
        isMatch = true;
      } else if (rule.type === "program" && midiEvt!.type === "programchange" && midiEvt!.program === rule.number) {
        isMatch = true;
      }

      if (isMatch) {
        const listeners = this.actionListeners.get(rule.actionId);
        if (listeners) {
          listeners.forEach((cb) => cb(midiEvt!));
        }
      }
    });

    // Special global dispatch for Program Change: auto-select preset if no explicit rule matches
    if (midiEvt.type === "programchange" && midiEvt.program !== undefined) {
      const pcListeners = this.actionListeners.get("tone:program_change");
      if (pcListeners) {
        pcListeners.forEach((cb) => cb(midiEvt!));
      }
    }
  }
}

export const midiManager = new MidiManager();
