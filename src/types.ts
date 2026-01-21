// Type definitions for the magnifier API

export interface ColorData {
  hex: string;
  r: number;
  g: number;
  b: number;
}

export interface PositionData {
  x: number;
  y: number;
  displayX: number;
  displayY: number;
}

export interface PixelGridData {
  centerColor: ColorData;
  colorName: string;
  pixels: Array<Array<ColorData>>;
  diameter: number;
  gridSize: number;
  squareSize: number;
}

export interface MagnifierAPI {
  send: {
    ready: () => void;
    colorSelected: () => void;
    cancelled: () => void;
    zoomDiameter: (delta: number) => void;
    zoomDensity: (delta: number) => void;
  };
  on: {
    updatePosition: (callback: (data: PositionData) => void) => unknown;
    updatePixelGrid: (callback: (data: PixelGridData) => void) => unknown;
  };
}
