import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RustSamplerManager, type PixelData } from '../src/manager';

vi.mock('electron', () => ({ app: { getAppPath: () => '/nonexistent' } }));
vi.mock('electron-is-dev', () => ({ default: true }));

const FAKE_SAMPLER = fileURLToPath(
  new URL('./fixtures/fake-sampler.mjs', import.meta.url)
);

let manager: RustSamplerManager;

function useMode(mode: string): RustSamplerManager {
  process.env.FAKE_SAMPLER_MODE = mode;
  manager = new RustSamplerManager(FAKE_SAMPLER);
  return manager;
}

function collect() {
  const data: PixelData[] = [];
  const errors: string[] = [];
  return {
    data,
    errors,
    onData: (d: PixelData) => data.push(d),
    onError: (e: string) => errors.push(e),
  };
}

const until = (check: () => boolean) =>
  vi.waitFor(() => expect(check()).toBe(true), { timeout: 2000 });

afterEach(async () => {
  vi.spyOn(console, 'error').mockRestore();
  await manager?.stop();
  delete process.env.FAKE_SAMPLER_MODE;
});

// The fixture runs through its shebang, which Windows can't do.
describe.skipIf(process.platform === 'win32')('RustSamplerManager', () => {
  it('resolves ensureStarted on the first frame and keeps delivering frames', async () => {
    const sink = collect();
    await useMode('normal').ensureStarted(9, 15, sink.onData, sink.onError);

    expect(sink.data[0]?.grid).toHaveLength(9);
    await until(() => sink.data.length >= 4);
    expect(manager.isRunning()).toBe(true);
  });

  it('reassembles lines split across chunks and parses several lines per chunk', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sink = collect();
    await useMode('normal').ensureStarted(5, 15, sink.onData, sink.onError);
    await until(() => sink.data.length >= 4);

    expect(sink.data.slice(0, 4).map((d) => d.timestamp)).toEqual([1, 2, 3, 4]);
    expect(sink.errors).toEqual([]);
  });

  it('applies grid size updates', async () => {
    const sink = collect();
    await useMode('normal').ensureStarted(5, 15, sink.onData, sink.onError);
    manager.updateGridSize(13);

    await until(() => sink.data.at(-1)?.grid.length === 13);
  });

  it('rejects ensureStarted with the error the sampler reports', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = useMode('error').ensureStarted(9, 15);

    await expect(started).rejects.toThrow('No screen capture method available');
  });

  it('rejects ensureStarted promptly when the sampler exits before sending data', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const startedAt = Date.now();

    await expect(
      useMode('crash-before-data').ensureStarted(9, 15)
    ).rejects.toThrow('code 3');
    expect(Date.now() - startedAt).toBeLessThan(2000);
    expect(manager.isRunning()).toBe(false);
  });

  it('rejects ensureStarted when the binary does not exist', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    manager = new RustSamplerManager('/nonexistent/hue-hunter-sampler');

    await expect(manager.ensureStarted(9, 15)).rejects.toThrow('ENOENT');
  });

  it('reports a crash after startup through the error callback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sink = collect();
    await useMode('crash-after-data').ensureStarted(
      9,
      15,
      sink.onData,
      sink.onError
    );

    await until(() => sink.errors.length > 0);
    expect(sink.errors[0]).toMatch('code 2');
    expect(manager.isRunning()).toBe(false);
  });

  it('skips output lines that are valid JSON but not sampler responses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sink = collect();
    await useMode('non-object-lines').ensureStarted(
      9,
      15,
      sink.onData,
      sink.onError
    );

    await until(() => sink.data.length >= 3);
    expect(sink.data.every((d) => Array.isArray(d.grid))).toBe(true);
    expect(sink.errors).toEqual([]);
  });

  it('keeps delivering frames after a data callback throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    await useMode('normal').ensureStarted(9, 15, () => {
      calls++;
      throw new Error('colorNameFn failed');
    });

    await until(() => calls >= 3);
    expect(manager.isRunning()).toBe(true);
  });

  it('rejects ensureStarted promptly when spawn throws', async () => {
    manager = new RustSamplerManager('/bad\0path');
    const startedAt = Date.now();

    await expect(manager.ensureStarted(9, 15)).rejects.toThrow();
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  it('stop cancels a start that is waiting for the previous sampler to exit', async () => {
    await useMode('normal').ensureStarted(9, 15);

    const replacement = manager.ensureStarted(9, 15);
    await manager.stop();

    await expect(replacement).rejects.toThrow('superseded');
    await new Promise((r) => setTimeout(r, 100));
    expect(manager.isRunning()).toBe(false);
  });

  it('survives writing to a sampler whose stdin is closed', async () => {
    const sink = collect();
    await useMode('close-stdin').ensureStarted(
      9,
      15,
      sink.onData,
      sink.onError
    );

    manager.updateGridSize(11);
    manager.updateGridSize(13);
    await new Promise((r) => setTimeout(r, 100));

    expect(manager.isRunning()).toBe(true);
    expect(sink.data.length).toBeGreaterThan(1);
  });

  it('stop resolves when the binary failed to spawn', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    manager = new RustSamplerManager('/nonexistent/hue-hunter-sampler');
    void manager.start(
      9,
      15,
      () => {},
      () => {}
    );

    await manager.stop();
    expect(manager.isRunning()).toBe(false);
  });

  it('stop resolves and reports no error for a clean shutdown', async () => {
    const sink = collect();
    await useMode('normal').ensureStarted(9, 15, sink.onData, sink.onError);

    await manager.stop();
    expect(manager.isRunning()).toBe(false);
    expect(sink.errors).toEqual([]);
  });

  it('stop kills a sampler that ignores the stop command', async () => {
    const sink = collect();
    await useMode('ignore-stop').ensureStarted(9, 15, sink.onData);

    const stoppedAt = Date.now();
    const framesAtStop = sink.data.length;
    await manager.stop();
    expect(Date.now() - stoppedAt).toBeLessThan(1500);
    expect(sink.data.length).toBe(framesAtStop);
  });

  it('a stop that is not awaited does not clear the next session', async () => {
    const first = collect();
    await useMode('normal').ensureStarted(9, 15, first.onData, first.onError);

    void manager.stop();
    const second = collect();
    await manager.ensureStarted(5, 15, second.onData, second.onError);
    await new Promise((r) => setTimeout(r, 100));

    expect(manager.isRunning()).toBe(true);
    await until(() => second.data.length >= 3);
    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);
  });
});
