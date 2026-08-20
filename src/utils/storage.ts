import { TonePreset, SavedRecording } from "../types";
import { DEFAULT_TONE_PRESETS } from "../data/presetsDatabase";

const DB_NAME = "GuitarStudio_DB";
const DB_VERSION = 1;
const STORE_RECORDINGS = "recordings";
const STORE_PRESETS = "presets";
const STORE_PRACTICE = "practice_logs";

// Fallback in-memory cache if IndexedDB is blocked in sandboxed iframes
const memoryPresets: TonePreset[] = [...DEFAULT_TONE_PRESETS];
const memoryRecordings: SavedRecording[] = [];
const memoryPracticeLogs: PracticeLog[] = [];

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof window === "undefined" || typeof indexedDB === "undefined") {
        return resolve(null);
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e: any) => {
        try {
          const db = e.target.result as IDBDatabase;
          if (!db.objectStoreNames.contains(STORE_RECORDINGS)) {
            db.createObjectStore(STORE_RECORDINGS, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(STORE_PRESETS)) {
            db.createObjectStore(STORE_PRESETS, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(STORE_PRACTICE)) {
            db.createObjectStore(STORE_PRACTICE, { keyPath: "id" });
          }
        } catch (err) {
          console.warn("IndexedDB upgrade warning:", err);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch (err) {
      console.warn("IndexedDB access error in sandbox iframe:", err);
      resolve(null);
    }
  });
}

export async function saveRecordingToDB(recording: SavedRecording): Promise<void> {
  try {
    const db = await openDB();
    if (!db) {
      const idx = memoryRecordings.findIndex((r) => r.id === recording.id);
      if (idx >= 0) memoryRecordings[idx] = recording;
      else memoryRecordings.push(recording);
      return;
    }
    const tx = db.transaction(STORE_RECORDINGS, "readwrite");
    const store = tx.objectStore(STORE_RECORDINGS);
    store.put(recording);
  } catch (err) {
    console.warn("Failed to save recording to DB:", err);
    memoryRecordings.push(recording);
  }
}

export async function loadRecordingsFromDB(): Promise<SavedRecording[]> {
  try {
    const db = await openDB();
    if (!db) {
      return memoryRecordings.map((rec) => ({
        ...rec,
        url: rec.blob ? URL.createObjectURL(rec.blob) : rec.url,
      }));
    }
    const tx = db.transaction(STORE_RECORDINGS, "readonly");
    const store = tx.objectStore(STORE_RECORDINGS);
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const records = (req.result as SavedRecording[]).map((rec) => ({
          ...rec,
          url: rec.blob ? URL.createObjectURL(rec.blob) : rec.url,
        }));
        resolve(records);
      };
      req.onerror = () => resolve(memoryRecordings);
    });
  } catch (err) {
    console.warn("Failed to load recordings:", err);
    return memoryRecordings;
  }
}

export async function deleteRecordingFromDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    if (!db) {
      const idx = memoryRecordings.findIndex((r) => r.id === id);
      if (idx >= 0) memoryRecordings.splice(idx, 1);
      return;
    }
    const tx = db.transaction(STORE_RECORDINGS, "readwrite");
    const store = tx.objectStore(STORE_RECORDINGS);
    store.delete(id);
  } catch (err) {
    console.warn("Failed to delete recording:", err);
  }
}

export async function savePresetToDB(preset: TonePreset): Promise<void> {
  try {
    const db = await openDB();
    if (!db) {
      const idx = memoryPresets.findIndex((p) => p.id === preset.id);
      if (idx >= 0) memoryPresets[idx] = preset;
      else memoryPresets.push(preset);
      return;
    }
    const tx = db.transaction(STORE_PRESETS, "readwrite");
    tx.objectStore(STORE_PRESETS).put(preset);
  } catch (err) {
    console.warn("Failed to save preset:", err);
  }
}

export async function loadPresetsFromDB(): Promise<TonePreset[]> {
  try {
    const db = await openDB();
    if (!db) {
      return memoryPresets;
    }
    const tx = db.transaction(STORE_PRESETS, "readonly");
    return new Promise((resolve) => {
      const req = tx.objectStore(STORE_PRESETS).getAll();
      req.onsuccess = () => {
        const userPresets = req.result as TonePreset[];
        if (!userPresets || userPresets.length === 0) {
          resolve(DEFAULT_TONE_PRESETS);
        } else {
          // Merge default + user
          const map = new Map<string, TonePreset>();
          DEFAULT_TONE_PRESETS.forEach((p) => map.set(p.id, p));
          userPresets.forEach((p) => map.set(p.id, p));
          resolve(Array.from(map.values()));
        }
      };
      req.onerror = () => resolve(DEFAULT_TONE_PRESETS);
    });
  } catch (err) {
    console.warn("Failed to load presets:", err);
    return DEFAULT_TONE_PRESETS;
  }
}

export interface PracticeLog {
  id: string;
  date?: string;
  minutes?: number;
  mode?: string;
  routineName?: string;
  score?: number;
  bpm: number;
  chordsPracticed?: string[];
  timestamp?: string;
}

export async function savePracticeLog(log: PracticeLog): Promise<void> {
  try {
    const db = await openDB();
    if (!db) {
      memoryPracticeLogs.push(log);
      return;
    }
    const tx = db.transaction(STORE_PRACTICE, "readwrite");
    tx.objectStore(STORE_PRACTICE).put(log);
  } catch (err) {
    console.warn("Failed to save practice log:", err);
    memoryPracticeLogs.push(log);
  }
}

export async function loadPracticeLogs(): Promise<PracticeLog[]> {
  try {
    const db = await openDB();
    if (!db) {
      return memoryPracticeLogs;
    }
    const tx = db.transaction(STORE_PRACTICE, "readonly");
    return new Promise((resolve) => {
      const req = tx.objectStore(STORE_PRACTICE).getAll();
      req.onsuccess = () => resolve(req.result as PracticeLog[]);
      req.onerror = () => resolve(memoryPracticeLogs);
    });
  } catch (err) {
    return memoryPracticeLogs;
  }
}
