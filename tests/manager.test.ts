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

describe('RustSamplerManager', () => {
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

  it('does not throw when commands are sent after the sampler died', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sink = collect();
    await useMode('crash-after-data').ensureStarted(
      9,
      15,
      sink.onData,
      sink.onError
    );
    await until(() => !manager.isRunning());

    expect(() => manager.updateGridSize(11)).not.toThrow();
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
    await manager.stop();
    expect(Date.now() - stoppedAt).toBeLessThan(1500);
    const framesAfterStop = sink.data.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(sink.data.length).toBe(framesAfterStop);
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
