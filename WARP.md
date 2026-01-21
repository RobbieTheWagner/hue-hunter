# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Hue Hunter is a cross-platform magnifying color picker for Electron applications. It combines a Rust-powered pixel sampler with an Electron UI to provide precise color selection on macOS, Windows, and Linux (X11 + Wayland).

## Key Technologies

- **TypeScript/Electron**: Main library and UI layer
- **Rust**: Native pixel sampling binary for high-performance screen capture
- **Vite**: Build tool for renderer (magnifier UI)
- **Vitest**: Testing framework
- **Tailwind CSS**: Styling for renderer

## Development Commands

### Building

```bash
# Build everything (Rust + TypeScript + Renderer)
pnpm build

# Build components individually
pnpm build:rust          # Build Rust binary (release mode)
pnpm build:rust:dev      # Build Rust binary (debug mode)
pnpm build:ts            # Build TypeScript library
pnpm build:renderer      # Build renderer UI with Vite
```

### Testing

```bash
# Run TypeScript tests
pnpm test
pnpm test:watch

# Run Rust tests
pnpm test:rust
# Or: cd rust-sampler && cargo test
```

### Code Quality

```bash
# Lint TypeScript
pnpm lint

# Format all files
pnpm format
```

### Rust Development

```bash
cd rust-sampler

# Build with X11 + Wayland support (Linux)
cargo build --release --features x11,wayland

# Build X11-only (Linux)
cargo build --release --features x11

# Run Rust tests
cargo test
```

## Architecture

### Three-Layer Architecture

The project has three distinct layers that communicate via IPC:

1. **Main Process (TypeScript)** - `src/`
   - `picker.ts`: `ColorPicker` class - orchestrates the color picking flow
   - `manager.ts`: `RustSamplerManager` - spawns and communicates with Rust binary via stdin/stdout JSON
   - Creates fullscreen transparent magnifier window
   - Handles user input (click, escape, scroll wheel)
   
2. **Rust Binary** - `rust-sampler/`
   - Platform-specific pixel sampling (macOS: Core Graphics, Windows: GDI, Linux: X11/Wayland)
   - Runs as a child process, communicates via JSON over stdin/stdout
   - Protocol: Commands in (start/update_grid/stop), pixel data out
   - Location in dev: `rust-sampler/target/debug/hue-hunter-sampler`
   - Location in prod: `<app.resourcesPath>/hue-hunter-sampler`

3. **Renderer Process (UI)** - `renderer/`
   - `main.ts`: Magnifier UI logic and rendering
   - `preload.ts`: IPC bridge between renderer and main process
   - Displays circular magnifier with pixel grid
   - Built with Vite, outputs to `dist/renderer/`

### Communication Flow

```
User Action → Renderer (UI)
    ↓ IPC (preload)
Main Process (picker.ts)
    ↓ JSON stdin/stdout
Rust Binary (sampler)
    ↓ Pixel data
Main Process (manager.ts)
    ↓ IPC
Renderer (updates UI)
```

### Key Classes

- **`ColorPicker`** (`src/picker.ts`): Main API entry point, call `pickColor()` to launch picker
- **`RustSamplerManager`** (`src/manager.ts`): Manages Rust child process lifecycle
- **`MagnifierRenderer`** (`renderer/main.ts`): Handles UI rendering and updates

### Platform-Specific Notes

**Linux**: Rust binary requires build dependencies:
- X11: `libx11-dev` 
- Wayland: `libpipewire-0.3-dev`
- Both enabled by default via Cargo features

**Wayland**: Uses XDG Desktop Portal + PipeWire, permission token saved to `~/.local/share/hue-hunter/screencast-token`

**macOS**: Requires Screen Recording permission (user prompted automatically)

**Windows**: No special permissions or dependencies

## Development Workflow

### Making Changes to TypeScript

1. Edit files in `src/` or `renderer/`
2. Run `pnpm build:ts` or `pnpm build:renderer`
3. Test changes with `pnpm test`

### Making Changes to Rust

1. Edit files in `rust-sampler/src/`
2. Build with `cd rust-sampler && cargo build` (or `pnpm build:rust:dev`)
3. Test with `cd rust-sampler && cargo test`
4. The TypeScript code will automatically use the debug binary when in dev mode

### Testing the Full Flow

The library is designed to be used within an Electron app. Testing requires:
1. Build all components: `pnpm build`
2. Integrate into an Electron app that uses the library
3. On Wayland: Permission dialog appears on first run

## File Structure

```
src/              # TypeScript library source
  picker.ts       # ColorPicker class (main API)
  manager.ts      # RustSamplerManager (spawns Rust binary)
  types.ts        # TypeScript type definitions
  utils/          # Grid calculations and utilities
renderer/         # Magnifier UI (Electron renderer)
  main.ts         # UI logic
  preload.ts      # IPC bridge
  index.html      # HTML structure
  styles.css      # Tailwind styles
rust-sampler/     # Rust pixel sampler
  src/
    main.rs       # Binary entry point
    lib.rs        # Library entry point
    sampler/      # Platform-specific implementations
      macos.rs
      windows.rs
      linux.rs
      wayland_portal.rs
  Cargo.toml      # Rust dependencies and features
dist/             # Build output (gitignored)
```

## Important Patterns

### Binary Path Resolution

The manager resolves the Rust binary path differently in dev vs production:
- Dev: `node_modules/hue-hunter/rust-sampler/target/debug/hue-hunter-sampler`
- Prod: `<resourcesPath>/hue-hunter-sampler`

Consumer apps must bundle the binary using Electron Forge `extraResource` config.

### Permission Flow (Wayland/macOS)

`picker.ts` calls `ensureStarted()` before showing the magnifier window. This triggers permission dialogs early so they're clickable (critical on Wayland where dialog must appear before fullscreen overlay).

### Grid Size Calculation

Grid size is dynamically calculated based on magnifier diameter and square size:
```typescript
gridSize = calculateGridSize(diameter, squareSize)
```

Users can zoom the diameter (scroll) or density (alt+scroll). Grid size updates are sent to Rust via `update_grid` command.

## Packaging for Distribution

When packaging this library with an Electron app:

1. Build the Rust binary: `pnpm build:rust`
2. Add to Forge config:
```typescript
packagerConfig: {
  extraResource: [
    process.platform === 'win32'
      ? 'node_modules/hue-hunter/rust-sampler/target/release/hue-hunter-sampler.exe'
      : 'node_modules/hue-hunter/rust-sampler/target/release/hue-hunter-sampler'
  ]
}
```
3. Consider adding a prepackage script to ensure binary is built
