import { useEffect, useState } from "react";
import { isValidSocketUrl, parseRoadMessage, type Road } from "@/lib/road";

export type LiveStatus = "off" | "connecting" | "live" | "failed";

const MAX_RETRIES = 4;
const PING_MS = 5000;

/**
 * Liga-se (no navegador) à WebSocket da mesa configurada e devolve o último evento "bacbo.road".
 * Reconecta com espera crescente; após MAX_RETRIES falhas seguidas fica "failed".
 */
export function useLiveRoad(url: string | undefined) {
  const [road, setRoad] = useState<Road | null>(null);
  const [status, setStatus] = useState<LiveStatus>("off");

  useEffect(() => {
    if (!url || !isValidSocketUrl(url)) { setStatus("off"); setRoad(null); return; }
    let ws: WebSocket | null = null;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let closed = false;

    const connect = () => {
      setStatus((s) => (s === "live" ? s : "connecting"));
      try { ws = new WebSocket(url); } catch { schedule(); return; }
      ws.onopen = () => {
        attempts = 0;
        ping = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: String(Date.now()), type: "metrics.ping", args: { t: Date.now() } }));
        }, PING_MS);
      };
      ws.onmessage = (e) => {
        const r = parseRoadMessage(typeof e.data === "string" ? e.data : "");
        if (r) { setRoad(r); setStatus("live"); }
      };
      ws.onclose = () => { clearInterval(ping); if (!closed) schedule(); };
      ws.onerror = () => ws?.close();
    };
    const schedule = () => {
      if (closed) return;
      if (attempts >= MAX_RETRIES) { setStatus("failed"); return; }
      const wait = 1000 * 2 ** attempts++;
      setStatus("connecting");
      retry = setTimeout(connect, wait);
    };

    connect();
    return () => { closed = true; clearInterval(ping); clearTimeout(retry); ws?.close(); };
  }, [url]);

  return { road, status };
}
