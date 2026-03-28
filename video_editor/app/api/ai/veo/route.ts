import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];

function deepFindHttpUrl(obj: unknown, depth = 0): string | null {
  if (depth > 30) return null;
  if (typeof obj === "string") {
    if (obj.startsWith("https://") || obj.startsWith("http://")) return obj;
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  for (const v of Object.values(obj)) {
    const u = deepFindHttpUrl(v, depth + 1);
    if (u) return u;
  }
  return null;
}

/**
 * Google Veo video generation on Vertex AI (predictLongRunning + poll).
 * Set GOOGLE_CLOUD_PROJECT, GOOGLE_APPLICATION_CREDENTIALS_JSON (full service account JSON),
 * optional GOOGLE_CLOUD_LOCATION (default us-central1), VEO_MODEL_ID (default veo-2.0-generate-001).
 *
 * Output is often a GCS URI; browsers cannot play gs:// URLs without signing. If the API returns
 * an https MP4 URL, we pass it through. Otherwise we return gcsUri + a clear message.
 */
export async function POST(req: NextRequest) {
  try {
    const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
    const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
    if (!project || !credJson) {
      return NextResponse.json(
        {
          error:
            "Vertex Veo requires GOOGLE_CLOUD_PROJECT and GOOGLE_APPLICATION_CREDENTIALS_JSON (service account JSON) in .env.local. Enable Vertex AI and billing on the project.",
          docs:
            "https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation",
        },
        { status: 503 }
      );
    }

    const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || "us-central1";
    const model =
      process.env.VEO_MODEL_ID?.trim() || "veo-2.0-generate-001";

    const body = await req.json().catch(() => ({}));
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(credJson) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON" },
        { status: 400 }
      );
    }

    const auth = new GoogleAuth({
      credentials,
      projectId: project,
      scopes: SCOPES,
    });
    const client = await auth.getClient();
    const access = await client.getAccessToken();
    const token = access.token;
    if (!token) {
      return NextResponse.json(
        { error: "Could not obtain Google access token" },
        { status: 500 }
      );
    }

    const host = `${location}-aiplatform.googleapis.com`;
    const predictUrl = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:predictLongRunning`;

    const durationSeconds = Math.min(
      8,
      Math.max(4, Number(body.durationSeconds) || 8)
    );

    const predictBody = {
      instances: [{ prompt }],
      parameters: {
        aspectRatio: "16:9",
        durationSeconds,
        sampleCount: 1,
      },
    };

    const pr = await fetch(predictUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(predictBody),
    });

    const prJson = (await pr.json().catch(() => ({}))) as { name?: string; error?: { message?: string } };
    if (!pr.ok) {
      return NextResponse.json(
        {
          error:
            prJson?.error?.message ||
            `Veo predictLongRunning failed (${pr.status})`,
        },
        { status: 502 }
      );
    }

    const opName = prJson.name;
    if (!opName) {
      return NextResponse.json(
        { error: "No operation name returned from Veo" },
        { status: 502 }
      );
    }

    const opPath = opName.startsWith("https://")
      ? opName.replace(/^https:\/\/[^/]+\//, "")
      : opName;

    const pollUrl = `https://${host}/v1/${opPath}`;
    const maxPoll = Number(process.env.VEO_POLL_ATTEMPTS || 60);
    const pollMs = Number(process.env.VEO_POLL_INTERVAL_MS || 5000);

    let donePayload: unknown = null;
    for (let i = 0; i < maxPoll; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, pollMs));
      const or = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const oj = (await or.json().catch(() => ({}))) as {
        done?: boolean;
        error?: { message?: string };
        response?: unknown;
      };
      if (oj.error) {
        return NextResponse.json(
          { error: oj.error.message || "Veo operation error" },
          { status: 502 }
        );
      }
      if (oj.done) {
        donePayload = oj.response ?? oj;
        break;
      }
    }

    if (!donePayload) {
      return NextResponse.json(
        { error: "Veo operation timed out (still running). Try again later." },
        { status: 504 }
      );
    }

    const httpUrl = deepFindHttpUrl(donePayload);
    if (httpUrl) {
      return NextResponse.json({
        videoUrl: httpUrl,
        provider: "vertex-veo",
        model,
      });
    }

    const gcsMatch = JSON.stringify(donePayload).match(/gs:\/\/[^"'\s]+/);
    const gcsUri = gcsMatch ? gcsMatch[0] : null;

    return NextResponse.json(
      {
        error:
          "Veo finished but no HTTPS video URL was found. Output may be in Cloud Storage only.",
        gcsUri,
        hint:
          "Serve the object via a signed URL, public bucket, or download pipeline; Remotion Player needs an http(s) URL.",
        raw: process.env.VEO_DEBUG === "1" ? donePayload : undefined,
      },
      { status: 422 }
    );
  } catch (err) {
    console.error("[veo]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "veo_failed" },
      { status: 500 }
    );
  }
}
