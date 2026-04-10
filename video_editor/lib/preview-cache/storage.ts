import path from "node:path";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import type {
  ChangedRangeInput,
  PreviewChunkRecord,
  PreviewManifest,
  TimelineSnapshotInput,
} from "./model";

const CACHE_PUBLIC_ROOT = path.join(process.cwd(), "public", "preview-cache");
const MANIFEST_FILE_NAME = "manifest.json";
const PROJECT_TMP_PREFIX = "tmp-";
const DEFAULT_KEEP_RECENT_MANIFESTS = 3;
const DEFAULT_PROJECT_MAX_BYTES = 512 * 1024 * 1024;
const PREVIEW_SOURCE_HASH_VERSION = "preview-source-v2";

function toSafeProjectId(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120) || "project";
}

function clampFrame(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function normalizeRange(range: ChangedRangeInput): ChangedRangeInput | null {
  const startFrame = clampFrame(range.startFrame);
  const endFrame = clampFrame(range.endFrame);
  if (endFrame <= startFrame) return null;
  return { startFrame, endFrame };
}

export function hashTimelineSnapshot(snapshot: TimelineSnapshotInput): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function chunkIntersectsRange(
  chunkStart: number,
  chunkEnd: number,
  range: ChangedRangeInput
): boolean {
  return chunkStart < range.endFrame && range.startFrame < chunkEnd;
}

function getChunkId(startFrame: number, endFrame: number): string {
  return `${startFrame}-${endFrame}`;
}

function buildChunkFilename(chunkId: string, sourceHash: string): string {
  return `${chunkId}-${sourceHash.slice(0, 12)}.json`;
}

function getSingleClipSrc(snapshot: TimelineSnapshotInput): string | null {
  if (!Array.isArray(snapshot.clips) || snapshot.clips.length !== 1) return null;
  const clip = snapshot.clips[0] as { src?: unknown } | null;
  if (!clip || typeof clip !== "object") return null;
  if (typeof clip.src !== "string" || !clip.src.trim()) return null;
  return clip.src;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function getProjectCacheDir(projectId: string): string {
  return path.join(CACHE_PUBLIC_ROOT, toSafeProjectId(projectId));
}

function getManifestPath(projectId: string): string {
  return path.join(getProjectCacheDir(projectId), MANIFEST_FILE_NAME);
}

export async function readManifest(projectId: string): Promise<PreviewManifest | null> {
  const manifestPath = getManifestPath(projectId);
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    return JSON.parse(raw) as PreviewManifest;
  } catch {
    return null;
  }
}

export type CleanupOptions = {
  keepRecentManifests?: number;
  maxBytes?: number;
};

export type CacheEntryStats = {
  fingerprint: string;
  directoryPath: string;
  manifestPath: string;
  bytes: number;
  updatedAtMs: number;
};

async function writeChunkOutput(chunk: PreviewChunkRecord): Promise<void> {
  const payload = {
    chunkId: chunk.chunkId,
    startFrame: chunk.startFrame,
    endFrame: chunk.endFrame,
    sourceHash: chunk.sourceHash,
    generatedAt: chunk.updatedAt,
    note: "Preview chunk placeholder output. Replace with MP4 render output later.",
  };
  await fs.writeFile(chunk.outputPath, JSON.stringify(payload, null, 2), "utf-8");
}

async function statPath(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.isFile()) return stat.size;
    if (!stat.isDirectory()) return 0;

    const children = await fs.readdir(filePath, { withFileTypes: true });
    const sizes = await Promise.all(
      children.map((child) => statPath(path.join(filePath, child.name)))
    );
    return sizes.reduce((sum, value) => sum + value, 0);
  } catch {
    return 0;
  }
}

async function removePath(targetPath: string): Promise<void> {
  await fs.rm(targetPath, { recursive: true, force: true });
}

export async function listProjectCacheEntries(
  projectId: string
): Promise<CacheEntryStats[]> {
  const projectDir = getProjectCacheDir(projectId);
  try {
    const children = await fs.readdir(projectDir, { withFileTypes: true });
    const cacheFiles = children.filter(
      (item) =>
        item.isFile() &&
        item.name !== MANIFEST_FILE_NAME &&
        !item.name.startsWith(PROJECT_TMP_PREFIX)
    );

    const entries = await Promise.all(
      cacheFiles.map(async (item): Promise<CacheEntryStats | null> => {
        const filePath = path.join(projectDir, item.name);
        try {
          const fileStat = await fs.stat(filePath);
          return {
            fingerprint: item.name,
            directoryPath: filePath,
            manifestPath: getManifestPath(projectId),
            bytes: fileStat.size,
            updatedAtMs: fileStat.mtimeMs,
          };
        } catch {
          return null;
        }
      })
    );

    return entries
      .filter((entry): entry is CacheEntryStats => entry !== null)
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  } catch {
    return [];
  }
}

