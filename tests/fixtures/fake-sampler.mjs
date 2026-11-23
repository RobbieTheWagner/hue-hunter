#!/usr/bin/env node
// Stands in for hue-hunter-sampler. FAKE_SAMPLER_MODE picks the behavior.
import { closeSync } from 'node:fs';
import { createInterface } from 'node:readline';

const mode = process.env.FAKE_SAMPLER_MODE ?? 'normal';
const write = (s) => process.stdout.write(s);
const pixel = (gridSize, n) =>
  JSON.stringify({
    cursor: { x: n, y: gridSize },
    center: { r: 1, g: 2, b: 3, hex: '#010203' },
    grid: Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => ({
        r: 1,
        g: 2,
        b: 3,
        hex: '#010203',
      }))
    ),
    timestamp: n,
  });

let gridSize = 0;
let frame = 0;
let timer;

const emit = () => {
  frame++;
  const line = pixel(gridSize, frame) + '\n';
  if (frame === 1) {
    const cut = Math.floor(line.length / 2);
    write(line.slice(0, cut));
    setTimeout(() => write(line.slice(cut) + '\n{not json\n'), 5);
  } else if (frame === 2) {
    write(line + pixel(gridSize, ++frame) + '\n');
  } else {
    write(line);
  }
  if (mode === 'crash-after-data' && frame >= 4) process.exit(2);
};

const onStart = () => {
  if (mode === 'crash-before-data') process.exit(3);
  if (mode === 'error') {
    write(
      JSON.stringify({ error: 'No screen capture method available' }) + '\n'
    );
    process.exit(1);
  }
  if (mode === 'silent') return;
  timer = setInterval(emit, 10);
};

if (mode === 'ignore-stop') process.on('SIGTERM', () => {});

if (mode === 'close-stdin') {
  closeSync(0);
  gridSize = 9;
  timer = setInterval(emit, 10);
} else {
  createInterface({ input: process.stdin }).on('line', onLine);
}

function onLine(line) {
  const cmd = JSON.parse(line);
  if (cmd.command === 'start') {
    gridSize = cmd.grid_size;
    onStart();
  } else if (cmd.command === 'update_grid') {
    gridSize = cmd.grid_size;
  } else if (cmd.command === 'stop' && mode !== 'ignore-stop') {
    clearInterval(timer);
    process.exit(0);
  }
}
