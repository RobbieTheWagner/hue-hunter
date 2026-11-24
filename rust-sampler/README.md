# Hue Hunter Pixel Sampler

A high-performance, cross-platform pixel sampling tool written in Rust for the Hue Hunter color picker.

## Overview

This Rust binary provides continuous, real-time pixel sampling for the Hue Hunter color picker's magnifier feature. It communicates with the Electron main process via JSON over stdin/stdout.

## Platform Support

### macOS

- Captures only the grid region with `CGWindowListCreateImage` once per frame. The magnifier window sets content protection, so it is excluded from the capture.
- Reads the cursor with `CGEventGetLocation`.

### Windows

- Copies the grid region with `BitBlt` once per frame and falls back to `GetPixel` if that fails.
- Reads the cursor with `GetCursorPos` and converts between logical and physical pixels using the DPI scale.

### Linux (X11)

- Captures the root window once with `XGetImage` when sampling starts, before the magnifier window is shown, and samples every grid from that frame. Re-capturing would include the magnifier, because Linux can't exclude a window from capture. Live content under the cursor does not update during a pick.
- 32-bit visuals are copied directly. Other depths are decoded per pixel by their color masks.
- Reads the cursor with `XQueryPointer`.

### Linux (Wayland)

- Asks the XDG Desktop Portal for a monitor screencast, reads one frame over PipeWire, then samples from it the same way as X11.
- Handles the BGRx, RGBx, xRGB and xBGR families (with or without alpha) and the stream's real row stride. Other formats are reported as an error. It gives up after 5 seconds without a frame.
- The permission token is saved to `~/.local/share/hue-hunter/screencast-token`, so the dialog appears once.
- Reads the cursor through XWayland with `XQueryPointer`. Known limits: the X11 backend is tried first and also succeeds under XWayland, and XWayland only sees the pointer over X11 windows. See the open issues in the repository.

## Linux Setup

### Build Dependencies

#### For All Linux Users (X11 + Wayland)

```bash
# Ubuntu/Debian
sudo apt install build-essential pkg-config libx11-dev libpipewire-0.3-dev

# Fedora
sudo dnf install gcc pkg-config libX11-devel pipewire-devel

# Arch Linux
sudo pacman -S base-devel pkg-config libx11 pipewire
```

**Note:** PipeWire support is enabled by default. This allows the sampler to work on both X11 and Wayland systems seamlessly:

- On X11: Uses direct X11 capture (fastest)
- On Wayland: Falls back to Portal + PipeWire (with persistent permissions)

#### Optional: X11-Only Build

If you only need X11 support (no Wayland):

```bash
cargo build --no-default-features
```

The PipeWire dependencies are already included in the default build above, so Wayland support is automatically enabled.

### Runtime Dependencies

#### For X11

No additional runtime dependencies! X11 direct capture is used automatically.

#### For Wayland

PipeWire must be running (standard on modern Linux distros):

```bash
# Check if PipeWire is running
systemctl --user status pipewire

# Most modern distros (Ubuntu 22.04+, Fedora 34+, etc.) have PipeWire by default
```

**First-time Permission:**

- On first use, you'll see a system dialog asking for screen capture permission
- Click "Share" to grant permission
- The permission token is saved in `~/.local/share/hue-hunter/screencast-token`
- Future launches will use the saved token automatically (no permission dialog)

## Building

### Development Build

```bash
cargo build
```

The debug binary will be at `target/debug/hue-hunter-sampler`

### Release Build

```bash
cargo build --release
```

The optimized binary will be at `target/release/hue-hunter-sampler`

## Communication Protocol

### Input (Commands from Electron)

Commands are sent as JSON over stdin, one per line:

```json
{"command": "start", "grid_size": 9, "sample_rate": 60}
{"command": "update_grid", "grid_size": 11}
{"command": "stop"}
```

#### Start Command

- `grid_size`: Number of pixels in each dimension (e.g., 9 = 9x9 grid)
- `sample_rate`: Target sampling frequency in Hz (e.g., 60 = 60 FPS)

#### Update Grid Command

- `grid_size`: New grid size to use

#### Stop Command

- No parameters, cleanly exits the sampler

### Output (Pixel Data to Electron)

Pixel data is sent as JSON over stdout, one object per sample:

```json
{
  "cursor": {"x": 100, "y": 200},
  "center": {"r": 255, "g": 128, "b": 64, "hex": "#FF8040"},
  "grid": [
    [
      {"r": 255, "g": 128, "b": 64, "hex": "#FF8040"},
      {"r": 254, "g": 127, "b": 63, "hex": "#FE7F3F"},
      ...
    ],
    ...
  ],
  "timestamp": 1700000000000
}
```

### Error Output

Errors are sent as JSON to stdout:

```json
{
  "error": "Failed to capture screen: permission denied"
}
```

Debug/diagnostic messages are sent to stderr.

## Performance Notes

Each frame captures once and serializes the grid as JSON. The picker requests 15 frames per second. On an Apple Silicon Mac, a 13x13 grid takes about 18 ms per frame when run unthrottled. On Linux, frames come from a buffer captured once per pick, so the per-frame cost is only the lookup and JSON.

## Permissions

### macOS

- Requires "Screen Recording" permission in System Preferences → Security & Privacy → Screen Recording
- Electron app must be granted this permission

### Linux (Wayland)

- Uses XDG Desktop Portal screencast permission
- Permission dialog appears on first use (before magnifier shows)
- Permission token saved to `~/.local/share/hue-hunter/screencast-token` for future use
- To revoke: Delete the token file or revoke via desktop environment settings

### Linux (X11)

- No special permissions required
- Direct X11 access for pixel sampling and cursor position

### Windows

- No special permissions required
- Uses standard GDI APIs

## Integration with Electron

The `RustSamplerManager` class handles spawning and communicating with this binary.

### Development Mode

Binary location: `rust-sampler/target/debug/hue-hunter-sampler`

### Production Mode

Binary location: `<app.resourcesPath>/hue-hunter-sampler` (or `.exe` on Windows)

The binary is automatically bundled with the Electron app during packaging.
