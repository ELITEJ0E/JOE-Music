import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  SkipBack,
  Square,
  Play,
  Pause,
  Circle,
  Repeat,
  Sliders,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Download,
  FolderOpen,
  Save,
  Check,
  Upload,
  Mic,
  MicOff,
  Headphones,
  SlidersHorizontal,
  FileAudio,
  Radio,
  Clock,
  Sparkles,
  Scissors,
  Copy,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Magnet,
  RotateCcw,
  Music,
} from "lucide-react";
import { audioEngine, AudioInputLevel } from "../audio/audioContext";
import { transport, TransportState } from "../audio/transport";
import { dawEngine } from "../audio/dawEngine";
import { dawHistory } from "../audio/dawHistory";
import {
  DAWTrack,
  DAWProject,
  AudioClip,
  CountInSetting,
  GridSnapSetting,
  TrackEqConfig,
  TrackInsertEffectsConfig,
  DEFAULT_TRACK_EQ,
  DEFAULT_TRACK_INSERT_EFFECTS,
} from "../types";

export interface BusChannelState {
  id: string;
  name: string;
  color: string;
  volume: number; // 0..1.5
  muted: boolean;
  soloed: boolean;
}

const DEFAULT_BUS_CHANNELS: BusChannelState[] = [
  { id: "guitars", name: "Guitars Bus", color: "#f59e0b", volume: 1.0, muted: false, soloed: false },
  { id: "drums", name: "Drums Bus", color: "#ef4444", volume: 1.0, muted: false, soloed: false },
  { id: "vocals", name: "Vocals Bus", color: "#06b6d4", volume: 1.0, muted: false, soloed: false },
  { id: "bass", name: "Bass Bus", color: "#8b5cf6", volume: 1.0, muted: false, soloed: false },
  { id: "keys", name: "Keys / FX Bus", color: "#ec4899", volume: 1.0, muted: false, soloed: false },
];
import {
  saveProjectToDB,
  loadProjectsFromDB,
  deleteProjectFromDB,
} from "../utils/storage";
import {
  audioBufferToWavBlob,
  blobToAudioBuffer,
  extractWaveformPeaks,
} from "../audio/wavEncoder";
import { TimelineRuler } from "./daw/TimelineRuler";
import { AudioClipView } from "./daw/AudioClipView";
import { TrackHeader } from "./daw/TrackHeader";
import { ClipInspector } from "./daw/ClipInspector";
import { ProjectsModal } from "./daw/ProjectsModal";
import { LooperStation } from "./LooperStation";
import { DrumMetronome } from "./DrumMetronome";

const DEFAULT_PROJECT_ID = "project-default-session";

type StudioTab = "timeline" | "looper" | "drums" | "mixer" | "projects";

import { SunoSong } from "./SongsLibraryView";

interface MultiTrackStudioProps {
  initialSong?: SunoSong | null;
}

