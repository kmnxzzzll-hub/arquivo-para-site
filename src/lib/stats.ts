// Motor estatístico do Bac Bo Live. Funções puras, sem dados inventados.
export type Outcome = "player" | "tie" | "banker";
export const OUTCOMES: Outcome[] = ["player", "tie", "banker"];
export const LABELS: Record<Outcome, string> = { player: "Player", tie: "Tie", banker: "Banker" };
export type Triple = Record<Outcome, number>;

/** Uniform random demo color, independent of statistical estimates; not a prediction. */
export function randomDemoOutcome(rand: () => number = Math.random): Outcome {
  const value = rand();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Valor aleatório inválido.");
  if (value < 1 / 3) return "banker";
  if (value < 2 / 3) return "player";
  return "tie";
}

/** Distribuição exata da soma de dois dados de 6 faces (2..12). */
export function twoDiceSumDistribution(): Map<number, number> {
  const m = new Map<number, number>();
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) m.set(a + b, (m.get(a + b) ?? 0) + 1 / 36);
  return m;
}

/** Probabilidade teórica: cada lado lança 2 dados; ganha a soma maior, igual = empate. */
export function theoreticalProbabilities(): Triple {
  const d = twoDiceSumDistribution();
  let player = 0, tie = 0;
  for (const [s1, p1] of d) for (const [s2, p2] of d) {
    if (s1 > s2) player += p1 * p2;
    else if (s1 === s2) tie += p1 * p2;
  }
  return { player, tie, banker: 1 - player - tie };
}

export function counts(winners: Outcome[]): Triple {
  const c: Triple = { player: 0, tie: 0, banker: 0 };
  for (const w of winners) c[w]++;
  return c;
}

/** Intervalo de confiança de Wilson (95%). */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n, den = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const adj = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - adj) / den), Math.min(1, (centre + adj) / den)];
}

/** Teste qui-quadrado de aderência à distribuição teórica (2 graus de liberdade). */
export function chiSquare(c: Triple, theo: Triple): { chi2: number; pValue: number } {
  const n = c.player + c.tie + c.banker;
  if (n === 0) return { chi2: 0, pValue: 1 };
  let chi2 = 0;
  for (const o of OUTCOMES) { const e = n * theo[o]; chi2 += (c[o] - e) ** 2 / e; }
  return { chi2, pValue: Math.exp(-chi2 / 2) }; // CDF exata para gl = 2
}

/** Estimativa bayesiana (Dirichlet) com prior teórico de peso `priorWeight` rodadas. */
export function dirichletEstimate(c: Triple, theo: Triple, priorWeight = 30): Triple {
  const n = c.player + c.tie + c.banker;
  const out = {} as Triple;
  for (const o of OUTCOMES) out[o] = (c[o] + priorWeight * theo[o]) / (n + priorWeight);
  return out;
}

export function observedFrequencies(c: Triple): Triple {
  const n = c.player + c.tie + c.banker;
  return n === 0 ? { player: 0, tie: 0, banker: 0 } : { player: c.player / n, tie: c.tie / n, banker: c.banker / n };
}

export function rollTwo(rand: () => number = Math.random) {
  return Math.floor(rand() * 6) + 1 + Math.floor(rand() * 6) + 1;
}

/** Simulação Monte Carlo de n rodadas (resultado SIMULADO, não real). */
export function simulate(n: number, rand: () => number = Math.random): Outcome[] {
  const r: Outcome[] = [];
  for (let i = 0; i < n; i++) {
    const p = rollTwo(rand), b = rollTwo(rand);
    r.push(p > b ? "player" : p < b ? "banker" : "tie");
  }
  return r;
}

export function winnerFromSums(p: number, b: number): Outcome {
  return p > b ? "player" : p < b ? "banker" : "tie";
}

export const MIN_OBSERVATIONS = 10;

export function analyse(winners: Outcome[]) {
  const theo = theoreticalProbabilities();
  const c = counts(winners);
  const n = winners.length;
  const obs = observedFrequencies(c);
  const ci = Object.fromEntries(OUTCOMES.map((o) => [o, wilson(c[o], n)])) as Record<Outcome, [number, number]>;
  const est = dirichletEstimate(c, theo);
  const { chi2, pValue } = chiSquare(c, theo);
  return { n, counts: c, theoretical: theo, observed: obs, ci, estimate: est, chi2, pValue };
}

