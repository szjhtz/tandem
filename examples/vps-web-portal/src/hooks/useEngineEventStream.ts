import { useCallback, useEffect, useRef, useState } from "react";
import { api, type JsonObject } from "../api";

export interface LiveEngineEvent {
  id: string;
  type: string;
  at: number;
  payload: JsonObject;
}

export const useEngineEventStream = (enabled = true) => {
  const [events, setEvents] = useState<LiveEngineEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const clear = useCallback(() => {
    setEvents([]);
  }, []);

  useEffect(() => {
    if (!enabled || !api.getToken()) {
      return;
    }

    let closed = false;
    const connect = () => {
      if (closed) return;
      const source = new EventSource(api.getGlobalEventStreamUrl());
      sourceRef.current = source;

      source.onopen = () => {
        setConnected(true);
      };

      source.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data) as JsonObject;
          const type = typeof parsed.type === "string" ? parsed.type : "unknown";
          setEvents((prev) => {
            const next = [
              ...prev,
              {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                type,
                at: Date.now(),
                payload: parsed,
              },
            ];
            return next.slice(-500);
          });
        } catch {
          // ignore malformed SSE payloads
        }
      };

      source.onerror = () => {
        setConnected(false);
        source.close();
        sourceRef.current = null;
        if (!closed) {
          window.setTimeout(connect, 1500);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [enabled]);

  return { events, connected, clear };
};