export const MultiTrackStudio: React.FC<MultiTrackStudioProps> = ({ initialSong }) => {
  const [activeTab, setActiveTab] = useState<StudioTab>("timeline");
  const [project, setProject] = useState<DAWProject>({
    id: DEFAULT_PROJECT_ID,
    name: "Guitar Studio Session",
    bpm: 120,
    keySig: "Am",
    timeSig: "4/4",
    tracks: [
      {
        id: "trk-1",
        name: "Lead Guitar",
        color: "#a3ff12",
        volume: 0.85,
        pan: 0,
        muted: false,
        soloed: false,
        armed: false,
        monitoring: false,
        clips: [],
        eq: { ...DEFAULT_TRACK_EQ },
        insertEffects: { ...DEFAULT_TRACK_INSERT_EFFECTS },
        busId: "master",
        inputSource: "processed",
      },
      {
        id: "trk-2",
        name: "Rhythm Guitar",
        color: "#38bdf8",
        volume: 0.8,
        pan: -0.2,
        muted: false,
        soloed: false,
        armed: false,
        monitoring: false,
        clips: [],
        eq: { ...DEFAULT_TRACK_EQ },
        insertEffects: { ...DEFAULT_TRACK_INSERT_EFFECTS },
        busId: "master",
        inputSource: "processed",
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const [savedProjects, setSavedProjects] = useState<DAWProject[]>([]);
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState<boolean>(false);
  const [armedTrackId, setArmedTrackId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string>("trk-1");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [inspectingClip, setInspectingClip] = useState<AudioClip | null>(null);

  // Transport & Clock State
  const [transportState, setTransportState] = useState<TransportState>(transport.getState());
  const [playheadTimeSec, setPlayheadTimeSec] = useState<number>(0);
  const [countInCountdown, setCountInCountdown] = useState<string | null>(null);

  // Timeline UI State
  const [zoomPxPerSec, setZoomPxPerSec] = useState<number>(80);
  const [gridSnap, setGridSnap] = useState<GridSnapSetting>("1beat");
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");

  // Audio Monitoring & Hardware
  const [isMonitoring, setIsMonitoring] = useState<boolean>(audioEngine.getIsMonitoring());
  const [isMicActive, setIsMicActive] = useState<boolean>(audioEngine.getIsMicActive());
  const [inputLevel, setInputLevel] = useState<AudioInputLevel>({ rms: 0, peak: 0, db: -100 });
  const [trackPeaks, setTrackPeaks] = useState<{ [trackId: string]: number }>({});
  const [clippingTracks, setClippingTracks] = useState<{ [trackId: string]: boolean }>({});
  const [buses, setBuses] = useState<BusChannelState[]>(DEFAULT_BUS_CHANNELS);
  const [isMixBusesOpen, setIsMixBusesOpen] = useState<boolean>(true);

  // Feedback & Operations
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isExportingMix, setIsExportingMix] = useState<boolean>(false);
  const [lastRecordedClipInfo, setLastRecordedClipInfo] = useState<{ trackId: string; clipId: string } | null>(null);

  // Recording State References
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordStartTimeRef = useRef<number>(0);
  const autosaveTimerRef = useRef<number | null>(null);

  // File Upload Reference
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const targetUploadTrackIdRef = useRef<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Helper to calculate snap seconds based on current BPM & grid setting
  const getSnapResolutionSec = useCallback((): number => {
    const secondsPerBeat = 60.0 / (project.bpm || 120);
    switch (gridSnap) {
      case "1bar":
        return secondsPerBeat * 4;
      case "1beat":
        return secondsPerBeat;
      case "1/2":
        return secondsPerBeat / 2;
      case "1/4":
        return secondsPerBeat / 4;
      case "1/8":
        return secondsPerBeat / 8;
      case "1/16":
        return secondsPerBeat / 16;
      case "off":
      default:
        return 0;
    }
  }, [gridSnap, project.bpm]);

  const snapTimeToGrid = useCallback(
    (timeSec: number): number => {
      const snapRes = getSnapResolutionSec();
      if (snapRes <= 0) return Math.max(0, timeSec);
      return Math.max(0, Math.round(timeSec / snapRes) * snapRes);
    },
    [getSnapResolutionSec]
  );

  // Total project timeline length
  const maxProjectDurationSec = Math.max(
    32,
    ...project.tracks.flatMap((t) => (t.clips || []).map((c) => c.startTime + c.duration + 4))
  );

  // Push state to Undo History and trigger debounced autosave
  const commitProjectChange = useCallback(
    (newProject: DAWProject, actionDescription: string = "Edit", recordHistory: boolean = true) => {
      if (recordHistory) {
        dawHistory.pushState(project, actionDescription);
      }
      setProject(newProject);
      setAutoSaveStatus("saving");

      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }

      autosaveTimerRef.current = window.setTimeout(async () => {
        try {
          await saveProjectToDB(newProject);
          setAutoSaveStatus("saved");
        } catch (err) {
          console.warn("Autosave warning:", err);
          setAutoSaveStatus("unsaved");
        }
      }, 1200);
    },
    [project]
  );

  // Initial Load from IndexedDB
  useEffect(() => {
    const ctx = audioEngine.getContext();
    loadProjectsFromDB(ctx).then((list) => {
      setSavedProjects(list);
      if (list.length > 0) {
        const latest = list[0];
        setProject(latest);
        transport.setBpm(latest.bpm || 120);
        transport.setKeySig(latest.keySig || "Am");
        transport.setTimeSig(latest.timeSig || "4/4");
      }
    });
  }, []);

  // Transport & Audio Engine Subscriptions
  useEffect(() => {
    const unsubTransport = transport.subscribe((state) => {
      setTransportState({ ...state });
    });

    const unsubTick = transport.subscribeTick((t) => {
      setPlayheadTimeSec(t);
    });

    const unsubMic = audioEngine.subscribeMicStatus(setIsMicActive);
    const unsubMon = audioEngine.subscribeMonitorStatus(setIsMonitoring);

    // Live VU meter update loop
    const meterInterval = window.setInterval(() => {
      const liveLvl = audioEngine.getInputLevel();
      setInputLevel(liveLvl);

      // Track level meters simulation / response
      const curPeaks: { [id: string]: number } = {};
      const newClipping: { [id: string]: boolean } = {};

      project.tracks.forEach((t) => {
        if (t.armed && isMicActive) {
          curPeaks[t.id] = liveLvl.peak;
          if (liveLvl.peak > 0.98) {
            newClipping[t.id] = true;
          }
        } else if (transportState.isPlaying && !t.muted) {
          // Check if playhead currently inside one of this track's clips
          const curTime = transport.getCurrentTime();
          const isPlayingClip = (t.clips || []).some(
            (c) => curTime >= c.startTime && curTime <= c.startTime + c.duration
          );
          curPeaks[t.id] = isPlayingClip ? Math.min(1.0, t.volume * 0.75 + Math.random() * 0.1) : 0.02;
        } else {
          curPeaks[t.id] = 0;
        }
      });

      setTrackPeaks(curPeaks);
      if (Object.keys(newClipping).length > 0) {
        setClippingTracks((prev) => ({ ...prev, ...newClipping }));
      }
    }, 45);

    return () => {
      unsubTransport();
      unsubTick();
      unsubMic();
      unsubMon();
      clearInterval(meterInterval);
      audioEngine.releaseInput("daw-armed");
      audioEngine.releaseInput("daw-recording");
    };
  }, [project.tracks, isMicActive, transportState.isPlaying]);

  // Keyboard Shortcuts (Undo / Redo / Play / Record)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting inside inputs
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        handleRedo();
      } else if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleToggleRecord();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedClipId) {
          e.preventDefault();
          handleDeleteClip(selectedClipId);
        }
      } else if (e.key === "s" && !e.ctrlKey && !e.metaKey) {
        if (selectedClipId) {
          e.preventDefault();
          handleSplitAtPlayhead(selectedClipId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // Undo / Redo Handlers
  const handleUndo = () => {
    const res = dawHistory.undo(project);
    if (res) {
      setProject(res.project);
      showToast(`Undo: ${res.description}`);
      if (transportState.isPlaying) {
        dawEngine.startPlayback(res.project, transport.getCurrentTime());
      }
    }
  };

  const handleRedo = () => {
    const res = dawHistory.redo(project);
    if (res) {
      setProject(res.project);
      showToast(`Redo: ${res.description}`);
      if (transportState.isPlaying) {
        dawEngine.startPlayback(res.project, transport.getCurrentTime());
      }
    }
  };

  // Playback Toggle
  const handleTogglePlay = () => {
    if (transportState.isPlaying || transportState.isRecording) {
      transport.pause();
      dawEngine.stopAllNodes();
    } else {
      const curTime = transport.getCurrentTime();
      dawEngine.startPlayback(project, curTime);
      transport.play();
    }
  };

  const handleStop = () => {
    if (transportState.isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    transport.stop();
    dawEngine.stopAllNodes();
  };

  const handleRewind = () => {
    handleStop();
    transport.seek(0);
  };

  // Real Guitar Recording Flow with Count-In
  const handleToggleRecord = async () => {
    if (transportState.isRecording) {
      // Stop active recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      audioEngine.releaseInput("daw-recording");
      transport.stopRecording();
      transport.pause();
      dawEngine.stopAllNodes();
      setCountInCountdown(null);
    } else {
      // Start real recording into armed track
      try {
        let armedTrack = project.tracks.find((t) => t.id === armedTrackId);
        if (!armedTrack) {
          // If no track armed, auto-arm selected or first track
          const targetTrack =
            project.tracks.find((t) => t.id === selectedTrackId) || project.tracks[0];
          if (targetTrack) {
            setArmedTrackId(targetTrack.id);
            setProject((prev) => ({
              ...prev,
              tracks: prev.tracks.map((t) => ({ ...t, armed: t.id === targetTrack.id })),
            }));
            armedTrack = targetTrack;
          }
        }

        if (!armedTrack) {
          alert("Please arm a track first to record guitar.");
          return;
        }

        // Run count-in if enabled
        if (transportState.countInMode !== "off") {
          await transport.runCountIn((beat, total) => {
            setCountInCountdown(`COUNT-IN: ${beat} / ${total}`);
          });
          setCountInCountdown(null);
        }

        await audioEngine.acquireInput("daw-recording", { isRecording: true });

        const sourceStream = audioEngine.getRecordingStream(
          armedTrack.inputSource || "processed"
        );

        audioChunksRef.current = [];
        const recorder = new MediaRecorder(sourceStream, {
          mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "audio/webm",
        });

        const curTime = transport.getCurrentTime();
        recordStartTimeRef.current = curTime;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          audioEngine.releaseInput("daw-recording");
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const ctx = audioEngine.getContext();
          try {
            const decoded = await blobToAudioBuffer(blob, ctx);
            const peaks = extractWaveformPeaks(decoded, 64);
            const clipId = `clip-${Date.now()}`;

            const newClip: AudioClip = {
              id: clipId,
              name: `${armedTrack.name} Take`,
              startTime: recordStartTimeRef.current,
              duration: decoded.duration,
              trimStart: 0,
              audioBuffer: decoded,
              audioBlob: blob,
              waveformPeaks: peaks,
              fadeInSec: 0.005,
              fadeOutSec: 0.005,
              gain: 1.0,
              color: armedTrack.color,
            };

            const updatedTracks = project.tracks.map((t) => {
              if (t.id === armedTrack.id) {
                return {
                  ...t,
                  clips: [...(t.clips || []), newClip],
                };
              }
              return t;
            });

            const updatedProj: DAWProject = {
              ...project,
              tracks: updatedTracks,
              updatedAt: Date.now(),
            };

            commitProjectChange(updatedProj, `Record Take to ${armedTrack.name}`);
            setLastRecordedClipInfo({ trackId: armedTrack.id, clipId });
            setSelectedClipId(clipId);
            showToast(`Take recorded to ${armedTrack.name}!`);
          } catch (err) {
            console.error("Record decode error:", err);
          }
        };

        recorder.start(50);
        mediaRecorderRef.current = recorder;

        // Start playback of existing tracks simultaneously
        dawEngine.startPlayback(project, curTime);
        transport.startRecording();
      } catch (err) {
        alert("Please enable microphone / USB audio device to record guitar.");
        setCountInCountdown(null);
      }
    }
  };

  // Quick Retake (discard last recorded take and restart recording from start position)
  const handleRetake = () => {
    if (!lastRecordedClipInfo) return;
    const { trackId, clipId } = lastRecordedClipInfo;

    // Remove the last clip
    const updatedTracks = project.tracks.map((t) => {
      if (t.id === trackId) {
        return {
          ...t,
          clips: (t.clips || []).filter((c) => c.id !== clipId),
        };
      }
      return t;
    });

    const updatedProj = { ...project, tracks: updatedTracks, updatedAt: Date.now() };
    commitProjectChange(updatedProj, "Retake");
    transport.seek(recordStartTimeRef.current);
    showToast("Discarded take. Ready to re-record.");
    setLastRecordedClipInfo(null);
  };

  // Timeline Navigation
  const handleSeek = (timeSec: number) => {
    const target = snapTimeToGrid(timeSec);
    transport.seek(target);
    if (transportState.isPlaying) {
      dawEngine.startPlayback(project, target);
    }
  };

  // Clip Manipulation: Move
  const handleMoveClip = (clipId: string, newStartTime: number) => {
    const snappedStart = snapTimeToGrid(newStartTime);
    const updatedTracks = project.tracks.map((t) => ({
      ...t,
      clips: (t.clips || []).map((c) => (c.id === clipId ? { ...c, startTime: snappedStart } : c)),
    }));
    commitProjectChange({ ...project, tracks: updatedTracks }, "Move Clip");
  };

  // Clip Manipulation: Trim Left
  const handleTrimLeft = (clipId: string, deltaSec: number) => {
    const updatedTracks = project.tracks.map((t) => ({
      ...t,
      clips: (t.clips || []).map((c) => {
        if (c.id !== clipId) return c;
        const totalBufferLen = c.audioBuffer ? c.audioBuffer.duration : c.duration;
        const newTrimStart = Math.max(0, Math.min(totalBufferLen - 0.1, (c.trimStart || 0) + deltaSec));
        const effectiveDelta = newTrimStart - (c.trimStart || 0);
        const newDuration = Math.max(0.1, c.duration - effectiveDelta);
        const newStartTime = Math.max(0, c.startTime + effectiveDelta);

        return {
          ...c,
          trimStart: newTrimStart,
          duration: newDuration,
          startTime: newStartTime,
        };
      }),
    }));
    commitProjectChange({ ...project, tracks: updatedTracks }, "Trim Clip Start");
  };

  // Clip Manipulation: Trim Right
  const handleTrimRight = (clipId: string, deltaSec: number) => {
    const updatedTracks = project.tracks.map((t) => ({
      ...t,
      clips: (t.clips || []).map((c) => {
        if (c.id !== clipId) return c;
        const totalBufferLen = c.audioBuffer ? c.audioBuffer.duration : c.duration;
        const maxPossibleDuration = totalBufferLen - (c.trimStart || 0);
        const newDuration = Math.max(0.1, Math.min(maxPossibleDuration, c.duration + deltaSec));

        return {
          ...c,
          duration: newDuration,
        };
      }),
    }));
    commitProjectChange({ ...project, tracks: updatedTracks }, "Trim Clip End");
  };

  // Clip Manipulation: Split at Playhead
  const handleSplitAtPlayhead = (clipId: string) => {
    const curPlayhead = transport.getCurrentTime();
    let targetClip: AudioClip | null = null;
    let targetTrackId: string | null = null;

    project.tracks.forEach((t) => {
      (t.clips || []).forEach((c) => {
        if (c.id === clipId) {
          targetClip = c;
          targetTrackId = t.id;
        }
      });
    });

    if (!targetClip || !targetTrackId) return;

    const clip = targetClip as AudioClip;
    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;

    if (curPlayhead <= clipStart || curPlayhead >= clipEnd) {
      alert("Place the playhead inside the clip to split.");
      return;
    }

    const splitOffset = curPlayhead - clipStart;

    // Left Clip
    const leftClip: AudioClip = {
      ...clip,
      id: `clip-split-L-${Date.now()}`,
      name: `${clip.name} (Part 1)`,
      duration: splitOffset,
    };

    // Right Clip
    const rightClip: AudioClip = {
      ...clip,
      id: `clip-split-R-${Date.now()}`,
      name: `${clip.name} (Part 2)`,
      startTime: curPlayhead,
      trimStart: (clip.trimStart || 0) + splitOffset,
      duration: clip.duration - splitOffset,
    };

    const updatedTracks = project.tracks.map((t) => {
      if (t.id === targetTrackId) {
        return {
          ...t,
          clips: (t.clips || []).flatMap((c) => (c.id === clipId ? [leftClip, rightClip] : [c])),
        };
      }
      return t;
    });

    commitProjectChange({ ...project, tracks: updatedTracks }, "Split Clip");
    setSelectedClipId(rightClip.id);
    showToast("Clip split into two parts.");
  };

  // Clip Manipulation: Duplicate
  const handleDuplicateClip = (clipId: string) => {
    const updatedTracks = project.tracks.map((t) => {
      const found = (t.clips || []).find((c) => c.id === clipId);
      if (found) {
        const cloned: AudioClip = {
          ...found,
          id: `clip-dup-${Date.now()}`,
          name: `${found.name} (Copy)`,
          startTime: found.startTime + found.duration + 0.1, // Placed directly after
        };
        return {
          ...t,
          clips: [...t.clips, cloned],
        };
      }
      return t;
    });

    commitProjectChange({ ...project, tracks: updatedTracks }, "Duplicate Clip");
    showToast("Clip duplicated.");
  };

  // Clip Manipulation: Delete
  const handleDeleteClip = (clipId: string) => {
    const updatedTracks = project.tracks.map((t) => ({
      ...t,
      clips: (t.clips || []).filter((c) => c.id !== clipId),
    }));
    commitProjectChange({ ...project, tracks: updatedTracks }, "Delete Clip");
    if (selectedClipId === clipId) setSelectedClipId(null);
    if (inspectingClip?.id === clipId) setInspectingClip(null);
    showToast("Clip deleted.");
  };

  // Clip Manipulation: Update Inspector
  const handleUpdateInspectingClip = (updated: AudioClip) => {
    setInspectingClip(updated);
    const updatedTracks = project.tracks.map((t) => ({
      ...t,
      clips: (t.clips || []).map((c) => (c.id === updated.id ? updated : c)),
    }));
    commitProjectChange({ ...project, tracks: updatedTracks }, "Update Clip Settings", false);
  };

  const handleCommitLooperTrack = (buffer: AudioBuffer, trackName: string) => {
    const newClipId = `clip-${Date.now()}`;
    const newTrkId = `trk-looper-${Date.now()}`;
    const newTrk: DAWTrack = {
      id: newTrkId,
      name: `Looper: ${trackName}`,
      color: "#f59e0b",
      volume: 0.85,
      pan: 0,
      muted: false,
      soloed: false,
      armed: false,
      monitoring: false,
      clips: [{
        id: newClipId,
        name: trackName,
        startTime: playheadTimeSec,
        duration: buffer.duration,
        audioBuffer: buffer,
        trimStart: 0,
        gain: 1,
        fadeInSec: 0.01,
        fadeOutSec: 0.01,
      }],
      eq: { ...DEFAULT_TRACK_EQ },
      insertEffects: { ...DEFAULT_TRACK_INSERT_EFFECTS },
      busId: "master",
    };
    const newProj = { ...project, tracks: [...project.tracks, newTrk] };
    dawHistory.pushState(project, "Commit Looper Track");
    setProject(newProj);
    showToast(`Committed ${trackName} to Timeline`);
  };

  // Track Management: Add Track
  const handleAddTrack = () => {
    const count = project.tracks.length + 1;
    const colors = ["#a3ff12", "#38bdf8", "#f59e0b", "#ec4899", "#a855f7", "#10b981"];
    const color = colors[(count - 1) % colors.length];

    const newTrk: DAWTrack = {
      id: `trk-${Date.now()}`,
      name: `Guitar ${count}`,
      color,
      volume: 0.85,
      pan: 0,
      muted: false,
      soloed: false,
      armed: false,
      monitoring: false,
      clips: [],
      eq: { ...DEFAULT_TRACK_EQ },
      insertEffects: { ...DEFAULT_TRACK_INSERT_EFFECTS },
      busId: "master",
      inputSource: "processed",
    };

    const updated = {
      ...project,
      tracks: [...project.tracks, newTrk],
      updatedAt: Date.now(),
    };

    commitProjectChange(updated, `Add Track ${newTrk.name}`);
    setSelectedTrackId(newTrk.id);
    showToast(`Track "${newTrk.name}" created.`);
  };

  // Track Management: Duplicate Track
  const handleDuplicateTrack = (trackId: string) => {
    const target = project.tracks.find((t) => t.id === trackId);
    if (!target) return;

    const cloned: DAWTrack = {
      ...target,
      id: `trk-dup-${Date.now()}`,
      name: `${target.name} (Copy)`,
      armed: false,
      eq: target.eq ? { ...target.eq } : { ...DEFAULT_TRACK_EQ },
      insertEffects: target.insertEffects ? { ...target.insertEffects } : { ...DEFAULT_TRACK_INSERT_EFFECTS },
      busId: target.busId || "master",
      clips: (target.clips || []).map((c) => ({
        ...c,
        id: `clip-dup-${Date.now()}-${c.id}`,
      })),
    };

    const updated = {
      ...project,
      tracks: [...project.tracks, cloned],
      updatedAt: Date.now(),
    };

    commitProjectChange(updated, `Duplicate Track ${target.name}`);
    showToast(`Track "${target.name}" duplicated.`);
  };

  // Track Management: Delete Track
  const handleDeleteTrack = (trackId: string) => {
    if (project.tracks.length <= 1) {
      alert("At least one track is required in the session.");
      return;
    }
    const updated = {
      ...project,
      tracks: project.tracks.filter((t) => t.id !== trackId),
      updatedAt: Date.now(),
    };
    commitProjectChange(updated, "Delete Track");
    if (armedTrackId === trackId) {
      setArmedTrackId(updated.tracks[0].id);
    }
    showToast("Track deleted.");
  };

  // Track Controls: Volume / Pan / Mute / Solo / Arm / EQ / FX / Bus
  const handleTrackVolumeChange = (trackId: string, val: number) => {
    setProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, volume: val } : t)),
    }));
    dawEngine.updateTrackVolume(trackId, val);
  };

  const handleTrackPanChange = (trackId: string, val: number) => {
    setProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, pan: val } : t)),
    }));
    dawEngine.updateTrackPan(trackId, val);
  };

  const handleTrackEqChange = (trackId: string, band: "low" | "mid" | "high", value: number) => {
    setProject((prev) => {
      const updatedTracks = prev.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const currentEq = t.eq || { lowGainDb: 0, midGainDb: 0, highGainDb: 0 };
        const newEq = {
          ...currentEq,
          [band === "low" ? "lowGainDb" : band === "mid" ? "midGainDb" : "highGainDb"]: value,
        };
        return { ...t, eq: newEq };
      });
      return { ...prev, tracks: updatedTracks };
    });

    const targetTrack = project.tracks.find((t) => t.id === trackId);
    dawEngine.updateTrackEq(trackId, band, value);
  };

  const handleTrackReverbSendChange = (trackId: string, value: number) => {
    setProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const currentFx = t.insertEffects || {
          reverbSendLevel: 0,
          compressorEnabled: false,
          compressorThresholdDb: -24,
          compressorRatio: 4,
        };
        return {
          ...t,
          insertEffects: {
            ...currentFx,
            reverbSendLevel: value,
          },
        };
      }),
    }));
    dawEngine.updateTrackReverbSend(trackId, value);
  };

  const handleTrackCompressorChange = (
    trackId: string,
    config: { enabled: boolean; thresholdDb: number; ratio: number }
  ) => {
    setProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const currentFx = t.insertEffects || {
          reverbSendLevel: 0,
          compressorEnabled: false,
          compressorThresholdDb: -24,
          compressorRatio: 4,
        };
        return {
          ...t,
          insertEffects: {
            ...currentFx,
            compressorEnabled: config.enabled,
            compressorThresholdDb: config.thresholdDb,
            compressorRatio: config.ratio,
          },
        };
      }),
    }));
    dawEngine.updateTrackCompressor(trackId, config);
  };

  const handleTrackBusChange = (trackId: string, busId: string) => {
    const targetBus = busId === "master" || busId === "none" ? undefined : busId;
    const updatedTracks = project.tracks.map((t) =>
      t.id === trackId ? { ...t, busId: targetBus } : t
    );
    const updated = { ...project, tracks: updatedTracks };
    commitProjectChange(updated, "Route Track to Bus", false);
    if (transportState.isPlaying) {
      dawEngine.startPlayback(updated, transport.getCurrentTime());
    }
  };

  const handleBusVolumeChange = (busId: string, volume: number) => {
    setBuses((prev) => prev.map((b) => (b.id === busId ? { ...b, volume } : b)));
    dawEngine.updateBusGain(busId, volume);
  };

  const handleBusToggleMute = (busId: string) => {
    setBuses((prev) => {
      return prev.map((b) => {
        if (b.id !== busId) return b;
        const nextMuted = !b.muted;
        dawEngine.updateBusGain(busId, nextMuted ? 0 : b.volume);
        return { ...b, muted: nextMuted };
      });
    });
  };

  const handleBusToggleSolo = (busId: string) => {
    setBuses((prev) => {
      const updated = prev.map((b) =>
        b.id === busId ? { ...b, soloed: !b.soloed } : b
      );
      const anySolo = updated.some((b) => b.soloed);
      updated.forEach((b) => {
        if (anySolo) {
          dawEngine.updateBusGain(b.id, b.soloed ? (b.muted ? 0 : b.volume) : 0);
        } else {
          dawEngine.updateBusGain(b.id, b.muted ? 0 : b.volume);
        }
      });
      return updated;
    });
  };

  const handleToggleMute = (trackId: string) => {
    const updatedTracks = project.tracks.map((t) =>
      t.id === trackId ? { ...t, muted: !t.muted } : t
    );
    const updated = { ...project, tracks: updatedTracks };
    commitProjectChange(updated, "Toggle Mute", false);
    if (transportState.isPlaying) {
      dawEngine.startPlayback(updated, transport.getCurrentTime());
    }
  };

  const handleToggleSolo = (trackId: string) => {
    const updatedTracks = project.tracks.map((t) =>
      t.id === trackId ? { ...t, soloed: !t.soloed } : t
    );
    const updated = { ...project, tracks: updatedTracks };
    commitProjectChange(updated, "Toggle Solo", false);
    if (transportState.isPlaying) {
      dawEngine.startPlayback(updated, transport.getCurrentTime());
    }
  };

  const handleArmTrack = async (trackId: string) => {
    if (armedTrackId === trackId) {
      // Disarm track
      setArmedTrackId(null);
      setProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => ({ ...t, armed: false })),
      }));
      audioEngine.releaseInput("daw-armed");
    } else {
      // Arm target track
      setArmedTrackId(trackId);
      setProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => ({ ...t, armed: t.id === trackId })),
      }));
      try {
        await audioEngine.acquireInput("daw-armed");
      } catch (err) {
        console.warn("Could not acquire input for armed track:", err);
      }
    }
  };

  const handleToggleMonitoring = (trackId: string) => {
    setProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === trackId ? { ...t, monitoring: !t.monitoring } : t
      ),
    }));
    audioEngine.toggleMonitoring();
  };

  const handleRenameTrack = (trackId: string, newName: string) => {
    const updatedTracks = project.tracks.map((t) =>
      t.id === trackId ? { ...t, name: newName } : t
    );
    commitProjectChange({ ...project, tracks: updatedTracks }, "Rename Track");
  };

  // Audio Import
  const handleTriggerUpload = (trackId: string) => {
    targetUploadTrackIdRef.current = trackId;
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetUploadTrackIdRef.current) return;

    try {
      const ctx = audioEngine.getContext();
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      const peaks = extractWaveformPeaks(decoded, 64);
      const targetId = targetUploadTrackIdRef.current;
      const targetTrack = project.tracks.find((t) => t.id === targetId);

      const newClip: AudioClip = {
        id: `clip-import-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        startTime: transport.getCurrentTime(),
        duration: decoded.duration,
        trimStart: 0,
        audioBuffer: decoded,
        audioBlob: file,
        waveformPeaks: peaks,
        fadeInSec: 0.005,
        fadeOutSec: 0.005,
        gain: 1.0,
        color: targetTrack?.color || "#38bdf8",
      };

      const updatedTracks = project.tracks.map((t) =>
        t.id === targetId
          ? {
              ...t,
              clips: [...(t.clips || []), newClip],
            }
          : t
      );

      const updated = { ...project, tracks: updatedTracks, updatedAt: Date.now() };
      commitProjectChange(updated, `Import Audio to ${targetTrack?.name || "Track"}`);
      setSelectedClipId(newClip.id);
      showToast(`Imported "${file.name}"!`);
    } catch (err) {
      alert("Failed to decode audio file. Please try a standard WAV or MP3 file.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Stem Export
  const handleExportStem = async (track: DAWTrack) => {
    if (!track.clips || track.clips.length === 0) {
      showToast("No clips on this track to export.");
      return;
    }
    const singleTrackProj: DAWProject = {
      ...project,
      tracks: [{ ...track, muted: false, soloed: false }],
    };
    try {
      const blob = await dawEngine.renderMixdownToWav(singleTrackProj);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.name.replace(/\s+/g, "_")}_${track.name.replace(/\s+/g, "_")}_Stem.wav`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Stem "${track.name}" exported!`);
    } catch (err) {
      alert("Stem export error: " + err);
    }
  };

  // Full Master Mixdown Export (OfflineAudioContext)
  const handleExportMixdown = async () => {
    const hasClips = project.tracks.some((t) => (t.clips || []).length > 0);
    if (!hasClips) {
      showToast("No recorded audio in project to export.");
      return;
    }

    setIsExportingMix(true);
    try {
      const blob = await dawEngine.renderMixdownToWav(project);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.name.replace(/\s+/g, "_")}_${project.bpm}BPM_Mix.wav`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Master Mixdown exported to WAV!");
    } catch (err) {
      alert("Mixdown export failed: " + err);
    } finally {
      setIsExportingMix(false);
    }
  };

  // Project Management Modal Handlers
  const handleSelectProject = (p: DAWProject) => {
    setProject(p);
    transport.setBpm(p.bpm || 120);
    transport.setKeySig(p.keySig || "Am");
    transport.setTimeSig(p.timeSig || "4/4");
    setIsProjectsModalOpen(false);
    dawHistory.clear();
    showToast(`Loaded "${p.name}".`);
  };

  const handleDeleteProject = async (pId: string) => {
    if (confirm("Delete this project from library?")) {
      await deleteProjectFromDB(pId);
      const list = await loadProjectsFromDB(audioEngine.getContext());
      setSavedProjects(list);
      showToast("Project deleted.");
    }
  };

  const handleNewProject = () => {
    const newProj: DAWProject = {
      id: `project-${Date.now()}`,
      name: `Guitar Session ${savedProjects.length + 1}`,
      bpm: 120,
      keySig: "Am",
      timeSig: "4/4",
      tracks: [
        {
          id: `trk-${Date.now()}-1`,
          name: "Guitar 1 (Lead)",
          color: "#a3ff12",
          volume: 0.85,
          pan: 0,
          muted: false,
          soloed: false,
          armed: true,
          monitoring: true,
          clips: [],
          eq: { ...DEFAULT_TRACK_EQ },
          insertEffects: { ...DEFAULT_TRACK_INSERT_EFFECTS },
          busId: "master",
          inputSource: "processed",
        },
        {
          id: `trk-${Date.now()}-2`,
          name: "Guitar 2 (Rhythm)",
          color: "#38bdf8",
          volume: 0.8,
          pan: -0.2,
          muted: false,
          soloed: false,
          armed: false,
          monitoring: false,
          clips: [],
          eq: { ...DEFAULT_TRACK_EQ },
          insertEffects: { ...DEFAULT_TRACK_INSERT_EFFECTS },
          busId: "master",
          inputSource: "processed",
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setProject(newProj);
    saveProjectToDB(newProj);
    setIsProjectsModalOpen(false);
    dawHistory.clear();
    showToast("New project created.");
  };

  const handleSaveAs = async (customName: string) => {
    const updated: DAWProject = {
      ...project,
      name: customName,
      bpm: transportState.bpm,
      keySig: transportState.keySig,
      timeSig: transportState.timeSig,
      updatedAt: Date.now(),
    };

    await saveProjectToDB(updated);
    setProject(updated);
    const list = await loadProjectsFromDB(audioEngine.getContext());
    setSavedProjects(list);
    showToast(`Project saved as "${customName}".`);
  };

  // Musical Time Calculation (Bar:Beat:Tick)
  const secondsPerBeat = 60.0 / (project.bpm || 120);
  const currentTotalBeats = playheadTimeSec / secondsPerBeat;
  const currentBar = Math.floor(currentTotalBeats / 4) + 1;
  const currentBeat = Math.floor(currentTotalBeats % 4) + 1;
  const currentTick = Math.floor(((currentTotalBeats % 4) % 1) * 100);

  return (
    <div id="panel-multitrack-studio" className="max-w-7xl mx-auto space-y-4 pb-16 animate-in fade-in duration-200">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 bg-[#16191f] border border-[#a3ff12] text-[#a3ff12] px-4 py-2.5 rounded-2xl shadow-[0_0_20px_rgba(163,255,18,0.2)] text-xs font-mono font-bold flex items-center gap-2 animate-in slide-in-from-top duration-200">
          <Check className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Live Count-In Overlay Banner */}
      {countInCountdown && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-50 bg-rose-600 border border-white/20 text-white px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(244,63,94,0.7)] text-base font-mono font-extrabold flex items-center gap-3 animate-pulse">
          <Radio className="w-5 h-5 animate-spin" />
          <span>{countInCountdown}</span>
        </div>
      )}

      {/* Hidden File Input for Audio Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="audio/*,.wav,.mp3,.m4a,.aac,.flac"
        className="hidden"
      />

      {/* TOP WORKSPACE HEADER & CONTROLS */}
      <header className="bg-[#12151d] border border-white/10 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        {/* Left: Project Info & Save State */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-[#a3ff12]/20 to-[#38bdf8]/20 border border-[#a3ff12]/40 flex items-center justify-center">
            <Music className="w-5 h-5 text-[#a3ff12]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-mono font-bold text-white tracking-wide">
                {project.name}
              </h1>
              <span
                className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${
                  autoSaveStatus === "saving"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse"
                    : "bg-[#a3ff12]/10 text-[#a3ff12] border-[#a3ff12]/30"
                }`}
              >
                {autoSaveStatus === "saving" ? "Autosaving..." : "Autosaved"}
              </span>
            </div>
            <p className="text-[11px] font-mono text-zinc-400">
              BandLab-Style Real Guitar DAW • Processed DSP Stream
            </p>
          </div>
        </div>

        {/* Center: BPM, Key, TimeSig, Count-In, Grid Snap */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-black/40 border border-white/10 px-3 py-1.5 rounded-xl text-xs font-mono">
          {/* BPM */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">BPM</span>
            <input
              type="number"
              min="40"
              max="240"
              value={transportState.bpm}
              onChange={(e) => {
                const b = parseInt(e.target.value, 10) || 120;
                transport.setBpm(b);
                commitProjectChange({ ...project, bpm: b }, "Change BPM", false);
              }}
              className="w-12 bg-zinc-900 border border-white/15 focus:border-[#a3ff12] text-center text-white font-bold rounded py-0.5 outline-none"
            />
          </div>

          <span className="text-zinc-700">|</span>

          {/* Key */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">KEY</span>
            <select
              value={transportState.keySig}
              onChange={(e) => {
                transport.setKeySig(e.target.value);
                commitProjectChange({ ...project, keySig: e.target.value }, "Change Key", false);
              }}
              className="bg-zinc-900 border border-white/15 text-white font-bold rounded py-0.5 px-1 outline-none"
            >
              {["C", "G", "D", "A", "E", "B", "F", "Am", "Em", "Dm", "Bm", "F#m"].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          <span className="text-zinc-700">|</span>

          {/* Count-In Toggle */}
          <button
            onClick={() => transport.toggleCountIn()}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
              transportState.countInMode !== "off"
                ? "bg-[#a3ff12] text-black font-bold"
                : "text-zinc-400 hover:text-white bg-zinc-900"
            }`}
            title="Count-In prior to recording"
          >
            COUNT: {transportState.countInMode.toUpperCase()}
          </button>

          <span className="text-zinc-700">|</span>

          {/* Grid Snap */}
          <div className="flex items-center gap-1">
            <Magnet className="w-3.5 h-3.5 text-[#38bdf8]" />
            <select
              value={gridSnap}
              onChange={(e) => setGridSnap(e.target.value as GridSnapSetting)}
              className="bg-zinc-900 border border-white/15 text-white font-bold rounded py-0.5 px-1 outline-none text-[11px]"
            >
              <option value="1bar">Snap: 1 Bar</option>
              <option value="1beat">Snap: 1 Beat</option>
              <option value="1/2">Snap: 1/2 Beat</option>
              <option value="1/4">Snap: 1/4 Beat</option>
              <option value="1/8">Snap: 1/8 Beat</option>
              <option value="off">Snap: Off</option>
            </select>
          </div>
        </div>

        {/* Right: Undo / Redo / Library / Export */}
        <div className="flex items-center gap-2">
          {/* Undo Button */}
          <button
            onClick={handleUndo}
            disabled={!dawHistory.canUndo()}
            className={`p-2 rounded-xl border transition-all ${
              dawHistory.canUndo()
                ? "bg-white/5 border-white/10 hover:bg-white/10 text-white cursor-pointer"
                : "bg-white/0 border-transparent text-zinc-600 cursor-not-allowed"
            }`}
            title={`Undo: ${dawHistory.getUndoDescription() || "None"} (Ctrl+Z)`}
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* Redo Button */}
          <button
            onClick={handleRedo}
            disabled={!dawHistory.canRedo()}
            className={`p-2 rounded-xl border transition-all ${
              dawHistory.canRedo()
                ? "bg-white/5 border-white/10 hover:bg-white/10 text-white cursor-pointer"
                : "bg-white/0 border-transparent text-zinc-600 cursor-not-allowed"
            }`}
            title={`Redo: ${dawHistory.getRedoDescription() || "None"} (Ctrl+Y)`}
          >
            <Redo2 className="w-4 h-4" />
          </button>

          {/* Projects Library Modal Button */}
          <button
            onClick={() => setIsProjectsModalOpen(true)}
            className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-xs font-mono font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FolderOpen className="w-4 h-4 text-[#38bdf8]" />
            <span className="hidden sm:inline">Projects</span>
          </button>

          {/* Export Mixdown WAV Button */}
          <button
            onClick={handleExportMixdown}
            disabled={isExportingMix}
            className="px-4 py-2 bg-linear-to-r from-[#a3ff12] to-[#38bdf8] text-black text-xs font-mono font-extrabold rounded-xl hover:opacity-90 shadow-[0_0_15px_rgba(163,255,18,0.3)] flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{isExportingMix ? "Rendering..." : "Export Mix"}</span>
          </button>
        </div>
      </header>

      {/* MULTI-TRACK TIMELINE WORKSPACE (ALWAYS VISIBLE) */}
          {/* MAIN TRANSPORT BAR */}
          <div className="bg-[#12151e] border border-white/10 rounded-2xl p-3 sm:px-6 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        {/* Playback & Record Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Rewind */}
          <button
            onClick={handleRewind}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors cursor-pointer"
            title="Rewind to Start"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* Stop */}
          <button
            onClick={handleStop}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors cursor-pointer"
            title="Stop"
          >
            <Square className="w-4 h-4" />
          </button>

          {/* Play / Pause */}
          <button
            onClick={handleTogglePlay}
            className={`px-5 py-2.5 rounded-xl font-mono font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              transportState.isPlaying
                ? "bg-[#a3ff12] text-black shadow-[0_0_20px_rgba(163,255,18,0.5)]"
                : "bg-white/10 hover:bg-white/20 text-white"
            }`}
          >
            {transportState.isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>PAUSE</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>PLAY</span>
              </>
            )}
          </button>

          {/* Record Button */}
          <button
            onClick={handleToggleRecord}
            className={`px-5 py-2.5 rounded-xl font-mono font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              transportState.isRecording
                ? "bg-rose-600 text-white shadow-[0_0_25px_rgba(244,63,94,0.8)] animate-pulse"
                : "bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300"
            }`}
          >
            <Circle className="w-4 h-4 fill-current" />
            <span>{transportState.isRecording ? "RECORDING" : "RECORD"}</span>
          </button>

          {/* Retake Button (Visible when last take available) */}
          {lastRecordedClipInfo && !transportState.isRecording && (
            <button
              onClick={handleRetake}
              className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Discard last take and restart"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Retake</span>
            </button>
          )}

          {/* Metronome Toggle */}
          <button
            onClick={() => transport.toggleMetronome()}
            className={`p-2.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
              transportState.isMetronomeActive
                ? "bg-[#a3ff12] text-black font-bold shadow-[0_0_10px_#a3ff12]"
                : "bg-white/5 hover:bg-white/10 text-zinc-400"
            }`}
            title="Metronome Click"
          >
            <Clock className="w-4 h-4" />
            <span className="text-[11px] font-mono hidden md:inline">CLICK</span>
          </button>
        </div>

        {/* Musical Bar & Time Display */}
        <div className="flex items-center gap-4 bg-black/60 border border-white/15 px-4 py-2 rounded-xl">
          {/* Musical Bar:Beat */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">BAR</span>
            <span className="text-base font-mono font-bold text-[#a3ff12]">
              {String(currentBar).padStart(2, "0")}:{currentBeat}.{String(currentTick).padStart(2, "0")}
            </span>
          </div>

          <span className="text-zinc-700">|</span>

          {/* Real Time MM:SS.ms */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">TIME</span>
            <span className="text-sm font-mono text-zinc-200">
              {Math.floor(playheadTimeSec / 60)}:
              {String(Math.floor(playheadTimeSec % 60)).padStart(2, "0")}.
              {String(Math.floor((playheadTimeSec % 1) * 100)).padStart(2, "0")}
            </span>
          </div>
        </div>

        {/* Zoom & Add Track Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom Out */}
          <button
            onClick={() => setZoomPxPerSec((z) => Math.max(40, z - 20))}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors"
            title="Zoom Out Timeline"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="text-[10px] font-mono text-zinc-500 w-10 text-center">
            {zoomPxPerSec}px
          </span>

          {/* Zoom In */}
          <button
            onClick={() => setZoomPxPerSec((z) => Math.min(220, z + 20))}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors"
            title="Zoom In Timeline"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <span className="text-zinc-700 mx-1">|</span>

          {/* Add Track */}
          <button
            onClick={handleAddTrack}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-mono font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#a3ff12]" />
            <span>Add Track</span>
          </button>
        </div>
      </div>

      {/* MULTI-TRACK TIMELINE WORKSPACE */}
      <div className="bg-[#0b0e14] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        {/* Workspace Ruler Header Row */}
        <div className="flex border-b border-white/10 bg-[#0d1017]">
          {/* Fixed Track Headers Corner */}
          <div className="w-48 sm:w-64 shrink-0 px-4 py-2 border-r border-white/10 flex items-center justify-between text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
            <span>Tracks ({project.tracks.length})</span>
            <span className="text-[10px] text-zinc-500">I/O • VOL • PAN</span>
          </div>

          {/* Scrollable Ruler */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <TimelineRuler
              bpm={project.bpm}
              timeSig={project.timeSig}
              zoomPxPerSec={zoomPxPerSec}
              totalDurationSec={maxProjectDurationSec}
              playheadTimeSec={playheadTimeSec}
              onSeek={handleSeek}
            />
          </div>
        </div>

        {/* Track Lanes */}
        <div className="divide-y divide-white/5">
          {project.tracks.map((track) => {
            const isArmed = track.id === armedTrackId;
            const isSelected = track.id === selectedTrackId;
            const peakVal = trackPeaks[track.id] || 0;
            const isClipping = clippingTracks[track.id] || false;

            return (
              <div
                key={track.id}
                className={`flex transition-colors ${
                  isSelected ? "bg-[#141824]" : "hover:bg-[#0e121a]"
                }`}
              >
                {/* Left Track Header Box */}
                <div className="w-48 sm:w-64 shrink-0">
                  <TrackHeader
                    track={track}
                    isSelected={isSelected}
                    isArmed={isArmed}
                    onSelect={(id) => setSelectedTrackId(id)}
                    onArm={handleArmTrack}
                    onToggleMute={handleToggleMute}
                    onToggleSolo={handleToggleSolo}
                    onToggleMonitoring={handleToggleMonitoring}
                    onVolumeChange={handleTrackVolumeChange}
                    onPanChange={handleTrackPanChange}
                    onRename={handleRenameTrack}
                    onDuplicate={handleDuplicateTrack}
                    onDelete={handleDeleteTrack}
                    onTriggerUpload={handleTriggerUpload}
                    onExportStem={handleExportStem}
                    meterPeak={peakVal}
                    isClipping={isClipping}
                    onResetClipping={() =>
                      setClippingTracks((prev) => ({ ...prev, [track.id]: false }))
                    }
                    onEqChange={handleTrackEqChange}
                    onReverbSendChange={handleTrackReverbSendChange}
                    onCompressorChange={handleTrackCompressorChange}
                    onBusChange={handleTrackBusChange}
                  />
                </div>

                {/* Right Scrollable Clip Lane */}
                <div
                  className="flex-1 relative h-24 overflow-x-auto overflow-y-hidden bg-[#090b10]/60 cursor-crosshair select-none"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    handleSeek(clickX / zoomPxPerSec);
                  }}
                  style={{ minWidth: `${Math.max(800, maxProjectDurationSec * zoomPxPerSec)}px` }}
                >
                  {/* Subtle Background Grid Lines */}
                  {Array.from({ length: Math.ceil(maxProjectDurationSec / (60 / project.bpm)) }).map(
                    (_, beatIdx) => {
                      const beatX = beatIdx * (60 / project.bpm) * zoomPxPerSec;
                      const isBar = beatIdx % 4 === 0;
                      return (
                        <div
                          key={`lane-grid-${beatIdx}`}
                          className={`absolute top-0 bottom-0 pointer-events-none ${
                            isBar ? "w-[1px] bg-white/10" : "w-[1px] bg-white/5"
                          }`}
                          style={{ left: `${beatX}px` }}
                        />
                      );
                    }
                  )}

                  {/* Render All Audio Clips on this track */}
                  {(track.clips || []).map((clip) => (
                    <AudioClipView
                      key={clip.id}
                      clip={clip}
                      trackColor={track.color}
                      zoomPxPerSec={zoomPxPerSec}
                      isSelected={selectedClipId === clip.id}
                      onSelect={(id) => {
                        setSelectedClipId(id);
                        setSelectedTrackId(track.id);
                      }}
                      onMove={handleMoveClip}
                      onTrimLeft={handleTrimLeft}
                      onTrimRight={handleTrimRight}
                      onOpenInspector={(c) => setInspectingClip(c)}
                      onSplitAtPlayhead={handleSplitAtPlayhead}
                      onDuplicate={handleDuplicateClip}
                      onDelete={handleDeleteClip}
                    />
                  ))}

                  {/* Active Recording Ghost Waveform Indicator if Armed */}
                  {isArmed && transportState.isRecording && (
                    <div
                      className="absolute top-1 bottom-1 rounded-lg border border-dashed border-rose-500 bg-rose-500/20 backdrop-blur-xs flex items-center justify-center font-mono text-[10px] text-rose-300 font-bold animate-pulse z-20 pointer-events-none"
                      style={{
                        left: `${recordStartTimeRef.current * zoomPxPerSec}px`,
                        width: `${Math.max(20, (playheadTimeSec - recordStartTimeRef.current) * zoomPxPerSec)}px`,
                      }}
                    >
                      <Radio className="w-3 h-3 mr-1 animate-spin" />
                      <span>REC</span>
                    </div>
                  )}

                  {/* Playhead Line in Lane */}
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-[#a3ff12] pointer-events-none z-30 shadow-[0_0_10px_#a3ff12]"
                    style={{ left: `${playheadTimeSec * zoomPxPerSec}px` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Mix Bus Submixing Bar in Timeline */}
        <div className="border-t border-white/10 bg-[#080a0f] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#a3ff12]" />
              <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                Mix Buses & Subgroups
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                (Route multiple tracks to a shared bus fader)
              </span>
            </div>
            <button
              onClick={() => setIsMixBusesOpen(!isMixBusesOpen)}
              className="text-xs font-mono text-zinc-400 hover:text-white px-2 py-1 bg-white/5 rounded border border-white/5"
            >
              {isMixBusesOpen ? "Collapse Buses ▲" : "Expand Buses ▼"}
            </button>
          </div>

          {isMixBusesOpen && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
              {buses.map((bus) => {
                const routedTracksCount = project.tracks.filter(
                  (t) => (t.busId || "").toLowerCase() === bus.id.toLowerCase()
                ).length;
                const busDb =
                  bus.volume > 0.001
                    ? (20 * Math.log10(bus.volume)).toFixed(1)
                    : "-∞";

                return (
                  <div
                    key={bus.id}
                    className={`bg-[#0d1017] border rounded-xl p-2.5 flex flex-col justify-between transition-all ${
                      bus.muted
                        ? "border-rose-500/30 opacity-70"
                        : bus.soloed
                        ? "border-amber-400/50 shadow-[0_0_12px_rgba(251,191,36,0.2)]"
                        : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: bus.color }}
                        />
                        <span className="text-xs font-mono font-bold text-zinc-200 truncate">
                          {bus.name}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-zinc-400">
                        {routedTracksCount} trk
                      </span>
                    </div>

                    {/* Mute & Solo Buttons */}
                    <div className="flex items-center gap-1 mb-2">
                      <button
                        onClick={() => handleBusToggleMute(bus.id)}
                        className={`flex-1 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${
                          bus.muted
                            ? "bg-rose-500 text-white font-bold"
                            : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        MUTE
                      </button>
                      <button
                        onClick={() => handleBusToggleSolo(bus.id)}
                        className={`flex-1 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${
                          bus.soloed
                            ? "bg-amber-400 text-black font-bold"
                            : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        SOLO
                      </button>
                    </div>

                    {/* Fader */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-mono text-zinc-400">
                        <span>BUS GAIN</span>
                        <span className="text-zinc-200 font-bold">{busDb} dB</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.01"
                        value={bus.volume}
                        onChange={(e) =>
                          handleBusVolumeChange(bus.id, parseFloat(e.target.value))
                        }
                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                        style={{ accentColor: bus.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Studio Utility Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5 px-2 mt-4">
        {(["timeline", "looper", "drums", "mixer", "projects"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 rounded-xl text-xs font-mono font-bold transition-all capitalize cursor-pointer ${
              activeTab === tab
                ? "bg-[#a3ff12]/15 text-[#a3ff12] border border-[#a3ff12]/30 shadow-[0_0_15px_rgba(163,255,18,0.1)]"
                : "bg-white/5 text-zinc-400 border border-transparent hover:text-white hover:bg-white/10"
            }`}
          >
            {tab === "timeline"
              ? "Close Utility Panel"
              : tab === "looper"
              ? "Looper Station"
              : tab === "drums"
              ? "Drum Machine & Metronome"
              : tab === "mixer"
              ? "Mixer Console"
              : "Projects"}
          </button>
        ))}
      </div>

      {activeTab === "looper" && (
        <div className="bg-[#0b0e14] border border-white/10 rounded-2xl shadow-2xl p-2 min-h-[500px]">
          <LooperStation onCommitToStudio={handleCommitLooperTrack} />
        </div>
      )}

      {activeTab === "drums" && (
        <div className="bg-[#0b0e14] border border-white/10 rounded-2xl shadow-2xl p-4 min-h-[500px]">
          <DrumMetronome />
        </div>
      )}

      {activeTab === "mixer" && (
        <div className="bg-[#0b0e14] border border-white/10 rounded-2xl shadow-2xl p-6 min-h-[550px]">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#a3ff12]/10 rounded-xl border border-[#a3ff12]/30">
                <Sliders className="w-5 h-5 text-[#a3ff12]" />
              </div>
              <div>
                <h3 className="text-sm font-mono font-bold text-white tracking-wide">
                  STUDIO MIXING CONSOLE
                </h3>
                <p className="text-xs font-mono text-zinc-400">
                  Per-track 3-band EQ, dynamics compression, reverb sends, and submix bus routing
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2.5 py-1 rounded bg-white/5 border border-white/10 text-zinc-300">
                {project.tracks.length} Channels • {buses.length} Submix Buses
              </span>
            </div>
          </div>

          {/* Mixing Strips Grid */}
          <div className="flex gap-4 overflow-x-auto pb-4 items-stretch">
            {/* Track Channel Strips */}
            {project.tracks.map((track) => {
              const peak = trackPeaks[track.id] || 0;
              const isClip = clippingTracks[track.id] || false;
              const lowG = track.eq?.lowGainDb ?? 0;
              const midG = track.eq?.midGainDb ?? 0;
              const highG = track.eq?.highGainDb ?? 0;
              const revG = track.insertEffects?.reverbSendLevel ?? 0;
              const compOn = !!track.insertEffects?.compressorEnabled;
              const compThresh = track.insertEffects?.compressorThresholdDb ?? -24;
              const compRat = track.insertEffects?.compressorRatio ?? 4;
              const volDb =
                track.volume > 0.001
                  ? (20 * Math.log10(track.volume)).toFixed(1)
                  : "-∞";

              return (
                <div
                  key={track.id}
                  className={`w-44 shrink-0 bg-[#0e121b] border rounded-xl p-3 flex flex-col justify-between select-none ${
                    track.id === selectedTrackId
                      ? "border-[#a3ff12]/50 shadow-[0_0_15px_rgba(163,255,18,0.15)]"
                      : "border-white/10"
                  }`}
                >
                  {/* Channel Header */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: track.color }}
                        />
                        <span className="text-xs font-mono font-bold text-white truncate">
                          {track.name}
                        </span>
                      </div>
                      <span className="text-[8px] font-mono px-1 rounded bg-white/10 text-zinc-400">
                        CH
                      </span>
                    </div>

                    {/* Mix Bus Select */}
                    <div className="mb-3">
                      <div className="text-[8px] font-mono text-zinc-400 mb-0.5">ROUTING</div>
                      <select
                        value={track.busId || "master"}
                        onChange={(e) => handleTrackBusChange(track.id, e.target.value)}
                        className="w-full bg-black/50 border border-white/15 text-[9px] font-mono text-zinc-200 rounded px-1.5 py-1 outline-none cursor-pointer"
                      >
                        <option value="master">Master (Direct)</option>
                        <option value="guitars">Guitars Bus</option>
                        <option value="drums">Drums Bus</option>
                        <option value="vocals">Vocals Bus</option>
                        <option value="bass">Bass Bus</option>
                        <option value="keys">Keys / FX Bus</option>
                      </select>
                    </div>

                    {/* 3-Band EQ Strip */}
                    <div className="bg-black/40 p-2 rounded border border-white/5 mb-3 space-y-1.5 text-[8px] font-mono">
                      <div className="text-zinc-400 font-bold flex justify-between">
                        <span>EQ SECTION</span>
                        <span className="text-zinc-500">±12dB</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">HI (4k)</span>
                        <input
                          type="range"
                          min="-12"
                          max="12"
                          step="0.5"
                          value={highG}
                          onChange={(e) => handleTrackEqChange(track.id, "high", parseFloat(e.target.value))}
                          className="w-20 h-1 bg-zinc-800 rounded accent-[#ec4899]"
                        />
                        <span className="text-[8px] text-zinc-300 w-6 text-right">
                          {highG > 0 ? `+${highG}` : highG}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">MID (1k)</span>
                        <input
                          type="range"
                          min="-12"
                          max="12"
                          step="0.5"
                          value={midG}
                          onChange={(e) => handleTrackEqChange(track.id, "mid", parseFloat(e.target.value))}
                          className="w-20 h-1 bg-zinc-800 rounded accent-[#38bdf8]"
                        />
                        <span className="text-[8px] text-zinc-300 w-6 text-right">
                          {midG > 0 ? `+${midG}` : midG}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">LOW (200)</span>
                        <input
                          type="range"
                          min="-12"
                          max="12"
                          step="0.5"
                          value={lowG}
                          onChange={(e) => handleTrackEqChange(track.id, "low", parseFloat(e.target.value))}
                          className="w-20 h-1 bg-zinc-800 rounded accent-[#a3ff12]"
                        />
                        <span className="text-[8px] text-zinc-300 w-6 text-right">
                          {lowG > 0 ? `+${lowG}` : lowG}
                        </span>
                      </div>
                    </div>

                    {/* FX Strip: Reverb Send & Compressor */}
                    <div className="bg-black/40 p-2 rounded border border-white/5 mb-3 space-y-1.5 text-[8px] font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">REVERB SEND</span>
                        <span className="text-purple-400 font-bold">{Math.round(revG * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={revG}
                        onChange={(e) => handleTrackReverbSendChange(track.id, parseFloat(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded accent-purple-400"
                      />

                      <div className="flex items-center justify-between pt-1 border-t border-white/5">
                        <span className="text-zinc-400 font-bold">COMP</span>
                        <button
                          onClick={() =>
                            handleTrackCompressorChange(track.id, {
                              enabled: !compOn,
                              thresholdDb: compThresh,
                              ratio: compRat,
                            })
                          }
                          className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                            compOn ? "bg-amber-400 text-black" : "bg-white/10 text-zinc-400"
                          }`}
                        >
                          {compOn ? "ON" : "OFF"}
                        </button>
                      </div>
                    </div>

                    {/* Pan Slider */}
                    <div className="mb-3">
                      <div className="flex justify-between text-[8px] font-mono text-zinc-400 mb-1">
                        <span>PAN</span>
                        <span className="text-zinc-200">
                          {track.pan === 0
                            ? "C"
                            : track.pan < 0
                            ? `L${Math.round(Math.abs(track.pan) * 100)}`
                            : `R${Math.round(track.pan * 100)}`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={track.pan}
                        onChange={(e) => handleTrackPanChange(track.id, parseFloat(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded accent-[#38bdf8]"
                      />
                    </div>

                    {/* Mute / Solo / Rec */}
                    <div className="grid grid-cols-3 gap-1 mb-3">
                      <button
                        onClick={() => handleArmTrack(track.id)}
                        className={`py-1 rounded text-[9px] font-mono font-bold ${
                          track.id === armedTrackId
                            ? "bg-rose-500 text-white animate-pulse"
                            : "bg-white/5 text-zinc-400 hover:text-white"
                        }`}
                      >
                        REC
                      </button>
                      <button
                        onClick={() => handleToggleMute(track.id)}
                        className={`py-1 rounded text-[9px] font-mono font-bold ${
                          track.muted
                            ? "bg-rose-500 text-white font-bold"
                            : "bg-white/5 text-zinc-400 hover:text-white"
                        }`}
                      >
                        M
                      </button>
                      <button
                        onClick={() => handleToggleSolo(track.id)}
                        className={`py-1 rounded text-[9px] font-mono font-bold ${
                          track.soloed
                            ? "bg-amber-400 text-black font-bold"
                            : "bg-white/5 text-zinc-400 hover:text-white"
                        }`}
                      >
                        S
                      </button>
                    </div>
                  </div>

                  {/* Fader + Meter Area */}
                  <div className="flex items-center gap-3 bg-black/30 p-2 rounded border border-white/5">
                    {/* Vertical VU Meter */}
                    <div className="w-2.5 h-32 bg-zinc-900 rounded overflow-hidden flex flex-col-reverse relative">
                      <div
                        className="w-full transition-all duration-75"
                        style={{
                          height: `${Math.min(100, peak * 100)}%`,
                          backgroundColor: peak > 0.9 ? "#f43f5e" : peak > 0.7 ? "#fbbf24" : "#a3ff12",
                        }}
                      />
                      {isClip && (
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-500 animate-pulse" />
                      )}
                    </div>

                    {/* Vertical Volume Slider */}
                    <div className="flex-1 flex flex-col items-center justify-between h-32 py-1">
                      <span className="text-[8px] font-mono text-zinc-300 font-bold">{volDb} dB</span>
                      <input
                        type="range"
                        min="0"
                        max="1.2"
                        step="0.01"
                        value={track.volume}
                        onChange={(e) => handleTrackVolumeChange(track.id, parseFloat(e.target.value))}
                        className="w-24 h-1 bg-zinc-800 rounded -rotate-90 appearance-none cursor-pointer accent-[#a3ff12]"
                      />
                      <span className="text-[8px] font-mono text-zinc-500">VOL</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Submix Bus Channel Strips */}
            <div className="border-l border-white/10 pl-4 flex gap-3">
              {buses.map((bus) => {
                const routedTracks = project.tracks.filter(
                  (t) => (t.busId || "").toLowerCase() === bus.id.toLowerCase()
                );
                const busDb =
                  bus.volume > 0.001
                    ? (20 * Math.log10(bus.volume)).toFixed(1)
                    : "-∞";

                return (
                  <div
                    key={bus.id}
                    className={`w-36 shrink-0 bg-[#0a0d14] border rounded-xl p-3 flex flex-col justify-between select-none ${
                      bus.muted
                        ? "border-rose-500/30 opacity-70"
                        : bus.soloed
                        ? "border-amber-400/50 shadow-[0_0_12px_rgba(251,191,36,0.2)]"
                        : "border-white/10"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: bus.color }}
                        />
                        <span className="text-xs font-mono font-bold text-zinc-200 truncate">
                          {bus.name}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-zinc-500 block mb-3">
                        {routedTracks.length} tracks routed
                      </span>

                      {/* Mute & Solo */}
                      <div className="grid grid-cols-2 gap-1 mb-4">
                        <button
                          onClick={() => handleBusToggleMute(bus.id)}
                          className={`py-1 rounded text-[9px] font-mono font-bold ${
                            bus.muted
                              ? "bg-rose-500 text-white font-bold"
                              : "bg-white/5 text-zinc-400 hover:text-white"
                          }`}
                        >
                          MUTE
                        </button>
                        <button
                          onClick={() => handleBusToggleSolo(bus.id)}
                          className={`py-1 rounded text-[9px] font-mono font-bold ${
                            bus.soloed
                              ? "bg-amber-400 text-black font-bold"
                              : "bg-white/5 text-zinc-400 hover:text-white"
                          }`}
                        >
                          SOLO
                        </button>
                      </div>
                    </div>

                    {/* Bus Fader Area */}
                    <div className="flex items-center justify-center bg-black/40 p-2 rounded border border-white/5 h-44 flex-col">
                      <span className="text-[9px] font-mono text-zinc-300 font-bold mb-2">
                        {busDb} dB
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.01"
                        value={bus.volume}
                        onChange={(e) => handleBusVolumeChange(bus.id, parseFloat(e.target.value))}
                        className="w-28 h-1 bg-zinc-800 rounded -rotate-90 appearance-none cursor-pointer my-auto"
                        style={{ accentColor: bus.color }}
                      />
                      <span className="text-[8px] font-mono text-zinc-500 mt-2">BUS SUB</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === "projects" && (
        <div className="bg-[#0b0e14] border border-white/10 rounded-2xl shadow-2xl min-h-[500px] overflow-hidden">
          <ProjectsModal
            inline={true}
            currentProject={project}
            savedProjects={savedProjects}
            onClose={() => setActiveTab("timeline")}
            onSelectProject={handleSelectProject}
            onDeleteProject={handleDeleteProject}
            onNewProject={handleNewProject}
            onSaveAs={handleSaveAs}
          />
        </div>
      )}

      {/* CLIP INSPECTOR MODAL */}
      {inspectingClip && (
        <ClipInspector
          clip={inspectingClip}
          trackName={
            project.tracks.find((t) => (t.clips || []).some((c) => c.id === inspectingClip.id))
              ?.name || "Guitar Track"
          }
          trackColor={
            project.tracks.find((t) => (t.clips || []).some((c) => c.id === inspectingClip.id))
              ?.color || "#a3ff12"
          }
          playheadTimeSec={playheadTimeSec}
          onClose={() => setInspectingClip(null)}
          onUpdateClip={handleUpdateInspectingClip}
          onSplitAtPlayhead={handleSplitAtPlayhead}
          onDuplicateClip={handleDuplicateClip}
          onDeleteClip={handleDeleteClip}
        />
      )}

      {/* PROJECTS LIBRARY MODAL (for top button) */}
      {isProjectsModalOpen && (
        <ProjectsModal
          currentProject={project}
          savedProjects={savedProjects}
          onClose={() => setIsProjectsModalOpen(false)}
          onSelectProject={handleSelectProject}
          onDeleteProject={handleDeleteProject}
          onNewProject={handleNewProject}
          onSaveAs={handleSaveAs}
        />
      )}
    </div>
  );
};
