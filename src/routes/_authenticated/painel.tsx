import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateSignal } from "@/lib/app.functions";
import { percentageInts, pickWinner, type Outcome, type Triple } from "@/lib/stats";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({ meta: [{ title: "Início — Bac Bo Live" }, { name: "description", content: "Sinais Bac Bo Live ao vivo." }, { property: "og:title", content: "Início — Bac Bo Live" }, { property: "og:description", content: "Sinais Bac Bo Live ao vivo." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Painel,
});

const CARDS: { o: Outcome; label: string; text: string; dot: string; glow: string }[] = [
  { o: "banker", label: "Vermelho", text: "text-banker", dot: "bg-banker", glow: "border-banker/70 shadow-[0_0_18px_-8px_var(--banker)]" },
  { o: "tie", label: "Empate", text: "text-tie", dot: "bg-tie", glow: "border-tie/70 shadow-[0_0_18px_-8px_var(--tie)]" },
  { o: "player", label: "Azul", text: "text-player", dot: "bg-player", glow: "border-player/70 shadow-[0_0_18px_-8px_var(--player)]" },
];
const TIMEOUT_MS = 10000;
const WAIT_MS = 5000;
type Result = { ints: Triple; winner: "banker" | "player"; simulated: boolean };

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))]);
}

function Painel() {
  const gen = useServerFn(generateSignal);
  const [res, setRes] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);


  async function run() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    const started = Date.now();
    try {
      const r = await withTimeout(gen());
      const values: Triple = r.confidence;
      const simulated = false;
      const ints = percentageInts(values);
      if (ints.banker + ints.tie + ints.player !== 100) throw new Error("invalid");
      const winner = pickWinner(values);
      const wait = WAIT_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setRes({ ints, winner, simulated });
    } catch {
      setError("Tenta novamente.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  const lead = res && !loading ? res.winner : null;

  return (
    <section className="mx-auto flex min-h-[calc(100svh-9rem)] w-full max-w-xl flex-col items-center justify-center gap-8">
      <h1 className="sr-only">Bac Bo Live</h1>
      <div className="grid w-full grid-cols-3 gap-2 sm:gap-4" aria-label="Probabilidades">
        {CARDS.map((c) => (
          <div key={c.o} className={`flex min-w-0 flex-col items-center justify-center rounded-lg border bg-secondary/40 px-1 py-5 transition-all duration-500 sm:py-7 ${lead === c.o ? c.glow : "border-border"}`}>
            <div className={`flex items-center gap-1 text-[10px] font-bold uppercase sm:gap-2 sm:text-sm ${c.text}`}><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`} />{c.label}</div>
            <div className="mt-2 font-display text-2xl font-extrabold tabular-nums sm:text-4xl">{res ? `${res.ints[c.o]}%` : "—"}</div>
          </div>
        ))}
      </div>

      <div className="flex w-full flex-col items-center gap-3">
        <Button variant="hero" className="h-16 w-full max-w-sm rounded-lg px-3 text-base tracking-normal sm:text-lg" disabled={loading} onClick={run}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm normal-case">A gerar sinal...</span></> : "GERAR SINAL"}
        </Button>
        <p role="status" className={`flex h-5 items-center text-center text-sm font-bold ${error ? "text-destructive" : "text-foreground"}`}>{error ?? "Acertividade 98%"}</p>
      </div>

    </section>
  );
}
