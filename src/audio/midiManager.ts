/**
 * Web MIDI API Manager
 * Connects physical MIDI foot controllers, MIDI guitars, and USB keyboards
 */

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
  type: "input" | "output";
}

class MidiManager {
  private midiAccess: any = null;
  private isSupported: boolean = false;
  private connectedInputs: MidiDevice[] = [];
  private listeners: Set<(event: { type: string; note?: number; velocity?: number; cc?: number; value?: number }) => void> = new Set();
  private connectionListeners: Set<(devices: MidiDevice[]) => void> = new Set();

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

  public getDevices(): MidiDevice[] {
    return this.connectedInputs;
  }

  public subscribeMidi(cb: (event: { type: string; note?: number; velocity?: number; cc?: number; value?: number }) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public subscribeConnections(cb: (devices: MidiDevice[]) => void) {
    this.connectionListeners.add(cb);
    return () => this.connectionListeners.delete(cb);
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

      // Attach message handler
      input.onmidimessage = (msg: any) => this.handleMidiMessage(msg);
    }

    this.connectedInputs = inputs;
    this.connectionListeners.forEach((cb) => cb(this.connectedInputs));
  }

  private handleMidiMessage(event: any) {
    const data = event.data;
    if (!data || data.length < 2) return;

    const command = data[0] >> 4;
    const channel = data[0] & 0xf;
    const noteOrCC = data[1];
    const velocityOrVal = data.length > 2 ? data[2] : 0;

    // Note On
    if (command === 9 && velocityOrVal > 0) {
      this.notifyListeners({
        type: "noteon",
        note: noteOrCC,
        velocity: velocityOrVal / 127,
      });
    }
    // Note Off
    else if (command === 8 || (command === 9 && velocityOrVal === 0)) {
      this.notifyListeners({
        type: "noteoff",
        note: noteOrCC,
        velocity: 0,
      });
    }
    // Control Change (CC) - e.g. Expression Pedal or Foot Switch
    else if (command === 11) {
      this.notifyListeners({
        type: "cc",
        cc: noteOrCC,
        value: velocityOrVal / 127,
      });
    }
  }

  private notifyListeners(event: any) {
    this.listeners.forEach((cb) => cb(event));
  }
}

export const midiManager = new MidiManager();
