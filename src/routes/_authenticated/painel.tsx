import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Loader2, RotateCw, Zap, Flame, Snowflake, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateSignal, type SignalDTO } from "@/lib/app.functions";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [{ title: "Dashboard — Bac Bo Live" }],
  }),
  component: Painel,
});

const TIMEOUT_MS = 15000;
const WAIT_MS = 3800;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))]);
}

function Painel() {
  const gen = useServerFn(generateSignal);
  const [fresh, setFresh] = useState<SignalDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  // Confidence bars — shift toward the signal side after generation
  const conf = fresh
    ? {
        banker: fresh.ints.banker,
        player: fresh.ints.player,
        tie: fresh.ints.tie,
      }
    : { banker: 34, player: 34, tie: 32 };

  async function run() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    const started = Date.now();
    try {
      const r = await withTimeout(gen());
      if (r.ints.banker + r.ints.tie + r.ints.player !== 100) throw new Error("invalid");
      const wait = WAIT_MS - (Date.now() - started);
      if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
      setFresh(r);
    } catch {
      setError("Tente novamente.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  const lead = fresh && !loading ? fresh.winner : null;
  const entryLabel = lead === "banker" ? "VERMELHO" : lead === "player" ? "AZUL" : null;
  const entrySide = lead === "banker" ? "CASA" : lead === "player" ? "JOGADOR" : null;

  return (
    <section className="mx-auto flex min-h-[calc(100svh-8.5rem)] w-full max-w-lg flex-col gap-4">
      <h1 className="sr-only">Dashboard Bac Bo</h1>

      {/* Top stats — glass */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatChip
          icon={<Flame className="h-3.5 w-3.5 text-banker" />}
          label="Vermelhos"
          value={fresh ? String(Math.round(conf.banker * 0.4 + 12)) : "—"}
          tone="banker"
        />
        <StatChip
          icon={<Snowflake className="h-3.5 w-3.5 text-player" />}
          label="Azuis"
          value={fresh ? String(Math.round(conf.player * 0.4 + 10)) : "—"}
          tone="player"
        />
        <StatChip
          icon={<GitBranch className="h-3.5 w-3.5 text-tie" />}
          label="Sequência"
          value={fresh ? String(2 + (fresh.ints.banker % 5)) : "—"}
          tone="tie"
        />
      </div>

      {/* Confidence monitor */}
      <div className="glass-card space-y-3.5 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Monitor de confiança
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {lead ? "Sinal ativo" : "À espera"}
          </span>
        </div>
        <ConfBar label="Casa / Vermelho" pct={conf.banker} color="var(--banker)" active={lead === "banker"} />
        <ConfBar label="Jogador / Azul" pct={conf.player} color="var(--player)" active={lead === "player"} />
        <ConfBar label="Empate" pct={conf.tie} color="var(--tie)" active={false} />
      </div>

      {/* Big signal card */}
      <div className="glass-card relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-5 py-9">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,oklch(0.4_0.1_265/0.2),transparent_60%)]" />

        {loading ? (
          <div className="relative z-10 flex flex-col items-center gap-4 animate-rise">
            <span className="flex h-32 w-32 items-center justify-center rounded-full border border-white/10 bg-white/5">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            </span>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">Analisando…</p>
          </div>
        ) : lead && entryLabel ? (
          <div key={fresh?.created_at} className="relative z-10 flex flex-col items-center gap-3.5 animate-rise">
            <span
              className={`h-32 w-32 rounded-full ${lead === "banker" ? "entry-banker" : "entry-player"}`}
              aria-hidden
            />
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-success">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success/20 text-[10px]">
                ✓
              </span>
              Entrada confirmada
            </div>
            <div className="text-center">
              <div className="num text-3xl tracking-wide sm:text-4xl">Apostar no {entryLabel}</div>
              <div className="mt-1.5 text-sm font-semibold text-muted-foreground">{entrySide}</div>
            </div>
            <div className="mt-1 rounded-full border border-tie/30 bg-tie/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-tie">
              Proteger empate
            </div>
          </div>
        ) : (
          <div className="relative z-10 flex flex-col items-center gap-4">
            <span className="flex h-32 w-32 items-center justify-center rounded-full border border-dashed border-white/12 bg-white/[0.03]">
              <Zap className="h-9 w-9 text-muted-foreground/50" />
            </span>
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">Sem sinal</p>
              <p className="mt-1.5 max-w-[220px] text-xs text-muted-foreground/65">
                Gere um sinal para receber a cor e a proteção de empate.
              </p>
            </div>
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
        <p role="status" className="h-5 text-sm font-semibold text-destructive">
          {error ?? ""}
        </p>
      </div>
    </section>
  );
}

function StatChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "banker" | "player" | "tie";
}) {
  const border =
    tone === "banker" ? "border-banker/20" : tone === "player" ? "border-player/20" : "border-tie/20";
  return (
    <div className={`glass-card flex flex-col items-center gap-1 px-2 py-3 ${border}`}>
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
        <span className="num text-xs tabular-nums" style={{ color: active ? color : undefined }}>
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
