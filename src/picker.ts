import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import isDev from 'electron-is-dev';

import { RustSamplerManager, type PixelData } from './manager.js';
import {
  calculateGridSize,
  calculateBufferedGridSize,
} from './utils/grid-calculation.js';
import { adjustSquareSize, getNextDiameter } from './utils/utils.js';

const SAMPLE_RATE_HZ = 15;

const IPC = {
  colorSelected: 'color-selected',
  cancelled: 'picker-cancelled',
  zoomDiameter: 'magnifier-zoom-diameter',
  zoomDensity: 'magnifier-zoom-density',
} as const;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ColorPickerOptions {
  /**
   * Optional function to provide color names for RGB values.
   * If not provided, "Unknown" will be used for all colors.
   */
  colorNameFn?: (rgb: { r: number; g: number; b: number }) => string;

  /**
   * Initial diameter of the magnifier circle in pixels.
   * @default 180
   */
  initialDiameter?: number;

  /**
   * Initial size of each pixel square in the grid.
   * @default 20
   */
  initialSquareSize?: number;
}

export class ColorPicker {
  private magnifierWindow: BrowserWindow | null = null;
  private isActive = false;
  private samplerManager: RustSamplerManager;
  private magnifierDiameter: number;
  private squareSize: number;
  private colorNameFn: (rgb: { r: number; g: number; b: number }) => string;

  constructor(options: ColorPickerOptions = {}) {
    this.magnifierDiameter = options.initialDiameter ?? 180;
    this.squareSize = adjustSquareSize(options.initialSquareSize ?? 20, 0);
    const colorNameFn = options.colorNameFn ?? (() => 'Unknown');
    this.colorNameFn = (rgb) => {
      try {
        return colorNameFn(rgb);
      } catch (error) {
        console.error('[Hue Hunter] colorNameFn threw:', error);
        return 'Unknown';
      }
    };
    this.samplerManager = new RustSamplerManager();
  }

  /** What the renderer shows. */
  private get gridSize(): number {
    return calculateGridSize(this.magnifierDiameter, this.squareSize);
  }

  /**
   * What the sampler captures: a margin around the displayed grid, so a zoom
   * usually has pixels to show before the sampler applies the new size. Fast
   * repeated zooms can outrun it, leaving edge cells unpainted for a frame.
   */
  private get samplerGridSize(): number {
    return calculateBufferedGridSize(this.magnifierDiameter, this.squareSize);
  }

  private resize(diameter: number, squareSize: number): void {
    if (diameter === this.magnifierDiameter && squareSize === this.squareSize) {
      return;
    }
    this.magnifierDiameter = diameter;
    this.squareSize = squareSize;
    this.samplerManager.updateGridSize(this.samplerGridSize);
  }

  private getPreloadPath(): string {
    // In INTERNAL_DEV mode (developing hue-hunter itself), preload is in .vite/build/
    if (process.env.INTERNAL_DEV === 'true') {
      return join(__dirname, 'magnifier-preload.js');
    }

    if (isDev) {
      // Use process.cwd() which points to the actual project root
      const depPath = join(
        process.cwd(),
        'node_modules',
        'hue-hunter',
        '.vite',
        'renderer',
        'preload.mjs'
      );

      if (existsSync(depPath)) {
        return depPath;
      }

      // Fallback to local path (when hue-hunter is the main app)
      return join(process.cwd(), '.vite', 'renderer', 'preload.mjs');
    } else {
      // In packaged production app, files are extracted to Resources
      // via extraResource in the consuming app's forge config
      return join(process.resourcesPath, '.vite', 'renderer', 'preload.mjs');
    }
  }

  private getRendererPath(): string {
    if (isDev) {
      // Use process.cwd() which points to the actual project root
      const depPath = join(
        process.cwd(),
        'node_modules',
        'hue-hunter',
        '.vite',
        'renderer',
        'index.html'
      );

      if (existsSync(depPath)) {
        return depPath;
      }

      // Fallback to local path (when hue-hunter is the main app)
      return join(process.cwd(), '.vite', 'renderer', 'index.html');
    } else {
      // In packaged production app, files are extracted to Resources
      // via extraResource in the consuming app's forge config
      return join(process.resourcesPath, '.vite', 'renderer', 'index.html');
    }
  }

