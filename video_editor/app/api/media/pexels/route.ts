import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy Pexels photo search (server-side key).
 * @see https://www.pexels.com/api/documentation/#photos-search
 */
export async function GET(req: NextRequest) {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      {
        error:
          "PEXELS_API_KEY is not set. Add it to .env.local (pexels.com/api).",
        results: [],
      },
      { status: 501 }
    );
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() || "nature";
  const perPage = Math.min(
    40,
    Math.max(1, Number(req.nextUrl.searchParams.get("per_page") || 20))
  );

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${perPage}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: key },
    });
    const data = (await res.json().catch(() => ({}))) as {
      photos?: Array<{
        id: number;
        alt?: string;
        src?: { large2x?: string; large?: string; portrait?: string };
      }>;
      error?: string;
    };

    if (!res.ok) {
      return NextResponse.json(
        {
          error: data?.error || `Pexels error (${res.status})`,
          results: [],
        },
        { status: 502 }
      );
    }

    const raw = Array.isArray(data.photos) ? data.photos : [];
    const results = raw
      .map((p) => {
        const src =
          p.src?.large2x || p.src?.large || p.src?.portrait;
        if (!src) return null;
        return {
          id: String(p.id),
          label: (p.alt || "Photo").slice(0, 80),
          previewUrl: src,
          playbackUrl: src,
          mediaType: "image" as const,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "pexels_fetch_failed",
        results: [],
      },
      { status: 500 }
    );
  }
}
