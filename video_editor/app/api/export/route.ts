import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import os from "os";

const CPU_COUNT = os.cpus().length;

// Bundle once per server process — avoids 30-90s webpack rebuild on every export
let cachedBundleLocation: string | null = null;

async function getBundleLocation(): Promise<string> {
  if (cachedBundleLocation) return cachedBundleLocation;
  const { bundle } = await import("@remotion/bundler");
  const entryPoint = path.join(process.cwd(), "remotion", "index.tsx");
  cachedBundleLocation = await bundle({
    entryPoint,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...(config.resolve?.alias ?? {}),
          "@": path.join(process.cwd()),
        },
      },
    }),
  });
  return cachedBundleLocation;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clips, textOverlays, audioTracks, fps = 30, totalFrames } = body;

    if (!totalFrames || totalFrames < 1) {
      return NextResponse.json({ error: "totalFrames is required" }, { status: 400 });
    }

    const { renderMedia, selectComposition } = await import("@remotion/renderer");

    const bundleLocation = await getBundleLocation();
    const outFile = path.join(os.tmpdir(), `remotion-export-${Date.now()}.mp4`);
    const inputProps = { clips, textOverlays, audioTracks, fps, totalFrames };

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "VideoExport",
      inputProps,
    });

    await renderMedia({
      composition: {
        ...composition,
        durationInFrames: Math.max(1, totalFrames),
        fps,
      },
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outFile,
      inputProps,
      // Use all available CPU cores for parallel frame rendering
      concurrency: Math.max(CPU_COUNT - 1, 4),
      // veryfast preset: ~3-4x faster encoding, negligible quality difference
      x264Preset: "veryfast",
      // crf 23: good quality/speed balance (default is 18, lower = slower)
      crf: 23,
    });

    const fileBuffer = fs.readFileSync(outFile);
    fs.unlinkSync(outFile);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="export-${Date.now()}.mp4"`,
        "Content-Length": String(fileBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error("[export] render failed:", err);
    // Invalidate cache if bundle is broken
    cachedBundleLocation = null;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Render failed" },
      { status: 500 }
    );
  }
}
