import type { Clip } from "@/types/types";

/** Higher value = drawn on top in preview; same order = top sub-lane on timeline. */
export function clipStackPriority(c: Clip, clipArrayIndex: number): number {
  if (c.fromAI) return 10_000_000 + (c.aiStackOrder ?? 0);
  if (c.overlayClip) return 5_000_000 + (c.overlayOrder ?? 0);
  return 1_000_000 + clipArrayIndex;
}

export function clipsTimeOverlap(a: Clip, b: Clip): boolean {
  return a.start < b.start + b.duration && b.start < a.start + a.duration;
}

export type VideoStackSlot = { lane: number; lanes: number };

/**
 * For clips on the video lane, assign vertical sub-lanes when times overlap.
 * Highest stack priority gets the top sub-lane (smallest lane index).
 */
export function computeVideoClipStackLayout(
  clips: Clip[],
  audioRow: number,
  textRow: number
): Map<string, VideoStackSlot> {
  const map = new Map<string, VideoStackSlot>();
  const videoClips = clips
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.row !== audioRow && c.row !== textRow);

  const n = videoClips.length;
  if (n === 0) return map;

  const parent = Array.from({ length: n }, (_, k) => k);
  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (clipsTimeOverlap(videoClips[i].c, videoClips[j].c)) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = groups.get(r) ?? [];
    arr.push(i);
    groups.set(r, arr);
  }

  Array.from(groups.values()).forEach((indices) => {
    const sorted = [...indices].sort(
      (ia, ib) =>
        clipStackPriority(videoClips[ib].c, videoClips[ib].i) -
        clipStackPriority(videoClips[ia].c, videoClips[ia].i)
    );
    const lanes = sorted.length;
    sorted.forEach((clipIdx, lane) => {
      map.set(videoClips[clipIdx].c.id, { lane, lanes });
    });
  });

  return map;
}
