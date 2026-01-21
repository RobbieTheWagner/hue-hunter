import { contextBridge, ipcRenderer } from 'electron';
// Define the actual API implementation - this is the source of truth for types
export const magnifierAPI = {
    // Send methods for magnifier-specific events
    send: {
        ready: () => ipcRenderer.send('magnifier-ready'),
        colorSelected: () => ipcRenderer.send('color-selected'),
        cancelled: () => ipcRenderer.send('picker-cancelled'),
        zoomDiameter: (delta) => ipcRenderer.send('magnifier-zoom-diameter', delta),
        zoomDensity: (delta) => ipcRenderer.send('magnifier-zoom-density', delta),
    },
    // Receive methods for magnifier-specific updates
    on: {
        updatePosition: (callback) => {
            const subscription = (_event, data) => callback(data);
            ipcRenderer.on('update-magnifier-position', subscription);
            return subscription;
        },
        updatePixelGrid: (callback) => {
            const subscription = (_event, data) => callback(data);
            ipcRenderer.on('update-pixel-grid', subscription);
            return subscription;
        },
    },
};
// Expose the API to the main world
contextBridge.exposeInMainWorld('magnifierAPI', magnifierAPI);
//# sourceMappingURL=preload.js.map