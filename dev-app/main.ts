import { app, BrowserWindow, ipcMain } from 'electron';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { colornames } from 'color-name-list';
import isDev from 'electron-is-dev';
import nearestColor from 'nearest-color';

import { ColorPicker } from '../src/picker.js';

// Set up color name lookup
const namedColors = colornames.reduce(
  (o: { [key: string]: string }, { name, hex }: { name: string; hex: string }) => 
    Object.assign(o, { [name]: hex }),
  {}
);
const nearestColorFn = nearestColor.from(namedColors);
const colorNameFn = ({ r, g, b }: { r: number; g: number; b: number }) => nearestColorFn({ r, g, b }).name;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create main window
let mainWindow: BrowserWindow | null = null;
const colorPicker = new ColorPicker({ colorNameFn });

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
    },
  });
  
  // Load the index.html
  const devAppDir = resolve(__dirname, '..', 'renderer', 'main_window');
  const devAppURL = isDev
    ? 'http://localhost:5173'
    : pathToFileURL(join(devAppDir, 'index.html')).toString();
  
  void mainWindow.loadURL(devAppURL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  console.log('[Dev App] Window created successfully');
}

// Handle color picker request from renderer
ipcMain.handle('pick-color', async () => {
  console.log('[Dev App] Color picker requested');
  const color = await colorPicker.pickColor();
  console.log('[Dev App] Color picked:', color);
  return color;
});

app.whenReady().then(() => {
  console.log('[Dev App] App is ready, creating window...');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
