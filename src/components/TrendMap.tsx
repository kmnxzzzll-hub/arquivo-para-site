import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLiveConfig, recentWinners } from "@/lib/app.functions";
import { lastRounds, parseRoadMessage, roadCounts, ROAD_SIZE, type RoadStats } from "@/lib/road";
import type { Outcome } from "@/lib/stats";

type Status = "off" | "connecting" | "live" | "failed";

const DOT: Record<Outcome, string> = {
  banker: "bg-banker shadow-[0_0_8px_-1px_var(--banker)]",
  player: "bg-player shadow-[0_0_8px_-1px_var(--player)]",
  tie: "bg-tie shadow-[0_0_8px_-1px_var(--tie)]",
};
const NAME: Record<Outcome, string> = { banker: "Vermelho", player: "Azul", tie: "Empate" };

/** Liga à mesa ao vivo (evento bacbo.road) quando há ligação configurada; senão usa as rodadas gravadas. */
function useLiveRoad(url: string) {
  const [status, setStatus] = useState<Status>("off");
  const [road, setRoad] = useState<{ history: Outcome[]; stats: RoadStats } | null>(null);
  const attempts = useRef(0);

  useEffect(() => {
    if (!url) { setStatus("off"); return; }
    let ws: WebSocket | null = null;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    attempts.current = 0;

    const connect = () => {
      setStatus("connecting");
      try { ws = new WebSocket(url); } catch { setStatus("failed"); return; }
      ws.onopen = () => {
        attempts.current = 0;
        ping = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ id: Math.random().toString(36).slice(2, 12), type: "metrics.ping", args: { t: Date.now() } }));
        }, 5000);
      };
      ws.onmessage = (e) => {
        const r = typeof e.data === "string" ? parseRoadMessage(e.data) : null;
        if (r && r.history.length) { setRoad(r); setStatus("live"); }
      };
      ws.onclose = () => {
        clearInterval(ping);
        if (closed) return;
        attempts.current += 1;
        if (attempts.current > 4) { setStatus("failed"); return; }
        setStatus("connecting");
        retry = setTimeout(connect, Math.min(30_000, 2000 * 2 ** attempts.current));
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => { closed = true; clearInterval(ping); clearTimeout(retry); ws?.close(); };
  }, [url]);

  return { status, road };
}

export function TrendMap() {
  const cfgFn = useServerFn(getLiveConfig);
  const recentFn = useServerFn(recentWinners);
  const cfg = useQuery({ queryKey: ["live-config"], queryFn: () => cfgFn(), staleTime: 5 * 60_000 });
  const recorded = useQuery({ queryKey: ["recent-winners"], queryFn: () => recentFn() });
  const { status, road } = useLiveRoad(cfg.data?.socketUrl ?? "");

  const live = status === "live" && road;
  const history = lastRounds(live ? road.history : recorded.data ?? []);
  const stats = live ? road.stats : roadCounts(history);
  const cells: (Outcome | null)[] = [...history, ...Array(Math.max(0, 42 - history.length)).fill(null)].slice(0, 42);

  const label =
    live ? "Ao vivo da mesa" :
    status === "connecting" ? "A ligar à mesa…" :
    status === "failed" ? "Mesa indisponível · rodadas gravadas" :
    "Rodadas gravadas";

  return (
    <section className="w-full rounded-2xl border border-border bg-secondary/40 p-3 sm:p-4" aria-label="Mapa de tendências">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-tight">Mapa de tendências</h2>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-success" : status === "failed" ? "bg-destructive" : "bg-muted-foreground"}`} />
          {label}
        </span>
      </div>
      <div className="grid grid-flow-col grid-rows-6 gap-1 sm:gap-1.5" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {cells.map((o, i) => (
          <div key={i} className="flex aspect-square items-center justify-center">
            {o ? (
              <span title={NAME[o]} className={`h-full max-h-7 w-full max-w-7 rounded-full ${DOT[o]} ${i === history.length - 1 ? "ring-2 ring-foreground/80" : ""}`} />
            ) : (
              <span className="h-full max-h-7 w-full max-w-7 rounded-full border border-border/60" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-4 text-xs font-bold tabular-nums">
        <span>🔴 {stats.banker}</span>
        <span>🔵 {stats.player}</span>
        <span>🟡 {stats.tie}</span>
      </div>
      {!history.length && !recorded.isLoading && (
        <p className="mt-2 text-center text-xs text-muted-foreground">Ainda não há rodadas. Gera um sinal para começar.</p>
      )}
      <p className="sr-only">Últimas {ROAD_SIZE} rodadas, da mais antiga para a mais recente.</p>
    </section>
  );
}
