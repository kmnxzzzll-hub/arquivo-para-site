import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  RotateCw,
  Zap,
  Flame,
  Snowflake,
  GitBranch,
  Download,
  Check,
  X,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateSignal, listSignals, type SignalDTO, type SignalRow } from "@/lib/app.functions";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [{ title: "Dashboard — Bac Bo Live" }],
  }),
  component: Painel,
});

const TIMEOUT_MS = 16000;
const WAIT_MS = 3200;
const RESULTS_KEY = "bacbo_signal_results_v1";

type LocalResult = "win" | "loss" | "skip";

function loadResults(): Record<string, LocalResult> {
  try {
    return JSON.parse(localStorage.getItem(RESULTS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveResult(id: string, r: LocalResult) {
  const all = loadResults();
  all[id] = r;
  localStorage.setItem(RESULTS_KEY, JSON.stringify(all));
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))]);
}

function vibrateSoft() {
  try {
    navigator.vibrate?.(40);
  } catch {
    /* ignore */
  }
}

function playTick() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    o.stop(ctx.currentTime + 0.16);
  } catch {
    /* ignore */
  }
}

function Painel() {
  const gen = useServerFn(generateSignal);
  const listFn = useServerFn(listSignals);
  const histQ = useQuery({ queryKey: ["signals"], queryFn: () => listFn(), refetchOnWindowFocus: true });

  const [fresh, setFresh] = useState<SignalDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"normal" | "strict">("normal");
  const [sound, setSound] = useState(true);
  const [results, setResults] = useState<Record<string, LocalResult>>({});
  const busy = useRef(false);

  useEffect(() => {
    setResults(loadResults());
  }, []);

  const conf = fresh
    ? { banker: fresh.ints.banker, player: fresh.ints.player, tie: fresh.ints.tie }
    : { banker: 34, player: 34, tie: 32 };

  const stats = fresh?.tableStats ?? { banker: 0, player: 0, tie: 0 };
  const streak = fresh?.streak ?? { side: null, length: 0 };

  async function run() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    const started = Date.now();
    try {
      const r = await withTimeout(gen({ data: { mode } }));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const wait = WAIT_MS - (Date.now() - started);
      if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
      setFresh(r.signal);
      if (sound) {
        vibrateSoft();
        playTick();
      }
      histQ.refetch();
    } catch {
      setError("Tente novamente.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  function mark(id: string, r: LocalResult) {
    if (!id) return;
    saveResult(id, r);
    setResults((prev) => ({ ...prev, [id]: r }));
  }

  function exportCsv() {
    const rows = histQ.data ?? [];
    const lines = ["id,created_at,winner,banker,player,tie,result"];
    for (const s of rows) {
      const res = results[s.id] ?? "";
      lines.push(
        `${s.id},${s.created_at},${s.winner},${s.banker},${s.player},${s.tie},${res}`,
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bacbo-sinais-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const lead = fresh && !loading ? fresh.winner : null;
  const entryLabel = lead === "banker" ? "VERMELHO" : lead === "player" ? "AZUL" : null;
  const entrySide = lead === "banker" ? "CASA" : lead === "player" ? "JOGADOR" : null;

  const scored = (histQ.data ?? []).filter((s) => results[s.id] === "win" || results[s.id] === "loss");
  const wins = scored.filter((s) => results[s.id] === "win").length;
  const winRate = scored.length ? Math.round((wins / scored.length) * 1000) / 10 : null;

  return (
    <section className="mx-auto flex min-h-[calc(100svh-8.5rem)] w-full max-w-lg flex-col gap-4">
      <h1 className="sr-only">Dashboard Bac Bo</h1>

      {/* Mode + sound */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-xl bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setMode("normal")}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
              mode === "normal" ? "bg-white/10 text-foreground" : "text-muted-foreground"
            }`}
          >
            Frequentes
          </button>
          <button
            type="button"
            onClick={() => setMode("strict")}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
              mode === "strict" ? "bg-white/10 text-foreground" : "text-muted-foreground"
            }`}
          >
            Alta confiança
          </button>
        </div>
        <button
          type="button"
          onClick={() => setSound((s) => !s)}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold ${
            sound ? "text-foreground" : "text-muted-foreground"
          }`}
          title="Som e vibração"
        >
          <Volume2 className="h-3.5 w-3.5" />
          {sound ? "Som on" : "Som off"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatChip
          icon={<Flame className="h-3.5 w-3.5 text-banker" />}
          label="Vermelhos"
          value={stats.banker || fresh ? String(stats.banker) : "—"}
        />
        <StatChip
          icon={<Snowflake className="h-3.5 w-3.5 text-player" />}
          label="Azuis"
          value={stats.player || fresh ? String(stats.player) : "—"}
        />
        <StatChip
          icon={<GitBranch className="h-3.5 w-3.5 text-tie" />}
          label="Sequência"
          value={
            streak.length
              ? `${streak.length}${streak.side === "banker" ? "R" : streak.side === "player" ? "A" : ""}`
              : "—"
          }
        />
      </div>

      {/* Confidence monitor */}
      <div className="glass-card space-y-3.5 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Monitor de confiança
          </span>
          {winRate != null && (
            <span className="text-[11px] font-bold text-success">{winRate}% acerto</span>
          )}
        </div>
        <ConfBar label="Casa / Vermelho" pct={conf.banker} color="var(--banker)" active={lead === "banker"} />
        <ConfBar label="Jogador / Azul" pct={conf.player} color="var(--player)" active={lead === "player"} />
        <ConfBar label="Empate" pct={conf.tie} color="var(--tie)" active={false} />
      </div>

      {/* Big signal */}
      <div className="glass-card relative flex flex-col items-center justify-center gap-3 overflow-hidden px-5 py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,oklch(0.4_0.1_265/0.2),transparent_60%)]" />

        {loading ? (
          <div className="relative z-10 flex flex-col items-center gap-4 animate-rise">
            <span className="flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-white/5">
              <Loader2 className="h-9 w-9 animate-spin text-muted-foreground" />
            </span>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">Analisando…</p>
          </div>
        ) : lead && entryLabel ? (
          <div key={fresh?.created_at} className="relative z-10 flex w-full flex-col items-center gap-3 animate-rise">
            <span
              className={`h-28 w-28 rounded-full ${lead === "banker" ? "entry-banker" : "entry-player"}`}
              aria-hidden
            />
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-success">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success/20 text-[10px]">
                ✓
              </span>
              Entrada confirmada · {fresh?.confidence}%
            </div>
            <div className="text-center">
              <div className="num text-3xl tracking-wide sm:text-4xl">Apostar no {entryLabel}</div>
              <div className="mt-1 text-sm font-semibold text-muted-foreground">{entrySide}</div>
            </div>
            <div className="rounded-full border border-tie/30 bg-tie/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-tie">
              Proteger empate
            </div>
            {fresh?.reason && (
              <p className="mt-1 max-w-xs text-center text-[11px] leading-relaxed text-muted-foreground">
                {fresh.reason}
              </p>
            )}
            {fresh?.id && !results[fresh.id] && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" className="gap-1" onClick={() => mark(fresh.id, "win")}>
                  <Check className="h-3.5 w-3.5 text-success" /> WIN
                </Button>
                <Button size="sm" variant="secondary" className="gap-1" onClick={() => mark(fresh.id, "loss")}>
                  <X className="h-3.5 w-3.5 text-destructive" /> LOSS
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="relative z-10 flex flex-col items-center gap-3">
            <span className="flex h-28 w-28 items-center justify-center rounded-full border border-dashed border-white/12 bg-white/[0.03]">
              <Zap className="h-8 w-8 text-muted-foreground/50" />
            </span>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">Sem sinal</p>
            <p className="max-w-[220px] text-center text-xs text-muted-foreground/65">
              {mode === "strict"
                ? "Modo alta confiança: só emite se o lado tiver ≥ 52%."
                : "Gere um sinal para receber a cor e a proteção de empate."}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button
          variant="hero"
          className="h-14 w-full rounded-2xl text-base font-extrabold tracking-wide shadow-[0_0_36px_-12px_oklch(0.64_0.2_262/0.55)]"
          disabled={loading}
          onClick={run}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm normal-case">Gerando…</span>
            </>
          ) : fresh ? (
            <>
              <RotateCw className="h-4 w-4" />
              GERAR NOVO SINAL
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              GERAR SINAL
            </>
          )}
        </Button>
        <p role="status" className="min-h-5 text-center text-sm font-semibold text-destructive">
          {error ?? ""}
        </p>
      </div>

      {/* History */}
      <div className="glass-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Histórico de sinais
          </h2>
          <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>
        <ul className="max-h-48 space-y-1.5 overflow-auto text-xs">
          {(histQ.data ?? []).slice(0, 20).map((s) => (
            <HistoryRow key={s.id} s={s} result={results[s.id]} onMark={mark} />
          ))}
          {!histQ.data?.length && (
            <li className="py-4 text-center text-muted-foreground">Ainda sem sinais.</li>
          )}
        </ul>
      </div>
    </section>
  );
}

function HistoryRow({
  s,
  result,
  onMark,
}: {
  s: SignalRow;
  result?: LocalResult;
  onMark: (id: string, r: LocalResult) => void;
}) {
  const color = s.winner === "banker" ? "text-banker" : "text-player";
  const label = s.winner === "banker" ? "VERMELHO" : "AZUL";
  const pct = s.winner === "banker" ? s.banker : s.player;
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-2">
      <div className="min-w-0">
        <span className={`font-bold ${color}`}>{label}</span>
        <span className="ml-2 text-muted-foreground">{pct}%</span>
        <div className="text-[10px] text-muted-foreground/70">
          {new Date(s.created_at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {result === "win" && <span className="font-bold text-success">WIN</span>}
        {result === "loss" && <span className="font-bold text-destructive">LOSS</span>}
        {!result && (
          <>
            <button
              type="button"
              className="rounded p-1 hover:bg-success/15"
              aria-label="Marcar WIN"
              onClick={() => onMark(s.id, "win")}
            >
              <Check className="h-3.5 w-3.5 text-success" />
            </button>
            <button
              type="button"
              className="rounded p-1 hover:bg-destructive/15"
              aria-label="Marcar LOSS"
              onClick={() => onMark(s.id, "loss")}
            >
              <X className="h-3.5 w-3.5 text-destructive" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass-card flex flex-col items-center gap-1 px-2 py-3">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="num text-xl text-foreground">{value}</div>
    </div>
  );
}

function ConfBar({
  label,
  pct,
  color,
  active,
}: {
  label: string;
  pct: number;
  color: string;
  active: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] font-semibold">
        <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
        <span className="num text-xs" style={{ color: active ? color : undefined }}>
          {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: color,
            boxShadow: active ? `0 0 12px -2px ${color}` : undefined,
            opacity: active ? 1 : 0.55,
          }}
        />
      </div>
    </div>
  );
}
