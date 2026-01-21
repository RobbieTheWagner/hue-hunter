# 🎨 Hue Hunter

> Cross-platform magnifying color picker for Electron applications

Hue Hunter is a high-performance, cross-platform color picker with a magnifying glass interface for Electron apps. It combines a Rust-powered pixel sampler with a beautiful UI to provide precise color selection on macOS, Windows, and Linux.

## Features

- **Magnifying Glass Interface** - Real-time magnified view of pixels under the cursor
- **Cross-Platform** - Works on macOS, Windows, and Linux (X11 + Wayland)
- **High Performance** - Rust-powered pixel sampling for smooth, responsive experience
- **Customizable** - Optional color naming, adjustable zoom levels
- **TypeScript Support** - Full type definitions included
- **Zero External Dependencies** - Self-contained Rust binary, no system dependencies on macOS/Windows

## Installation

```bash
npm install hue-hunter
# or
pnpm add hue-hunter
# or
yarn add hue-hunter
```

### Platform-Specific Setup

#### Linux

On Linux, you'll need to install system dependencies for building the Rust binary:

```bash
# Ubuntu/Debian
sudo apt install build-essential pkg-config libx11-dev libpipewire-0.3-dev

# Fedora
sudo dnf install gcc pkg-config libX11-devel pipewire-devel

# Arch Linux
sudo pacman -S base-devel pkg-config libx11 pipewire
```

These provide support for both X11 and Wayland. On Wayland, users will see a one-time permission dialog for screen capture.

## Usage

### Basic Example

```typescript
import { ColorPicker } from 'hue-hunter';
import { app, ipcMain } from 'electron';

app.whenReady().then(() => {
  const picker = new ColorPicker();

  ipcMain.handle('pick-color', async () => {
    const color = await picker.pickColor();
    return color; // Returns "#FF8040" or null if cancelled
  });
});
```

### With Color Naming

```typescript
import { ColorPicker } from 'hue-hunter';
import { colornames } from 'color-name-list';
import nearestColor from 'nearest-color';

// Set up color naming
const namedColors = colornames.reduce(
  (o, { name, hex }) => Object.assign(o, { [name]: hex }),
  {}
);
const getColorName = nearestColor.from(namedColors);

const picker = new ColorPicker({
  colorNameFn: (rgb) => getColorName(rgb).name,
  initialDiameter: 200,
  initialSquareSize: 20,
});

const color = await picker.pickColor();
// User sees color names like "Sunset Orange" in the magnifier
```

## Electron Forge Integration

To bundle the Rust binary with your Electron app, add it to your Forge configuration:

```typescript
// forge.config.ts
export default {
  packagerConfig: {
    extraResource: [
      // Include the appropriate binary for your platform
      process.platform === 'win32'
        ? 'node_modules/hue-hunter/rust-sampler/target/release/hue-hunter-sampler.exe'
        : 'node_modules/hue-hunter/rust-sampler/target/release/hue-hunter-sampler',
    ],
  },
  // ...
};
```

**Note:** You'll need to build the Rust binary before packaging:

```bash
cd node_modules/hue-hunter
pnpm build:rust
```

Or add it as a prepackage script in your `package.json`:

```json
{
  "scripts": {
    "prepackage": "cd node_modules/hue-hunter && pnpm build:rust"
  }
}
```

## API Reference

### `ColorPicker`

The main class for launching the color picker.

```typescript
class ColorPicker {
  constructor(options?: ColorPickerOptions);
  pickColor(): Promise<string | null>;
}
```

#### Options

```typescript
interface ColorPickerOptions {
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
```

#### Methods

##### `pickColor()`

Launches the magnifying color picker and waits for user selection.

- **Returns:** `Promise<string | null>` - The selected color as a hex string (e.g., `"#FF8040"`), or `null` if cancelled
- **User Controls:**
  - **Click** - Select the color under the cursor
  - **Escape** - Cancel and return `null`
  - **Scroll wheel** - Zoom diameter in/out
  - **Alt + Scroll wheel** - Adjust pixel density (square size)

## Platform Support

### macOS ✅

- Uses Core Graphics for efficient screen capture
- Hardware-accelerated sampling
- Requires "Screen Recording" permission (user is prompted automatically)

### Windows ✅

- Uses Windows GDI for fast pixel sampling
- No special permissions required

### Linux ✅

#### X11
- Direct pixel sampling via X11 APIs
- No permissions required
- Best performance

#### Wayland
- Uses XDG Desktop Portal + PipeWire for screen capture
- One-time permission dialog (token saved to `~/.local/share/hue-hunter/screencast-token`)
- Requires PipeWire 0.3+ (standard on modern distros)
- Excellent performance (~15 FPS)

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/shipshapecode/hue-hunter.git
cd hue-hunter

# Install dependencies
pnpm install

# Build everything (Rust + TypeScript + Renderer)
pnpm build

# Or build individually
pnpm build:rust    # Rust binary
pnpm build:ts      # TypeScript library
pnpm build:renderer # Renderer UI
```

### Project Structure

```
hue-hunter/
├── src/              # TypeScript source
│   ├── index.ts      # Main export
│   ├── picker.ts     # ColorPicker class
│   ├── manager.ts    # Rust sampler manager
│   └── utils/        # Grid calculations, utilities
├── renderer/         # Magnifier UI
│   ├── index.html
│   ├── main.ts       # Renderer process
│   ├── preload.ts    # IPC bridge
│   └── styles.css
├── rust-sampler/     # Rust pixel sampler
│   ├── Cargo.toml
│   └── src/
└── dist/             # Built output
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © [Ship Shape Consulting LLC](https://shipshape.io)

## Acknowledgments

Originally extracted from [Swach](https://swach.io), a robust color management tool.
