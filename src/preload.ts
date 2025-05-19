import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  selectDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  listChannels: (dirPath: string) =>
    ipcRenderer.invoke("fs:listChannels", dirPath),
  getChannelDateRange: (channelPath: string) =>
    ipcRenderer.invoke("fs:getChannelDateRange", channelPath),
  loadMessages: (
    channelPath: string,
    startDate: string,
    endDate: string,
  ) => ipcRenderer.invoke("fs:loadMessages", channelPath, startDate, endDate),
});