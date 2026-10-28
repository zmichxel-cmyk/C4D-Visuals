import type { ControllerType } from "./layouts";

// Where the watermark logo's CENTER sits on each controller, as a percentage
// of the controller frame's height from the top (horizontally it's always
// centered). Defaults are each default body skin's measured vertical center
// (bounding box of its opaque pixels: C4D.1 49.9, C4D.1 Edge 49.9, C4D.4 50,
// C4D.5 48.9, C4D.5 Edge 50.4), then moved up 9 points so the logo sits above
// the controller's middle. Raise a number to move the logo down, lower it to
// move it up. Used by both the live preview and the OBS export.
export const WATERMARK_CENTER_Y: Record<ControllerType, number> = {
  c4d1: 40.9,
  "c4d1-edge": 40.9,
  c4d4: 41,
  c4d5: 39.9,
  "c4d5-edge": 41.4,
};

// The logo sits at 53.8% of the watermark video's own height (it isn't
// perfectly centered in the 1920x852 frame), so shift the video up by that
// much to put the logo itself on the target point.
export const WATERMARK_LOGO_CENTER_IN_VIDEO = 53.8;

export function watermarkCenterY(type: ControllerType): number {
  return WATERMARK_CENTER_Y[type] ?? 50;
}
