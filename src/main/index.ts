import path from "node:path";
import fs from "node:fs/promises";
import { BrowserWindow, app, ipcMain, dialog } from "electron";

app.whenReady().then(() => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
    
    // 従来形式: ディレクトリがチャンネル
    const directories = dirents
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
    
    // API形式: JSONファイルがチャンネル(ただし_summary.jsonなどのメタデータファイルを除外)
    const jsonFiles = dirents
      .filter((dirent) => 
        dirent.isFile() && 
        dirent.name.endsWith('.json') &&
        !dirent.name.startsWith('_') && // _summary.jsonなどを除外
        dirent.name !== 'channels.json' &&
        dirent.name !== 'users.json'
      )
      .map((dirent) => dirent.name.replace('.json', ''));
    
    // 両方の形式をマージ(重複は除去)
    const allChannels = [...new Set([...directories, ...jsonFiles])];
    
    return allChannels.sort();
  } catch (error) {
    console.error("Error listing channels:", error);
    return [];
  }
});

ipcMain.handle(
  "fs:getChannelDateRange",
  async (_event, channelPath: string) => {
    try {
      // channelPathはディレクトリ/チャンネル名の形式で渡される
      // API形式の場合は親ディレクトリ/チャンネル名.jsonとしてファイルが存在する可能性がある
      const channelDir = path.dirname(channelPath);
      const channelName = path.basename(channelPath);
      
      // まずディレクトリとして存在するか確認
      let isDirectory = false;
      try {
        const stat = await fs.stat(channelPath);
        isDirectory = stat.isDirectory();
      } catch {
        // ディレクトリが存在しない場合はAPI形式の可能性
      }
      
      if (isDirectory) {
        // ディレクトリとして存在する場合(従来形式またはAPI形式のディレクトリ内)
        const files = await fs.readdir(channelPath);
        
        // API形式のチェック: チャンネル名.jsonファイルが存在する場合
        const apiFormatFile = files.find(file => 
          file === `${channelName}.json` || 
          (file.endsWith('.json') && !file.match(/^\d{4}-\d{2}-\d{2}\.json$/))
        );
        
        if (apiFormatFile) {
          // API形式: 単一ファイルからメタデータを読み取る
          const filePath = path.join(channelPath, apiFormatFile);
          const content = await fs.readFile(filePath, "utf-8");
          const data = JSON.parse(content);
          
          // messagesプロパティが存在し、メッセージがある場合
          if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
            const timestamps = data.messages
              .map((msg: any) => parseFloat(msg.ts))
              .filter((ts: number) => !isNaN(ts))
              .sort((a: number, b: number) => a - b);
            
            if (timestamps.length > 0) {
              const firstDate = new Date(timestamps[0] * 1000).toISOString().split('T')[0];
              const lastDate = new Date(timestamps[timestamps.length - 1] * 1000).toISOString().split('T')[0];
              return { first: firstDate, last: lastDate };
            }
          }
          return null;
        }
        
        // 従来のエクスポート形式: 日付別ファイル
        const dateFiles = files
          .filter((file) => file.endsWith(".json") && /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
          .map((file) => file.replace(".json", ""))
          .sort();
        if (dateFiles.length === 0) {
          return null;
        }
        return { first: dateFiles[0], last: dateFiles[dateFiles.length - 1] };
      } else {
        // ディレクトリとして存在しない場合、API形式のJSONファイルとして扱う
        const jsonFilePath = `${channelPath}.json`;
        try {
          const content = await fs.readFile(jsonFilePath, "utf-8");
          const data = JSON.parse(content);
          
          if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
            const timestamps = data.messages
              .map((msg: any) => parseFloat(msg.ts))
              .filter((ts: number) => !isNaN(ts))
              .sort((a: number, b: number) => a - b);
            
            if (timestamps.length > 0) {
              const firstDate = new Date(timestamps[0] * 1000).toISOString().split('T')[0];
              const lastDate = new Date(timestamps[timestamps.length - 1] * 1000).toISOString().split('T')[0];
              return { first: firstDate, last: lastDate };
            }
          }
        } catch {
          // JSONファイルも存在しない場合
        }
        return null;
      }
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
      const channelDir = path.dirname(channelPath);
      const channelName = path.basename(channelPath);
      
      // ユーザー情報を読み込む(アーカイブのルートディレクトリから)
      let users: any = {};
      const usersJsonPath = path.join(channelDir, 'users.json');
      try {
        const usersContent = await fs.readFile(usersJsonPath, 'utf-8');
        const usersArray = JSON.parse(usersContent);
        // ユーザーIDをキーとするマップに変換
        if (Array.isArray(usersArray)) {
          users = usersArray.reduce((acc: any, user: any) => {
            acc[user.id] = user;
            return acc;
          }, {});
        }
      } catch (error) {
        console.log('users.json not found or invalid, continuing without user profiles');
      }
      
      // ユーザー情報をメッセージに付加する関数
      const enrichMessage = (msg: any) => {
        if (msg.user && users[msg.user]) {
          const user = users[msg.user];
          msg.user_profile = {
            real_name: user.real_name || user.profile?.real_name,
            display_name: user.profile?.display_name || user.name,
            image_72: user.profile?.image_72,
          };
        }
        return msg;
      };
      
      // まずディレクトリとして存在するか確認
      let isDirectory = false;
      try {
        const stat = await fs.stat(channelPath);
        isDirectory = stat.isDirectory();
      } catch {
        // ディレクトリが存在しない場合はAPI形式の可能性
      }
      
      if (isDirectory) {
        // ディレクトリとして存在する場合
        const files = await fs.readdir(channelPath);
        
        // API形式のチェック: チャンネル名.jsonファイルまたは日付パターン以外のJSONファイル
        const apiFormatFile = files.find(file => 
          file === `${channelName}.json` || 
          (file.endsWith('.json') && !file.match(/^\d{4}-\d{2}-\d{2}\.json$/))
        );
        
        if (apiFormatFile) {
          // API形式: 単一ファイルから全メッセージを読み込み、日付範囲でフィルタ
          const filePath = path.join(channelPath, apiFormatFile);
          const content = await fs.readFile(filePath, "utf-8");
          const data = JSON.parse(content);
          
          if (data.messages && Array.isArray(data.messages)) {
            // 日付範囲でフィルタ
            const startTimestamp = new Date(startDate + 'T00:00:00Z').getTime() / 1000;
            const endTimestamp = new Date(endDate + 'T23:59:59Z').getTime() / 1000;
            
            const filteredMessages = data.messages.filter((msg: any) => {
              const ts = parseFloat(msg.ts);
              return !isNaN(ts) && ts >= startTimestamp && ts <= endTimestamp;
            });
            
            // タイムスタンプでソート
            filteredMessages.sort((a: any, b: any) => parseFloat(a.ts) - parseFloat(b.ts));
            
            // ユーザー情報を付加
            return filteredMessages.map(enrichMessage);
          }
          return [];
        }
        
        // 従来のエクスポート形式: 日付別ファイルから読み込み
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
        
        // ユーザー情報を付加
        return allMessages.map(enrichMessage);
      } else {
        // ディレクトリとして存在しない場合、API形式のJSONファイルとして扱う
        const jsonFilePath = `${channelPath}.json`;
        try {
          const content = await fs.readFile(jsonFilePath, "utf-8");
          const data = JSON.parse(content);
          
          if (data.messages && Array.isArray(data.messages)) {
            // 日付範囲でフィルタ
            const startTimestamp = new Date(startDate + 'T00:00:00Z').getTime() / 1000;
            const endTimestamp = new Date(endDate + 'T23:59:59Z').getTime() / 1000;
            
            const filteredMessages = data.messages.filter((msg: any) => {
              const ts = parseFloat(msg.ts);
              return !isNaN(ts) && ts >= startTimestamp && ts <= endTimestamp;
            });
            
            // タイムスタンプでソート
            filteredMessages.sort((a: any, b: any) => parseFloat(a.ts) - parseFloat(b.ts));
            
            // ユーザー情報を付加
            return filteredMessages.map(enrichMessage);
          }
        } catch {
          // JSONファイルも存在しない場合
        }
        return [];
      }
    } catch (error) {
      console.error("Error loading messages:", error);
      return [];
    }
  },
);
