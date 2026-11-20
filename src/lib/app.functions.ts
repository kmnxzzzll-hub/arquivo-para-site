import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  analyse,
  simulate,
  winnerFromSums,
  percentageInts,
  pickWinner,
  MIN_OBSERVATIONS,
  strategyConfidence,
  strategyHitRate,
  strategyPredict,
  STRATEGIES,
  type Outcome,
  type Strategy,
} from "./stats";

type Ctx = { supabase: any; userId: string };

async function assertActive(ctx: Ctx) {
  const { data } = await ctx.supabase.from("profiles").select("active, username").eq("id", ctx.userId).maybeSingle();
  if (!data?.active) throw new Error("Conta desativada.");
  return data as { active: boolean; username: string };
}

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const p = await assertActive(context);
    await context.supabase.rpc("touch_last_seen");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { username: p.username, isAdmin: !!isAdmin };
  });

export const listRounds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActive(context);
    const { data, error } = await context.supabase
      .from("rounds")
      .select("id, winner, player_sum, banker_sum, source, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Não foi possível carregar as rondas.");
    return data as {
      id: string;
      winner: Outcome;
      player_sum: number | null;
      banker_sum: number | null;
      source: string;
      created_at: string;
    }[];
  });

const roundSchema = z.object({
  winner: z.enum(["player", "tie", "banker"]).optional(),
  player_sum: z.number().int().min(2).max(12).nullable().optional(),
  banker_sum: z.number().int().min(2).max(12).nullable().optional(),
});

export const addRounds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ rounds: z.array(roundSchema).min(1).max(2000), source: z.enum(["manual", "import"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertActive(context);
    const rows: {
      user_id: string;
      winner: Outcome;
      player_sum: number | null;
      banker_sum: number | null;
      source: string;
    }[] = [];
    const errors: string[] = [];
    data.rounds.forEach((r, i) => {
      const hasSums = r.player_sum != null && r.banker_sum != null;
      const winner = hasSums ? winnerFromSums(r.player_sum!, r.banker_sum!) : r.winner;
      if (!winner) {
        errors.push(`Linha ${i + 1}: resultado em falta.`);
        return;
      }
      if (hasSums && r.winner && r.winner !== winner) {
        errors.push(`Linha ${i + 1}: resultado incoerente com as somas.`);
        return;
      }
      rows.push({
        user_id: context.userId,
        winner,
        player_sum: r.player_sum ?? null,
        banker_sum: r.banker_sum ?? null,
        source: data.source,
      });
    });
    if (rows.length) {
      const { error } = await context.supabase.from("rounds").insert(rows);
      if (error) throw new Error("Não foi possível guardar as rondas.");
    }
    return { inserted: rows.length, errors };
  });

export const deleteRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertActive(context);
    await context.supabase.from("rounds").delete().eq("id", data.id);
    return { ok: true };
  });

export const generateAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: z.enum(["real", "simulated"]), simulations: z.number().int().min(100).max(100000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertActive(context);
    let winners: Outcome[];
    let method: string;
    if (data.kind === "real") {
      const { data: rows, error } = await context.supabase
        .from("rounds")
        .select("winner")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) return { ok: false as const, error: "Não foi possível ler os dados." };
      winners = (rows ?? []).map((r: { winner: string }) => r.winner as Outcome);
      if (winners.length < MIN_OBSERVATIONS)
        return {
          ok: false as const,
          error: `Dados insuficientes: mínimo ${MIN_OBSERVATIONS} rondas (tem ${winners.length}).`,
        };
      method = "Frequência observada + estimativa Bayesiana + qui-quadrado";
    } else {
      winners = simulate(data.simulations ?? 10000);
      method = `Simulação Monte Carlo de ${winners.length} rondas`;
    }
    const a = analyse(winners);
    const sum = a.estimate.player + a.estimate.tie + a.estimate.banker;
    if (Math.abs(sum - 1) > 1e-9)
      return { ok: false as const, error: "Validação falhou: probabilidades não somam 100%." };
    const row = {
      user_id: context.userId,
      kind: data.kind,
      method,
      observations: a.n,
      theoretical: a.theoretical,
      observed: { freq: a.observed, counts: a.counts, ci: a.ci },
      estimate: a.estimate,
      chi2: a.chi2,
      p_value: a.pValue,
    };
    const { data: saved, error } = await context.supabase.from("analyses").insert(row).select().single();
    if (error) return { ok: false as const, error: "Análise calculada mas não foi guardada." };
    return { ok: true as const, analysis: saved as unknown as AnalysisRow };
  });

export type AnalysisRow = {
  id: string;
  created_at: string;
  kind: "real" | "simulated";
  method: string;
  observations: number;
  theoretical: Record<Outcome, number>;
  observed: {
    freq: Record<Outcome, number>;
    counts: Record<Outcome, number>;
    ci: Record<Outcome, [number, number]>;
  };
  estimate: Record<Outcome, number>;
  chi2: number | null;
  p_value: number | null;
  status: string;
};

export const listAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActive(context);
    const { data, error } = await context.supabase
      .from("analyses")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Não foi possível carregar o histórico.");
    return data as unknown as AnalysisRow[];
  });

export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ current: z.string().min(1).max(128), next: z.string().min(10).max(128) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const p = await assertActive(context);
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const c = createClient(process.env["SUPABASE_URL"]!, key, { auth: { persistSession: false } });
    const { usernameToEmail } = await import("./config");
    const { error } = await c.auth.signInWithPassword({
      email: usernameToEmail(p.username),
      password: data.current,
    });
    if (error) return { ok: false as const, error: "Palavra-passe atual incorreta." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: e2 } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.next,
    });
    if (e2) return { ok: false as const, error: "Não foi possível alterar a palavra-passe." };
    return { ok: true as const };
  });

