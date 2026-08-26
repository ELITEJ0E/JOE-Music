import { TonePreset, SavedRecording, SavedSong, DAWProject, LooperSession, DAWTrack, LooperTrack } from "../types";
import { DEFAULT_TONE_PRESETS } from "../data/presetsDatabase";
import { audioBufferToWavBlob, blobToAudioBuffer, extractWaveformPeaks } from "../audio/wavEncoder";

const DB_NAME = "GuitarStudio_DB";
const DB_VERSION = 3; // Incremented for DAW projects & looper stores
const STORE_RECORDINGS = "recordings";
const STORE_PRESETS = "presets";
const STORE_PRACTICE = "practice_logs";
const STORE_SONGS = "songs";
const STORE_PROJECTS = "daw_projects";
const STORE_LOOPER = "looper_sessions";

// Fallback in-memory cache if IndexedDB is blocked in sandboxed iframes
const memoryPresets: TonePreset[] = [...DEFAULT_TONE_PRESETS];
const memoryRecordings: SavedRecording[] = [];
const memoryPracticeLogs: PracticeLog[] = [];
const memorySongs: SavedSong[] = [];
const memoryProjects: DAWProject[] = [];
const memoryLooperSessions: LooperSession[] = [];

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
          if (!db.objectStoreNames.contains(STORE_SONGS)) {
            db.createObjectStore(STORE_SONGS, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
            db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(STORE_LOOPER)) {
            db.createObjectStore(STORE_LOOPER, { keyPath: "id" });
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

export async function saveSongToDB(song: SavedSong): Promise<void> {
  const songToSave: SavedSong = {
    ...song,
    savedAt: song.savedAt || Date.now(),
    lastPlayedAt: song.lastPlayedAt || Date.now(),
  };
  try {
    const db = await openDB();
    if (!db) {
      const idx = memorySongs.findIndex((s) => s.id === songToSave.id);
      if (idx >= 0) memorySongs[idx] = songToSave;
      else memorySongs.push(songToSave);
      return;
    }
    const tx = db.transaction(STORE_SONGS, "readwrite");
    const store = tx.objectStore(STORE_SONGS);
    store.put(songToSave);
  } catch (err) {
    console.warn("Failed to save song to DB:", err);
    memorySongs.push(songToSave);
  }
}

export async function loadSongsFromDB(): Promise<SavedSong[]> {
  try {
    const db = await openDB();
    if (!db) {
      return [...memorySongs].sort((a, b) => (b.savedAt || b.lastPlayedAt || 0) - (a.savedAt || a.lastPlayedAt || 0));
    }
    const tx = db.transaction(STORE_SONGS, "readonly");
    const store = tx.objectStore(STORE_SONGS);
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result as SavedSong[]) || [];
        // Sort strictly by uploaded/saved timestamp: newest uploaded first to oldest
        list.sort((a, b) => (b.savedAt || b.lastPlayedAt || 0) - (a.savedAt || a.lastPlayedAt || 0));
        resolve(list);
      };
      req.onerror = () => resolve(memorySongs);
    });
  } catch (err) {
    console.warn("Failed to load songs:", err);
    return memorySongs;
  }
}

export async function deleteSongFromDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    if (!db) {
      const idx = memorySongs.findIndex((s) => s.id === id);
      if (idx >= 0) memorySongs.splice(idx, 1);
      return;
    }
    const tx = db.transaction(STORE_SONGS, "readwrite");
    const store = tx.objectStore(STORE_SONGS);
    store.delete(id);
  } catch (err) {
    console.warn("Failed to delete song:", err);
  }
}

