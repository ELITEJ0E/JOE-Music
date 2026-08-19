import React, { useState, useEffect } from "react";
import {
  FolderOpen,
  Music,
  Trash2,
  Download,
  Play,
  Pause,
  Plus,
  SlidersHorizontal,
  Clock,
} from "lucide-react";
import { loadRecordingsFromDB, deleteRecordingFromDB, loadPresetsFromDB } from "../utils/storage";
import { SavedRecording, TonePreset } from "../types";
import { DEFAULT_TONE_PRESETS } from "../data/presetsDatabase";

interface PresetsRecordingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTonePreset: (preset: TonePreset) => void;
}

export const PresetsRecordingsModal: React.FC<PresetsRecordingsModalProps> = ({
  isOpen,
  onClose,
  onSelectTonePreset,
}) => {
  const [activeTab, setActiveTab] = useState<"recordings" | "presets">("recordings");
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [presets, setPresets] = useState<TonePreset[]>(DEFAULT_TONE_PRESETS);
  const [playingRecId, setPlayingRecId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadRecordingsFromDB().then(setRecordings);
      loadPresetsFromDB().then(setPresets);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePlayRecording = (rec: SavedRecording) => {
    if (audioElement) {
      audioElement.pause();
    }

    if (playingRecId === rec.id) {
      setPlayingRecId(null);
      return;
    }

    const audio = new Audio(rec.url);
    audio.play();
    setAudioElement(audio);
    setPlayingRecId(rec.id);

    audio.onended = () => {
      setPlayingRecId(null);
    };
  };

  const handleDeleteRecording = async (id: string) => {
    if (confirm("Delete this recording from the vault?")) {
      await deleteRecordingFromDB(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      if (playingRecId === id && audioElement) {
        audioElement.pause();
        setPlayingRecId(null);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#101016] border border-[#2c2c3e] rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#20202c] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FolderOpen className="w-5 h-5 text-[#2ae500]" />
            <h3 className="font-mono font-bold text-base text-white">
              STUDIO VAULT & AUDIO TAKES
            </h3>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white font-mono text-xs px-2 py-1 bg-[#181824] rounded-lg border border-[#2a2a3c]"
          >
            ESC
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#20202c] bg-[#0c0c12] px-4 pt-2">
          <button
            onClick={() => setActiveTab("recordings")}
            className={`px-4 py-2 text-xs font-mono font-bold border-b-2 transition-all ${
              activeTab === "recordings"
                ? "border-[#2ae500] text-[#2ae500]"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            SAVED RECORDINGS ({recordings.length})
          </button>
          <button
            onClick={() => setActiveTab("presets")}
            className={`px-4 py-2 text-xs font-mono font-bold border-b-2 transition-all ${
              activeTab === "presets"
                ? "border-[#2ae500] text-[#2ae500]"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            TONE PRESETS ({presets.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {activeTab === "recordings" ? (
            recordings.length === 0 ? (
              <div className="text-center py-12 text-gray-500 font-mono text-xs">
                No recorded takes yet. Record audio in the Looper or Multi-Track DAW!
              </div>
            ) : (
              recordings.map((rec) => {
                const isPlaying = playingRecId === rec.id;

                return (
                  <div
                    key={rec.id}
                    className="p-3.5 rounded-xl bg-[#14141e] border border-[#242436] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => handlePlayRecording(rec)}
                        className={`p-2 rounded-xl transition-all ${
                          isPlaying
                            ? "bg-[#2ae500] text-black shadow-md shadow-[#2ae500]/30"
                            : "bg-[#20202e] text-white hover:bg-[#2c2c3e]"
                        }`}
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>

                      <div>
                        <div className="font-mono font-bold text-xs text-white">
                          {rec.title}
                        </div>
                        <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                          {new Date(rec.date).toLocaleDateString()} • {rec.duration.toFixed(1)}s
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <a
                        href={rec.url}
                        download={`${rec.title}.webm`}
                        className="p-2 rounded-lg bg-[#181824] text-gray-300 hover:text-[#2ae500] border border-[#28283a]"
                        title="Download Take"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>

                      <button
                        onClick={() => handleDeleteRecording(rec.id)}
                        className="p-2 rounded-lg bg-[#181824] text-gray-400 hover:text-red-400 border border-[#28283a]"
                        title="Delete Recording"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => {
                    onSelectTonePreset(preset);
                    onClose();
                  }}
                  className="p-3.5 rounded-xl bg-[#14141e] border border-[#242436] hover:border-[#2ae500] hover:bg-[#1a1a26] cursor-pointer transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-mono font-bold text-xs text-white">
                        {preset.name}
                      </h4>
                      <span className="text-[9px] font-mono bg-[#2ae500]/15 text-[#2ae500] px-1.5 py-0.5 rounded">
                        {preset.category}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-gray-400 mt-1">
                      {preset.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-[#20202c] text-[10px] font-mono text-gray-500">
                    {preset.pedals.filter((p) => p.enabled).length} Active Pedals &bull; Click to load
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
