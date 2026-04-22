"use client";

import { registerRoot, Composition } from "remotion";
import { ExportComposition, type ExportCompositionProps } from "./export-composition";

const defaultProps: ExportCompositionProps = {
  clips: [],
  textOverlays: [],
  audioTracks: [],
  fps: 30,
  totalFrames: 900,
};

registerRoot(() => (
  <Composition
    id="VideoExport"
    component={ExportComposition}
    fps={defaultProps.fps}
    width={1920}
    height={1080}
    durationInFrames={defaultProps.totalFrames}
    defaultProps={defaultProps}
  />
));
