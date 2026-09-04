import { X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

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
import { CustomConfirmDialog } from "./ui/CustomConfirmDialog";

const DEFAULT_PROJECT_ID = "project-default-session";

type StudioTab = "tracks" | "looper" | "drums" | "mixer" | "projects";

import { SunoSong } from "./SongsLibraryView";
import { fetchDecryptedAudioFile } from "../utils/sunoAudioResolver";

interface MultiTrackStudioProps {
  initialSong?: SunoSong | null;
}

export const MultiTrackStudio: React.FC<MultiTrackStudioProps> = ({ initialSong }) => {
  const [activeTab, setActiveTab] = useState<StudioTab>("tracks");
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
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    type?: "confirm" | "alert" | "error" | "success";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
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

  // Handle initialSong import (from Songs Library or Dashboard)
  useEffect(() => {
    if (!initialSong) return;
    const hasAudio = initialSong.id || initialSong.audio_url || initialSong.audioUrl;
    if (!hasAudio) return;

    let isMounted = true;
    (async () => {
      try {
        const audioTarget = initialSong.id || initialSong.audio_url || initialSong.audioUrl || "";
        const file = await fetchDecryptedAudioFile(audioTarget, initialSong.title || "Suno Song");
        if (!file || !isMounted) return;

        const ctx = audioEngine.getContext();
        const arrayBuf = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuf);
        if (!isMounted) return;

        const peaks = extractWaveformPeaks(decoded, 64);
        const newClip: AudioClip = {
          id: `clip-suno-${Date.now()}`,
          name: initialSong.title || "Backing Track",
          startTime: 0,
          duration: decoded.duration,
          trimStart: 0,
          audioBuffer: decoded,
          audioBlob: file,
          waveformPeaks: peaks,
          fadeInSec: 0.005,
          fadeOutSec: 0.005,
          gain: 0.9,
          color: "#a3ff12",
        };

        setProject((prev) => {
          const targetTrackId = prev.tracks[0]?.id || "trk-1";
          const updatedTracks = prev.tracks.map((t, idx) =>
            idx === 0
              ? {
                  ...t,
                  name: `${initialSong.title || "Track"} (Suno)`,
                  clips: [newClip],
                }
              : t
          );
          return { ...prev, tracks: updatedTracks, updatedAt: Date.now() };
        });
        showToast(`Loaded "${initialSong.title}" into Studio!`);
      } catch (e) {
        console.warn("Failed to load initialSong into MultiTrackStudio:", e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [initialSong]);

  // Transport & Audio Engine Subscriptions
  useEffect(() => {
    return () => {
      audioEngine.releaseInput("daw-armed");
      audioEngine.releaseInput("daw-recording");
    };
  }, []);

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
          setDialog({
            isOpen: true,
            title: "No Armed Track",
            message: "Please select and arm a track first to record audio.",
            confirmText: "OK",
            type: "alert",
            onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
          });
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
        setDialog({
          isOpen: true,
          title: "Audio Input Access Required",
          message: "Please ensure your microphone or USB audio device is connected and authorized to record guitar.",
          confirmText: "OK",
          type: "alert",
          onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
        });
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
      setDialog({
        isOpen: true,
        title: "Invalid Playhead Position",
        message: "Place the playhead inside the clip boundaries first to split it.",
        confirmText: "OK",
        type: "alert",
        onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
      });
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
      setDialog({
        isOpen: true,
        title: "Track Deletion Restricted",
        message: "At least one track is required in the multi-track studio session. You cannot delete the last remaining track.",
        confirmText: "OK",
        type: "alert",
        onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
      });
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

  const handleTrackInputSourceChange = (trackId: string, source: "dry" | "processed") => {
    commitProjectChange(
      {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId ? { ...t, inputSource: source === "dry" ? "dry" : "processed" } : t
        ),
      },
      "Change Track Input Source",
      false
    );
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
      setDialog({
        isOpen: true,
        title: "Audio Import Failed",
        message: "Failed to decode the imported audio file. Please ensure it is a valid, uncorrupted WAV or MP3 file.",
        confirmText: "OK",
        type: "error",
        onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
      });
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
      setDialog({
        isOpen: true,
        title: "Stem Export Error",
        message: `An error occurred during stem export: ${err instanceof Error ? err.message : String(err)}`,
        confirmText: "OK",
        type: "error",
        onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
      });
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
      setDialog({
        isOpen: true,
        title: "Mixdown Export Failed",
        message: `An error occurred during master mixdown export: ${err instanceof Error ? err.message : String(err)}`,
        confirmText: "OK",
        type: "error",
        onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
      });
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

  const handleDeleteSavedProject = async (pId: string) => {
    setDialog({
      isOpen: true,
      title: "Delete Project",
      message: "Are you sure you want to delete this project from your library? This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      type: "confirm",
      onConfirm: async () => {
        await deleteProjectFromDB(pId);
        const list = await loadProjectsFromDB(audioEngine.getContext());
        setSavedProjects(list);
        showToast("Project deleted.");
        setDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
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

  const handleSaveProject = async (customName: string) => {
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
    <div id="panel-multitrack-studio" className="flex flex-col h-full w-full bg-[#0b0e14] text-white overflow-hidden animate-in fade-in duration-200">
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 bg-[#16191f] border border-[#a3ff12] text-[#a3ff12] px-4 py-2.5 rounded-2xl shadow-[0_0_20px_rgba(163,255,18,0.2)] text-xs font-mono font-bold flex items-center gap-2 animate-in slide-in-from-top duration-200">
          <Check className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Live Count-In Overlay Banner */}
      {countInCountdown && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-50 bg-rose-600 border border-white/20 text-white px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(244,63,94,0.7)] text-base font-mono font-extrabold flex items-center gap-3 animate-pulse pointer-events-none">
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

      {/* 1. STUDIO TRANSPORT (PERSISTENT TOP) */}
      <div className="shrink-0 bg-[#12151e] border-b border-white/10 px-2 sm:px-4 py-2 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 z-20">
        
        {/* Left: Project Info */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-[#a3ff12]/20 to-[#38bdf8]/20 border border-[#a3ff12]/40 flex items-center justify-center">
              <Music className="w-4 h-4 text-[#a3ff12]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xs sm:text-sm font-mono font-bold text-white truncate max-w-[120px] sm:max-w-[200px]">
                  {project.name}
                </h1>
                <span className={`hidden md:inline-block text-[9px] font-mono px-2 py-0.5 rounded-full border ${autoSaveStatus === "saving" ? "bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse" : "bg-[#a3ff12]/10 text-[#a3ff12] border-[#a3ff12]/30"}`}>
                  {autoSaveStatus === "saving" ? "Autosaving..." : "Saved"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex md:hidden items-center gap-2">
            {/* Mobile quick actions */}
            <button onClick={() => setIsProjectsModalOpen(true)} className="p-1.5 bg-white/5 rounded text-zinc-300"><FolderOpen className="w-4 h-4" /></button>
            <button onClick={handleExportMixdown} disabled={isExportingMix} className="p-1.5 bg-[#a3ff12]/20 text-[#a3ff12] rounded"><Download className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Center: Playback & Record Controls */}
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-none w-full sm:w-auto justify-center">
          <button onClick={handleRewind} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors cursor-pointer shrink-0" title="Rewind to Start">
            <SkipBack className="w-4 h-4" />
          </button>
          <button onClick={handleStop} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors cursor-pointer shrink-0" title="Stop">
            <Square className="w-4 h-4" />
          </button>
          <button onClick={handleTogglePlay} className={`px-3 sm:px-4 py-2 rounded-lg font-mono font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${transportState.isPlaying ? "bg-[#a3ff12] text-black shadow-[0_0_15px_rgba(163,255,18,0.4)]" : "bg-white/10 hover:bg-white/20 text-white"}`}>
            {transportState.isPlaying ? <><Pause className="w-4 h-4 fill-current" /><span className="hidden sm:inline">PAUSE</span></> : <><Play className="w-4 h-4 fill-current" /><span className="hidden sm:inline">PLAY</span></>}
          </button>
          <button onClick={handleToggleRecord} className={`px-3 sm:px-4 py-2 rounded-lg font-mono font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${transportState.isRecording ? "bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.6)] animate-pulse" : "bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300"}`}>
            <Circle className="w-4 h-4 fill-current" />
            <span className="hidden sm:inline">{transportState.isRecording ? "REC" : "RECORD"}</span>
          </button>
          
          <div className="w-px h-6 bg-white/10 mx-1 shrink-0" />
          
          {/* Loop & Metronome */}
          <button onClick={() => transport.toggleMetronome()} className={`p-2 rounded-lg transition-colors cursor-pointer shrink-0 ${transportState.isMetronomeActive ? "bg-[#a3ff12] text-black shadow-[0_0_10px_#a3ff12]" : "bg-white/5 text-zinc-400"}`} title="Metronome">
            <Clock className="w-4 h-4" />
          </button>

          {/* Time Display */}
          <div className="hidden lg:flex items-center gap-3 bg-black/60 border border-white/10 px-3 py-1.5 rounded-lg shrink-0">
            <div className="text-sm font-mono font-bold text-[#a3ff12] w-[60px]">
              {String(currentBar).padStart(2, "0")}:{currentBeat}.{String(currentTick).padStart(2, "0")}
            </div>
            <div className="w-px h-4 bg-white/20" />
            <div className="text-xs font-mono text-zinc-300 w-[50px]">
              {Math.floor(playheadTimeSec / 60)}:{String(Math.floor(playheadTimeSec % 60)).padStart(2, "0")}
            </div>
          </div>
        </div>

        {/* Right: Settings & Actions */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 px-2 py-1 rounded-lg text-xs font-mono">
            <span className="text-zinc-500">BPM</span>
            <input type="number" min="40" max="240" value={transportState.bpm} onChange={(e) => { const b = parseInt(e.target.value, 10) || 120; transport.setBpm(b); commitProjectChange({ ...project, bpm: b }, "Change BPM", false); }} className="w-10 bg-transparent text-center text-white font-bold outline-none" />
          </div>
          
          <button onClick={handleUndo} disabled={!dawHistory.canUndo()} className={`p-1.5 rounded text-zinc-300 ${dawHistory.canUndo() ? 'hover:bg-white/10' : 'opacity-30'}`}><Undo2 className="w-4 h-4" /></button>
          <button onClick={handleRedo} disabled={!dawHistory.canRedo()} className={`p-1.5 rounded text-zinc-300 ${dawHistory.canRedo() ? 'hover:bg-white/10' : 'opacity-30'}`}><Redo2 className="w-4 h-4" /></button>
          
          <div className="w-px h-6 bg-white/10 mx-1 shrink-0" />
          
          <button onClick={() => setIsProjectsModalOpen(true)} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-mono font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer">
            <FolderOpen className="w-3.5 h-3.5" /> Projects
          </button>
          <button onClick={handleExportMixdown} disabled={isExportingMix} className="px-3 py-1.5 bg-[#a3ff12]/20 hover:bg-[#a3ff12]/30 text-[#a3ff12] text-xs font-mono font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer">
            <Download className="w-3.5 h-3.5" /> {isExportingMix ? "Wait..." : "Export"}
          </button>
        </div>
      </div>

      {/* 2. SECONDARY NAVIGATION (TABS) */}
      <div className="shrink-0 flex items-center bg-[#0d1017] border-b border-white/5 overflow-x-auto scrollbar-none z-10 px-2 sm:px-4">
        {(["tracks", "looper", "drums", "mixer"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 sm:px-6 py-2 sm:py-3 text-[11px] sm:text-xs font-mono font-bold transition-all capitalize whitespace-nowrap cursor-pointer border-b-2 ${
              activeTab === tab
                ? "border-[#a3ff12] text-[#a3ff12] bg-white/5"
                : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            }`}
          >
            {tab === "tracks" ? "Arrangement" : tab}
          </button>
        ))}
      </div>

      {/* 3. MAIN WORKSPACE */}
      <div className="flex-1 overflow-hidden relative flex flex-col bg-[#0b0e14]">
        
        {/* TRACKS / ARRANGEMENT TAB */}
        <div className={`flex-col h-full ${activeTab === "tracks" ? "flex" : "hidden"}`}>
          {/* Top: Timeline & Tracks */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Track Headers (Hidden on small mobile if timeline active, or stack? Mobile: horizontal scroll tracks?) */}
            {/* Actually, let's keep left-right flex but adapt width */}
            <div className="w-32 sm:w-48 lg:w-64 shrink-0 flex flex-col bg-[#0d1017] border-r border-white/10 z-10">
              {/* Corner header */}
              <div className="h-10 shrink-0 border-b border-white/10 px-2 py-2 flex items-center justify-between text-[9px] sm:text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider bg-[#0d1017] sticky top-0">
                <span>Tracks ({project.tracks.length})</span>
                <button onClick={handleAddTrack} className="p-1 hover:text-[#a3ff12] hover:bg-white/5 rounded transition-colors"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              {/* Track list scrolling container (must sync scroll with timeline y-axis) */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none" id="track-headers-container" onScroll={(e) => {
                const target = document.getElementById('timeline-lanes-container');
                if (target) target.scrollTop = e.currentTarget.scrollTop;
              }}>
                <div className="divide-y divide-white/5">
                  {project.tracks.map((track) => (
                    <div key={track.id} className={`${track.id === selectedTrackId ? "bg-[#141824]" : "hover:bg-[#0e121a]"}`}>
                      <TrackHeader
                        track={track}
                        isSelected={track.id === selectedTrackId}
                        isArmed={track.id === armedTrackId}
                        onSelect={(id) => setSelectedTrackId(id)}
                        onArm={handleArmTrack}
                        onToggleMute={handleToggleMute}
                        onToggleSolo={handleToggleSolo}
                        onToggleMonitoring={handleToggleMonitoring}
                        onInputSourceChange={handleTrackInputSourceChange}
                        onVolumeChange={handleTrackVolumeChange}
                        onPanChange={handleTrackPanChange}
                        onRename={handleRenameTrack}
                        onDuplicate={handleDuplicateTrack}
                        onDelete={handleDeleteTrack}
                        onTriggerUpload={handleTriggerUpload}
                        onExportStem={handleExportStem}
                        meterPeak={trackPeaks[track.id] || 0}
                        isClipping={clippingTracks[track.id] || false}
                        onResetClipping={() => setClippingTracks((prev) => ({ ...prev, [track.id]: false }))}
                        onEqChange={handleTrackEqChange}
                        onReverbSendChange={handleTrackReverbSendChange}
                        onCompressorChange={handleTrackCompressorChange}
                        onBusChange={handleTrackBusChange}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Center Timeline */}
            <div className="flex-1 flex flex-col bg-[#090b10] overflow-hidden relative">
              {/* Ruler */}
              <div className="h-10 shrink-0 border-b border-white/10 bg-[#0d1017] overflow-x-auto overflow-y-hidden scrollbar-none" id="timeline-ruler-container" onScroll={(e) => {
                const target = document.getElementById('timeline-lanes-container');
                if (target) target.scrollLeft = e.currentTarget.scrollLeft;
              }}>
                <TimelineRuler
                  bpm={project.bpm}
                  timeSig={project.timeSig}
                  zoomPxPerSec={zoomPxPerSec}
                  totalDurationSec={maxProjectDurationSec}
                  playheadTimeSec={playheadTimeSec}
                  onSeek={handleSeek}
                />
              </div>

              {/* Lanes */}
              <div className="flex-1 overflow-auto cursor-crosshair select-none" id="timeline-lanes-container" onScroll={(e) => {
                const ruler = document.getElementById('timeline-ruler-container');
                const headers = document.getElementById('track-headers-container');
                if (ruler) ruler.scrollLeft = e.currentTarget.scrollLeft;
                if (headers) headers.scrollTop = e.currentTarget.scrollTop;
              }}>
                <div 
                  className="relative divide-y divide-white/5" 
                  style={{ minWidth: `${Math.max(800, maxProjectDurationSec * zoomPxPerSec)}px` }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    handleSeek(clickX / zoomPxPerSec);
                  }}
                >
                  {/* Subtle Background Grid Lines */}
                  <div className="absolute inset-0 pointer-events-none">
                    {Array.from({ length: Math.ceil(maxProjectDurationSec / (60 / project.bpm)) }).map((_, beatIdx) => {
                      const beatX = beatIdx * (60 / project.bpm) * zoomPxPerSec;
                      const isBar = beatIdx % 4 === 0;
                      return (
                        <div key={`lane-grid-${beatIdx}`} className={`absolute top-0 bottom-0 ${isBar ? "w-[1px] bg-white/10" : "w-[1px] bg-white/5"}`} style={{ left: `${beatX}px` }} />
                      );
                    })}
                  </div>

                  {/* Render Track Lanes */}
                  {project.tracks.map((track) => (
                    <div key={track.id} className={`relative h-24 ${track.id === selectedTrackId ? "bg-white/[0.02]" : ""}`}>
                      {(track.clips || []).map((clip) => (
                        <AudioClipView
                          key={clip.id}
                          clip={clip}
                          trackColor={track.color}
                          zoomPxPerSec={zoomPxPerSec}
                          isSelected={clip.id === selectedClipId}
                          onSelect={() => {
                            setSelectedClipId(clip.id);
                            setSelectedTrackId(track.id);
                            setInspectingClip(clip);
                          }}
                          onMove={(newStart) => handleMoveClip(clip.id, newStart)}
                          onTrimLeft={(delta) => {}}
                          onTrimRight={(delta) => {}}
                          onOpenInspector={(c) => setInspectingClip(c)}
                        />
                      ))}
                    </div>
                  ))}
                  
                  {/* Playhead */}
                  <div className="absolute top-0 bottom-0 w-px bg-rose-500 z-10 pointer-events-none shadow-[0_0_10px_rgba(244,63,94,0.8)]" style={{ left: `${playheadTimeSec * zoomPxPerSec}px` }}>
                    <div className="absolute -top-3 -left-1.5 w-3 h-3 bg-rose-500 rotate-45" />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Zoom Controls (Floating Bottom Right of Timeline) */}
            <div className="absolute bottom-24 sm:bottom-4 right-4 z-20 flex items-center gap-1 bg-[#12151e]/80 backdrop-blur border border-white/10 p-1 rounded-lg">
              <button onClick={() => setZoomPxPerSec((z) => Math.max(40, z - 20))} className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300" title="Zoom Out">
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-mono text-zinc-500 w-8 text-center">{zoomPxPerSec}</span>
              <button onClick={() => setZoomPxPerSec((z) => Math.min(220, z + 20))} className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300" title="Zoom In">
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Bottom Contextual Panel (Inspector) */}
          <div className="h-48 sm:h-64 shrink-0 bg-[#0d1017] border-t border-white/10 overflow-y-auto">
            {inspectingClip && selectedTrackId ? (
              <ClipInspector
                clip={inspectingClip}
                trackName={project.tracks.find(t => t.id === selectedTrackId)?.name || ""}
                trackColor={project.tracks.find(t => t.id === selectedTrackId)?.color || "#fff"}
                onClose={() => setInspectingClip(null)}
                onUpdateClip={(updated) => {}}
                onSplitAtPlayhead={(clipId) => {}}
                onDuplicateClip={(clipId) => {}}
                onDeleteClip={(clipId) => {}}
                playheadTimeSec={playheadTimeSec}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-600 text-xs font-mono select-none">
                Select an audio clip to inspect and edit.
              </div>
            )}
          </div>
        </div>

        {/* LOOPER TAB */}
        <div className={`flex-col h-full overflow-y-auto p-2 sm:p-4 ${activeTab === "looper" ? "flex" : "hidden"}`}>
          <LooperStation onCommitToStudio={handleCommitLooperTrack} />
        </div>

        {/* DRUMS TAB */}
        <div className={`flex-col h-full overflow-y-auto p-2 sm:p-4 ${activeTab === "drums" ? "flex" : "hidden"}`}>
          <DrumMetronome />
        </div>

        {/* MIXER TAB */}
        <div className={`flex-col h-full overflow-y-auto p-4 ${activeTab === "mixer" ? "flex" : "hidden"}`}>
          <div className="flex gap-4 items-stretch h-full overflow-x-auto pb-4 scrollbar-none">
            {/* Tracks Strips */}
            {project.tracks.map((track) => {
              const peak = trackPeaks[track.id] || 0;
              const isClip = clippingTracks[track.id] || false;
              const volDb = track.volume > 0.001 ? (20 * Math.log10(track.volume)).toFixed(1) : "-∞";
              return (
                <div key={track.id} className="w-32 sm:w-40 shrink-0 bg-[#0e121b] border border-white/10 rounded-xl p-3 flex flex-col justify-between">
                  <div className="flex flex-col gap-2 mb-4">
                    <span className="text-xs font-mono font-bold text-white truncate text-center bg-white/5 rounded py-1" style={{ borderTop: `2px solid ${track.color}`}}>
                      {track.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleToggleMute(track.id)} className={`flex-1 py-1 rounded text-[10px] font-mono font-bold ${track.muted ? "bg-rose-500 text-white" : "bg-white/5 text-zinc-400"}`}>M</button>
                      <button onClick={() => handleToggleSolo(track.id)} className={`flex-1 py-1 rounded text-[10px] font-mono font-bold ${track.soloed ? "bg-amber-400 text-black" : "bg-white/5 text-zinc-400"}`}>S</button>
                    </div>
                  </div>
                  
                  <div className="flex-1 relative flex justify-center mb-4 min-h-[150px]">
                     <input type="range" min="0" max="1.5" step="0.01" value={track.volume} onChange={(e) => handleTrackVolumeChange(track.id, parseFloat(e.target.value))}
                       className="absolute h-full appearance-none bg-transparent cursor-pointer"
                       style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical', width: '20px' } as any}
                     />
                  </div>
                  
                  <div className="text-center">
                     <span className="text-[10px] font-mono text-zinc-400">{volDb} dB</span>
                  </div>
                </div>
              );
            })}
            
            {/* Master Strip */}
            <div className="w-32 sm:w-40 shrink-0 bg-black/40 border border-[#a3ff12]/20 rounded-xl p-3 flex flex-col justify-between ml-4">
              <div className="flex flex-col gap-2 mb-4">
                <span className="text-xs font-mono font-bold text-[#a3ff12] truncate text-center bg-[#a3ff12]/10 rounded py-1">
                  MASTER
                </span>
              </div>
              <div className="flex-1 relative flex justify-center mb-4 min-h-[150px]">
                {/* Master meter can go here */}
                <div className="w-4 h-full bg-black rounded-full overflow-hidden flex flex-col justify-end border border-white/10">
                   <div className="w-full bg-[#a3ff12]" style={{ height: `${Math.min(100, Math.max(0, inputLevel.rms * 100)) }%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {isProjectsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[80vh] flex flex-col bg-[#0b0e14] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative">
            <button onClick={() => setIsProjectsModalOpen(false)} className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors z-50">
              <X className="w-4 h-4" />
            </button>
            <div className="flex-1 overflow-y-auto">
              <ProjectsModal
                inline={true}
                currentProject={project}
                savedProjects={savedProjects}
                onClose={() => setIsProjectsModalOpen(false)}
                onSelectProject={(loaded) => {
                  transport.stop();
                  setProject(loaded);
                  transport.setBpm(loaded.bpm || 120);
                  transport.setKeySig(loaded.keySig || "Am");
                  transport.setTimeSig(loaded.timeSig || "4/4");
                  setIsProjectsModalOpen(false);
                  setActiveTab("tracks");
                }}
                onDeleteProject={handleDeleteSavedProject}
                onNewProject={handleNewProject}
                onSaveAs={handleSaveProject}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
