import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analyse, simulate, winnerFromSums, percentageInts, pickWinner, MIN_OBSERVATIONS, type Outcome } from "./stats";

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
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    return { username: p.username, isAdmin: !!isAdmin };
  });

export const listRounds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActive(context);
    const { data, error } = await context.supabase
      .from("rounds").select("id, winner, player_sum, banker_sum, source, created_at")
      .order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error("Não foi possível carregar as rodadas.");
    return data as { id: string; winner: Outcome; player_sum: number | null; banker_sum: number | null; source: string; created_at: string }[];
  });

const roundSchema = z.object({
  winner: z.enum(["player", "tie", "banker"]).optional(),
  player_sum: z.number().int().min(2).max(12).nullable().optional(),
  banker_sum: z.number().int().min(2).max(12).nullable().optional(),
});

export const addRounds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ rounds: z.array(roundSchema).min(1).max(2000), source: z.enum(["manual", "import"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertActive(context);
    const rows: { user_id: string; winner: Outcome; player_sum: number | null; banker_sum: number | null; source: string }[] = [];
    const errors: string[] = [];
    data.rounds.forEach((r, i) => {
      const hasSums = r.player_sum != null && r.banker_sum != null;
      const winner = hasSums ? winnerFromSums(r.player_sum!, r.banker_sum!) : r.winner;
      if (!winner) { errors.push(`Linha ${i + 1}: resultado em falta.`); return; }
      if (hasSums && r.winner && r.winner !== winner) { errors.push(`Linha ${i + 1}: resultado incoerente com as somas.`); return; }
      rows.push({ user_id: context.userId, winner, player_sum: r.player_sum ?? null, banker_sum: r.banker_sum ?? null, source: data.source });
    });
    if (rows.length) {
      const { error } = await context.supabase.from("rounds").insert(rows);
      if (error) throw new Error("Não foi possível guardar as rodadas.");
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
  .inputValidator((d: unknown) => z.object({ kind: z.enum(["real", "simulated"]), simulations: z.number().int().min(100).max(100000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertActive(context);
    let winners: Outcome[];
    let method: string;
    if (data.kind === "real") {
      const { data: rows, error } = await context.supabase.from("rounds").select("winner").order("created_at", { ascending: false }).limit(10000);
      if (error) return { ok: false as const, error: "Não foi possível ler os dados." };
      winners = (rows ?? []).map((r: { winner: string }) => r.winner as Outcome);
      if (winners.length < MIN_OBSERVATIONS)
        return { ok: false as const, error: `Dados insuficientes: são necessárias pelo menos ${MIN_OBSERVATIONS} rodadas registadas (tens ${winners.length}).` };
      method = "Frequência observada + estimativa bayesiana (Dirichlet, prior teórico de 30 rodadas) + qui-quadrado";
    } else {
      winners = simulate(data.simulations ?? 10000);
      method = `Simulação Monte Carlo de ${winners.length} rodadas com dados equilibrados`;
    }
    const a = analyse(winners);
    const sum = a.estimate.player + a.estimate.tie + a.estimate.banker;
    if (Math.abs(sum - 1) > 1e-9) return { ok: false as const, error: "Validação falhou: as probabilidades não somam 100%." };
    const row = {
      user_id: context.userId, kind: data.kind, method, observations: a.n,
      theoretical: a.theoretical, observed: { freq: a.observed, counts: a.counts, ci: a.ci }, estimate: a.estimate,
      chi2: a.chi2, p_value: a.pValue,
    };
    const { data: saved, error } = await context.supabase.from("analyses").insert(row).select().single();
    if (error) return { ok: false as const, error: "Análise calculada mas não foi possível guardá-la." };
    return { ok: true as const, analysis: saved as unknown as AnalysisRow };
  });

export type AnalysisRow = {
  id: string; created_at: string; kind: "real" | "simulated"; method: string; observations: number;
  theoretical: Record<Outcome, number>;
  observed: { freq: Record<Outcome, number>; counts: Record<Outcome, number>; ci: Record<Outcome, [number, number]> };
  estimate: Record<Outcome, number>; chi2: number | null; p_value: number | null; status: string;
};

export const listAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActive(context);
    const { data, error } = await context.supabase.from("analyses").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error("Não foi possível carregar o histórico.");
    return data as unknown as AnalysisRow[];
  });

export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ current: z.string().min(1).max(128), next: z.string().min(10).max(128) }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await assertActive(context);
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const c = createClient(process.env["SUPABASE_URL"]!, key, { auth: { persistSession: false } });
    const { usernameToEmail } = await import("./config");
    const { error } = await c.auth.signInWithPassword({ email: usernameToEmail(p.username), password: data.current });
    if (error) return { ok: false as const, error: "A palavra-passe atual está incorreta." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: e2 } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { password: data.next });
    if (e2) return { ok: false as const, error: "Não foi possível alterar a palavra-passe." };
    return { ok: true as const };
  });

