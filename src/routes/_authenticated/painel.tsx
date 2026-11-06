import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateSignal, getLastSignal, type SignalDTO } from "@/lib/app.functions";
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
const COMMAND = {
  banker: { text: "ENTRAR NO VERMELHO 🔴", cls: "signal-banker text-banker" },
  player: { text: "ENTRAR NO AZUL 🔵", cls: "signal-player text-player" },
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
  const last = useQuery({ queryKey: ["last-signal"], queryFn: () => lastFn() });
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
      const r = await withTimeout(gen());
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
    <section className="mx-auto flex min-h-[calc(100svh-9rem)] w-full max-w-xl flex-col items-center gap-6">
      <h1 className="sr-only">Bac Bo Live</h1>
      <div className="grid w-full grid-cols-3 gap-2 sm:gap-4" aria-label="Probabilidades">
        {CARDS.map((c) => (
          <div key={c.o} className={`flex min-w-0 flex-col items-center justify-center rounded-2xl border bg-secondary/40 px-1 py-5 transition-all duration-500 sm:py-7 ${lead === c.o ? c.glow : "border-border"}`}>
            <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-tight sm:gap-2 sm:text-sm ${c.text}`}><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`} />{c.label}</div>
            <div className="mt-2 font-display text-3xl font-extrabold tracking-tight tabular-nums sm:text-5xl">{res ? `${res.ints[c.o]}%` : "—"}</div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex w-full flex-col items-center gap-4">
        <div className="flex min-h-16 w-full max-w-sm items-center justify-center" aria-live="polite">
          {lead && (
            <div key={res?.created_at} className={`animate-rise w-full rounded-2xl border-2 px-4 py-4 text-center font-display text-xl font-extrabold tracking-tight sm:text-2xl ${COMMAND[lead].cls}`}>
              {COMMAND[lead].text}
            </div>
          )}
        </div>
        <Button variant="hero" className="h-16 w-full max-w-sm rounded-2xl px-3 text-base font-extrabold tracking-tight sm:text-lg" disabled={loading} onClick={run}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm normal-case">A gerar sinal...</span></> : "GERAR SINAL"}
        </Button>
        <p role="status" className="flex h-5 items-center text-center text-sm font-bold text-destructive">{error ?? ""}</p>
      </div>

      <footer className="pt-2 text-center text-sm font-extrabold tracking-tight">Acertividade 98%</footer>
    </section>
  );
}
