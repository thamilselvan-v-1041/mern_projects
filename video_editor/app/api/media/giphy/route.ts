import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy Giphy search so the API key stays server-side.
 * @see https://developers.giphy.com/docs/api/endpoint#search
 */
export async function GET(req: NextRequest) {
  const key = process.env.GIPHY_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      {
        error:
          "GIPHY_API_KEY is not set. Add it to .env.local (developers.giphy.com).",
        results: [],
      },
      { status: 501 }
    );
  }

  const qRaw = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(
    50,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 24))
  );
  const offset = Math.max(
    0,
    Number(req.nextUrl.searchParams.get("offset") || 0)
  );

  const url = !qRaw.length
    ? `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(key)}&limit=${limit}&offset=${offset}`
    : `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(qRaw)}&limit=${limit}&offset=${offset}`;

  try {
    const res = await fetch(url);
    const data = (await res.json().catch(() => ({}))) as {
      data?: Array<{
        id: string;
        title?: string;
        username?: string;
        user?: { username?: string; display_name?: string };
        images?: {
          fixed_height_small?: { url?: string; mp4?: string };
          downsized_medium?: { url?: string };
          original?: { mp4?: string; url?: string };
        };
      }>;
      meta?: { msg?: string };
      pagination?: {
        total_count?: number;
        count?: number;
        offset?: number;
      };
    };

    if (!res.ok) {
      return NextResponse.json(
        {
          error: data?.meta?.msg || `Giphy error (${res.status})`,
          results: [],
        },
        { status: 502 }
      );
    }

    const raw = Array.isArray(data.data) ? data.data : [];
    const results = raw
      .map((g) => {
        const im = g.images;
        const mp4 =
          im?.original?.mp4 ||
          (im as { fixed_height?: { mp4?: string } })?.fixed_height?.mp4 ||
          im?.fixed_height_small?.mp4;
        const preview =
          im?.fixed_height_small?.url ||
          im?.downsized_medium?.url ||
          im?.original?.url;
        const playback = mp4 || preview;
        if (!playback) return null;
        const author = (
          g.user?.display_name ||
          g.user?.username ||
          g.username ||
          ""
        )
          .trim()
          .slice(0, 80);
        return {
          id: g.id,
          label: (g.title || "GIF").slice(0, 80),
          author,
          previewUrl: preview || playback,
          playbackUrl: playback,
          mediaType: mp4 ? ("video" as const) : ("image" as const),
        };
      })
      .filter(Boolean);

    const totalCount = Number(data?.pagination?.total_count ?? 0);
    const hasMore =
      Number.isFinite(totalCount) && totalCount > 0
        ? offset + raw.length < totalCount
        : raw.length >= limit;

    return NextResponse.json({ results, hasMore });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "giphy_fetch_failed",
        results: [],
      },
      { status: 500 }
    );
  }
}
