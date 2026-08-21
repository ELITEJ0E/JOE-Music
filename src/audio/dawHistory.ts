import { DAWProject, DAWTrack, AudioClip } from "../types";

export interface HistoryEntry {
  project: DAWProject;
  description: string;
  timestamp: number;
}

/**
 * Deep clones a DAWProject while safely preserving AudioBuffer and Blob instances.
 */
export function cloneDAWProject(project: DAWProject): DAWProject {
  return {
    ...project,
    tracks: project.tracks.map((t) => ({
      ...t,
      clips: (t.clips || []).map((c) => ({
        ...c,
        waveformPeaks: c.waveformPeaks ? [...c.waveformPeaks] : undefined,
      })),
      waveformPeaks: t.waveformPeaks ? [...t.waveformPeaks] : undefined,
    })),
  };
}

class DAWHistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxDepth: number = 50;

  public pushState(project: DAWProject, description: string = "Edit") {
    // Avoid storing duplicate consecutive identical states
    this.undoStack.push({
      project: cloneDAWProject(project),
      description,
      timestamp: Date.now(),
    });

    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }

    // New action invalidates redo stack
    this.redoStack = [];
  }

  public undo(currentProject: DAWProject): { project: DAWProject; description: string } | null {
    if (this.undoStack.length === 0) return null;

    const previousEntry = this.undoStack.pop()!;
    // Push current to redo stack
    this.redoStack.push({
      project: cloneDAWProject(currentProject),
      description: previousEntry.description,
      timestamp: Date.now(),
    });

    return {
      project: cloneDAWProject(previousEntry.project),
      description: previousEntry.description,
    };
  }

  public redo(currentProject: DAWProject): { project: DAWProject; description: string } | null {
    if (this.redoStack.length === 0) return null;

    const nextEntry = this.redoStack.pop()!;
    // Push current to undo stack
    this.undoStack.push({
      project: cloneDAWProject(currentProject),
      description: nextEntry.description,
      timestamp: Date.now(),
    });

    return {
      project: cloneDAWProject(nextEntry.project),
      description: nextEntry.description,
    };
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getUndoDescription(): string | null {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1].description : null;
  }

  public getRedoDescription(): string | null {
    return this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1].description : null;
  }

  public clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}

export const dawHistory = new DAWHistoryManager();
