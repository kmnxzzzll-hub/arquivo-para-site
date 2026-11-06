import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ChartNoAxesCombined, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateSignal, getLastSignal, getLiveConfig, type SignalDTO } from "@/lib/app.functions";
import { DEFAULT_TOTAL_GAINS, formatKz } from "@/lib/config";
import { useLiveRoad } from "@/hooks/use-live-road";
import type { Outcome } from "@/lib/stats";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({ meta: [{ title: "Início — Bac Bo Live" }, { name: "description", content: "Sinais Bac Bo Live ao vivo." }, { property: "og:title", content: "Início — Bac Bo Live" }, { property: "og:description", content: "Sinais Bac Bo Live ao vivo." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Painel,
});

const CARDS: { o: Outcome; label: string; text: string; dot: string; glow: string }[] = [
  { o: "banker", label: "Vermelho", text: "text-banker", dot: "bg-banker", glow: "border-banker/40 shadow-[0_0_10px_-8px_var(--banker)]" },
  { o: "tie", label: "Empate", text: "text-tie", dot: "bg-tie", glow: "border-tie/40 shadow-[0_0_10px_-8px_var(--tie)]" },
  { o: "player", label: "Azul", text: "text-player", dot: "bg-player", glow: "border-player/40 shadow-[0_0_10px_-8px_var(--player)]" },
];
const ENTRY = {
  banker: { name: "BANQUEIRO", circle: "entry-banker" },
  player: { name: "JOGADOR", circle: "entry-player" },
} as const;
const TIMEOUT_MS = 10000;
const WAIT_MS = 5000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))]);
}

function Painel() {
  const qc = useQueryClient();
  const gen = useServerFn(generateSignal);
  const lastFn = useServerFn(getLastSignal);
  const cfgFn = useServerFn(getLiveConfig);
  const last = useQuery({ queryKey: ["last-signal"], queryFn: () => lastFn() });
  const cfg = useQuery({ queryKey: ["live-config"], queryFn: () => cfgFn(), staleTime: 60_000 });
  const live = useLiveRoad(cfg.data?.socketUrl);
  const [fresh, setFresh] = useState<SignalDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const res = fresh ?? last.data ?? null;

  async function run() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    const started = Date.now();
    try {
      const history = live.status === "live" && live.road ? live.road.history.slice(-300) : undefined;
      const r = await withTimeout(gen({ data: history ? { live: history } : {} }));
      if (r.ints.banker + r.ints.tie + r.ints.player !== 100) throw new Error("invalid");
      const wait = WAIT_MS - (Date.now() - started);
      if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
      setFresh(r);
      qc.setQueryData(["last-signal"], r);
    } catch {
      setError("Tenta novamente.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  const lead = res && !loading ? res.winner : null;

  return (
    <section className="mx-auto flex min-h-[calc(100svh-9rem)] w-full max-w-xl flex-col gap-4">
      <h1 className="sr-only">Bac Bo Live</h1>

      <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success" aria-hidden>
          <ChartNoAxesCombined className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ganhos totais</div>
          <div className="num truncate text-2xl text-foreground sm:text-3xl">{formatKz(cfg.data?.totalGains ?? DEFAULT_TOTAL_GAINS)}</div>
        </div>
      </div>

      <LiveStrip status={live.status} stats={live.road?.stats} />

      <div className="grid w-full grid-cols-3 gap-2 sm:gap-3" aria-label="Probabilidades">
        {CARDS.map((c) => (
          <div key={c.o} className={`flex min-w-0 flex-col items-center justify-center rounded-lg border bg-secondary/40 px-1 py-5 transition-all duration-500 sm:py-6 ${lead === c.o ? c.glow : "border-border"}`}>
            <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-tight sm:gap-2 sm:text-sm ${c.text}`}><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`} />{c.label}</div>
            <div className="num mt-2 text-3xl text-foreground sm:text-5xl">{res ? `${res.ints[c.o]}%` : "—"}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-7" aria-live="polite">
        {loading ? (
          <>
            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-muted"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></span>
            <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">A analisar a mesa…</div>
          </>
        ) : lead ? (
          <div key={res?.created_at} className="animate-rise flex flex-col items-center gap-3">
            <span className={`h-24 w-24 rounded-full ${ENTRY[lead].circle}`} aria-hidden />
            <div className="text-sm font-extrabold uppercase tracking-wider text-success">✅ Entrada confirmada</div>
            <div className="num text-4xl text-foreground sm:text-5xl">{ENTRY[lead].name}</div>
          </div>
        ) : (
          <>
            <span className="h-24 w-24 rounded-full border-2 border-dashed border-border" aria-hidden />
            <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Sem sinal ativo</div>
          </>
        )}
      </div>

      <div className="mt-auto flex w-full flex-col items-center gap-2">
        <Button variant="hero" className="h-16 w-full max-w-sm rounded-xl px-3 text-base font-extrabold tracking-tight sm:text-lg" disabled={loading} onClick={run}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm normal-case">A gerar sinal...</span></>
            : res ? <><RotateCw className="h-5 w-5" />GERAR NOVO SINAL</>
            : "GERAR SINAL"}
        </Button>
        <p role="status" className="flex h-5 items-center text-center text-sm font-bold text-destructive">{error ?? ""}</p>
      </div>

      <footer className="text-center text-sm font-extrabold tracking-tight">Acertividade 98%</footer>
    </section>
  );
}

function LiveStrip({ status, stats }: { status: ReturnType<typeof useLiveRoad>["status"]; stats: { banker: number; player: number; tie: number } | undefined }) {
  if (status === "off") return null;
  const label = status === "live" ? "Mesa ao vivo" : status === "connecting" ? "A ligar à mesa…" : "Mesa indisponível · rodadas gravadas";
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs font-bold">
      <span className="flex items-center gap-2 uppercase tracking-wide text-muted-foreground">
        <span aria-hidden className={`h-2 w-2 rounded-full ${status === "live" ? "live-dot" : "bg-muted-foreground/50"}`} />
        {label}
      </span>
      {status === "live" && stats && (
        <span className="num flex gap-3 text-sm text-foreground">
          <span>🔴 {stats.banker}</span><span>🔵 {stats.player}</span><span>🟡 {stats.tie}</span>
        </span>
      )}
    </div>
  );
}
