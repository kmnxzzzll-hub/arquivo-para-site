// Server-only: opens the live table socket from the server (the casino refuses browser
// connections coming from another site), waits for the first "bacbo.road" event and closes.
import { parseKickout, parseRoadMessage, type Road } from "./road";

export type ProbeResult =
  | { status: "live"; road: Road }
  | { status: "refused"; httpStatus: number | null }
  | { status: "kicked"; reason: string }
  | { status: "no_data" }
  | { status: "error" };

const UA = "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

type Sock = { send(d: string): void; close(): void; addEventListener(t: string, cb: (e: any) => void): void };

function listen(ws: Sock, timeoutMs: number, opened: boolean): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let done = false;
    let isOpen = opened;
    const finish = (r: ProbeResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* already closed */ }
      resolve(r);
    };
    const timer = setTimeout(() => finish(isOpen ? { status: "no_data" } : { status: "refused", httpStatus: null }), timeoutMs);
    ws.addEventListener("open", () => { isOpen = true; });
    ws.addEventListener("message", (e) => {
      const data = typeof e.data === "string" ? e.data : "";
      const road = parseRoadMessage(data);
      if (road) return finish({ status: "live", road });
      const kick = parseKickout(data);
      if (kick) finish({ status: "kicked", reason: kick });
    });
    ws.addEventListener("error", () => finish(isOpen ? { status: "error" } : { status: "refused", httpStatus: null }));
    ws.addEventListener("close", () => finish(isOpen ? { status: "no_data" } : { status: "refused", httpStatus: null }));
  });
}

export async function probeLiveRoad(url: string, timeoutMs = 5000): Promise<ProbeResult> {
  try {
    const host = new URL(url).host;
    const headers: Record<string, string> = { Origin: `https://${host}`, "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" };
    if (typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== "undefined") {
      // Hosted runtime: outbound sockets are opened with an upgrade request.
      const resp = await fetch(url.replace(/^wss:/, "https:"), { headers: { ...headers, Upgrade: "websocket" } });
      const ws = (resp as unknown as { webSocket?: Sock & { accept(): void } }).webSocket;
      if (!ws) return { status: "refused", httpStatus: resp.status };
      ws.accept();
      return await listen(ws, timeoutMs, true);
    }
    // Local dev runtime: WebSocket client that accepts custom headers.
    const ws = new (WebSocket as unknown as new (u: string, o: unknown) => Sock)(url, { headers });
    return await listen(ws, timeoutMs, false);
  } catch (e) {
    console.error("live probe failed", e instanceof Error ? e.message : "unknown");
    return { status: "error" };
  }
}

const cache = new Map<string, { at: number; result: ProbeResult }>();

/** Same as probeLiveRoad, reusing a result for a few seconds so many members don't each open a connection. */
export async function cachedLiveRoad(url: string, maxAgeMs = 10_000): Promise<ProbeResult> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.result;
  const result = await probeLiveRoad(url);
  cache.clear();
  cache.set(url, { at: Date.now(), result });
  return result;
}

/** Plain-English explanation of a probe result for the administrator. */
export function explainProbe(r: ProbeResult): string {
  switch (r.status) {
    case "live": return `Connected. The table sent its history (${r.road.history.length} rounds).`;
    case "refused": return `The casino refused the connection${r.httpStatus ? ` (code ${r.httpStatus})` : ""}. The session has probably expired — open the game again and copy a fresh address.`;
    case "kicked": return r.reason === "notAuthorised"
      ? "Connected, but the casino rejected the session (notAuthorised). The EVOSESSIONID is expired or wrong — open the game again and copy a fresh address."
      : `Connected, but the casino closed the connection (${r.reason}).`;
    case "no_data": return "Connected, but no table history arrived within 5 seconds. Check that the table in the address is correct.";
    default: return "Could not reach the table server. Try again in a moment.";
  }
}
