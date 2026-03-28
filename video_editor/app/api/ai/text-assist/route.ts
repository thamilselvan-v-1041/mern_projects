import { NextRequest, NextResponse } from "next/server";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Short AI copy for titles, captions, and on-screen text via Groq (OpenAI-compatible API).
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "GROQ_API_KEY is not set. Add it to .env.local (console.groq.com) to enable AI text generation.",
      },
      { status: 501 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const prompt =
      typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const model =
      process.env.GROQ_TEXT_MODEL?.trim() || "llama-3.3-70b-versatile";

    const res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "You help with short on-video text: titles, lower-thirds, captions, and marketing lines. Reply with only the suggested text or a few tight variants separated by blank lines—no markdown, no quotes unless part of the copy.",
          },
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
        {
          error:
            data?.error?.message ||
            `Groq error (${res.status})`,
        },
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

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[text-assist]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "text_assist_failed" },
      { status: 500 }
    );
  }
}
