export type PreviewChunkStatus = "pending" | "ready" | "stale" | "failed";

export type TimelineSnapshotInput = {
  clips: unknown[];
  textOverlays: unknown[];
  audioTracks: unknown[];
};

export type ChangedRangeInput = {
  startFrame: number;
  endFrame: number;
};

export type PreviewChunkRecord = {
  chunkId: string;
  startFrame: number;
  endFrame: number;
  sourceHash: string;
  outputPath: string;
  outputUrl: string;
  status: PreviewChunkStatus;
  updatedAt: string;
  error?: string;
};

export type PreviewManifest = {
  projectId: string;
  timelineFingerprint: string;
  fps: number;
  totalFrames: number;
  chunkSizeFrames: number;
  generatedAt: string;
  chunks: PreviewChunkRecord[];
};
