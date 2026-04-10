import { NextRequest, NextResponse } from "next/server";
import { readManifest } from "@/lib/preview-cache/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim() ?? "";
  if (!projectId) {
    return NextResponse.json({ error: "projectId query param is required" }, { status: 400 });
  }

  try {
    const manifest = await readManifest(projectId);
    if (!manifest) {
      return NextResponse.json(
        { error: "manifest_not_found", projectId, chunks: [] },
        { status: 404 }
      );
    }

    return NextResponse.json({
      projectId,
      manifest,
      readyChunkMap: Object.fromEntries(
        manifest.chunks
          .filter((chunk) => chunk.status === "ready")
          .map((chunk) => [chunk.chunkId, chunk.outputUrl])
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "manifest_fetch_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
