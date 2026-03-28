import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";

function getReplicateToken(): string | undefined {
  const t = process.env.REPLICATE_API_TOKEN?.trim();
  return t || undefined;
}

/**
 * AI Video Generation API — Replicate (free credits for new accounts).
 * Returns a URL to the generated video for use as a clip src.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const trimmed = prompt.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: "Prompt cannot be empty" },
        { status: 400 }
      );
    }

    const replicateToken = getReplicateToken();
    if (replicateToken) {
      const url = await generateWithReplicate(trimmed, replicateToken);
      return NextResponse.json({ success: true, videoUrl: url });
    }

    return NextResponse.json(
      {
        error:
          "No API key configured. Add REPLICATE_API_TOKEN to .env.local (get free credits at replicate.com).",
      },
      { status: 503 }
    );
  } catch (err) {
    console.error("Video generation error:", err);
    const message =
      err instanceof Error ? err.message : "Video generation failed";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

async function generateWithReplicate(
  prompt: string,
  token: string
): Promise<string> {
  const replicate = new Replicate({ auth: token });

  // minimax/video-01 is in Replicate's "Try for Free" collection - limited free runs
  const output = await replicate.run("minimax/video-01", {
    input: { prompt },
  });

  let url: string | undefined;

  const resolveUrl = (val: unknown): string | undefined => {
    if (typeof val === "string" && (val.startsWith("http") || val.startsWith("https"))) return val;
    if (val && typeof val === "object" && typeof (val as { url?: () => unknown }).url === "function") {
      const u = (val as { url: () => unknown }).url();
      return u != null ? String(u) : undefined;
    }
    return undefined;
  };

  url = resolveUrl(output) ?? (Array.isArray(output) ? resolveUrl(output[0]) : undefined);
  if (!url && output && typeof output === "object" && !Array.isArray(output)) {
    const obj = output as Record<string, unknown>;
    const candidate = obj.video ?? obj.output ?? obj.url;
    url = resolveUrl(candidate) ?? (typeof candidate === "string" ? candidate : undefined);
  }

  if (!url || typeof url !== "string" || (!url.startsWith("http") && !url.startsWith("data:"))) {
    throw new Error("Invalid video URL from Replicate");
  }
  return url;
}