export async function saveProjectToDB(project: DAWProject): Promise<void> {
  const serializableTracks: DAWTrack[] = project.tracks.map((t) => {
    const clips = (t.clips || []).map((clip) => {
      let blob = clip.audioBlob;
      if (!blob && clip.audioBuffer) {
        try {
          blob = audioBufferToWavBlob(clip.audioBuffer);
        } catch (err) {
          console.warn("Failed to serialize clip buffer to blob:", err);
        }
      }
      const peaks = clip.waveformPeaks || (clip.audioBuffer ? extractWaveformPeaks(clip.audioBuffer, 64) : undefined);
      return {
        ...clip,
        audioBuffer: null, // Exclude non-cloneable AudioBuffer
        audioBlob: blob,
        waveformPeaks: peaks,
        fadeInSec: clip.fadeInSec ?? 0.005,
        fadeOutSec: clip.fadeOutSec ?? 0.005,
        gain: clip.gain ?? 1.0,
        trimStart: clip.trimStart ?? 0,
      };
    });

    // Also handle legacy track buffer if present
    let trackBlob = t.audioBlob;
    if (!trackBlob && t.audioBuffer) {
      try {
        trackBlob = audioBufferToWavBlob(t.audioBuffer);
      } catch (_) {}
    }

    return {
      ...t,
      clips,
      audioBuffer: null,
      audioBlob: trackBlob,
      waveformPeaks: t.waveformPeaks || (t.audioBuffer ? extractWaveformPeaks(t.audioBuffer, 64) : undefined),
    };
  });

  const projectToSave: DAWProject = {
    ...project,
    tracks: serializableTracks,
    updatedAt: Date.now(),
  };

  try {
    const db = await openDB();
    if (!db) {
      const idx = memoryProjects.findIndex((p) => p.id === projectToSave.id);
      if (idx >= 0) memoryProjects[idx] = projectToSave;
      else memoryProjects.push(projectToSave);
      return;
    }
    const tx = db.transaction(STORE_PROJECTS, "readwrite");
    const store = tx.objectStore(STORE_PROJECTS);
    store.put(projectToSave);
  } catch (err) {
    console.warn("Failed to save project to DB:", err);
    const idx = memoryProjects.findIndex((p) => p.id === projectToSave.id);
    if (idx >= 0) memoryProjects[idx] = projectToSave;
    else memoryProjects.push(projectToSave);
  }
}

export async function loadProjectsFromDB(ctx?: AudioContext): Promise<DAWProject[]> {
  try {
    const db = await openDB();
    let rawProjects: DAWProject[] = [];

    if (!db) {
      rawProjects = [...memoryProjects];
    } else {
      const tx = db.transaction(STORE_PROJECTS, "readonly");
      const store = tx.objectStore(STORE_PROJECTS);
      rawProjects = await new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as DAWProject[]) || []);
        req.onerror = () => resolve(memoryProjects);
      });
    }

    // Hydrate audioBuffers for all clips and legacy tracks
    if (rawProjects.length > 0) {
      for (const proj of rawProjects) {
        for (const track of proj.tracks) {
          if (!track.clips) {
            track.clips = [];
          }

          // Legacy track migration if track has audioBuffer/audioBlob but no clips
          if (track.clips.length === 0 && track.audioBlob) {
            track.clips.push({
              id: `clip-migrated-${track.id}`,
              name: `${track.name} Take`,
              startTime: track.startTime || 0,
              duration: track.duration || 16,
              trimStart: 0,
              audioBuffer: null,
              audioBlob: track.audioBlob,
              waveformPeaks: track.waveformPeaks,
              fadeInSec: 0.005,
              fadeOutSec: 0.005,
              gain: 1.0,
            });
          }

          // Hydrate clip buffers if AudioContext provided
          if (ctx) {
            for (const clip of track.clips) {
              if (clip.audioBlob && !clip.audioBuffer) {
                try {
                  clip.audioBuffer = await blobToAudioBuffer(clip.audioBlob, ctx);
                  if (!clip.waveformPeaks || clip.waveformPeaks.length === 0) {
                    clip.waveformPeaks = extractWaveformPeaks(clip.audioBuffer, 64);
                  }
                  if (!clip.duration && clip.audioBuffer) {
                    clip.duration = clip.audioBuffer.duration;
                  }
                } catch (err) {
                  console.warn("Failed to hydrate clip audioBuffer:", err);
                }
              }
            }
          }
        }
      }
    }

    return rawProjects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (err) {
    console.warn("Failed to load projects:", err);
    return memoryProjects;
  }
}