export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d).replace(".", ",")}%`;

/** Largest-remainder rounding: displayed tenths total exactly 100.0%, without changing the estimate. */
export function percentageTenths(values: Triple): Triple {
  const sum = OUTCOMES.reduce((total, o) => total + values[o], 0);
  if (!Number.isFinite(sum) || sum <= 0 || OUTCOMES.some((o) => !Number.isFinite(values[o]) || values[o] < 0)) throw new Error("Probabilidades inválidas.");
  const parts = OUTCOMES.map((o) => ({ o, scaled: values[o] / sum * 1000 }));
  const rounded: Triple = { player: 0, tie: 0, banker: 0 };
  for (const part of parts) rounded[part.o] = Math.floor(part.scaled + 1e-10);
  const remaining = 1000 - OUTCOMES.reduce((total, o) => total + rounded[o], 0);
  parts.sort((a, b) => (b.scaled - rounded[b.o]) - (a.scaled - rounded[a.o]));
  for (const part of parts.slice(0, remaining)) rounded[part.o] += 1;
  return rounded;
}

/** Destaque visual: lado (vermelho/azul) com maior valor; null em igualdade. Empate nunca é destacado. */
export function leadingSide(v: Triple): "banker" | "player" | null {
  if (v.banker > v.player) return "banker";
  if (v.player > v.banker) return "player";
  return null;
}

/** Valida percentagens em décimos: inteiros finitos 0–1000 que somam exatamente 1000. */
export function validTenths(t: Triple): boolean {
  const xs = [t.banker, t.tie, t.player];
  return xs.every((x) => Number.isInteger(x) && x >= 0 && x <= 1000) && t.banker + t.tie + t.player === 1000;
}

export type Strategy = "alternancia" | "2x" | "3x";
export const STRATEGIES: Strategy[] = ["alternancia", "2x", "3x"];
const BLOCK: Record<Strategy, number> = { alternancia: 1, "2x": 2, "3x": 3 };

/** Sequência de sinais de uma estratégia de padrão (alternância, 2X, 3X) entre vermelho e azul. */
export function strategySequence(strategy: Strategy, start: "banker" | "player", length: number): Outcome[] {
  const other = start === "banker" ? "player" : "banker";
  return Array.from({ length }, (_, i) => (Math.floor(i / BLOCK[strategy]) % 2 === 0 ? start : other));
}

/** Escolhe uma estratégia e cor inicial ao acaso e devolve a sequência de sinais. Não é previsão. */
export function strategySignals(length = 6, rand: () => number = Math.random) {
  const strategy: Strategy = STRATEGIES[Math.min(2, Math.floor(rand() * 3))] ?? "alternancia";
  const start = rand() < 0.5 ? "banker" : "player";
  return { strategy, signals: strategySequence(strategy, start, length) };
}

/** Largest-remainder rounding to whole percentages that always total exactly 100. */
export function percentageInts(values: Triple): Triple {
  const t = percentageTenths(values);
  const sum = OUTCOMES.reduce((s, o) => s + t[o], 0);
  const parts = OUTCOMES.map((o) => ({ o, scaled: (t[o] / sum) * 100 }));
  const r: Triple = { player: 0, tie: 0, banker: 0 };
  for (const p of parts) r[p.o] = Math.floor(p.scaled + 1e-10);
  const rem = 100 - OUTCOMES.reduce((s, o) => s + r[o], 0);
  parts.sort((a, b) => (b.scaled - r[b.o]) - (a.scaled - r[a.o]));
  for (const p of parts.slice(0, rem)) r[p.o] += 1;
  return r;
}

/** Simulated frequencies from n Monte Carlo rounds (SIMULATED, not real data). */
export function simulatedFrequencies(n = 200, rand: () => number = Math.random): Triple {
  return observedFrequencies(counts(simulate(n, rand)));
}

/** Single final winner: only red (banker) or blue (player); never tie. Equal sides → coin flip. */
export function pickWinner(v: Triple, rand: () => number = Math.random): "banker" | "player" {
  return leadingSide(v) ?? (rand() < 0.5 ? "banker" : "player");
}

type Side = "banker" | "player";
const opp = (s: Side): Side => (s === "banker" ? "player" : "banker");

/** Next side predicted by a strategy from a history (oldest → newest), ties ignored. */
export function strategyPredict(strategy: Strategy, history: Outcome[]): Side | null {
  const sides = history.filter((o): o is Side => o !== "tie");
  const last = sides[sides.length - 1];
  if (!last) return null;
  if (strategy === "alternancia") return opp(last);
  let streak = 0;
  for (let i = sides.length - 1; i >= 0 && sides[i] === last; i--) streak++;
  const block = strategy === "2x" ? 2 : 3;
  return streak % block === 0 ? opp(last) : last;
}

/** Backtested hit rate of a strategy over a history (Laplace-smoothed). */
export function strategyHitRate(strategy: Strategy, history: Outcome[]): number {
  let hits = 0, total = 0;
  for (let i = 1; i < history.length; i++) {
    if (history[i] === "tie") continue;
    const p = strategyPredict(strategy, history.slice(0, i));
    if (!p) continue;
    total++;
    if (p === history[i]) hits++;
  }
  return (hits + 1) / (total + 2);
}

/**
 * Confirmação matemática: cada estratégia vota no próximo lado com peso
 * igual à sua taxa de acerto histórica; o empate recebe a frequência observada.
 * Quando as estratégias concordam a percentagem do lado fica alta.
 */
export function strategyConfidence(history: Outcome[]): Triple {
  const n = history.length;
  const tie = n ? (history.filter((o) => o === "tie").length + 1) / (n + 9) : 146 / 1296;
  const score = { banker: 0.02, player: 0.02 };
  for (const s of STRATEGIES) {
    const p = strategyPredict(s, history);
    if (p) score[p] += strategyHitRate(s, history);
  }
  const tot = score.banker + score.player;
  return { banker: (score.banker / tot) * (1 - tie), player: (score.player / tot) * (1 - tie), tie };
}
