import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  X,
  Plus,
  Sliders,
  Volume2,
  VolumeX,
  Radio,
  Clock,
  Sparkles,
  Scissors,
  Copy,
  Trash2,
  Download,
  FolderOpen,
  Save,
  Check,
  Upload,
  Mic,
  Headphones,
  SlidersHorizontal,
  RotateCcw,
  Music,
  Waves,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronUp,
  ChevronDown,
  Layers,
  Activity,
  Zap,
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
import { ToneMacroSettings, DEFAULT_TONE_MACROS, mapMacrosToDspEffects } from "../types/toneAndEffects";
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
import { getTrackCapabilities } from "../utils/trackPermissions";
import { SunoSong } from "./SongsLibraryView";
import { fetchDecryptedAudioFile } from "../utils/sunoAudioResolver";

// DAW Subcomponents
import { StudioTransport } from "./daw/StudioTransport";
import { TimelineRuler } from "./daw/TimelineRuler";
import { AudioClipView } from "./daw/AudioClipView";
import { TrackHeader } from "./daw/TrackHeader";
import { ClipInspector } from "./daw/ClipInspector";
import { ProjectsModal } from "./daw/ProjectsModal";
import { SessionExportModal } from "./daw/SessionExportModal";
import { StudioEffectsRack } from "./daw/StudioEffectsRack";
import { StudioToneMacros } from "./daw/StudioToneMacros";
import { StudioAIAssistant } from "./daw/StudioAIAssistant";
import { LooperStation } from "./LooperStation";
import { DrumMetronome } from "./DrumMetronome";
import { CustomConfirmDialog } from "./ui/CustomConfirmDialog";

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

const DEFAULT_PROJECT_ID = "project-default-session";

type StudioDeckTab = "inspector" | "mixer" | "effects" | "tone" | "drums" | "looper" | "ai";
type MobileNavTab = "tracks" | "mix" | "fx" | "tone" | "ai";

interface MultiTrackStudioProps {
  initialSong?: SunoSong | null;
}

