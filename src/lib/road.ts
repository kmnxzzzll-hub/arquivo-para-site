import type { Outcome } from "./stats";

export const ROAD_SIZE = 40;

export type RoadStats = { banker: number; player: number; tie: number };
export type Road = { history: Outcome[]; stats: RoadStats };

/** Converte o valor "winner" das mensagens da mesa (Player/Banker/Tie, ou azul/vermelho) num resultado. */
export function winnerToOutcome(w: unknown): Outcome | null {
  if (typeof w !== "string") return null;
  const s = w.trim().toLowerCase();
  if (s === "player" || s === "blue" || s === "azul") return "player";
  if (s === "banker" || s === "red" || s === "vermelho") return "banker";
  if (s === "tie" || s === "draw" || s === "empate") return "tie";
  return null;
}

/** Conta vitórias por resultado. */
export function roadCounts(history: Outcome[]): RoadStats {
  const c: RoadStats = { banker: 0, player: 0, tie: 0 };
  for (const o of history) c[o]++;
  return c;
}

/** Últimas `size` rodadas (mais antiga → mais recente). */
export function lastRounds(history: Outcome[], size = ROAD_SIZE): Outcome[] {
  return history.slice(Math.max(0, history.length - size));
}

/**
 * Interpreta uma mensagem da WebSocket da mesa. Só aceita o evento "bacbo.road":
 * { type: "bacbo.road", args: { stats: { playerWins, bankerWins, ties }, history: [{ winner: "Player" }, ...] } }
 * O histórico é assumido em ordem cronológica (mais antigo primeiro). Devolve null para outros eventos.
 */
export function parseRoadMessage(raw: string | unknown): Road | null {
  let msg: any = raw;
  if (typeof raw === "string") {
    try { msg = JSON.parse(raw); } catch { return null; }
  }
  if (!msg || typeof msg !== "object" || msg.type !== "bacbo.road") return null;
  const args = msg.args ?? {};
  const list: unknown[] = Array.isArray(args.history) ? args.history : [];
  const history = list
    .map((h) => winnerToOutcome(h && typeof h === "object" ? (h as { winner?: unknown }).winner : h))
    .filter((o): o is Outcome => o !== null);
  const s = args.stats ?? {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
  const fallback = roadCounts(history);
  return {
    history,
    stats: {
      player: num(s.playerWins) ?? fallback.player,
      banker: num(s.bankerWins) ?? fallback.banker,
      tie: num(s.ties) ?? fallback.tie,
    },
  };
}

/** Só aceita ligações seguras (wss://) para a configuração da mesa. */
export function isValidSocketUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "wss:" && !!u.hostname;
  } catch {
    return false;
  }
}
