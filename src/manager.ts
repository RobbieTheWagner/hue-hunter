import { ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

import { app } from 'electron';
import isDev from 'electron-is-dev';

export interface PixelData {
  cursor: { x: number; y: number };
  center: { r: number; g: number; b: number; hex: string };
  grid: Array<Array<{ r: number; g: number; b: number; hex: string }>>;
  timestamp: number;
}

interface ErrorResponse {
  error: string;
}

type SamplerResponse = PixelData | ErrorResponse;

type SamplerCallback = (data: PixelData) => void;
type ErrorCallback = (error: string) => void;

const START_TIMEOUT_MS = 30_000;

export class RustSamplerManager {
  private process: ChildProcess | null = null;
  public dataCallback: SamplerCallback | null = null;
  public errorCallback: ErrorCallback | null = null;

  /**
   * @param binaryPath Path to the hue-hunter-sampler binary. Defaults to the
   * dev or packaged location described in the README.
   */
  constructor(private readonly binaryPath?: string) {}

  private getBinaryPath(): string {
    if (this.binaryPath) {
      return this.binaryPath;
    }

    const ext = process.platform === 'win32' ? '.exe' : '';
    const binaryName = `hue-hunter-sampler${ext}`;

    if (isDev) {
      // Try node_modules first (when used as a dependency)
      // Always use release binary for dependencies
      const depPath = join(
        app.getAppPath(),
        'node_modules',
        'hue-hunter',
        'rust-sampler',
        'target',
        'release',
        binaryName
      );

      if (existsSync(depPath)) {
        return depPath;
      }

      // Fallback to local path (when hue-hunter is the main app being developed)
      return join(
        app.getAppPath(),
        'rust-sampler',
        'target',
        'debug',
        binaryName
      );
    } else {
      // In production, binary is in resources
      const resourcesPath = process.resourcesPath;
      return join(resourcesPath, binaryName);
    }
  }

  async start(
    gridSize: number,
    sampleRate: number,
    onData: SamplerCallback,
    onError: ErrorCallback
  ): Promise<void> {
    if (this.process) {
      await this.stop();
    }

    this.dataCallback = onData;
    this.errorCallback = onError;

    const proc = spawn(this.getBinaryPath(), [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process = proc;

    // Writing to a sampler that already died emits EPIPE here. The exit
    // handler reports the death, so don't let the write error crash the app.
    proc.stdin.on('error', () => {});

    let buffer = '';
    proc.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        let parsed: SamplerResponse;
        try {
          parsed = JSON.parse(line) as SamplerResponse;
        } catch {
          console.error('[HueHunter] Ignoring malformed sampler output:', line);
          continue;
        }
        if ('error' in parsed) {
          this.errorCallback?.(parsed.error);
        } else {
          this.dataCallback?.(parsed);
        }
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      console.error('[HueHunter stderr]', data.toString());
    });

    proc.on('error', (error: Error) => {
      if (this.process === proc) {
        this.process = null;
      }
      this.errorCallback?.(error.message);
    });

    proc.on('exit', (code, signal) => {
      if (this.process !== proc) {
        return;
      }
      this.process = null;
      this.errorCallback?.(
        `Sampler exited unexpectedly (${signal ?? `code ${code}`})`
      );
    });

    this.sendCommand({
      command: 'start',
      grid_size: gridSize,
      sample_rate: sampleRate,
    });
  }

  /**
   * Start the sampler and resolve once the first pixel data arrives, so OS
   * permission prompts (macOS Screen Recording, the Wayland portal) appear
   * before any UI is shown. Rejects if the sampler reports an error, exits, or
   * sends nothing for 30 seconds. `onData` and `onError` stay installed after
   * the promise settles.
   */
  ensureStarted(
    gridSize: number,
    sampleRate: number,
    onData: SamplerCallback = () => {},
    onError: ErrorCallback = () => {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (error?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(new Error(error));
        else resolve();
      };
      const timeout = setTimeout(
        () => settle('Timeout waiting for sampler to start'),
        START_TIMEOUT_MS
      );

      void this.start(
        gridSize,
        sampleRate,
        (data) => {
          settle();
          onData(data);
        },
        (error) => {
          settle(error);
          onError(error);
        }
      );
    });
  }

  updateGridSize(gridSize: number): void {
    this.sendCommand({ command: 'update_grid', grid_size: gridSize });
  }

  /** Ask the sampler to exit, killing it if it hasn't after 500ms. */
  stop(): Promise<void> {
    const proc = this.process;
    this.process = null;
    this.dataCallback = null;
    this.errorCallback = null;

    const exited =
      !proc ||
      proc.pid === undefined ||
      proc.exitCode !== null ||
      proc.signalCode !== null;
    if (exited) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => proc.kill('SIGKILL'), 500);
      proc.once('exit', () => {
        clearTimeout(killTimer);
        resolve();
      });
      proc.stdin?.end(JSON.stringify({ command: 'stop' }) + '\n');
    });
  }

  private sendCommand(command: object): void {
    this.process?.stdin?.write(JSON.stringify(command) + '\n');
  }

  isRunning(): boolean {
    return this.process !== null;
  }
}
