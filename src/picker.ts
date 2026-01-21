import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import isDev from 'electron-is-dev';

import { RustSamplerManager, type PixelData } from './manager.js';
import { calculateGridSize } from './utils/grid-calculation.js';
import { adjustSquareSize, getNextDiameter } from './utils/utils.js';

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
  private gridSize: number;
  private colorNameFn: (rgb: { r: number; g: number; b: number }) => string;

  constructor(options: ColorPickerOptions = {}) {
    this.magnifierDiameter = options.initialDiameter ?? 180;
    this.squareSize = options.initialSquareSize ?? 20;
    this.gridSize = calculateGridSize(this.magnifierDiameter, this.squareSize);
    this.colorNameFn = options.colorNameFn ?? (() => 'Unknown');
    this.samplerManager = new RustSamplerManager();
  }

  private getColorName(r: number, g: number, b: number): string {
    return this.colorNameFn({ r, g, b });
  }

  /**
   * Launch the magnifying color picker and wait for user selection.
   * @returns The selected color as a hex string (e.g., "#FF8040"), or null if cancelled
   */
  async pickColor(): Promise<string | null> {
    if (this.isActive) {
      return null;
    }

    this.isActive = true;

    try {
      // Pre-start the sampler to trigger permission dialogs BEFORE showing magnifier
      // This is critical on Wayland where the permission dialog needs to be clickable
      await this.samplerManager.ensureStarted(this.gridSize, 15);
      await this.createMagnifierWindow();
      return await this.startColorPicking();
    } catch (error) {
      console.error('[Hue Hunter] Error:', error);
      return null;
    } finally {
      this.cleanup();
    }
  }

  private async createMagnifierWindow(): Promise<void> {
    const cursorPos = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPos);

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
        devTools: isDev,
        preload: join(__dirname, 'magnifier-preload.js'),
      },
    });

    // Set to screen-saver level
    this.magnifierWindow.setAlwaysOnTop(true, 'screen-saver');

    // Prevent this window from being captured in screen recordings/screenshots
    // macOS: Uses NSWindowSharingNone - works perfectly with CGWindowListCreateImage
    // Windows: Uses WDA_EXCLUDEFROMCAPTURE (Windows 10 2004+) - should work
    // Linux: Limited/no support depending on compositor
    this.magnifierWindow.setContentProtection(true);

    if (isDev) {
      // In development, magnifier runs on port 5174
      await this.magnifierWindow.loadURL('http://localhost:5174/');
    } else {
      const magnifierPath = join(__dirname, '../renderer/index.html');
      await this.magnifierWindow.loadFile(magnifierPath);
    }

    this.magnifierWindow.show();
  }

  private startColorPicking(): Promise<string | null> {
    return new Promise((resolve) => {
      let currentColor = '#FFFFFF';
      let hasResolved = false;

      const cleanup = () => {
        // Unregister global shortcut
        globalShortcut.unregister('Escape');

        // Remove IPC listeners
        ipcMain.removeAllListeners('color-selected');
        ipcMain.removeAllListeners('picker-cancelled');
        ipcMain.removeAllListeners('magnifier-zoom-diameter');
        ipcMain.removeAllListeners('magnifier-zoom-density');

        // Remove window close handler
        if (this.magnifierWindow && !this.magnifierWindow.isDestroyed()) {
          this.magnifierWindow.removeAllListeners('closed');
        }
      };

      const resolveOnce = (result: string | null) => {
        if (!hasResolved) {
          hasResolved = true;
          cleanup();
          resolve(result);
        }
      };

      // Handle window close (Alt+F4, close button, etc.)
      if (this.magnifierWindow && !this.magnifierWindow.isDestroyed()) {
        this.magnifierWindow.once('closed', () => {
          console.log('[Hue Hunter] Window closed externally');
          resolveOnce(null);
        });
      }

      ipcMain.once('color-selected', () => resolveOnce(currentColor));
      ipcMain.once('picker-cancelled', () => resolveOnce(null));

      ipcMain.on('magnifier-zoom-diameter', (_event, delta: number) => {
        const newDiameter = getNextDiameter(this.magnifierDiameter, delta);

        if (newDiameter !== this.magnifierDiameter) {
          this.magnifierDiameter = newDiameter;
          this.gridSize = calculateGridSize(
            this.magnifierDiameter,
            this.squareSize
          );

          // Update grid size in Rust sampler
          this.samplerManager.updateGridSize(this.gridSize);
        }
      });

      ipcMain.on('magnifier-zoom-density', (_event, delta: number) => {
        const newSquareSize = adjustSquareSize(this.squareSize, delta);

        if (newSquareSize !== this.squareSize) {
          this.squareSize = newSquareSize;
          this.gridSize = calculateGridSize(
            this.magnifierDiameter,
            this.squareSize
          );

          // Update grid size in Rust sampler
          this.samplerManager.updateGridSize(this.gridSize);
        }
      });

      globalShortcut.register('Escape', () => resolveOnce(null));

      // Set up data callback for the sampler
      const dataCallback = (pixelData: PixelData) => {
        // Update current color
        currentColor = pixelData.center.hex;

        // Get color name
        const colorName = this.getColorName(
          pixelData.center.r,
          pixelData.center.g,
          pixelData.center.b
        );

        // Update magnifier position
        this.updateMagnifierPosition(pixelData.cursor);

        // Send pixel grid to renderer
        if (this.magnifierWindow && !this.magnifierWindow.isDestroyed()) {
          this.magnifierWindow.webContents.send('update-pixel-grid', {
            centerColor: pixelData.center,
            colorName,
            pixels: pixelData.grid,
            diameter: this.magnifierDiameter,
            gridSize: this.gridSize,
            squareSize: this.squareSize,
          });
        }
      };

      const errorCallback = (error: string) => {
        console.error('[Hue Hunter] Sampler error:', error);
        // Continue even on errors - they might be transient
      };

      // Start the Rust sampler if not already running
      // (it may already be running from ensureStarted)
      if (!this.samplerManager.isRunning()) {
        console.log('[Hue Hunter] Starting sampler (not yet running)');
        this.samplerManager
          .start(
            this.gridSize,
            15, // 15 Hz sample rate (realistic for screen capture)
            dataCallback,
            errorCallback
          )
          .catch((error: unknown) => {
            console.error('[Hue Hunter] Failed to start sampler:', error);
          });
      } else {
        console.log(
          '[Hue Hunter] Sampler already running from ensureStarted, updating callbacks'
        );
        // Replace callbacks since ensureStarted used temporary ones
        this.samplerManager.dataCallback = dataCallback;
        this.samplerManager.errorCallback = errorCallback;
      }
    });
  }

  private updateMagnifierPosition(cursor: { x: number; y: number }): void {
    if (!this.magnifierWindow || this.magnifierWindow.isDestroyed()) return;

    const windowBounds = this.magnifierWindow.getBounds();

    this.magnifierWindow.webContents.send('update-magnifier-position', {
      x: cursor.x,
      y: cursor.y,
      displayX: windowBounds.x,
      displayY: windowBounds.y,
    });
  }

  private cleanup(): void {
    this.isActive = false;

    // Stop the Rust sampler
    void this.samplerManager.stop();

    if (this.magnifierWindow && !this.magnifierWindow.isDestroyed()) {
      this.magnifierWindow.close();
      this.magnifierWindow = null;
    }

    ipcMain.removeAllListeners('magnifier-ready');
    ipcMain.removeAllListeners('color-selected');
    ipcMain.removeAllListeners('picker-cancelled');
    ipcMain.removeAllListeners('magnifier-zoom-diameter');
    ipcMain.removeAllListeners('magnifier-zoom-density');

    globalShortcut.unregister('Escape');
  }
}
