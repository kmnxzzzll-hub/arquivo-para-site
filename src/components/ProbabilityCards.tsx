import { OUTCOMES, LABELS, pct, type Outcome } from "@/lib/stats";

const STYLE: Record<Outcome, { text: string; glow: string; border: string }> = {
  player: { text: "text-player", glow: "glow-player", border: "border-player/40" },
  tie: { text: "text-tie", glow: "glow-tie", border: "border-tie/40" },
  banker: { text: "text-banker", glow: "glow-banker", border: "border-banker/40" },
};

export function ProbabilityCards({ values, sub, highlight = true }: { values: Record<Outcome, number>; sub?: Partial<Record<Outcome, string>>; highlight?: boolean }) {
  const max = Math.max(...OUTCOMES.map((o) => values[o]));
  return (
    <div className="grid grid-cols-3 gap-3">
      {OUTCOMES.map((o) => {
        const top = highlight && values[o] === max;
        return (
          <div key={o} className={`animate-rise rounded-2xl border bg-secondary/60 px-2 py-4 text-center transition-all ${STYLE[o].border} ${top ? STYLE[o].glow : ""}`}>
            <div className={`font-display text-2xl font-extrabold sm:text-4xl ${top ? "text-foreground" : STYLE[o].text}`}>{pct(values[o])}</div>
            <div className={`mt-1 text-xs font-bold uppercase tracking-widest sm:text-sm ${STYLE[o].text}`}>{LABELS[o]}</div>
            {sub?.[o] && <div className="mt-1 text-[10px] text-muted-foreground sm:text-xs">{sub[o]}</div>}
          </div>
        );
      })}
    </div>
  );
}
