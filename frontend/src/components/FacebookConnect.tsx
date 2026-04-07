"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getFBStatus,
  setFBToken,
  startFBPolling,
  stopFBPolling,
  type FBStatus,
} from "@/lib/fb-api";

export default function FacebookConnect() {
  const [status, setStatus] = useState<FBStatus | null>(null);
  const [token, setToken] = useState("");
  const [videoId, setVideoId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getFBStatus();
      setStatus(s);
    } catch {
      // backend may not be running yet
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  async function handleSetToken() {
    setError("");
    setLoading(true);
    try {
      await setFBToken(token);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set token");
    } finally {
      setLoading(false);
    }
  }

  async function handleStartPolling() {
    setError("");
    if (!videoId.trim()) {
      setError("Enter a Live Video ID");
      return;
    }
    setLoading(true);
    try {
      await startFBPolling(videoId.trim());
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start polling");
    } finally {
      setLoading(false);
    }
  }

  async function handleStopPolling() {
    try {
      await stopFBPolling();
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop polling");
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-5 border-l-4 border-blue-500">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-800">Facebook Live</h2>
        {status?.connected && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
            Token Set
          </span>
        )}
      </div>

      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

      {/* Polling active */}
      {status?.polling ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-gray-600">
              Listening to video{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">
                {status.activeVideoId}
              </code>
            </span>
          </div>
          <p className="text-xs text-gray-400">
            Comments matching claim codes will automatically create orders.
          </p>
          <button
            onClick={handleStopPolling}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded text-sm transition-colors"
          >
            Stop Listening
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Step 1: Set token */}
          {!status?.connected ? (
            <>
              <p className="text-sm text-gray-500">
                Get a Page Access Token from the{" "}
                <a
                  href="https://developers.facebook.com/tools/explorer/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  Graph API Explorer
                </a>
                {" "}with{" "}
                <code className="text-xs bg-gray-100 px-1 rounded">pages_manage_posts</code>{" "}
                and{" "}
                <code className="text-xs bg-gray-100 px-1 rounded">pages_read_engagement</code>{" "}
                permissions.
              </p>
              <input
                type="text"
                placeholder="Paste Page Access Token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm text-gray-800 font-mono"
              />
              <button
                onClick={handleSetToken}
                disabled={loading || !token.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                {loading ? "Connecting..." : "Connect"}
              </button>
            </>
          ) : (
            <>
              {/* Step 2: Enter video ID and start */}
              <p className="text-sm text-gray-500">
                Enter your Facebook Live Video ID to start capturing comments.
              </p>
              <input
                type="text"
                placeholder="Live Video ID (e.g. 123456789)"
                value={videoId}
                onChange={(e) => setVideoId(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm text-gray-800 font-mono"
              />
              <button
                onClick={handleStartPolling}
                disabled={loading || !videoId.trim()}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded transition-colors disabled:opacity-50"
              >
                {loading ? "Starting..." : "Start Listening"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
