import { NextRequest, NextResponse } from "next/server";
import {
  renderOrReusePreviewChunks,
} from "@/lib/preview-cache/storage";
import type {
  ChangedRangeInput,
  TimelineSnapshotInput,
} from "@/lib/preview-cache/model";

export const runtime = "nodejs";

type RenderPreviewRequest = {
  projectId?: unknown;
  snapshot?: unknown;
  changedRanges?: unknown;
  totalFrames?: unknown;
  fps?: unknown;
  chunkSizeFrames?: unknown;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toSnapshot(v: unknown): TimelineSnapshotInput | null {
  if (!isObject(v)) return null;
  const clips = Array.isArray(v.clips) ? v.clips : null;
  const textOverlays = Array.isArray(v.textOverlays) ? v.textOverlays : null;
  const audioTracks = Array.isArray(v.audioTracks) ? v.audioTracks : null;
  if (!clips || !textOverlays || !audioTracks) return null;
  return { clips, textOverlays, audioTracks };
}

function toRanges(v: unknown): ChangedRangeInput[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (!isObject(item)) return null;
      const startFrame = Number(item.startFrame);
      const endFrame = Number(item.endFrame);
      if (!Number.isFinite(startFrame) || !Number.isFinite(endFrame)) return null;
      return { startFrame, endFrame };
    })
    .filter((x): x is ChangedRangeInput => x !== null);
}

function toPositiveInt(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RenderPreviewRequest;
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    const snapshot = toSnapshot(body.snapshot);

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }
    if (!snapshot) {
      return NextResponse.json(
        { error: "snapshot must include clips, textOverlays, and audioTracks arrays" },
        { status: 400 }
      );
    }

    const manifest = await renderOrReusePreviewChunks({
      projectId,
      snapshot,
      changedRanges: toRanges(body.changedRanges),
      totalFrames: toPositiveInt(body.totalFrames, 1),
      fps: toPositiveInt(body.fps, 30),
      chunkSizeFrames: toPositiveInt(body.chunkSizeFrames, 60),
    });

    const readyChunkMap = Object.fromEntries(
      manifest.chunks
        .filter((chunk) => chunk.status === "ready")
        .map((chunk) => [chunk.chunkId, chunk.outputUrl])
    );

    return NextResponse.json({
      success: true,
      manifest,
      readyChunkMap,
      stats: {
        total: manifest.chunks.length,
        ready: manifest.chunks.filter((x) => x.status === "ready").length,
        failed: manifest.chunks.filter((x) => x.status === "failed").length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "preview_render_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
