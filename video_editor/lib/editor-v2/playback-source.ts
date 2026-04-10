export type V2PlaybackSourceKind = "direct-url" | "none";

export type V2PlaybackSource = {
  kind: V2PlaybackSourceKind;
  url: string | null;
  reason: string;
};

type ResolveSourceParams = {
  explicitSource: string | null;
};

const HTTP_URL_REGEX = /^https?:\/\//i;

export function resolveV2PlaybackSource({
  explicitSource,
}: ResolveSourceParams): V2PlaybackSource {
  const source = explicitSource?.trim();

  if (!source) {
    return {
      kind: "none",
      url: null,
      reason: "No source URL found in query parameter `src`.",
    };
  }

  if (!HTTP_URL_REGEX.test(source)) {
    return {
      kind: "none",
      url: null,
      reason:
        "Unsupported source URL. Use an absolute http(s) media URL in `src`.",
    };
  }

  return {
    kind: "direct-url",
    url: source,
    reason: "Loaded direct media URL from route query.",
  };
}
