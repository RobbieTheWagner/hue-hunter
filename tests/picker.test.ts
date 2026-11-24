import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => {
  const sent: Array<{ channel: string; payload: unknown }> = [];
  return { sent, appPath: '', ipcMain: null as unknown as EventEmitter };
});

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  electron.ipcMain = new EventEmitter();
  class BrowserWindow extends EventEmitter {
    destroyed = false;
    webContents = {
      send: (channel: string, payload: unknown) =>
        electron.sent.push({ channel, payload }),
    };
    getBounds = () => ({ x: 0, y: 0, width: 800, height: 600 });
    setAlwaysOnTop() {}
    setContentProtection() {}
    loadURL = async () => {};
    show() {}
    isDestroyed = () => this.destroyed;
    close() {
      this.destroyed = true;
      this.emit('closed');
    }
  }
  return {
    app: { getAppPath: () => electron.appPath },
    BrowserWindow,
    ipcMain: electron.ipcMain,
    globalShortcut: { register() {}, unregister() {} },
    screen: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => ({
        bounds: { x: 0, y: 0 },
        size: { width: 800, height: 600 },
      }),
    },
  };
});
vi.mock('electron-is-dev', () => ({ default: true }));

const { ColorPicker } = await import('../src/picker');

// The manager looks for the dev binary under the app path; point it at the fake.
electron.appPath = mkdtempSync(join(tmpdir(), 'hue-hunter-picker-'));
mkdirSync(join(electron.appPath, 'rust-sampler/target/debug'), {
  recursive: true,
});
symlinkSync(
  fileURLToPath(new URL('./fixtures/fake-sampler.mjs', import.meta.url)),
  join(electron.appPath, 'rust-sampler/target/debug/hue-hunter-sampler')
);

const gridUpdates = () =>
  electron.sent.filter((m) => m.channel === 'update-pixel-grid');

const until = (check: () => boolean) =>
  vi.waitFor(() => expect(check()).toBe(true), { timeout: 2000 });

afterEach(() => {
  electron.sent.length = 0;
  vi.restoreAllMocks();
  delete process.env.FAKE_SAMPLER_MODE;
});

describe.skipIf(process.platform === 'win32')('ColorPicker', () => {
  it('returns the sampled color when the user clicks', async () => {
    const pick = new ColorPicker().pickColor();
    await until(() => gridUpdates().length >= 2);

    electron.ipcMain.emit('color-selected');
    await expect(pick).resolves.toBe('#010203');
  });

  it('keeps rendering with an Unknown name when colorNameFn throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pick = new ColorPicker({
      colorNameFn: () => {
        throw new Error('no names loaded');
      },
    }).pickColor();
    await until(() => gridUpdates().length >= 2);

    expect(gridUpdates()[0]?.payload).toMatchObject({ colorName: 'Unknown' });
    electron.ipcMain.emit('picker-cancelled');
    await expect(pick).resolves.toBeNull();
  });

  it('resolves null when the sampler crashes mid-pick', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.FAKE_SAMPLER_MODE = 'crash-after-data';

    await expect(new ColorPicker().pickColor()).resolves.toBeNull();
  });
});
