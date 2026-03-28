import type { Clip, TextOverlay, TimelineAudio } from "@/types/types";

const STORAGE_KEY = "video-editor-projects-v1";

export type StoredVideoProject = {
  id: string;
  name: string;
  updatedAt: string;
  clips: Clip[];
  textOverlays: TextOverlay[];
  audioTracks: TimelineAudio[];
};

export function loadAllProjects(): StoredVideoProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as StoredVideoProject[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveAllProjects(projects: StoredVideoProject[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function upsertStoredProject(project: StoredVideoProject): void {
  const all = loadAllProjects();
  const i = all.findIndex((p) => p.id === project.id);
  if (i >= 0) all[i] = project;
  else all.push(project);
  saveAllProjects(all);
}

export function deleteStoredProject(id: string): void {
  saveAllProjects(loadAllProjects().filter((p) => p.id !== id));
}

/** Create a persisted empty project and return its id (for opening `/editor` in a new tab). */
export function createEmptyProjectInStorage(): string {
  const id = `proj-${Date.now()}`;
  upsertStoredProject({
    id,
    name: "Untitled video",
    updatedAt: new Date().toISOString(),
    clips: [],
    textOverlays: [],
    audioTracks: [],
  });
  return id;
}

export function getStoredProjectById(
  id: string
): StoredVideoProject | undefined {
  return loadAllProjects().find((p) => p.id === id);
}
