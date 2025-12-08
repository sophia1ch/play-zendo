import type {
  Shape,
  Orientation,
  BlockOrPyramidOrientation,
  WedgeOrientation,
} from "./types";

const CYCLE: Record<Shape, Orientation[]> = {
  block: ["upright", "upside_down", "flat"] as BlockOrPyramidOrientation[],
  pyramid: ["upright", "upside_down", "flat"] as BlockOrPyramidOrientation[],
  wedge: [
    "upright",
    "upside_down",
    "cheesecake",
    "doorstop",
  ] as WedgeOrientation[],
};

export function nextOrientation(
  shape: Shape,
  current: Orientation
): Orientation {
  const arr = CYCLE[shape];
  const i = Math.max(0, arr.indexOf(current));
  return arr[(i + 1) % arr.length];
}

export const ORIENTATIONS = CYCLE;
