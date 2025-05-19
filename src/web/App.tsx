import { useState, useEffect } from "react";
import "./App.css";
import type { SlackMessage } from "../renderer";

export const App = () => {
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(
    null,
  );
  const [channels, setChannels] = useState<string[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [channelDateRange, setChannelDateRange] = useState<{
    first: string;
    last: string;
  } | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleDirectorySelect = async () => {
    setError(null);
    setChannels([]);
    setSelectedChannel(null);
    setChannelDateRange(null);
    setMessages([]);
    setStartDate("");
    setEndDate("");
    const path = await window.electronAPI.selectDirectory();
    if (path) {
      setSelectedDirectory(path);
    } else {
      setSelectedDirectory(null);
    }
  };

  useEffect(() => {
    if (selectedDirectory) {
      const fetchChannels = async () => {
        try {
          const channelList = await window.electronAPI.listChannels(
            selectedDirectory,
          );
          setChannels(channelList);
          if (channelList.length > 0) {
            setSelectedChannel(channelList[0]);
          }
        } catch (e: any) {
          setError(`チャンネルの読み込みに失敗しました: ${e.message}`);
        }
      };
      fetchChannels();
    }
  }, [selectedDirectory]);

  useEffect(() => {
    if (selectedChannel && selectedDirectory) {
      const fetchDateRange = async () => {
        try {
          const channelPath = `${selectedDirectory}/${selectedChannel}`;
          const range = await window.electronAPI.getChannelDateRange(
            channelPath,
          );
          setChannelDateRange(range);
          if (range) {
            setStartDate(range.first);
            setEndDate(range.last);
          } else {
            setStartDate("");
            setEndDate("");
          }
        } catch (e: any) {
          setError(`日付範囲の取得に失敗しました: ${e.message}`);
        }
      };
      fetchDateRange();
      setMessages([]); // チャンネル変更時にメッセージをクリア
    }
  }, [selectedChannel, selectedDirectory]);

  const handleLoadMessages = async () => {
    if (!selectedDirectory || !selectedChannel || !startDate || !endDate) {
      setError("ディレクトリ、チャンネル、日付範囲を選択・入力してください。");
      return;
    }
    setError(null);
    try {
      const channelPath = `${selectedDirectory}/${selectedChannel}`;
      const loadedMessages = await window.electronAPI.loadMessages(
        channelPath,
        startDate,
        endDate,
      );
      setMessages(loadedMessages);
      if (loadedMessages.length === 0) {
        setError("指定された範囲にメッセージはありませんでした。");
      }
    } catch (e: any) {
      setError(`メッセージの読み込みに失敗しました: ${e.message}`);
    }
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(parseFloat(ts) * 1000);
    return date.toLocaleString();
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Slack Archive Reader</h1>
        <button onClick={handleDirectorySelect}>アーカイブディレクトリを選択</button>
        {selectedDirectory && <p>選択中: {selectedDirectory}</p>}
      </header>

      {error && <p className="error-message">{error}</p>}

      {channels.length > 0 && (
        <section className="channel-section">
          <h2>チャンネル</h2>
          <select
            aria-label="チャンネル選択"
            value={selectedChannel || ""}
            onChange={(e) => setSelectedChannel(e.target.value)}
          >
            {channels.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
          {channelDateRange && (
            <p>
              データ範囲: {channelDateRange.first} ~ {channelDateRange.last}
            </p>
          )}
        </section>
      )}

      {selectedChannel && channelDateRange && (
        <section className="date-range-section">
          <h2>日付範囲指定</h2>
          <div>
            <label htmlFor="startDate">開始日:</label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              min={channelDateRange.first}
              max={channelDateRange.last}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="endDate">終了日:</label>
            <input
              type="date"
              id="endDate"
              value={endDate}
              min={channelDateRange.first}
              max={channelDateRange.last}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <button onClick={handleLoadMessages}>メッセージを読み込む</button>
        </section>
      )}

      {messages.length > 0 && (
        <section className="messages-section">
          <h2>メッセージ</h2>
          <div className="messages-list">
            {messages.map((msg) => (
              <div key={msg.ts} className="message-item">
                <div className="message-header">
                  <img
                    src={msg.user_profile?.image_72}
                    alt={msg.user_profile?.real_name || msg.user}
                    className="avatar"
                  />
                  <strong>
                    {msg.user_profile?.display_name ||
                      msg.user_profile?.real_name ||
                      msg.user}
                  </strong>
                  <span className="timestamp">{formatTimestamp(msg.ts)}</span>
                </div>
                <div
                  className="message-text"
                  dangerouslySetInnerHTML={{
                    __html: msg.text?.replace(/\n/g, "<br />") || "",
                  }}
                />
                {/* TODO: ファイルや添付ファイルの表示 */}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};