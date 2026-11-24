export const AVAILABLE_DIAMETERS = [
  120, 150, 180, 210, 240, 270, 300, 330, 360, 390, 420,
];
export const MIN_SQUARE_SIZE = 10;
export const MAX_SQUARE_SIZE = 40;

/**
 * The next listed diameter above (delta > 0) or below (delta < 0) the current one.
 * A current diameter that isn't in the list, such as a custom initialDiameter,
 * moves to its nearest listed neighbor in that direction.
 */
export function getNextDiameter(
  currentDiameter: number,
  delta: number
): number {
  const next =
    delta > 0
      ? AVAILABLE_DIAMETERS.find((d) => d > currentDiameter)
      : AVAILABLE_DIAMETERS.findLast((d) => d < currentDiameter);
  return delta === 0 ? currentDiameter : (next ?? currentDiameter);
}

/**
 * Adjust square size within bounds by a given delta.
 */
export function adjustSquareSize(
  currentSize: number,
  delta: number,
  step = 2
): number {
  return Math.max(
    MIN_SQUARE_SIZE,
    Math.min(MAX_SQUARE_SIZE, currentSize + delta * step)
  );
}
