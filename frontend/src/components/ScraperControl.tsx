"use client";

import { useCallback, useEffect, useState } from "react";

const SCRAPER_URL = process.env.NEXT_PUBLIC_SCRAPER_URL || "http://localhost:8081";

interface ScraperStatus {
  active: boolean;
  videoURL: string;
  commentsSeen: number;
}

export default function ScraperControl() {
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch(`${SCRAPER_URL}/status`);
      const data = await res.json();
      setStatus(data);
      setOffline(false);
    } catch {
      setOffline(true);
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 3000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  async function handleStart() {
    if (!url.trim()) {
      setError("Enter a Facebook Live URL");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${SCRAPER_URL}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start");
      }
      await new Promise((r) => setTimeout(r, 1000));
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start scraper");
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    try {
      await fetch(`${SCRAPER_URL}/stop`, { method: "POST" });
      await refreshStatus();
    } catch {
      setError("Failed to stop scraper");
    }
  }

  // Scraper service not running
  if (offline) {
    return (
      <div className="bg-white rounded-lg shadow p-5 border-l-4 border-gray-300">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          <h2 className="font-bold text-gray-800">Facebook Live</h2>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Start the scraper service to connect to Facebook Live.
        </p>
        <pre className="bg-gray-900 text-green-400 text-xs p-3 rounded overflow-x-auto">
          <code>cd scraper && npm start</code>
        </pre>
        <p className="text-xs text-gray-400 mt-2">
          Run this in a separate terminal, then refresh.
        </p>
      </div>
    );
  }

  // Scraper is actively polling
  if (status?.active) {
    return (
      <div className="bg-white rounded-lg shadow p-5 border-l-4 border-green-500">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <h2 className="font-bold text-gray-800">Facebook Live</h2>
          </div>
          <span className="flex items-center gap-1.5 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Listening
          </span>
        </div>
        <p className="text-sm text-gray-600 truncate mb-1">{status.videoURL}</p>
        <p className="text-xs text-gray-400">{status.commentsSeen} comments captured</p>
        <button
          onClick={handleStop}
          className="mt-3 w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded text-sm transition-colors"
        >
          Stop Listening
        </button>
      </div>
    );
  }

  // Ready to start
  return (
    <div className="bg-white rounded-lg shadow p-5 border-l-4 border-blue-500">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
        <h2 className="font-bold text-gray-800">Facebook Live</h2>
      </div>
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
      <p className="text-sm text-gray-500 mb-3">
        Paste your Facebook Live video URL to start capturing comments.
      </p>
      <input
        type="text"
        placeholder="https://www.facebook.com/YourPage/videos/123456"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleStart()}
        className="w-full border rounded px-3 py-2 text-sm text-gray-800 mb-3"
      />
      <button
        onClick={handleStart}
        disabled={loading || !url.trim()}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors disabled:opacity-50"
      >
        {loading ? "Connecting..." : "Start Listening"}
      </button>
    </div>
  );
}
