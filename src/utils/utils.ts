export const AVAILABLE_DIAMETERS = [
  120, 150, 180, 210, 240, 270, 300, 330, 360, 390, 420,
];
export const MIN_SQUARE_SIZE = 10;
export const MAX_SQUARE_SIZE = 40;

/**
 * Get the next diameter in the available diameters list.
 * Returns the current diameter if already at the boundary.
 */
export function getNextDiameter(
  currentDiameter: number,
  delta: number
): number {
  const currentIndex = AVAILABLE_DIAMETERS.indexOf(currentDiameter);
  const newIndex = Math.max(
    0,
    Math.min(AVAILABLE_DIAMETERS.length - 1, currentIndex + delta)
  );

  return AVAILABLE_DIAMETERS[newIndex]!;
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