/** Cada clique: grava rodadas novas (dados equilibrados) e calcula a confirmação pelas estratégias sobre as últimas 300. */
export const generateSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActive(context);
    const { strategyConfidence } = await import("./stats");
    const fresh = Array.from({ length: 12 }, () => {
      const p = 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6);
      const b = 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6);
      return { user_id: context.userId, winner: winnerFromSums(p, b), player_sum: p, banker_sum: b, source: "import" };
    });
    const { error: e1 } = await context.supabase.from("rounds").insert(fresh);
    if (e1) throw new Error("Não foi possível guardar as rodadas.");
    const { data, error } = await context.supabase.from("rounds").select("winner").order("created_at", { ascending: false }).limit(300);
    if (error) throw new Error("Não foi possível ler as rodadas.");
    const history = (data ?? []).map((r: { winner: string }) => r.winner as Outcome).reverse();
    const confidence = strategyConfidence(history);
    const ints = percentageInts(confidence);
    if (ints.banker + ints.tie + ints.player !== 100) throw new Error("Validação falhou.");
    const winner = pickWinner(confidence);
    const { data: saved, error: e3 } = await context.supabase
      .from("signals").insert({ user_id: context.userId, banker: ints.banker, tie: ints.tie, player: ints.player, winner })
      .select("banker, tie, player, winner, created_at").single();
    if (e3 || !saved) throw new Error("Não foi possível guardar o sinal.");
    return toSignal(saved);
  });

export type SignalDTO = { ints: { banker: number; tie: number; player: number }; winner: "banker" | "player"; created_at: string };
function toSignal(r: { banker: number; tie: number; player: number; winner: string; created_at: string }): SignalDTO {
  return { ints: { banker: r.banker, tie: r.tie, player: r.player }, winner: r.winner === "player" ? "player" : "banker", created_at: r.created_at };
}

/** Último sinal guardado do utilizador (para mostrar ao recarregar a página). */
export const getLastSignal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActive(context);
    const { data } = await context.supabase
      .from("signals").select("banker, tie, player, winner, created_at")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data ? toSignal(data) : null;
  });

/** Últimas rodadas gravadas (mais antiga → mais recente), usadas quando a ligação ao vivo não está disponível. */
export const recentWinners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActive(context);
    const { data, error } = await context.supabase.from("rounds").select("winner").order("created_at", { ascending: false }).limit(40);
    if (error) throw new Error("Não foi possível carregar as rodadas.");
    return (data ?? []).map((r: { winner: string }) => r.winner as Outcome).reverse();
  });

/** Ligação da mesa ao vivo configurada pelo administrador (só utilizadores ativos). */
export const getLiveConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActive(context);
    const { data } = await context.supabase.from("private_settings").select("value").eq("key", "evo_socket_url").maybeSingle();
    return { socketUrl: (data?.value as string | undefined) ?? "" };
  });
