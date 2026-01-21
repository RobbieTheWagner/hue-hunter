import { app, BrowserWindow, ipcMain } from 'electron';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import isDev from 'electron-is-dev';

import { ColorPicker } from '../src/picker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('[Dev App] Main process starting...');
console.log('[Dev App] isDev:', isDev);
console.log('[Dev App] __dirname:', __dirname);

// Create main window
let mainWindow: BrowserWindow | null = null;
const colorPicker = new ColorPicker();

function createWindow() {
  console.log('[Dev App] Creating window...');
  
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
    },
  });

  console.log('[Dev App] Loading URL...');
  
  // Load the index.html
  const devAppDir = resolve(__dirname, '..', 'renderer', 'main_window');
  const devAppURL = isDev
    ? 'http://localhost:5173'
    : pathToFileURL(join(devAppDir, 'index.html')).toString();
  
  void mainWindow.loadURL(devAppURL);

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

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
