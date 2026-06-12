# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hue Hunter is a cross-platform magnifying color picker library for Electron apps. A Rust binary does the platform-specific pixel sampling (macOS: Core Graphics, Windows: GDI, Linux: X11 or Wayland via XDG Portal + PipeWire); TypeScript in the Electron main process orchestrates it and drives a fullscreen transparent magnifier window.

Package manager is pnpm (Node >= 24). Rust toolchain required (`postinstall` builds the Rust binary).

## Commands

```bash
pnpm build              # Build everything: Rust (release) + tsc + magnifier renderer
pnpm build:rust         # Rust binary, release mode (--features x11,wayland)
pnpm build:rust:dev     # Rust binary, debug mode
pnpm build:ts           # tsc → dist/
pnpm start              # Run the dev-app test harness (builds debug Rust binary first)

pnpm test               # Vitest (tests/*.test.ts)
pnpm test:watch
pnpm vitest run tests/grid-calculation.test.ts   # single test file
pnpm test:rust          # cargo test in rust-sampler/
cd rust-sampler && cargo test <name>             # single Rust test

pnpm lint               # eslint . (flat config in eslint.config.mjs)
pnpm lint:rust          # cargo clippy --all-targets -- -D warnings (warnings fail CI)
pnpm format             # prettier --write .
```

The magnifier renderer is built with `vite build -c vite.magnifier.config.ts` (part of `pnpm build`; there is no separate `build:renderer` script). Output goes to `.vite/renderer/`, which is shipped in the npm package alongside `dist/`.

On Linux, building the Rust binary needs system packages: `libx11-dev`, `pkg-config`, `libpipewire-0.3-dev`, `libspa-0.2-dev`.

## Architecture

Three layers communicating over two boundaries:

1. **Main process library (`src/`)** — the published API.
   - `picker.ts`: `ColorPicker` class, the entry point. `pickColor()` returns a hex string or `null` on cancel. Creates the fullscreen transparent magnifier `BrowserWindow`, handles click/escape/scroll input. It calls `ensureStarted()` *before* showing the window so OS permission dialogs (macOS Screen Recording, Wayland portal) appear while still clickable — keep that ordering.
   - `manager.ts`: `RustSamplerManager` spawns the Rust binary as a child process and exchanges newline-delimited JSON over stdin/stdout (commands in: `start`/`update_grid`/`stop`; pixel data out).
   - `utils/`: grid math (`calculateGridSize(diameter, squareSize)`); grid size changes from zooming are forwarded to Rust via `update_grid`.

2. **Rust sampler (`rust-sampler/`)** — standalone binary `hue-hunter-sampler`. Platform implementations live in `src/sampler/` (`macos.rs`, `windows.rs`, `linux.rs`, `wayland_portal.rs`). Linux backends are Cargo features (`x11`, `wayland`), both off by default — builds must pass `--features x11,wayland` (the pnpm scripts do). Integration tests are in `rust-sampler/tests/`.

3. **Renderer (`renderer/`)** — the magnifier UI. `main.ts` renders the circular pixel grid; `magnifier-preload.ts` is the IPC bridge. Styled with Tailwind 4 (via `@tailwindcss/vite`).

Data flow: renderer input → IPC → `picker.ts` → JSON stdin → Rust binary → pixel data on stdout → `manager.ts` callback → IPC → renderer redraw.

### Binary path resolution (`manager.ts`)

- Dev, as a dependency: `node_modules/hue-hunter/rust-sampler/target/release/...` (release build expected — `postinstall` produces it)
- Dev, in this repo: `rust-sampler/target/debug/...`
- Production: `<app.resourcesPath>/hue-hunter-sampler` — consumer apps must bundle the binary via Forge `extraResource` (see README)

### dev-app

`dev-app/` is a minimal Electron Forge app for manually testing the full flow (`pnpm start`, wired up in `forge.config.ts`). It is not published. The library itself can't be exercised end-to-end by unit tests — real screen capture needs the dev-app or a consumer app.

## Releases

Automated with [release-plan](https://github.com/embroider-build/release-plan/). Every merged PR must carry exactly one label: `breaking`, `enhancement`, `bug`, `documentation`, or `internal`. Merging the auto-generated "Prepare Release" PR publishes. See RELEASE.md.