export const MultiTrackStudio: React.FC<MultiTrackStudioProps> = ({ initialSong }) => {
  // Project & Tracks State
  const [project, setProject] = useState<DAWProject>({
    id: DEFAULT_PROJECT_ID,
    name: "JOE Studio Session",
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
        armed: true,
        monitoring: true,
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
      {
        id: "trk-3",
        name: "Bass",
        color: "#f59e0b",
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
        id: "trk-4",
        name: "Drum Groove",
        color: "#ec4899",
        volume: 0.9,
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
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const [savedProjects, setSavedProjects] = useState<DAWProject[]>([]);
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [armedTrackId, setArmedTrackId] = useState<string | null>("trk-1");
  const [selectedTrackId, setSelectedTrackId] = useState<string>("trk-1");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [inspectingClip, setInspectingClip] = useState<AudioClip | null>(null);

  // Studio Deck & Layout Controls
  const [activeDeckTab, setActiveDeckTab] = useState<StudioDeckTab>("mixer");
  const [isDeckExpanded, setIsDeckExpanded] = useState<boolean>(true);
  const [mobileNavTab, setMobileNavTab] = useState<MobileNavTab>("tracks");
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState<boolean>(false);

  // Tone Macros State
  const [toneMacros, setToneMacros] = useState<ToneMacroSettings>({ ...DEFAULT_TONE_MACROS });

  // Transport & Clock State
  const [transportState, setTransportState] = useState<TransportState>(transport.getState());
  const [playheadTimeSec, setPlayheadTimeSec] = useState<number>(0);
  const [countInCountdown, setCountInCountdown] = useState<string | null>(null);

  // Timeline UI Settings
  const [zoomPxPerSec, setZoomPxPerSec] = useState<number>(80);
  const [gridSnap, setGridSnap] = useState<GridSnapSetting>("1beat");
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");

  // Audio Monitoring & VU Levels
  const [isMonitoring, setIsMonitoring] = useState<boolean>(audioEngine.getIsMonitoring());
  const [isMicActive, setIsMicActive] = useState<boolean>(audioEngine.getIsMicActive());
  const [inputLevel, setInputLevel] = useState<AudioInputLevel>({ rms: 0, peak: 0, db: -100 });
  const [trackPeaks, setTrackPeaks] = useState<{ [trackId: string]: number }>({});
  const [clippingTracks, setClippingTracks] = useState<{ [trackId: string]: boolean }>({});
  const [buses, setBuses] = useState<BusChannelState[]>(DEFAULT_BUS_CHANNELS);

  // Grid Canvas Scrubbing Control
  const isCanvasScrubbingRef = useRef<boolean>(false);
  const canvasRectCacheRef = useRef<{ left: number; width: number }>({ left: 0, width: 1 });
  const pendingCanvasSeekTimeRef = useRef<number | null>(null);

  // Dialogs & Feedback
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
  const [lastRecordedClipInfo, setLastRecordedClipInfo] = useState<{ trackId: string; clipId: string } | null>(null);

  // High-performance direct DOM playhead ref
  const playheadLineRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

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
    setTimeout(() => setToastMessage(null), 3200);
  };

  // Helper to calculate snap seconds
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
  const maxProjectDurationSec = useMemo(() => {
    return Math.max(
      32,
      ...project.tracks.flatMap((t) => (t.clips || []).map((c) => c.startTime + c.duration + 4))
    );
  }, [project.tracks]);

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

  // Check initialSong and validate content capabilities
  useEffect(() => {
    if (!initialSong) return;

    // Check track permissions
    const capabilities = getTrackCapabilities(initialSong);

    if (!capabilities.canOpenInStudio) {
      setDialog({
        isOpen: true,
        title: "Protected Artist Audio",
        message: `"${initialSong.title}" is a protected artist composition licensed for streaming and practice. To protect copyrighted catalog material, multi-track DAW editing is restricted to user-created tracks and remixable audio.`,
        confirmText: "Understood",
        type: "alert",
        onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
      });
      return;
    }

    const hasAudio = initialSong.id || initialSong.audio_url || initialSong.audioUrl;
    if (!hasAudio) return;

    let isMounted = true;
    (async () => {
      try {
        const audioTarget = initialSong.id || initialSong.audio_url || initialSong.audioUrl || "";
        const file = await fetchDecryptedAudioFile(audioTarget, initialSong.title || "Remix Track");
        if (!file || !isMounted) return;

        const ctx = audioEngine.getContext();
        const arrayBuf = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuf);
        if (!isMounted) return;

        const peaks = extractWaveformPeaks(decoded, 64);
        const newClip: AudioClip = {
          id: `clip-remix-${Date.now()}`,
          name: initialSong.title || "Remix Audio",
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
          const updatedTracks = prev.tracks.map((t, idx) =>
            idx === 0
              ? {
                  ...t,
                  name: `${initialSong.title || "Track"} (Remix)`,
                  clips: [newClip],
                }
              : t
          );
          return { ...prev, tracks: updatedTracks, updatedAt: Date.now() };
        });
        showToast(`Loaded "${initialSong.title}" into JOE Studio!`);
      } catch (e) {
        console.warn("Failed to load initialSong into MultiTrackStudio:", e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [initialSong]);

  // Audio Engine Subscriptions and High-Performance rAF Playhead Loop
  useEffect(() => {
    const unsubTransport = transport.subscribe((state) => {
      setTransportState({ ...state });
    });

    const unsubTick = transport.subscribeTick((t) => {
      setPlayheadTimeSec(t);
      if (playheadLineRef.current) {
        playheadLineRef.current.style.transform = `translate3d(${(t * zoomPxPerSec).toFixed(2)}px, 0, 0)`;
      }
    });

    const unsubMic = audioEngine.subscribeMicStatus(setIsMicActive);
    const unsubMon = audioEngine.subscribeMonitorStatus(setIsMonitoring);

    // Live VU meter update loop (45ms interval)
    const meterInterval = window.setInterval(() => {
      const liveLvl = audioEngine.getInputLevel();
      setInputLevel(liveLvl);

      const curPeaks: { [id: string]: number } = {};
      const newClipping: { [id: string]: boolean } = {};

      project.tracks.forEach((t) => {
        if (t.armed && isMicActive) {
          curPeaks[t.id] = liveLvl.peak;
          if (liveLvl.peak > 0.98) {
            newClipping[t.id] = true;
          }
        } else if (transportState.isPlaying && !t.muted) {
          const curTime = transport.getCurrentTime();
          const isPlayingClip = (t.clips || []).some(
            (c) => curTime >= c.startTime && curTime <= c.startTime + c.duration
          );
          curPeaks[t.id] = isPlayingClip ? Math.min(1.0, t.volume * 0.75 + Math.random() * 0.08) : 0.02;
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
  }, [project.tracks, isMicActive, transportState.isPlaying, zoomPxPerSec]);

  // Keyboard Shortcuts (Space, R, S, Delete, Undo, Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleToggleRecord();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedClipId) {
          e.preventDefault();
          handleDeleteClip(selectedClipId);
        }
      } else if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey) {
        if (selectedClipId) {
          e.preventDefault();
          handleSplitAtPlayhead(selectedClipId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // Undo / Redo
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

  // Playback Handlers
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
    setPlayheadTimeSec(0);
  };

  // Live Guitar Recording Flow
  const handleToggleRecord = async () => {
    if (transportState.isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      audioEngine.releaseInput("daw-recording");
      transport.stopRecording();
      transport.pause();
      dawEngine.stopAllNodes();
      setCountInCountdown(null);
    } else {
      try {
        let armedTrack = project.tracks.find((t) => t.id === armedTrackId);
        if (!armedTrack) {
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
            message: "Please select and arm a track to record audio.",
            confirmText: "OK",
            type: "alert",
            onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
          });
          return;
        }

        if (transportState.countInMode !== "off") {
          await transport.runCountIn((beat, total) => {
            setCountInCountdown(`COUNT-IN: ${beat} / ${total}`);
          });
          setCountInCountdown(null);
        }

        await audioEngine.acquireInput("daw-recording", { isRecording: true });
        const stream = audioEngine.getInputStream();
        if (!stream) throw new Error("Audio input stream unavailable");

        const curTime = transport.getCurrentTime();
        recordStartTimeRef.current = curTime;
        audioChunksRef.current = [];

        const recorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined,
        });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          try {
            const rawBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
            const ctx = audioEngine.getContext();
            const buffer = await blobToAudioBuffer(rawBlob, ctx);
            const peaks = extractWaveformPeaks(buffer, 64);

            const clipId = `clip-rec-${Date.now()}`;
            const newClip: AudioClip = {
              id: clipId,
              name: `Take ${armedTrack.name}`,
              startTime: recordStartTimeRef.current,
              duration: buffer.duration,
              trimStart: 0,
              audioBuffer: buffer,
              audioBlob: rawBlob,
              waveformPeaks: peaks,
              fadeInSec: 0.005,
              fadeOutSec: 0.005,
              gain: 1.0,
              color: armedTrack.color,
            };

            const updatedTracks = project.tracks.map((t) => {
              if (t.id === armedTrack.id) {
                return { ...t, clips: [...(t.clips || []), newClip] };
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

        dawEngine.startPlayback(project, curTime);
        transport.startRecording();
      } catch (err) {
        setDialog({
          isOpen: true,
          title: "Audio Input Access Required",
          message: "Please ensure your microphone or guitar interface is connected and authorized.",
          confirmText: "OK",
          type: "alert",
          onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
        });
        setCountInCountdown(null);
      }
    }
  };

  // Timeline Navigation
  const handleSeek = (timeSec: number) => {
    const target = snapTimeToGrid(timeSec);
    transport.seek(target);
    setPlayheadTimeSec(target);
    if (playheadLineRef.current) {
      playheadLineRef.current.style.transform = `translate3d(${(target * zoomPxPerSec).toFixed(2)}px, 0, 0)`;
    }
    if (transportState.isPlaying) {
      dawEngine.startPlayback(project, target);
    }
  };

  const handleGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-clip-item]")) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;

    const gridEl = e.currentTarget;
    const rect = gridEl.getBoundingClientRect();
    canvasRectCacheRef.current = { left: rect.left, width: rect.width };

    try {
      gridEl.setPointerCapture(e.pointerId);
    } catch {}

    isCanvasScrubbingRef.current = true;
    document.body.style.cursor = "ew-resize";
    const clickX = Math.max(0, e.clientX - rect.left);
    const targetSec = Math.max(0, clickX / zoomPxPerSec);
    pendingCanvasSeekTimeRef.current = targetSec;

    if (playheadLineRef.current) {
      playheadLineRef.current.style.transform = `translate3d(${(targetSec * zoomPxPerSec).toFixed(2)}px, 0, 0)`;
    }
  };

  const handleGridPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isCanvasScrubbingRef.current) return;
    const { left } = canvasRectCacheRef.current;
    const currentX = Math.max(0, e.clientX - left);
    const targetSec = Math.max(0, currentX / zoomPxPerSec);
    pendingCanvasSeekTimeRef.current = targetSec;

    if (playheadLineRef.current) {
      playheadLineRef.current.style.transform = `translate3d(${(targetSec * zoomPxPerSec).toFixed(2)}px, 0, 0)`;
    }
  };

  const handleGridPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const gridEl = e.currentTarget;
    if (gridEl && gridEl.hasPointerCapture(e.pointerId)) {
      try {
        gridEl.releasePointerCapture(e.pointerId);
      } catch {}
    }

    if (isCanvasScrubbingRef.current) {
      isCanvasScrubbingRef.current = false;
      document.body.style.cursor = "";

      if (pendingCanvasSeekTimeRef.current !== null) {
        const finalTarget = pendingCanvasSeekTimeRef.current;
        pendingCanvasSeekTimeRef.current = null;
        handleSeek(finalTarget);
      }
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
        title: "Split Boundary",
        message: "Position playhead inside the selected clip to split it.",
        confirmText: "OK",
        type: "alert",
        onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
      });
      return;
    }

    const splitOffset = curPlayhead - clipStart;

    const leftClip: AudioClip = {
      ...clip,
      id: `clip-split-L-${Date.now()}`,
      name: `${clip.name} (Part 1)`,
      duration: splitOffset,
    };

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
          startTime: found.startTime + found.duration + 0.1,
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

  // Track Management: Add Track
  const handleAddTrack = (type: "guitar" | "bass" | "vocal" | "beat" | "synth" = "guitar") => {
    const count = project.tracks.length + 1;
    const colors = ["#a3ff12", "#38bdf8", "#f59e0b", "#ec4899", "#a855f7", "#10b981"];
    const color = colors[(count - 1) % colors.length];

    const typeNames: Record<string, string> = {
      guitar: `Guitar ${count}`,
      bass: `Bass ${count}`,
      vocal: `Lead Vocal ${count}`,
      beat: `Beat Groove ${count}`,
      synth: `Synth ${count}`,
    };

    const newTrk: DAWTrack = {
      id: `trk-${Date.now()}`,
      name: typeNames[type] || `Track ${count}`,
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

  // Track Controls Handlers
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

    dawEngine.updateTrackEq(trackId, band, value);
  };

  const handleTrackReverbSendChange = (trackId: string, value: number) => {
    setProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const currentFx = t.insertEffects || { ...DEFAULT_TRACK_INSERT_EFFECTS };
        return {
          ...t,
          insertEffects: { ...currentFx, reverbSendLevel: value },
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
        const currentFx = t.insertEffects || { ...DEFAULT_TRACK_INSERT_EFFECTS };
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

  const handleArmTrack = (trackId: string) => {
    setArmedTrackId(trackId);
    setProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => ({ ...t, armed: t.id === trackId })),
    }));
    audioEngine.acquireInput("daw-armed").catch(() => {});
    showToast(`Track "${project.tracks.find((t) => t.id === trackId)?.name}" armed for recording.`);
  };

  // User Audio File Upload Handler
  const handleTriggerUpload = (trackId: string) => {
    targetUploadTrackIdRef.current = trackId;
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const ctx = audioEngine.getContext();
      const arrayBuf = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      const peaks = extractWaveformPeaks(decoded, 64);

      const targetTrack = project.tracks.find((t) => t.id === targetUploadTrackIdRef.current) || project.tracks[0];
      const newClip: AudioClip = {
        id: `clip-upload-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        startTime: playheadTimeSec,
        duration: decoded.duration,
        trimStart: 0,
        audioBuffer: decoded,
        audioBlob: file,
        waveformPeaks: peaks,
        fadeInSec: 0.005,
        fadeOutSec: 0.005,
        gain: 1.0,
        color: targetTrack?.color || "#a3ff12",
      };

      const updatedTracks = project.tracks.map((t) =>
        t.id === targetTrack.id
          ? {
              ...t,
              clips: [...(t.clips || []), newClip],
            }
          : t
      );

      const updated = { ...project, tracks: updatedTracks, updatedAt: Date.now() };
      commitProjectChange(updated, `Import Audio to ${targetTrack.name}`);
      setSelectedClipId(newClip.id);
      showToast(`Imported "${file.name}"!`);
    } catch (err) {
      setDialog({
        isOpen: true,
        title: "Audio Import Failed",
        message: "Failed to decode audio. Please ensure it is an uncorrupted WAV, MP3, or M4A file.",
        confirmText: "OK",
        type: "error",
        onConfirm: () => setDialog((prev) => ({ ...prev, isOpen: false })),
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const selectedTrack = project.tracks.find((t) => t.id === selectedTrackId) || project.tracks[0] || null;

  return (
    <div id="panel-multitrack-studio" className="flex flex-col h-full w-full bg-[#090b10] text-white overflow-hidden select-none font-mono">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 bg-[#12151e] border border-[#a3ff12] text-[#a3ff12] px-4 py-2.5 rounded-2xl shadow-[0_0_25px_rgba(163,255,18,0.25)] text-xs font-mono font-bold flex items-center gap-2 animate-in slide-in-from-top duration-200">
          <Check className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Live Count-In Overlay Banner */}
      {countInCountdown && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-rose-600 border border-white/20 text-white px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(244,63,94,0.7)] text-base font-extrabold flex items-center gap-3 animate-pulse pointer-events-none">
          <Radio className="w-5 h-5 animate-spin" />
          <span>{countInCountdown}</span>
        </div>
      )}

      {/* Hidden File Input for Audio Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="audio/*,.wav,.mp3,.m4a,.flac"
        className="hidden"
      />

      {/* 1. TOP TRANSPORT BAR (DESKTOP & TABLET) */}
      <StudioTransport
        isPlaying={transportState.isPlaying}
        isRecording={transportState.isRecording}
        isMetronomeActive={transportState.isMetronomeActive}
        isLoopActive={transportState.isLooping}
        bpm={transportState.bpm}
        timeSig={transportState.timeSig}
        keySig={transportState.keySig}
        playheadTimeSec={playheadTimeSec}
        zoomPxPerSec={zoomPxPerSec}
        gridSnap={gridSnap}
        countInMode={transportState.countInMode}
        canUndo={dawHistory.canUndo()}
        canRedo={dawHistory.canRedo()}
        autoSaveStatus={autoSaveStatus}
        projectName={project.name}
        onTogglePlay={handleTogglePlay}
        onStop={handleStop}
        onRewind={handleRewind}
        onToggleRecord={handleToggleRecord}
        onToggleMetronome={() => transport.toggleMetronome()}
        onToggleLoop={() => transport.toggleLoop()}
        onBpmChange={(b) => {
          transport.setBpm(b);
          commitProjectChange({ ...project, bpm: b }, "Change BPM", false);
        }}
        onTimeSigChange={(sig) => {
          transport.setTimeSig(sig);
          commitProjectChange({ ...project, timeSig: sig }, "Change Time Sig", false);
        }}
        onKeySigChange={(key) => {
          transport.setKeySig(key);
          commitProjectChange({ ...project, keySig: key }, "Change Key", false);
        }}
        onZoomChange={setZoomPxPerSec}
        onGridSnapChange={setGridSnap}
        onCountInChange={(c) => transport.setCountInMode(c)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenProjects={() => setIsProjectsModalOpen(true)}
        onOpenExport={() => setIsExportModalOpen(true)}
        onRenameProject={(name) => commitProjectChange({ ...project, name }, "Rename Project", false)}
      />

      {/* 2. MAIN TIMELINE WORKSPACE (Split Left Track Headers + Center Timeline Grid) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Track Headers (Scroll synchronized with timeline lanes) */}
        <div className="w-28 sm:w-48 md:w-56 lg:w-64 shrink-0 flex flex-col bg-[#0d0f17] border-r border-white/10 z-10">
          {/* Header Bar */}
          <div className="h-10 shrink-0 border-b border-white/10 px-2 sm:px-3 py-2 flex items-center justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-[#0d0f17]">
            <span className="truncate">Tracks ({project.tracks.length})</span>
            <button
              onClick={() => handleAddTrack("guitar")}
              className="p-1 hover:text-[#a3ff12] hover:bg-white/5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
              title="Add Guitar Track"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add</span>
            </button>
          </div>

          {/* Track Headers List */}
          <div
            className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none divide-y divide-white/5"
            id="track-headers-container"
            onScroll={(e) => {
              const target = document.getElementById("timeline-lanes-container");
              if (target) target.scrollTop = e.currentTarget.scrollTop;
            }}
          >
            {project.tracks.map((track) => (
              <div
                key={track.id}
                className={`${track.id === selectedTrackId ? "bg-[#141824]" : "hover:bg-[#0e121a]"}`}
              >
                <TrackHeader
                  track={track}
                  isSelected={track.id === selectedTrackId}
                  isArmed={track.id === armedTrackId}
                  onSelect={(id) => setSelectedTrackId(id)}
                  onArm={handleArmTrack}
                  onToggleMute={handleToggleMute}
                  onToggleSolo={handleToggleSolo}
                  onToggleMonitoring={() => {}}
                  onInputSourceChange={() => {}}
                  onVolumeChange={handleTrackVolumeChange}
                  onPanChange={handleTrackPanChange}
                  onRename={(id, newName) => {
                    const updated = {
                      ...project,
                      tracks: project.tracks.map((t) => (t.id === id ? { ...t, name: newName } : t)),
                    };
                    commitProjectChange(updated, "Rename Track", false);
                  }}
                  onDuplicate={() => handleAddTrack("guitar")}
                  onDelete={(id) => {
                    if (project.tracks.length <= 1) return;
                    commitProjectChange(
                      { ...project, tracks: project.tracks.filter((t) => t.id !== id) },
                      "Delete Track"
                    );
                  }}
                  onTriggerUpload={handleTriggerUpload}
                  meterPeak={trackPeaks[track.id] || 0}
                  isClipping={clippingTracks[track.id] || false}
                  onResetClipping={() => setClippingTracks((prev) => ({ ...prev, [track.id]: false }))}
                  onEqChange={handleTrackEqChange}
                  onReverbSendChange={handleTrackReverbSendChange}
                  onCompressorChange={handleTrackCompressorChange}
                  onBusChange={() => {}}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Center Timeline Workspace (Single Shared Scroll Container) */}
        <div
          className="flex-1 overflow-auto select-none relative touch-none bg-[#07090e] cursor-crosshair"
          id="timeline-main-container"
          onScroll={(e) => {
            const headers = document.getElementById("track-headers-container");
            if (headers) headers.scrollTop = e.currentTarget.scrollTop;
          }}
        >
          <div
            className="relative min-h-full"
            style={{ width: `${Math.max(800, maxProjectDurationSec * zoomPxPerSec)}px` }}
            onPointerDown={handleGridPointerDown}
            onPointerMove={handleGridPointerMove}
            onPointerUp={handleGridPointerUp}
            onPointerCancel={handleGridPointerUp}
          >
            {/* Sticky Ruler Header at Top */}
            <div className="sticky top-0 z-40 h-10 bg-[#0c0e15] border-b border-white/10 shadow-md">
              <TimelineRuler
                bpm={project.bpm}
                timeSig={project.timeSig}
                zoomPxPerSec={zoomPxPerSec}
                totalDurationSec={maxProjectDurationSec}
                playheadTimeSec={playheadTimeSec}
                onSeek={handleSeek}
                playheadLineRef={playheadLineRef}
              />
            </div>

            {/* Background Grid Lines */}
            <div className="absolute top-10 bottom-0 left-0 right-0 pointer-events-none z-0">
              {Array.from({ length: Math.ceil(maxProjectDurationSec / (60 / project.bpm)) }).map((_, beatIdx) => {
                const beatX = beatIdx * (60 / project.bpm) * zoomPxPerSec;
                const isBar = beatIdx % 4 === 0;
                return (
                  <div
                    key={`lane-grid-${beatIdx}`}
                    className={`absolute top-0 bottom-0 ${isBar ? "w-px bg-white/10" : "w-px bg-white/5"}`}
                    style={{ left: `${beatX}px` }}
                  />
                );
              })}
            </div>

            {/* Track Lanes with Clips */}
            <div className="relative divide-y divide-white/5 pt-0 z-10">
              {project.tracks.map((track) => (
                <div
                  key={track.id}
                  className={`relative h-24 sm:h-28 ${track.id === selectedTrackId ? "bg-white/[0.02]" : ""}`}
                >
                  {(track.clips || []).map((clip) => (
                    <div key={clip.id} data-clip-item="true">
                      <AudioClipView
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
                        onTrimLeft={(delta) => handleTrimLeft(clip.id, delta)}
                        onTrimRight={(delta) => handleTrimRight(clip.id, delta)}
                        onOpenInspector={(c) => {
                          setInspectingClip(c);
                          setActiveDeckTab("inspector");
                          setIsDeckExpanded(true);
                        }}
                        onSplitAtPlayhead={handleSplitAtPlayhead}
                        onDuplicate={handleDuplicateClip}
                        onDelete={handleDeleteClip}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* ONE SINGLE UNIFIED CONTINUOUS HARDWARE-ACCELERATED PLAYHEAD (Ruler Handle + Track Needle) */}
            <div
              ref={playheadLineRef}
              className="absolute top-0 bottom-0 w-[2px] bg-[#a3ff12] z-50 pointer-events-none shadow-[0_0_14px_rgba(163,255,18,0.95)] will-change-transform"
              style={{ transform: `translate3d(${(playheadTimeSec * zoomPxPerSec).toFixed(2)}px, 0, 0)` }}
            >
              {/* Neon Green Thumb Handle Pointer sitting atop the Sticky Ruler */}
              <div className="absolute top-0 -left-[7px] w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-[#a3ff12] filter drop-shadow-[0_0_6px_#a3ff12]" />
            </div>
          </div>
        </div>

          {/* Floating Zoom & Tool Controls */}
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 bg-[#12151e]/90 backdrop-blur-md border border-white/10 p-1 rounded-xl shadow-lg">
            <button
              onClick={() => setZoomPxPerSec((z) => Math.max(40, z - 20))}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-bold text-zinc-400 w-8 text-center">{zoomPxPerSec}px</span>
            <button
              onClick={() => setZoomPxPerSec((z) => Math.min(240, z + 20))}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      {/* 3. COLLAPSIBLE BOTTOM STUDIO DECK (MIXER / EFFECTS / TONE / DRUMS / LOOPER / AI) */}
      <div className={`shrink-0 bg-[#0d1017] border-t border-white/10 transition-all duration-300 flex flex-col ${isDeckExpanded ? "h-64 sm:h-72" : "h-10"}`}>
        {/* Deck Tab Bar */}
        <div className="h-10 shrink-0 flex items-center justify-between px-2 sm:px-4 border-b border-white/5 bg-[#0a0c12]">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar touch-pan-x py-1 pr-2">
            {(
              [
                { id: "mixer", label: "Mixer", icon: Sliders },
                { id: "effects", label: "FX Rack", icon: Activity },
                { id: "tone", label: "Tone Macros", icon: Sparkles },
                { id: "inspector", label: "Inspector", icon: SlidersHorizontal },
                { id: "drums", label: "Rhythm", icon: Clock },
                { id: "looper", label: "Looper", icon: RotateCcw },
                { id: "ai", label: "JOE AI", icon: Zap },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeDeckTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveDeckTab(tab.id);
                    setIsDeckExpanded(true);
                  }}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    isActive && isDeckExpanded
                      ? "bg-[#a3ff12] text-black shadow-[0_0_10px_rgba(163,255,18,0.3)]"
                      : "text-zinc-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setIsDeckExpanded(!isDeckExpanded)}
            className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            title={isDeckExpanded ? "Collapse Deck" : "Expand Deck"}
          >
            {isDeckExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        {/* Deck Content Panels */}
        {isDeckExpanded && (
          <div className="flex-1 overflow-hidden relative">
            {/* MIXER CONSOLE */}
            {activeDeckTab === "mixer" && (
              <div className="h-full overflow-x-auto p-2 sm:p-4 flex gap-2.5 sm:gap-4 items-stretch no-scrollbar touch-pan-x select-none">
                {project.tracks.map((track) => {
                  const volDb = track.volume > 0.001 ? (20 * Math.log10(track.volume)).toFixed(1) : "-∞";
                  return (
                    <div
                      key={track.id}
                      className="w-24 sm:w-32 md:w-36 shrink-0 bg-[#0e121b] border border-white/10 rounded-2xl p-2 sm:p-3 flex flex-col justify-between"
                    >
                      <div className="space-y-1.5">
                        <div
                          className="text-[11px] sm:text-xs font-bold text-white truncate text-center py-1 bg-white/5 rounded-lg px-1"
                          style={{ borderTop: `3px solid ${track.color}` }}
                        >
                          {track.name}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleToggleMute(track.id)}
                            className={`flex-1 py-1 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                              track.muted ? "bg-rose-600 text-white" : "bg-white/5 text-zinc-400 hover:text-white"
                            }`}
                          >
                            M
                          </button>
                          <button
                            onClick={() => handleToggleSolo(track.id)}
                            className={`flex-1 py-1 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                              track.soloed ? "bg-amber-400 text-black" : "bg-white/5 text-zinc-400 hover:text-white"
                            }`}
                          >
                            S
                          </button>
                        </div>
                      </div>

                      {/* Vertical Volume Slider & Meter */}
                      <div className="flex-1 flex items-center justify-center gap-2 sm:gap-3 my-1.5 min-h-[95px] sm:min-h-[110px]">
                        <input
                          type="range"
                          min="0"
                          max="1.5"
                          step="0.01"
                          value={track.volume}
                          onChange={(e) => handleTrackVolumeChange(track.id, parseFloat(e.target.value))}
                          className="h-full appearance-none bg-zinc-800 rounded-lg cursor-pointer"
                          style={{ writingMode: "vertical-lr", direction: "rtl", width: "16px" }}
                        />
                        {/* Peak Meter */}
                        <div className="w-2 sm:w-2.5 h-full bg-black/60 rounded-full overflow-hidden flex flex-col justify-end border border-white/10">
                          <div
                            className="w-full bg-[#a3ff12] transition-all duration-75"
                            style={{ height: `${Math.min(100, Math.max(0, (trackPeaks[track.id] || 0) * 100))}%` }}
                          />
                        </div>
                      </div>

                      <div className="text-center text-[9.5px] sm:text-[10px] text-zinc-400 font-bold">
                        {volDb} dB
                      </div>
                    </div>
                  );
                })}

                {/* Master Channel Strip */}
                <div className="w-24 sm:w-32 md:w-36 shrink-0 bg-black/40 border border-[#a3ff12]/30 rounded-2xl p-2 sm:p-3 flex flex-col justify-between ml-auto">
                  <div className="text-[11px] sm:text-xs font-bold text-[#a3ff12] text-center py-1 bg-[#a3ff12]/10 rounded-lg border border-[#a3ff12]/20">
                    MASTER
                  </div>

                  <div className="flex-1 flex items-center justify-center gap-2 sm:gap-3 my-1.5 min-h-[95px] sm:min-h-[110px]">
                    <div className="w-2.5 sm:w-3.5 h-full bg-black rounded-full overflow-hidden flex flex-col justify-end border border-white/20">
                      <div
                        className="w-full bg-[#a3ff12]"
                        style={{ height: `${Math.min(100, Math.max(0, inputLevel.rms * 100))}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-center text-[9.5px] sm:text-[10px] text-[#a3ff12] font-bold">
                    0.0 dB
                  </div>
                </div>
              </div>
            )}

            {/* EFFECTS RACK */}
            {activeDeckTab === "effects" && (
              <StudioEffectsRack
                track={selectedTrack}
                onEqChange={handleTrackEqChange}
                onCompressorChange={handleTrackCompressorChange}
                onReverbSendChange={handleTrackReverbSendChange}
              />
            )}

            {/* TONE MACROS */}
            {activeDeckTab === "tone" && (
              <StudioToneMacros
                macros={toneMacros}
                onChangeMacros={(newM) => setToneMacros(newM)}
                trackName={selectedTrack?.name}
                trackColor={selectedTrack?.color}
              />
            )}

            {/* CLIP INSPECTOR */}
            {activeDeckTab === "inspector" && (
              <div className="h-full overflow-y-auto p-4">
                {inspectingClip && selectedTrack ? (
                  <ClipInspector
                    clip={inspectingClip}
                    trackName={selectedTrack.name}
                    trackColor={selectedTrack.color}
                    onClose={() => setInspectingClip(null)}
                    onUpdateClip={(updated) => {
                      setInspectingClip(updated);
                      const updatedTracks = project.tracks.map((t) => ({
                        ...t,
                        clips: (t.clips || []).map((c) => (c.id === updated.id ? updated : c)),
                      }));
                      commitProjectChange({ ...project, tracks: updatedTracks }, "Update Clip", false);
                    }}
                    onSplitAtPlayhead={handleSplitAtPlayhead}
                    onDuplicateClip={handleDuplicateClip}
                    onDeleteClip={handleDeleteClip}
                    playheadTimeSec={playheadTimeSec}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
                    Select an audio clip on the timeline to inspect its gain, timing, fades, and speed.
                  </div>
                )}
              </div>
            )}

            {/* RHYTHM GROOVES */}
            {activeDeckTab === "drums" && (
              <div className="h-full overflow-y-auto p-4">
                <DrumMetronome />
              </div>
            )}

            {/* LOOPER STATION */}
            {activeDeckTab === "looper" && (
              <div className="h-full overflow-y-auto p-4">
                <LooperStation
                  onCommitToStudio={(buffer, trackName) => {
                    const newClipId = `clip-looper-${Date.now()}`;
                    const newTrk: DAWTrack = {
                      id: `trk-looper-${Date.now()}`,
                      name: `Looper: ${trackName}`,
                      color: "#f59e0b",
                      volume: 0.85,
                      pan: 0,
                      muted: false,
                      soloed: false,
                      armed: false,
                      monitoring: false,
                      clips: [
                        {
                          id: newClipId,
                          name: trackName,
                          startTime: playheadTimeSec,
                          duration: buffer.duration,
                          audioBuffer: buffer,
                          trimStart: 0,
                          gain: 1.0,
                          fadeInSec: 0.01,
                          fadeOutSec: 0.01,
                        },
                      ],
                      eq: { ...DEFAULT_TRACK_EQ },
                      insertEffects: { ...DEFAULT_TRACK_INSERT_EFFECTS },
                      busId: "master",
                    };
                    commitProjectChange(
                      { ...project, tracks: [...project.tracks, newTrk] },
                      "Commit Looper Track"
                    );
                    showToast(`Committed ${trackName} to Timeline!`);
                  }}
                />
              </div>
            )}

            {/* JOE AI PRODUCER */}
            {activeDeckTab === "ai" && (
              <StudioAIAssistant
                project={project}
                onApplyBpm={(b) => {
                  transport.setBpm(b);
                  commitProjectChange({ ...project, bpm: b }, "Apply BPM");
                }}
                onApplyKey={(k) => {
                  transport.setKeySig(k);
                  commitProjectChange({ ...project, keySig: k }, "Apply Key");
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Projects Modal */}
      {isProjectsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[85vh] flex flex-col bg-[#0b0e14] border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative">
            <button
              onClick={() => setIsProjectsModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors z-50 cursor-pointer"
            >
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
                  dawHistory.clear();
                  showToast(`Loaded "${loaded.name}"!`);
                }}
                onDeleteProject={async (pId) => {
                  await deleteProjectFromDB(pId);
                  const list = await loadProjectsFromDB(audioEngine.getContext());
                  setSavedProjects(list);
                  showToast("Project deleted.");
                }}
                onNewProject={() => {
                  const newProj: DAWProject = {
                    id: `project-${Date.now()}`,
                    name: `Guitar Session ${savedProjects.length + 1}`,
                    bpm: 120,
                    keySig: "Am",
                    timeSig: "4/4",
                    tracks: [
                      {
                        id: `trk-1-${Date.now()}`,
                        name: "Lead Guitar",
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
                      },
                      {
                        id: `trk-2-${Date.now()}`,
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
                }}
                onSaveAs={async (customName) => {
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
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Session Master & Stem Exporter */}
      <SessionExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        project={project}
      />

      {/* Confirmation Dialog */}
      <CustomConfirmDialog
        isOpen={dialog.isOpen}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        type={dialog.type}
        onConfirm={dialog.onConfirm}
        onCancel={() => setDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
