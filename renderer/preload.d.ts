export declare const magnifierAPI: {
    readonly send: {
        readonly ready: () => void;
        readonly colorSelected: () => void;
        readonly cancelled: () => void;
        readonly zoomDiameter: (delta: number) => void;
        readonly zoomDensity: (delta: number) => void;
    };
    readonly on: {
        readonly updatePosition: (callback: (data: {
            x: number;
            y: number;
            displayX: number;
            displayY: number;
        }) => void) => (_event: unknown, data: {
            x: number;
            y: number;
            displayX: number;
            displayY: number;
        }) => void;
        readonly updatePixelGrid: (callback: (data: {
            centerColor: {
                hex: string;
                r: number;
                g: number;
                b: number;
            };
            colorName: string;
            pixels: Array<Array<{
                hex: string;
                r: number;
                g: number;
                b: number;
            }>>;
            diameter: number;
            gridSize: number;
            squareSize: number;
        }) => void) => (_event: unknown, data: {
            centerColor: {
                hex: string;
                r: number;
                g: number;
                b: number;
            };
            colorName: string;
            pixels: Array<Array<{
                hex: string;
                r: number;
                g: number;
                b: number;
            }>>;
            diameter: number;
            gridSize: number;
            squareSize: number;
        }) => void;
    };
};
//# sourceMappingURL=preload.d.ts.map