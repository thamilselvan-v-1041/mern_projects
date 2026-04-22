import { AbsoluteFill, Sequence } from "remotion";
import type { Clip, TextOverlay, TimelineAudio } from "../types/types";
import { ClipSequenceContent } from "../components/clip-sequence-content";
import { AudioWithFades } from "../components/audio-with-fades";
import { TextOverlayLayer } from "../components/text-overlay-layer";
import { normalizeAudioTracksForComposition } from "../lib/timeline-audio-layers";

export type ExportCompositionProps = {
  clips: Clip[];
  textOverlays: TextOverlay[];
  audioTracks: TimelineAudio[];
  fps: number;
  totalFrames: number;
};

export function ExportComposition({
  clips,
  textOverlays,
  audioTracks,
}: ExportCompositionProps) {
  const normalizedVideoLayers = (() => {
    const byIdentity = new Map<
      string,
      {
        clip: Clip;
        safeStart: number;
        safeDuration: number;
        safeTrimStart: number;
        zVideo: number;
        renderKey: string;
      }
    >();
    for (const clip of clips) {
      const safeStart = Math.max(0, Math.floor(clip.start));
      const safeDuration = Math.max(1, Math.floor(clip.duration));
      const safeTrimStart = Math.max(0, Math.floor(clip.trimStart ?? 0));
      const zVideo = clip.fromAI
        ? 200 + (clip.aiStackOrder ?? 0)
        : clip.overlayClip
          ? 200 + (clip.overlayOrder ?? 0)
          : 20;
      const identityKey = `${clip.src}|${safeStart}|${safeDuration}|${safeTrimStart}|${clip.row}`;
      const candidate = { clip, safeStart, safeDuration, safeTrimStart, zVideo, renderKey: `video:${identityKey}|z:${zVideo}` };
      const existing = byIdentity.get(identityKey);
      if (!existing || candidate.clip.id.localeCompare(existing.clip.id) < 0) {
        byIdentity.set(identityKey, candidate);
      }
    }
    return Array.from(byIdentity.values()).sort((a, b) => {
      if (a.safeStart !== b.safeStart) return a.safeStart - b.safeStart;
      if (a.zVideo !== b.zVideo) return a.zVideo - b.zVideo;
      return a.clip.id.localeCompare(b.clip.id);
    });
  })();

  const normalizedAudioLayers = normalizeAudioTracksForComposition(audioTracks);
  const hasAudioLayers = normalizedAudioLayers.length > 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {normalizedVideoLayers.map((layer) => (
        <Sequence
          key={layer.renderKey}
          from={layer.safeStart}
          durationInFrames={layer.safeDuration}
        >
          <ClipSequenceContent
            clip={{ ...layer.clip, trimStart: layer.safeTrimStart }}
            zIndex={layer.zVideo}
            sequenceDurationInFrames={layer.safeDuration}
            muted={hasAudioLayers}
          />
        </Sequence>
      ))}

      {normalizedAudioLayers.map((layer) => (
        <Sequence
          key={layer.renderKey}
          from={layer.safeStart}
          durationInFrames={layer.safeDuration}
        >
          <AudioWithFades
            track={{ ...layer.track, trimStart: layer.safeTrimStart }}
            sequenceDurationInFrames={layer.safeDuration}
          />
        </Sequence>
      ))}

      {[...textOverlays]
        .sort((a, b) => a.start - b.start)
        .map((item) => (
          <Sequence
            key={item.id}
            from={item.start}
            durationInFrames={item.duration}
          >
            <AbsoluteFill style={{ zIndex: 5000, pointerEvents: "none" }}>
              <TextOverlayLayer
                text={item.text}
                animation={item.animation}
                animInFrames={item.animInFrames}
                fontSizeRem={item.fontSizeRem}
                color={item.color}
                animDirection={item.animDirection}
                fontWeight={item.fontWeight}
                posX={item.posX}
                posY={item.posY}
                widthPct={item.widthPct}
                rotationDeg={item.rotationDeg}
                shapeBackground={item.shapeBackground}
                shapeFill={item.shapeFill}
                shapeStroke={item.shapeStroke}
                shapeStrokeWidthPx={item.shapeStrokeWidthPx}
                shapePaddingRem={item.shapePaddingRem}
              />
            </AbsoluteFill>
          </Sequence>
        ))}
    </AbsoluteFill>
  );
}
