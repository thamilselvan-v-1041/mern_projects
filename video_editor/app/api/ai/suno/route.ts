import { NextRequest, NextResponse } from "next/server";

/** Record-info track shape: sunoapi.org uses sunoData[].audioUrl (see docs). */
type SunoTrack = {
  audioUrl?: string;
  audio_url?: string;
  streamAudioUrl?: string;
  stream_audio_url?: string;
  duration?: number;
};

function tracksFromRecordInfo(response: unknown): SunoTrack[] | undefined {
  if (!response || typeof response !== "object") return undefined;
  const r = response as Record<string, unknown>;
  if (Array.isArray(r.sunoData)) return r.sunoData as SunoTrack[];
  if (Array.isArray(r.data)) return r.data as SunoTrack[];
  return undefined;
}

function pickAudioUrl(t: SunoTrack | undefined): string | undefined {
  if (!t) return undefined;
  const u =
    t.audioUrl ||
    t.audio_url ||
    t.streamAudioUrl ||
    t.stream_audio_url;
  return typeof u === "string" && u.trim() ? u.trim() : undefined;
}

/**
 * Suno-style music generation via sunoapi.org (third-party API; not affiliated with Suno Inc).
 * Supports simple mode (prompt only) and custom mode (style, title, lyrics, vocalGender).
 */
export async function POST(req: NextRequest) {
  try {
    const key = process.env.SUNO_API_KEY?.trim();
    if (!key) {
      return NextResponse.json(
        {
          error:
            "SUNO_API_KEY is not set. Get a key from your Suno API provider (e.g. sunoapi.org) and add it to .env.local.",
        },
        { status: 503 }
      );
    }

    const base = (process.env.SUNO_API_BASE || "https://api.sunoapi.org").replace(
      /\/$/,
      ""
    );
    const body = await req.json().catch(() => ({}));
    const model = typeof body.model === "string" ? body.model : "V4_5ALL";
    const callBackUrl =
      process.env.SUNO_CALLBACK_URL?.trim() || "https://example.com/suno-callback";

    const customMode = Boolean(body.customMode);
    const instrumental =
      body.instrumental === undefined ? true : Boolean(body.instrumental);

    const payload: Record<string, unknown> = {
      customMode,
      instrumental,
      model,
      callBackUrl,
    };

    if (customMode) {
      const style = typeof body.style === "string" ? body.style.trim() : "";
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

      if (!style || !title) {
        return NextResponse.json(
          {
            error:
              "Custom mode requires style (music type) and title. Add more detail or switch to Simple mode.",
          },
          { status: 400 }
        );
      }
      if (!instrumental && !prompt) {
        return NextResponse.json(
          {
            error:
              "With vocals on, provide lyrics or a line to sing (prompt field) in custom mode.",
          },
          { status: 400 }
        );
      }

      payload.style = style.slice(0, 1000);
      payload.title = title.slice(0, 100);
      if (!instrumental) {
        payload.prompt = prompt.slice(0, 5000);
      }

      const vg = body.vocalGender;
      if (vg === "m" || vg === "f") {
        payload.vocalGender = vg;
      }
      if (typeof body.negativeTags === "string" && body.negativeTags.trim()) {
        payload.negativeTags = body.negativeTags.trim().slice(0, 500);
      }
    } else {
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) {
        return NextResponse.json({ error: "prompt is required" }, { status: 400 });
      }
      payload.prompt = prompt.slice(0, 500);
      const vgSimple = body.vocalGender;
      if (vgSimple === "m" || vgSimple === "f") {
        payload.vocalGender = vgSimple;
      }
    }

    const genRes = await fetch(`${base}/api/v1/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const genJson = (await genRes.json().catch(() => ({}))) as {
      data?: { taskId?: string };
      msg?: string;
      code?: number;
    };

    const taskId = genJson?.data?.taskId;
    if (!taskId) {
      return NextResponse.json(
        {
          error:
            genJson?.msg ||
            `Suno generate failed (${genRes.status}). Check SUNO_API_BASE and key.`,
        },
        { status: 502 }
      );
    }

    const maxAttempts = Number(process.env.SUNO_POLL_ATTEMPTS || 45);
    const delayMs = Number(process.env.SUNO_POLL_INTERVAL_MS || 3000);

    for (let i = 0; i < maxAttempts; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, delayMs));

      const stRes = await fetch(
        `${base}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
        { headers: { Authorization: `Bearer ${key}` } }
      );
      const stJson = (await stRes.json().catch(() => ({}))) as {
        data?: {
          status?: string;
          response?: unknown;
          errorMessage?: string;
        };
      };

      const status = stJson?.data?.status;
      const tracks = tracksFromRecordInfo(stJson?.data?.response);
      let first: SunoTrack | undefined;
      let audioUrl: string | undefined;
      if (Array.isArray(tracks)) {
        for (const t of tracks) {
          const u = pickAudioUrl(t);
          if (u) {
            first = t;
            audioUrl = u;
            break;
          }
        }
      }

      // Docs: FIRST_SUCCESS = first track ready; SUCCESS = all done. Both may include sunoData.
      const readyWithAudio =
        (status === "SUCCESS" || status === "FIRST_SUCCESS") && audioUrl;

      if (readyWithAudio) {
        const durationSec =
          typeof first?.duration === "number" ? first.duration : undefined;
        return NextResponse.json({
          audioUrl,
          durationSec,
          taskId,
        });
      }

      // All tracks done but payload missing URL — fail. FIRST_SUCCESS without URL: keep polling.
      if (status === "SUCCESS" && !audioUrl) {
        const hint =
          stJson?.data?.errorMessage ||
          "No audio in sunoData/data; provider may have changed response shape.";
        return NextResponse.json(
          { error: `Suno returned no playable URL. ${hint}` },
          { status: 502 }
        );
      }

      if (
        status === "FAILED" ||
        status === "FAILURE" ||
        status === "ERROR" ||
        status === "CREATE_TASK_FAILED" ||
        status === "GENERATE_AUDIO_FAILED" ||
        status === "CALLBACK_EXCEPTION" ||
        status === "SENSITIVE_WORD_ERROR"
      ) {
        const detail = stJson?.data?.errorMessage || status;
        return NextResponse.json(
          { error: `Suno generation failed: ${detail}` },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      { error: "Suno generation timed out while polling. Try again later." },
      { status: 504 }
    );
  } catch (err) {
    console.error("[suno]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "suno_failed" },
      { status: 500 }
    );
  }
}
