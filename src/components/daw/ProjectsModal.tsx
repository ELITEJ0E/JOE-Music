import React, { useState } from "react";
import { X, FolderOpen, Plus, Trash2, Calendar, Clock, Music } from "lucide-react";
import { DAWProject } from "../../types";

interface ProjectsModalProps {
  currentProject: DAWProject;
  savedProjects: DAWProject[];
  onClose: () => void;
  onSelectProject: (proj: DAWProject) => void;
  onDeleteProject: (projId: string) => void;
  onNewProject: () => void;
  onSaveAs: (name: string) => void;
  inline?: boolean;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({
  currentProject,
  savedProjects,
  onClose,
  onSelectProject,
  onDeleteProject,
  onNewProject,
  onSaveAs,
  inline,
}) => {
  const [saveAsName, setSaveAsName] = useState<string>(currentProject.name);

  if (inline) {
    return (
      <div id="daw-projects-inline" className="w-full h-full flex items-center justify-center p-8 bg-[#0b0e14]">
        <div className="bg-[#10131b] border border-white/15 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-6 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-[#a3ff12]" />
              <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                Studio Project Library
              </h3>
            </div>
          </div>
          {/* Main Body */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="space-y-2">
              <h4 className="text-xs font-mono font-bold text-zinc-500 uppercase">Save Current Project</h4>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:border-[#a3ff12] outline-none"
                  placeholder="Project Name..."
                />
                <button
                  onClick={() => onSaveAs(saveAsName)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer"
                >
                  Save As
                </button>
              </div>
            </div>
            <div className="pt-2 border-t border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono font-bold text-zinc-500 uppercase">Load Saved Projects</h4>
                <button
                  onClick={onNewProject}
                  className="px-3 py-1.5 bg-[#a3ff12]/15 hover:bg-[#a3ff12]/25 text-[#a3ff12] border border-[#a3ff12]/30 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Project</span>
                </button>
              </div>
              <div className="space-y-2">
                {savedProjects.length === 0 ? (
                  <div className="text-center py-6 text-zinc-500 text-xs font-mono">No saved projects found.</div>
                ) : (
                  savedProjects.map((p) => {
                    const isCurrent = p.id === currentProject.id;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                          isCurrent
                            ? "bg-[#a3ff12]/5 border-[#a3ff12]/30"
                            : "bg-black/20 border-white/5 hover:border-white/15"
                        }`}
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <h4 className="text-sm font-bold text-white font-mono truncate">
                            {p.name}
                            {isCurrent && <span className="ml-2 text-[10px] text-[#a3ff12] uppercase border border-[#a3ff12]/30 px-1.5 rounded bg-[#a3ff12]/10">Active</span>}
                          </h4>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500 font-mono">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.bpm} BPM</span>
                            <span className="flex items-center gap-1"><Music className="w-3 h-3" />{p.keySig}</span>
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(p.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => onSelectProject(p)}
                            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold font-mono transition-colors cursor-pointer"
                          >
                            Load
                          </button>
                          <button
                            onClick={() => onDeleteProject(p.id)}
                            className="p-1.5 rounded-lg text-rose-500/70 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Delete Project"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id="daw-projects-modal"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#10131b] border border-white/15 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-[#a3ff12]" />
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
              Studio Project Library
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Save Current Session */}
        <div className="bg-[#161a24] border border-white/10 rounded-xl p-3 shrink-0">
          <label className="block text-[11px] font-mono text-zinc-400 mb-1">
            Save Current Project As:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              className="flex-1 bg-black/40 border border-white/15 focus:border-[#a3ff12] text-xs font-mono text-white px-3 py-1.5 rounded-xl outline-none"
            />
            <button
              onClick={() => {
                if (saveAsName.trim()) {
                  onSaveAs(saveAsName.trim());
                  onClose();
                }
              }}
              className="px-4 py-1.5 bg-[#a3ff12] text-black text-xs font-mono font-bold rounded-xl hover:bg-[#b5ff38] transition-colors"
            >
              Save
            </button>
          </div>
        </div>

        {/* Existing Projects List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <span>Saved Projects ({savedProjects.length})</span>
            <button
              onClick={onNewProject}
              className="text-[#a3ff12] hover:underline flex items-center gap-1 font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Blank Session</span>
            </button>
          </div>

          {savedProjects.length === 0 ? (
            <div className="text-center py-8 text-xs font-mono text-zinc-500">
              No saved projects yet. Changes autosave automatically.
            </div>
          ) : (
            savedProjects.map((p) => {
              const isCurrent = p.id === currentProject.id;
              const trackCount = p.tracks.length;
              const clipCount = p.tracks.reduce((sum, t) => sum + (t.clips?.length || (t.audioBuffer ? 1 : 0)), 0);

              return (
                <div
                  key={p.id}
                  onClick={() => onSelectProject(p)}
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    isCurrent
                      ? "bg-[#181f2f] border-[#a3ff12]/50 shadow-[0_0_15px_rgba(163,255,18,0.15)]"
                      : "bg-[#131620] border-white/10 hover:border-white/30"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-bold text-white truncate">{p.name}</span>
                      {isCurrent && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-[#a3ff12]/20 text-[#a3ff12] font-bold">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Music className="w-3 h-3 text-[#38bdf8]" />
                        {trackCount} Tracks ({clipCount} Clips)
                      </span>
                      <span>•</span>
                      <span>{p.bpm} BPM ({p.keySig})</span>
                      <span>•</span>
                      <span>{new Date(p.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProject(p.id);
                      }}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete Project"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-white/10 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-mono text-zinc-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
