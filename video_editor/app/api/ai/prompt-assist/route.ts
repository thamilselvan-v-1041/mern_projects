import { NextRequest, NextResponse } from "next/server";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

export type PromptAssistIntent = "lyrics" | "video_scene" | "text_overlay";

const SYSTEM: Record<PromptAssistIntent, string> = {
  lyrics: `You expand short music ideas into rich lyrics or a sung-ready brief for AI vocal music.
Output ONLY the lyrics or sung lines—no preamble like "Here are the lyrics".
Use [Verse], [Chorus], [Bridge] when it helps. Vivid, singable imagery; match the user's mood and genre hints if any.
Aim for roughly one full song length unless the user asked for something shorter (then stay under ~200 words).`,

  video_scene: `You turn short ideas into a detailed text-to-video prompt.
Include: main subject and action, environment, lighting, camera angle and motion (dolly, handheld, aerial, etc.), lens or focal feel, mood, and style (e.g. cinematic 35mm, anime, documentary).
Output one dense paragraph OR 3–5 numbered shot lines. No preamble, no "Certainly".`,

  text_overlay: `You turn brief ideas into tight on-video text: titles, lower-thirds, taglines, or CTAs.
Output 2–6 options separated by a single blank line. Each line is one standalone phrase (usually under 12 words).
No bullets, no markdown, no wrapping quotes.`,
};

/**
 * Groq: expand a short user idea into a detailed prompt for lyrics, video, or on-screen text.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "GROQ_API_KEY is not set. Add it to .env.local to expand prompts.",
      },
      { status: 501 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const prompt =
      typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
    const intentRaw = body.intent;
    const intent: PromptAssistIntent =
      intentRaw === "video_scene" || intentRaw === "text_overlay"
        ? intentRaw
        : "lyrics";

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const model =
      process.env.GROQ_PROMPT_MODEL?.trim() ||
      process.env.GROQ_TEXT_MODEL?.trim() ||
      "llama-3.3-70b-versatile";

    const res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.75,
        max_tokens: 2048,
        messages: [
          { role: "system", content: SYSTEM[intent] },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message || `Groq error (${res.status})` },
        { status: 502 }
      );
    }

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return NextResponse.json(
        { error: "Empty response from model" },
        { status: 502 }
      );
    }

    return NextResponse.json({ text, intent });
  } catch (err) {
    console.error("[prompt-assist]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "prompt_assist_failed" },
      { status: 500 }
    );
  }
}
