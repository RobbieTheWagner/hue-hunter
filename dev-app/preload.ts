import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  pickColor: () => ipcRenderer.invoke('pick-color'),
});
