import { describe, expect, it } from 'vitest';

import { centerGrid } from '../src/utils/pixel-grid-utils';

const grid = (size: number) =>
  Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => `${r},${c}`)
  );

describe('centerGrid', () => {
  it('returns the grid unchanged when sizes match', () => {
    expect(centerGrid(grid(3), 3)).toEqual(grid(3));
  });

  it('crops a larger grid to its center', () => {
    expect(centerGrid(grid(5), 3)).toEqual([
      ['1,1', '1,2', '1,3'],
      ['2,1', '2,2', '2,3'],
      ['3,1', '3,2', '3,3'],
    ]);
  });

  it('centers a smaller grid and leaves the border empty', () => {
    const result = centerGrid(grid(3), 5);
    expect(result[2]![2]).toBe('1,1');
    expect(result[1]![1]).toBe('0,0');
    expect(result[0]).toEqual(Array(5).fill(undefined));
    expect(result[4]![4]).toBeUndefined();
  });

  it('keeps the same center pixel whatever the size difference', () => {
    for (const [from, to] of [
      [13, 9],
      [9, 13],
      [25, 5],
      [5, 25],
    ] as const) {
      const result = centerGrid(grid(from), to);
      const mid = Math.floor(to / 2);
      const sourceMid = Math.floor(from / 2);
      expect(result[mid]![mid]).toBe(`${sourceMid},${sourceMid}`);
    }
  });

  it('handles an empty grid', () => {
    expect(centerGrid([], 3).flat()).toEqual(Array(9).fill(undefined));
  });
});