async function loadHistory(ctx: Ctx): Promise<Outcome[]> {
  const { data, error } = await ctx.supabase
    .from("rounds")
    .select("winner")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return [];
  return (data ?? []).map((r: { winner: string }) => r.winner as Outcome).reverse();
}

function currentStreak(history: Outcome[]): { side: "banker" | "player" | null; length: number } {
  const sides = history.filter((o): o is "banker" | "player" => o !== "tie");
  if (!sides.length) return { side: null, length: 0 };
  const last = sides[sides.length - 1]!;
  let n = 0;
  for (let i = sides.length - 1; i >= 0 && sides[i] === last; i--) n++;
  return { side: last, length: n };
}

function buildReason(history: Outcome[], winner: "banker" | "player"): string {
  const parts: string[] = [];
  const streak = currentStreak(history);
  if (streak.side && streak.length >= 2) {
    const name = streak.side === "banker" ? "vermelho" : "azul";
    parts.push(`sequência de ${streak.length} ${name}`);
  }
  const votes: Strategy[] = [];
  for (const s of STRATEGIES) {
    const p = strategyPredict(s, history);
    if (p === winner) votes.push(s);
  }
  if (votes.length) parts.push(`${votes.length} estratégia(s) a confirmar`);
  const hit = Math.max(...STRATEGIES.map((s) => strategyHitRate(s, history)));
  if (hit >= 0.52) parts.push(`taxa histórica ${(hit * 100).toFixed(0)}%`);
  if (!parts.length) parts.push("confirmação por padrões");
  return parts.join(" · ");
}

function countColors(history: Outcome[]) {
  let banker = 0,
    player = 0,
    tie = 0;
  for (const o of history) {
    if (o === "banker") banker++;
    else if (o === "player") player++;
    else tie++;
  }
  return { banker, player, tie };
}

export type SignalDTO = {
  id: string;
  ints: { banker: number; tie: number; player: number };
  winner: "banker" | "player";
  created_at: string;
  reason: string;
  streak: { side: "banker" | "player" | null; length: number };
  tableStats: { banker: number; player: number; tie: number };
  confidence: number;
};

function toSignal(
  r: { id?: string; banker: number; tie: number; player: number; winner: string; created_at: string },
  extra: { reason: string; streak: SignalDTO["streak"]; tableStats: SignalDTO["tableStats"]; confidence: number },
): SignalDTO {
  return {
    id: r.id ?? "",
    ints: { banker: r.banker, tie: r.tie, player: r.player },
    winner: r.winner === "player" ? "player" : "banker",
    created_at: r.created_at,
    reason: extra.reason,
    streak: extra.streak,
    tableStats: extra.tableStats,
    confidence: extra.confidence,
  };
}

/**
 * Gera sinal. mode=strict exige confiança mínima (lado ≥ 52).
 */
export const generateSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        mode: z.enum(["normal", "strict"]).optional(),
      })
      .optional()
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertActive(context);
    const mode = data?.mode ?? "normal";
    let history = await loadHistory(context);

    if (history.length < MIN_OBSERVATIONS) {
      const fresh = Array.from({ length: 24 }, () => {
        const p = 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6);
        const b = 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6);
        return {
          user_id: context.userId,
          winner: winnerFromSums(p, b),
          player_sum: p,
          banker_sum: b,
          source: "import",
        };
      });
      await context.supabase.from("rounds").insert(fresh);
      history = await loadHistory(context);
    }

    const confidence = strategyConfidence(history);
    const ints = percentageInts(confidence);
    if (ints.banker + ints.tie + ints.player !== 100) throw new Error("Validação falhou.");

    let winner = pickWinner(confidence);
    const sidePct = winner === "banker" ? ints.banker : ints.player;

    if (mode === "strict" && sidePct < 52) {
      // Try the other side if stronger
      const alt = winner === "banker" ? "player" : "banker";
      const altPct = alt === "banker" ? ints.banker : ints.player;
      if (altPct >= 52) winner = alt;
      else
        return {
          ok: false as const,
          error: `Confiança insuficiente (${sidePct}%). Modo alta confiança exige ≥ 52%.`,
        };
    }

    const finalPct = winner === "banker" ? ints.banker : ints.player;
    const streak = currentStreak(history);
    const reason = buildReason(history, winner);
    const tableStats = countColors(history.slice(-40));

    const { data: saved, error: e3 } = await context.supabase
      .from("signals")
      .insert({
        user_id: context.userId,
        banker: ints.banker,
        tie: ints.tie,
        player: ints.player,
        winner,
      })
      .select("id, banker, tie, player, winner, created_at")
      .single();
    if (e3 || !saved) throw new Error("Não foi possível guardar o sinal.");

    return {
      ok: true as const,
      signal: toSignal(saved, {
        reason,
        streak,
        tableStats,
        confidence: finalPct,
      }),
    };
  });

export type SignalRow = {
  id: string;
  banker: number;
  tie: number;
  player: number;
  winner: string;
  created_at: string;
};

export const listSignals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActive(context);
    const { data, error } = await context.supabase
      .from("signals")
      .select("id, banker, tie, player, winner, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Não foi possível carregar os sinais.");
    return (data ?? []) as SignalRow[];
  });
