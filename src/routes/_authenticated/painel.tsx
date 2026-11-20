import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Loader2, RotateCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateSignal, type SignalDTO } from "@/lib/app.functions";
import type { Outcome } from "@/lib/stats";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Signals — Bac Bo Live" },
      { name: "description", content: "Live Bac Bo signals." },
      { property: "og:title", content: "Signals — Bac Bo Live" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Painel,
});

const CARDS: { o: Outcome; label: string; text: string; ring: string; glow: string }[] = [
  {
    o: "player",
    label: "JOGADOR",
    text: "text-player",
    ring: "ring-player/40",
    glow: "shadow-[0_0_28px_-8px_var(--player)] border-player/50",
  },
  {
    o: "tie",
    label: "EMPATE",
    text: "text-tie",
    ring: "ring-tie/40",
    glow: "shadow-[0_0_28px_-8px_var(--tie)] border-tie/50",
  },
  {
    o: "banker",
    label: "CASA",
    text: "text-banker",
    ring: "ring-banker/40",
    glow: "shadow-[0_0_28px_-8px_var(--banker)] border-banker/50",
  },
];

const ENTRY = {
  banker: { name: "CASA", circle: "entry-banker" },
  player: { name: "JOGADOR", circle: "entry-player" },
} as const;

const TIMEOUT_MS = 15000;
const WAIT_MS = 4200;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))]);
}

function Painel() {
  const gen = useServerFn(generateSignal);
  const [fresh, setFresh] = useState<SignalDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const res = fresh;

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

  const lead = res && !loading ? res.winner : null;

  return (
    <section className="mx-auto flex min-h-[calc(100svh-8.5rem)] w-full max-w-md flex-col gap-5">
      <h1 className="sr-only">Bac Bo Live</h1>

      {/* Probability cards — reference style */}
      <div className="grid w-full grid-cols-3 gap-2.5" aria-label="Probabilidades">
        {CARDS.map((c) => {
          const active = lead === c.o;
          return (
            <div
              key={c.o}
              className={`glass-card flex min-w-0 flex-col items-center justify-center px-2 py-5 transition-all duration-500 ${
                active ? c.glow : "border-white/8"
              }`}
            >
              <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${c.text}`}>
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    c.o === "banker" ? "bg-banker" : c.o === "player" ? "bg-player" : "bg-tie"
                  }`}
                />
                {c.label}
              </div>
              <div className="num mt-2.5 text-3xl text-foreground sm:text-4xl">
                {res ? `${res.ints[c.o]}%` : "—"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Entry / signal card — big circle like references */}
      <div
        className="glass-card relative flex flex-col items-center justify-center gap-4 overflow-hidden px-5 py-10"
        aria-live="polite"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,oklch(0.45_0.12_265/0.18),transparent_55%)]" />

        {loading ? (
          <div className="relative z-10 flex flex-col items-center gap-4 animate-rise">
            <span className="flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-white/5 backdrop-blur-md">
              <Loader2 className="h-9 w-9 animate-spin text-muted-foreground" />
            </span>
            <div className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Analisando mesa…
            </div>
          </div>
        ) : lead ? (
          <div key={res?.created_at} className="relative z-10 flex flex-col items-center gap-3 animate-rise">
            <span className={`h-28 w-28 rounded-full ${ENTRY[lead].circle}`} aria-hidden />
            <div className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.14em] text-success">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success/20 text-[11px]">✓</span>
              Entrada confirmada
            </div>
            <div className="num text-4xl tracking-wide text-foreground sm:text-5xl">{ENTRY[lead].name}</div>
          </div>
        ) : (
          <div className="relative z-10 flex flex-col items-center gap-4">
            <span className="flex h-28 w-28 items-center justify-center rounded-full border border-dashed border-white/15 bg-white/[0.03]">
              <Zap className="h-8 w-8 text-muted-foreground/60" />
            </span>
            <div className="text-center">
              <div className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Nenhum sinal gerado
              </div>
              <p className="mt-1.5 max-w-[240px] text-xs text-muted-foreground/70">
                Toque em Gerar Sinal para analisar e receber a recomendação.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="mt-auto flex w-full flex-col items-center gap-2.5 pt-1">
        <Button
          variant="hero"
          className="h-[3.6rem] w-full rounded-2xl px-4 text-base font-extrabold tracking-wide shadow-[0_0_32px_-10px_oklch(0.62_0.2_258/0.55)]"
          disabled={loading}
          onClick={run}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm normal-case tracking-normal">Gerando sinal…</span>
            </>
          ) : res ? (
            <>
              <RotateCw className="h-4.5 w-4.5" />
              GERAR NOVO SINAL
            </>
          ) : (
            <>
              <Zap className="h-4.5 w-4.5" />
              GERAR SINAL
            </>
          )}
        </Button>
        <p role="status" className="flex h-5 items-center text-center text-sm font-semibold text-destructive">
          {error ?? ""}
        </p>
      </div>
    </section>
  );
}
