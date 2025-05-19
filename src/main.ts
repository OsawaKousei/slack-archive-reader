import path from "node:path";
import fs from "node:fs/promises";
import { BrowserWindow, app, ipcMain, dialog } from "electron";

app.whenReady().then(() => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile("dist/index.html");
  // mainWindow.webContents.openDevTools(); // 開発者ツールを開く場合
});

app.once("window-all-closed", () => app.quit());

ipcMain.handle("dialog:openDirectory", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

ipcMain.handle("fs:listChannels", async (_event, dirPath: string) => {
  try {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true });
    return dirents
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
  } catch (error) {
    console.error("Error listing channels:", error);
    return [];
  }
});

ipcMain.handle(
  "fs:getChannelDateRange",
  async (_event, channelPath: string) => {
    try {
      const files = await fs.readdir(channelPath);
      const dateFiles = files
        .filter((file) => file.endsWith(".json") && /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
        .map((file) => file.replace(".json", ""))
        .sort();
      if (dateFiles.length === 0) {
        return null;
      }
      return { first: dateFiles[0], last: dateFiles[dateFiles.length - 1] };
    } catch (error) {
      console.error("Error getting channel date range:", error);
      return null;
    }
  },
);

ipcMain.handle(
  "fs:loadMessages",
  async (
    _event,
    channelPath: string,
    startDate: string,
    endDate: string,
  ) => {
    try {
      const files = await fs.readdir(channelPath);
      const dateFiles = files
        .filter((file) => {
          if (file.endsWith(".json") && /^\d{4}-\d{2}-\d{2}\.json$/.test(file)) {
            const date = file.replace(".json", "");
            return date >= startDate && date <= endDate;
          }
          return false;
        })
        .sort();

      let allMessages: any[] = [];
      for (const file of dateFiles) {
        const filePath = path.join(channelPath, file);
        const content = await fs.readFile(filePath, "utf-8");
        const messages = JSON.parse(content);
        allMessages = allMessages.concat(messages);
      }
      // ts (timestamp) でソート
      allMessages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
      return allMessages;
    } catch (error) {
      console.error("Error loading messages:", error);
      return [];
    }
  },
);