  /**
   * Launch the magnifying color picker and wait for user selection.
   * @returns The selected color as a hex string (e.g., "#FF8040"), or null if
   * cancelled or the sampler failed
   */
  async pickColor(): Promise<string | null> {
    if (this.isActive) {
      return null;
    }
    this.isActive = true;

    let currentColor: string | null = null;
    let finish: (color: string | null) => void = () => {};
    const picked = new Promise<string | null>((resolve) => (finish = resolve));

    try {
      // Start sampling before the window exists so permission dialogs
      // (macOS Screen Recording, the Wayland portal) stay clickable.
      await this.samplerManager.ensureStarted(
        this.samplerGridSize,
        SAMPLE_RATE_HZ,
        (pixelData) => {
          currentColor = pixelData.center.hex;
          this.render(pixelData);
        },
        (error) => {
          console.error('[Hue Hunter] Sampler error:', error);
          if (!this.samplerManager.isRunning()) finish(null);
        }
      );
      await this.createMagnifierWindow(() => finish(null));
      this.listenForInput((selected) => finish(selected ? currentColor : null));
      return await picked;
    } catch (error) {
      console.error('[Hue Hunter] Error:', error);
      return null;
    } finally {
      this.cleanup();
    }
  }

  private async createMagnifierWindow(onClosed: () => void): Promise<void> {
    const cursorPos = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPos);

    const preloadPath = this.getPreloadPath();

    this.magnifierWindow = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.size.width,
      height: display.size.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      show: false,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Required for ESM preload scripts
        devTools: isDev, // Only enable devtools while developing hue-hunter
        preload: preloadPath,
      },
    });

    // Set to screen-saver level
    this.magnifierWindow.setAlwaysOnTop(true, 'screen-saver');

    // Prevent this window from being captured in screen recordings/screenshots
    // macOS: Uses NSWindowSharingNone - works perfectly with CGWindowListCreateImage
    // Windows: Uses WDA_EXCLUDEFROMCAPTURE (Windows 10 2004+) - should work
    // Linux: Limited/no support depending on compositor
    this.magnifierWindow.setContentProtection(true);

    // Only use dev server when INTERNAL_DEV is set (hue-hunter itself being developed)
    if (process.env.INTERNAL_DEV === 'true') {
      await this.magnifierWindow.loadURL('http://localhost:5174/');
    } else {
      // Use loadURL with file:// protocol so relative asset paths resolve correctly
      const rendererPath = this.getRendererPath();
      const url = pathToFileURL(rendererPath).toString();
      await this.magnifierWindow.loadURL(url);
    }

    this.magnifierWindow.once('closed', onClosed);
    this.magnifierWindow.show();
  }

  private listenForInput(done: (selected: boolean) => void): void {
    ipcMain.once(IPC.colorSelected, () => done(true));
    ipcMain.once(IPC.cancelled, () => done(false));
    globalShortcut.register('Escape', () => done(false));

    ipcMain.on(IPC.zoomDiameter, (_event, delta: number) => {
      this.resize(
        getNextDiameter(this.magnifierDiameter, delta),
        this.squareSize
      );
    });
    ipcMain.on(IPC.zoomDensity, (_event, delta: number) => {
      this.resize(
        this.magnifierDiameter,
        adjustSquareSize(this.squareSize, delta)
      );
    });
  }

  private render(pixelData: PixelData): void {
    const window = this.magnifierWindow;
    if (!window || window.isDestroyed()) return;

    const bounds = window.getBounds();
    window.webContents.send('update-magnifier-position', {
      x: pixelData.cursor.x,
      y: pixelData.cursor.y,
      displayX: bounds.x,
      displayY: bounds.y,
    });
    window.webContents.send('update-pixel-grid', {
      centerColor: pixelData.center,
      colorName: this.colorNameFn(pixelData.center),
      pixels: pixelData.grid,
      diameter: this.magnifierDiameter,
      gridSize: this.gridSize,
      squareSize: this.squareSize,
    });
  }

  private cleanup(): void {
    this.isActive = false;
    void this.samplerManager.stop();

    if (this.magnifierWindow && !this.magnifierWindow.isDestroyed()) {
      this.magnifierWindow.removeAllListeners('closed');
      this.magnifierWindow.close();
    }
    this.magnifierWindow = null;

    for (const channel of Object.values(IPC)) {
      ipcMain.removeAllListeners(channel);
    }
    globalShortcut.unregister('Escape');
  }
}
