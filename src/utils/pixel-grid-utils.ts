/**
 * Fit a square grid to `size` x `size` by keeping its center. A larger grid is
 * cropped. A smaller one is centered with `undefined` around it, which happens
 * for a frame or two after a zoom while the sampler catches up.
 */
export function centerGrid<T>(grid: T[][], size: number): (T | undefined)[][] {
  const offset = Math.floor((grid.length - size) / 2);
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => grid[row + offset]?.[col + offset])
  );
}
