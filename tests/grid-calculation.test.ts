import { describe, expect, it } from 'vitest';

import {
  calculateActualSquareSize,
  calculateBufferedGridSize,
  calculateGridSize,
} from '../src/utils/grid-calculation';

describe('grid-calculation', () => {
  describe('calculateGridSize', () => {
    it('should calculate correct grid size for exact divisions', () => {
      expect(calculateGridSize(180, 20)).toBe(9); // 180/20 = 9
      expect(calculateGridSize(210, 30)).toBe(7); // 210/30 = 7
      expect(calculateGridSize(150, 30)).toBe(5); // 150/30 = 5
    });

    it('should return odd number when result is even', () => {
      expect(calculateGridSize(200, 20)).toBe(11); // 200/20 = 10 → 11 (round up)
      expect(calculateGridSize(240, 20)).toBe(13); // 240/20 = 12 → 13 (round up)
      expect(calculateGridSize(160, 20)).toBe(9); // 160/20 = 8 → 9 (round up)
    });

    it('should always return odd numbers', () => {
      const testCases = [
        { diameter: 120, squareSize: 10 },
        { diameter: 180, squareSize: 15 },
        { diameter: 420, squareSize: 25 },
        { diameter: 300, squareSize: 18 },
      ];

      testCases.forEach(({ diameter, squareSize }) => {
        const result = calculateGridSize(diameter, squareSize);
        expect(result % 2).toBe(1);
      });
    });

    it('should handle all standard diameter/square size combinations', () => {
      // Test some common combinations
      expect(calculateGridSize(120, 10)).toBe(13); // 120/10 = 12 → 13 (round up)
      expect(calculateGridSize(120, 20)).toBe(7); // 120/20 = 6 → 7 (round up)
      expect(calculateGridSize(120, 40)).toBe(3); // 120/40 = 3

      expect(calculateGridSize(180, 10)).toBe(19); // 180/10 = 18 → 19 (round up)
      expect(calculateGridSize(180, 20)).toBe(9); // 180/20 = 9
      expect(calculateGridSize(180, 40)).toBe(5); // 180/40 = 4.5 → 5 (round + up)

      expect(calculateGridSize(420, 10)).toBe(43); // 420/10 = 42 → 43 (round up)
      expect(calculateGridSize(420, 20)).toBe(21); // 420/20 = 21
      expect(calculateGridSize(420, 40)).toBe(11); // 420/40 = 10.5 → 11 (round + up)
    });

    it('should handle minimum grid size of 3', () => {
      // Very large squares relative to diameter
      expect(calculateGridSize(100, 50)).toBe(3); // 100/50 = 2 → 3 (round up to odd)
      expect(calculateGridSize(120, 60)).toBe(3); // 120/60 = 2 → 3 (round up to odd)
    });
  });

  describe('calculateBufferedGridSize', () => {
    it('should add buffer of 2 squares in each direction by default', () => {
      // Base: 180 / 20 = 9
      // Buffered: 9 + 2*2 = 13
      expect(calculateBufferedGridSize(180, 20)).toBe(13);
    });

    it('should add custom buffer when specified', () => {
      // Base: 180 / 20 = 9
      // Buffered with buffer=3: 9 + 3*2 = 15
      expect(calculateBufferedGridSize(180, 20, 3)).toBe(15);

      // Buffered with buffer=1: 9 + 1*2 = 11
      expect(calculateBufferedGridSize(180, 20, 1)).toBe(11);
    });

    it('should ensure result is always odd', () => {
      // Base: 200 / 20 = 10 → 11 (made odd)
      // Buffered: 11 + 2*2 = 15 (odd)
      expect(calculateBufferedGridSize(200, 20)).toBe(15);

      // Base: 160 / 20 = 8 → 9 (made odd)
      // Buffered: 9 + 2*2 = 13 (odd)
      expect(calculateBufferedGridSize(160, 20)).toBe(13);
    });

    it('should handle small grids correctly', () => {
      // Base: 60 / 20 = 3
      // Buffered: 3 + 2*2 = 7
      expect(calculateBufferedGridSize(60, 20)).toBe(7);
    });

    it('buffer of 0 equals base grid size', () => {
      const diameter = 180;
      const squareSize = 20;
      expect(calculateBufferedGridSize(diameter, squareSize, 0)).toBe(
        calculateGridSize(diameter, squareSize)
      );
    });

    it('should always return odd numbers', () => {
      const testCases = [
        { diameter: 120, squareSize: 10, buffer: 2 },
        { diameter: 180, squareSize: 15, buffer: 3 },
        { diameter: 420, squareSize: 25, buffer: 1 },
        { diameter: 300, squareSize: 18, buffer: 2 },
      ];

      testCases.forEach(({ diameter, squareSize, buffer }) => {
        const result = calculateBufferedGridSize(diameter, squareSize, buffer);
        expect(result % 2).toBe(1);
      });
    });

    it('should be greater than base grid size when buffer > 0', () => {
      const diameter = 180;
      const squareSize = 20;
      const baseSize = calculateGridSize(diameter, squareSize);
      const bufferedSize = calculateBufferedGridSize(diameter, squareSize);

      expect(bufferedSize).toBeGreaterThan(baseSize);
      expect(bufferedSize - baseSize).toBe(4); // buffer of 2 in each direction
    });
  });

  describe('calculateActualSquareSize', () => {
    it('should divide diameter evenly by grid size', () => {
      expect(calculateActualSquareSize(180, 9)).toBe(20);
      expect(calculateActualSquareSize(210, 7)).toBe(30);
      expect(calculateActualSquareSize(420, 21)).toBe(20);
    });

    it('should handle non-exact divisions with decimals', () => {
      // 182px circle with 9 squares = 20.222...px per square
      expect(calculateActualSquareSize(182, 9)).toBeCloseTo(20.222, 2);

      // 420px circle with 19 squares = 22.105...px per square
      expect(calculateActualSquareSize(420, 19)).toBeCloseTo(22.105, 2);
    });

    it('should always fill the circle exactly', () => {
      const testCases = [
        { diameter: 120, gridSize: 5 },
        { diameter: 180, gridSize: 9 },
        { diameter: 420, gridSize: 21 },
        { diameter: 300, gridSize: 15 },
      ];

      testCases.forEach(({ diameter, gridSize }) => {
        const squareSize = calculateActualSquareSize(diameter, gridSize);
        // Grid of squares should exactly equal diameter
        expect(squareSize * gridSize).toBeCloseTo(diameter, 5);
      });
    });
  });

  describe('integration: diameter changes', () => {
    it('should increase grid size when diameter increases (keeping square size constant)', () => {
      const squareSize = 20;

      // Start with 180px diameter
      const grid1 = calculateGridSize(180, squareSize);
      expect(grid1).toBe(9); // 180/20 = 9

      // Increase to 210px
      const grid2 = calculateGridSize(210, squareSize);
      expect(grid2).toBe(11); // 210/20 = 10.5 → 11 (round + up)

      // Increase to 240px
      const grid3 = calculateGridSize(240, squareSize);
      expect(grid3).toBe(13); // 240/20 = 12 → 13 (round up)
    });

    it('should maintain buffer gap when diameter changes', () => {
      const squareSize = 20;

      // At 180px
      const base1 = calculateGridSize(180, squareSize);
      const buffered1 = calculateBufferedGridSize(180, squareSize);
      expect(buffered1 - base1).toBe(4);

      // At 210px
      const base2 = calculateGridSize(210, squareSize);
      const buffered2 = calculateBufferedGridSize(210, squareSize);
      expect(buffered2 - base2).toBe(4);
    });
  });

  describe('integration: square size changes', () => {
    it('should change grid size when square size changes (keeping diameter constant)', () => {
      const diameter = 180;

      // Start with 20px squares
      const grid1 = calculateGridSize(diameter, 20);
      expect(grid1).toBe(9); // 180/20 = 9

      // Reduce to 15px squares (more squares should fit)
      const grid2 = calculateGridSize(diameter, 15);
      expect(grid2).toBe(13); // 180/15 = 12 → 13 (round up to odd)

      // Increase to 30px squares (fewer squares fit)
      const grid3 = calculateGridSize(diameter, 30);
      expect(grid3).toBe(7); // 180/30 = 6 → 7 (round up to odd)
    });

    it('should maintain buffer gap when square size changes', () => {
      const diameter = 180;

      // At 20px squares
      const base1 = calculateGridSize(diameter, 20);
      const buffered1 = calculateBufferedGridSize(diameter, 20);
      expect(buffered1 - base1).toBe(4);

      // At 15px squares
      const base2 = calculateGridSize(diameter, 15);
      const buffered2 = calculateBufferedGridSize(diameter, 15);
      expect(buffered2 - base2).toBe(4);
    });
  });
});