export async function cleanupProjectCache(
  projectId: string,
  options?: CleanupOptions
): Promise<{ removedFingerprints: string[]; bytesFreed: number }> {
  const keepRecent = Math.max(
    options?.keepRecentManifests ?? DEFAULT_KEEP_RECENT_MANIFESTS,
    0
  );
  const maxBytes = Math.max(options?.maxBytes ?? DEFAULT_PROJECT_MAX_BYTES, 0);
  const entries = await listProjectCacheEntries(projectId);

  let runningBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  let bytesFreed = 0;
  const removedFingerprints: string[] = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const shouldDropByRecency = i >= keepRecent;
    const shouldDropByQuota = runningBytes > maxBytes;
    if (!shouldDropByRecency && !shouldDropByQuota) continue;

    await removePath(entry.directoryPath);
    runningBytes -= entry.bytes;
    bytesFreed += entry.bytes;
    removedFingerprints.push(entry.fingerprint);
  }

  await cleanupProjectTempDirs(projectId);
  return { removedFingerprints, bytesFreed };
}

export async function deleteProjectCache(projectId: string): Promise<void> {
  await removePath(getProjectCacheDir(projectId));
}

export async function cleanupProjectTempDirs(projectId: string): Promise<void> {
  const projectDir = getProjectCacheDir(projectId);
  try {
    const children = await fs.readdir(projectDir, { withFileTypes: true });
    const tmpFiles = children.filter(
      (item) => item.name.startsWith(PROJECT_TMP_PREFIX)
    );
    await Promise.all(
      tmpFiles.map((tmpFile) => removePath(path.join(projectDir, tmpFile.name)))
    );
  } catch {
    // Ignore if project directory does not exist.
  }
}

export async function renderOrReusePreviewChunks(params: {
  projectId: string;
  snapshot: TimelineSnapshotInput;
  changedRanges: ChangedRangeInput[];
  totalFrames: number;
  fps: number;
  chunkSizeFrames: number;
}): Promise<PreviewManifest> {
  const projectId = params.projectId;
  const totalFrames = Math.max(1, clampFrame(params.totalFrames));
  const fps = Math.max(1, clampFrame(params.fps));
  const chunkSizeFrames = Math.max(1, clampFrame(params.chunkSizeFrames));
  const normalizedRanges = params.changedRanges
    .map(normalizeRange)
    .filter((x): x is ChangedRangeInput => x !== null);

  const timelineFingerprint = hashTimelineSnapshot(params.snapshot);
  const singleClipSrc = getSingleClipSrc(params.snapshot);
  const projectDir = getProjectCacheDir(projectId);
  await ensureDir(projectDir);

  const previous = await readManifest(projectId);
  const previousByChunkId = new Map<string, PreviewChunkRecord>();
  if (previous?.chunks) {
    previous.chunks.forEach((chunk) => {
      previousByChunkId.set(chunk.chunkId, chunk);
    });
  }

  const chunks: PreviewChunkRecord[] = [];
  const now = new Date().toISOString();

  if (singleClipSrc) {
    const sourceHash = createHash("sha256")
      .update(`${PREVIEW_SOURCE_HASH_VERSION}:${timelineFingerprint}:single-clip`)
      .digest("hex");
    chunks.push({
      chunkId: getChunkId(0, totalFrames),
      startFrame: 0,
      endFrame: totalFrames,
      sourceHash,
      outputPath: "",
      outputUrl: singleClipSrc,
      status: "ready",
      updatedAt: now,
    });
  } else {
    for (let startFrame = 0; startFrame < totalFrames; startFrame += chunkSizeFrames) {
    const endFrame = Math.min(totalFrames, startFrame + chunkSizeFrames);
    const chunkId = getChunkId(startFrame, endFrame);
    const perChunkSourceHash = createHash("sha256")
      .update(`${PREVIEW_SOURCE_HASH_VERSION}:${timelineFingerprint}:${chunkId}`)
      .digest("hex");

    const invalidated = normalizedRanges.some((range) =>
      chunkIntersectsRange(startFrame, endFrame, range)
    );

    const prevChunk = previousByChunkId.get(chunkId);
    const canReuse =
      !invalidated &&
      prevChunk?.status === "ready" &&
      prevChunk.sourceHash === perChunkSourceHash;

    if (canReuse) {
      chunks.push(prevChunk);
      continue;
    }

    const filename = buildChunkFilename(chunkId, perChunkSourceHash);
    const outputPath = path.join(projectDir, filename);
    const outputUrl = `/preview-cache/${toSafeProjectId(projectId)}/${filename}`;
    const nextChunk: PreviewChunkRecord = {
      chunkId,
      startFrame,
      endFrame,
      sourceHash: perChunkSourceHash,
      outputPath,
      outputUrl: "",
      status: "failed",
      updatedAt: now,
      error: "preview_renderer_not_implemented_for_multi_layer",
    };

    chunks.push(nextChunk);
  }
  }

  const manifest: PreviewManifest = {
    projectId,
    timelineFingerprint,
    fps,
    totalFrames,
    chunkSizeFrames,
    generatedAt: now,
    chunks,
  };

  await fs.writeFile(getManifestPath(projectId), JSON.stringify(manifest, null, 2), "utf-8");
  await cleanupProjectCache(projectId);
  return manifest;
}
