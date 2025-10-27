export interface IElectronAPI {
  selectDirectory: () => Promise<string | null>;
  listChannels: (dirPath: string) => Promise<string[]>;
  getChannelDateRange: (
    channelPath: string,
  ) => Promise<{ first: string; last: string } | null>;
  loadMessages: (
    channelPath: string,
    startDate: string,
    endDate: string,
  ) => Promise<SlackMessage[]>;
}

export interface SlackMessage {
  user: string;
  type: string;
  ts: string;
  text?: string;
  user_profile?: {
    real_name?: string;
    display_name?: string;
    image_72?: string;
  };
  files?: Array<{
    name?: string;
    thumb_360?: string; // 画像プレビュー用
    url_private_download?: string; // ダウンロード用だがローカルでは直接使えない可能性
    permalink?: string; // Slack上でのパーマリンク
  }>;
  attachments?: Array<{
    title?: string;
    text?: string;
    image_url?: string;
    thumb_url?: string;
    from_url?: string;
    service_name?: string;
    title_link?: string;
  }>;
  blocks?: Array<any>; // blocks構造は複雑なのでanyで一旦定義
  // 他にも多くのフィールドが存在する可能性があります
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
