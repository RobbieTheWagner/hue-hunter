import { describe, expect, it } from 'vitest';

import {
  adjustSquareSize,
  getNextDiameter,
  MAX_SQUARE_SIZE,
  MIN_SQUARE_SIZE,
} from '../src/utils/utils';

describe('getNextDiameter', () => {
  it('steps one size up or down through the list', () => {
    expect(getNextDiameter(180, 1)).toBe(210);
    expect(getNextDiameter(180, -1)).toBe(150);
  });

  it('stays put at either end of the list', () => {
    expect(getNextDiameter(420, 1)).toBe(420);
    expect(getNextDiameter(120, -1)).toBe(120);
  });

  it('moves to the neighboring size from a diameter that is not in the list', () => {
    expect(getNextDiameter(200, 1)).toBe(210);
    expect(getNextDiameter(200, -1)).toBe(180);
  });

  it('keeps a custom diameter outside the list range when zooming further out of range', () => {
    expect(getNextDiameter(500, 1)).toBe(500);
    expect(getNextDiameter(500, -1)).toBe(420);
    expect(getNextDiameter(100, -1)).toBe(100);
    expect(getNextDiameter(100, 1)).toBe(120);
  });
});

describe('adjustSquareSize', () => {
  it('steps by 2px per scroll notch', () => {
    expect(adjustSquareSize(20, 1)).toBe(22);
    expect(adjustSquareSize(20, -1)).toBe(18);
  });

  it('clamps to the allowed range', () => {
    expect(adjustSquareSize(MAX_SQUARE_SIZE, 1)).toBe(MAX_SQUARE_SIZE);
    expect(adjustSquareSize(MIN_SQUARE_SIZE, -1)).toBe(MIN_SQUARE_SIZE);
  });
});
