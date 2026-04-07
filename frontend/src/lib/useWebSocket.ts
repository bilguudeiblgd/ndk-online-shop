"use client";

import { useEffect, useRef, useCallback } from "react";
import type { WSEvent } from "./types";

export function useWebSocket(onEvent: (event: WSEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const wsUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/^http/, "ws") + "/ws";
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (e) => {
      try {
        const event: WSEvent = JSON.parse(e.data);
        onEventRef.current(event);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      // Reconnect after 2s
      setTimeout(connect, 2000);
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);
}
