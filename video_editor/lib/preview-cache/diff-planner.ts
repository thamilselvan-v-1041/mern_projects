import type { Clip, TextOverlay, TimelineAudio } from "@/types/types";

export type PreviewTimelineSnapshot = {
  clips: Clip[];
  textOverlays: TextOverlay[];
  audioTracks: TimelineAudio[];
};

export type FrameRange = {
  start: number;
  end: number;
};

export type DiffChunkPlan = {
  chunkSizeFrames: number;
  totalDurationFrames: number;
  invalidatedChunkIndexes: number[];
  invalidatedRanges: FrameRange[];
  changedRanges: FrameRange[];
};

type TimelineLayer = Clip | TextOverlay | TimelineAudio;

function toSafeInt(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function normalizeRange(start: number, end: number): FrameRange {
  const safeStart = toSafeInt(start);
  const safeEnd = Math.max(safeStart, toSafeInt(end));
  return { start: safeStart, end: safeEnd };
}

function layerToRange(layer: TimelineLayer): FrameRange {
  const start = toSafeInt(layer.start);
  const duration = Math.max(1, toSafeInt(layer.duration, 1));
  return { start, end: start + duration };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableSerialize(val)}`)
    .join(",")}}`;
}

function getLayerHash(layer: TimelineLayer): string {
  return stableSerialize(layer);
}

function toLayerMap(layers: TimelineLayer[]): Map<string, TimelineLayer> {
  const map = new Map<string, TimelineLayer>();
  for (const layer of layers) {
    map.set(layer.id, layer);
  }
  return map;
}

function mergeRanges(ranges: FrameRange[]): FrameRange[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: FrameRange[] = [normalizeRange(sorted[0].start, sorted[0].end)];

  for (let i = 1; i < sorted.length; i++) {
    const current = normalizeRange(sorted[i].start, sorted[i].end);
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
      continue;
    }
    merged.push(current);
  }

  return merged;
}

function collectChangedRanges(
  previousLayers: TimelineLayer[],
  nextLayers: TimelineLayer[]
): FrameRange[] {
  const previousById = toLayerMap(previousLayers);
  const nextById = toLayerMap(nextLayers);
  const allIds = new Set<string>([
    ...Array.from(previousById.keys()),
    ...Array.from(nextById.keys()),
  ]);

  const changed: FrameRange[] = [];

  for (const id of allIds) {
    const before = previousById.get(id);
    const after = nextById.get(id);

    if (!before && after) {
      changed.push(layerToRange(after));
      continue;
    }

    if (before && !after) {
      changed.push(layerToRange(before));
      continue;
    }

    if (!before || !after) continue;

    if (getLayerHash(before) === getLayerHash(after)) continue;

    const beforeRange = layerToRange(before);
    const afterRange = layerToRange(after);
    changed.push({
      start: Math.min(beforeRange.start, afterRange.start),
      end: Math.max(beforeRange.end, afterRange.end),
    });
  }

  return mergeRanges(changed);
}

function inferDurationFrames(
  previous: PreviewTimelineSnapshot,
  next: PreviewTimelineSnapshot
): number {
  const allLayers = [
    ...previous.clips,
    ...previous.textOverlays,
    ...previous.audioTracks,
    ...next.clips,
    ...next.textOverlays,
    ...next.audioTracks,
  ];

  return allLayers.reduce((maxEnd, layer) => {
    const range = layerToRange(layer);
    return Math.max(maxEnd, range.end);
  }, 0);
}

function expandRanges(ranges: FrameRange[], paddingFrames: number): FrameRange[] {
  if (paddingFrames <= 0) return ranges;
  return ranges.map((range) =>
    normalizeRange(range.start - paddingFrames, range.end + paddingFrames)
  );
}

function rangesToChunkIndexes(
  ranges: FrameRange[],
  chunkSizeFrames: number,
  totalDurationFrames: number
): number[] {
  if (ranges.length === 0 || totalDurationFrames <= 0) return [];

  const maxChunkIndex = Math.max(0, Math.ceil(totalDurationFrames / chunkSizeFrames) - 1);
  const indexes = new Set<number>();

  for (const range of ranges) {
    const start = Math.min(Math.max(0, range.start), totalDurationFrames);
    const endExclusive = Math.min(Math.max(start, range.end), totalDurationFrames);
    if (endExclusive <= start) continue;

    const firstChunk = Math.floor(start / chunkSizeFrames);
    const lastChunk = Math.floor((endExclusive - 1) / chunkSizeFrames);
    for (let i = firstChunk; i <= Math.min(lastChunk, maxChunkIndex); i++) {
      indexes.add(i);
    }
  }

  return [...indexes].sort((a, b) => a - b);
}

function chunkIndexesToRanges(
  chunkIndexes: number[],
  chunkSizeFrames: number,
  totalDurationFrames: number
): FrameRange[] {
  return chunkIndexes.map((chunkIndex) => {
    const start = chunkIndex * chunkSizeFrames;
    const end = Math.min(totalDurationFrames, start + chunkSizeFrames);
    return { start, end };
  });
}

export function planInvalidatedChunksFromTimelineDiff(input: {
  previous: PreviewTimelineSnapshot;
  next: PreviewTimelineSnapshot;
  chunkSizeFrames: number;
  totalDurationFrames?: number;
  paddingFrames?: number;
}): DiffChunkPlan {
  const chunkSizeFrames = Math.max(1, toSafeInt(input.chunkSizeFrames, 1));
  const totalDurationFrames = Math.max(
    0,
    toSafeInt(
      input.totalDurationFrames ?? inferDurationFrames(input.previous, input.next)
    )
  );
  const paddingFrames = Math.max(0, toSafeInt(input.paddingFrames ?? 0, 0));

  const changedRanges = collectChangedRanges(
    [...input.previous.clips, ...input.previous.textOverlays, ...input.previous.audioTracks],
    [...input.next.clips, ...input.next.textOverlays, ...input.next.audioTracks]
  );

  const expandedChangedRanges = mergeRanges(expandRanges(changedRanges, paddingFrames));
  const invalidatedChunkIndexes = rangesToChunkIndexes(
    expandedChangedRanges,
    chunkSizeFrames,
    totalDurationFrames
  );
  const invalidatedRanges = chunkIndexesToRanges(
    invalidatedChunkIndexes,
    chunkSizeFrames,
    totalDurationFrames
  );

  return {
    chunkSizeFrames,
    totalDurationFrames,
    invalidatedChunkIndexes,
    invalidatedRanges,
    changedRanges: expandedChangedRanges,
  };
}