export async function deleteProjectFromDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    if (!db) {
      const idx = memoryProjects.findIndex((p) => p.id === id);
      if (idx >= 0) memoryProjects.splice(idx, 1);
      return;
    }
    const tx = db.transaction(STORE_PROJECTS, "readwrite");
    tx.objectStore(STORE_PROJECTS).delete(id);
  } catch (err) {
    console.warn("Failed to delete project:", err);
  }
}

export async function saveLooperSessionToDB(session: LooperSession): Promise<void> {
  const serializableTracks: LooperTrack[] = session.tracks.map((t) => {
    let blob = t.blob;
    if (!blob && t.buffer) {
      try {
        blob = audioBufferToWavBlob(t.buffer);
      } catch (err) {
        console.warn("Failed to serialize looper track to blob:", err);
      }
    }
    return {
      ...t,
      buffer: null,
      blob: blob,
    };
  });

  const sessionToSave: LooperSession = {
    ...session,
    tracks: serializableTracks,
    updatedAt: Date.now(),
  };

  try {
    const db = await openDB();
    if (!db) {
      const idx = memoryLooperSessions.findIndex((s) => s.id === sessionToSave.id);
      if (idx >= 0) memoryLooperSessions[idx] = sessionToSave;
      else memoryLooperSessions.push(sessionToSave);
      return;
    }
    const tx = db.transaction(STORE_LOOPER, "readwrite");
    tx.objectStore(STORE_LOOPER).put(sessionToSave);
  } catch (err) {
    console.warn("Failed to save looper session to DB:", err);
    const idx = memoryLooperSessions.findIndex((s) => s.id === sessionToSave.id);
    if (idx >= 0) memoryLooperSessions[idx] = sessionToSave;
    else memoryLooperSessions.push(sessionToSave);
  }
}

export async function loadLooperSessionsFromDB(ctx?: AudioContext): Promise<LooperSession[]> {
  try {
    const db = await openDB();
    let rawSessions: LooperSession[] = [];

    if (!db) {
      rawSessions = [...memoryLooperSessions];
    } else {
      const tx = db.transaction(STORE_LOOPER, "readonly");
      rawSessions = await new Promise((resolve) => {
        const req = tx.objectStore(STORE_LOOPER).getAll();
        req.onsuccess = () => resolve((req.result as LooperSession[]) || []);
        req.onerror = () => resolve(memoryLooperSessions);
      });
    }

    if (ctx && rawSessions.length > 0) {
      for (const sess of rawSessions) {
        for (const track of sess.tracks) {
          if (track.blob && !track.buffer) {
            try {
              track.buffer = await blobToAudioBuffer(track.blob, ctx);
            } catch (err) {
              console.warn("Failed to hydrate looper track buffer:", err);
            }
          }
        }
      }
    }

    return rawSessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (err) {
    console.warn("Failed to load looper sessions:", err);
    return memoryLooperSessions;
  }
}

const LAST_PLAYED_SONG_KEY = "guitar_studio_last_played_song_id";

export function saveLastPlayedSongId(id: string): void {
  try {
    localStorage.setItem(LAST_PLAYED_SONG_KEY, id);
  } catch (err) {
    console.warn("Failed to save last played song ID:", err);
  }
}

export function getLastPlayedSongId(): string | null {
  try {
    return localStorage.getItem(LAST_PLAYED_SONG_KEY);
  } catch (err) {
    console.warn("Failed to get last played song ID:", err);
    return null;
  }
}


