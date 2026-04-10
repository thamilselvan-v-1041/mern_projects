import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy Pexels video search (server-side key).
 * Filters to items that have a playable MP4 and are 12-30 seconds.
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
      { status: 501 },
    );
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() || "trending";
  const perPage = Math.min(
    40,
    Math.max(1, Number(req.nextUrl.searchParams.get("per_page") || 24)),
  );
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1));

  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: key },
    });
    const data = (await res.json().catch(() => ({}))) as {
      videos?: Array<{
        id: number;
        duration?: number;
        url?: string;
        image?: string;
        tags?: Array<{ title?: string }>;
        user?: { name?: string; id?: number; url?: string };
        video_files?: Array<{
          link?: string;
          width?: number;
          height?: number;
          quality?: string;
        }>;
      }>;
      error?: string;
    };

    if (!res.ok) {
      return NextResponse.json(
        {
          error: data?.error || `Pexels error (${res.status})`,
          results: [],
        },
        { status: 502 },
      );
    }

    const raw = Array.isArray(data.videos) ? data.videos : [];
    const results = raw
      .map((v) => {
        const durationSec = Number(v.duration || 0);
        if (!Number.isFinite(durationSec) || durationSec < 12 || durationSec > 30) {
          return null;
        }
        const candidates = Array.isArray(v.video_files) ? v.video_files : [];
        const mp4 = candidates
          .filter((f) => (f.link || "").toLowerCase().includes(".mp4"))
          .sort((a, b) => {
            const ar = (a.width || 0) * (a.height || 0);
            const br = (b.width || 0) * (b.height || 0);
            return br - ar;
          })[0];
        if (!mp4?.link) return null;
        const tagTitle = v.tags?.find((t) => t.title?.trim())?.title?.trim();
        const label = (tagTitle || `Video ${v.id}`).slice(0, 80);
        const author = (v.user?.name || "").trim().slice(0, 80);
        return {
          id: String(v.id),
          label,
          author,
          previewUrl: v.image || mp4.link,
          playbackUrl: mp4.link,
          durationSec,
          aspectW: Math.max(1, mp4.width || 16),
          aspectH: Math.max(1, mp4.height || 9),
        };
      })
      .filter(Boolean);

    const hasMore = raw.length >= perPage;
    return NextResponse.json({ results, page, hasMore });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "pexels_video_fetch_failed",
        results: [],
      },
      { status: 500 },
    );
  }
}
