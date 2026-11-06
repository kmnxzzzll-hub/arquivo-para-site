import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analyse, simulate, winnerFromSums, percentageInts, pickWinner, MIN_OBSERVATIONS, type Outcome } from "./stats";

type Ctx = { supabase: any; userId: string };

async function assertActive(ctx: Ctx) {
  const { data } = await ctx.supabase.from("profiles").select("active, username").eq("id", ctx.userId).maybeSingle();
  if (!data?.active) throw new Error("Account deactivated.");
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
    if (error) throw new Error("Could not load the rounds.");
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
      if (error) throw new Error("Could not save the rounds.");
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
      if (error) return { ok: false as const, error: "Could not read the data." };
      winners = (rows ?? []).map((r: { winner: string }) => r.winner as Outcome);
      if (winners.length < MIN_OBSERVATIONS)
        return { ok: false as const, error: `Not enough data: at least ${MIN_OBSERVATIONS} recorded rounds are needed (you have ${winners.length}).` };
      method = "Observed frequency + Bayesian estimate (Dirichlet, theoretical prior of 30 rounds) + chi-square";
    } else {
      winners = simulate(data.simulations ?? 10000);
      method = `Monte Carlo simulation of ${winners.length} rounds with fair dice`;
    }
    const a = analyse(winners);
    const sum = a.estimate.player + a.estimate.tie + a.estimate.banker;
    if (Math.abs(sum - 1) > 1e-9) return { ok: false as const, error: "Validation failed: probabilities do not add up to 100%." };
    const row = {
      user_id: context.userId, kind: data.kind, method, observations: a.n,
      theoretical: a.theoretical, observed: { freq: a.observed, counts: a.counts, ci: a.ci }, estimate: a.estimate,
      chi2: a.chi2, p_value: a.pValue,
    };
    const { data: saved, error } = await context.supabase.from("analyses").insert(row).select().single();
    if (error) return { ok: false as const, error: "Analysis computed but could not be saved." };
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
    if (error) throw new Error("Could not load the history.");
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
    if (error) return { ok: false as const, error: "The current password is incorrect." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: e2 } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { password: data.next });
    if (e2) return { ok: false as const, error: "Could not change the password." };
    return { ok: true as const };
  });

/** Reads the admin-configured live table address (active members only); "" when none. */
async function liveUrl(ctx: Ctx): Promise<string> {
  const { data } = await ctx.supabase.from("private_settings").select("value").eq("key", "evo_socket_url").maybeSingle();
  return (data?.value as string | undefined) ?? "";
}

/**
 * Each click computes the strategy confirmation. When the live table answers (read on the server from the
 * admin-configured socket, "bacbo.road" event, oldest → newest), its real history is used; otherwise new
 * rounds are recorded and the latest 300 are used.
 */
export const generateSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActive(context);
    const { strategyConfidence } = await import("./stats");
    let history: Outcome[] = [];
    const url = await liveUrl(context);
    if (url) {
      const { diagnoseSocketUrl } = await import("./road");
      if (diagnoseSocketUrl(url).length === 0) {
        const { cachedLiveRoad } = await import("./live-probe.server");
        const r = await cachedLiveRoad(url);
        if (r.status === "live") history = r.road.history.slice(-300);
      }
    }
    if (history.length < MIN_OBSERVATIONS) {
      const fresh = Array.from({ length: 12 }, () => {
        const p = 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6);
        const b = 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6);
        return { user_id: context.userId, winner: winnerFromSums(p, b), player_sum: p, banker_sum: b, source: "import" };
      });
      const { error: e1 } = await context.supabase.from("rounds").insert(fresh);
      if (e1) throw new Error("Could not save the rounds.");
      const { data, error } = await context.supabase.from("rounds").select("winner").order("created_at", { ascending: false }).limit(300);
      if (error) throw new Error("Could not read the rounds.");
      history = (data ?? []).map((r: { winner: string }) => r.winner as Outcome).reverse();
    }
    const confidence = strategyConfidence(history);
    const ints = percentageInts(confidence);
    if (ints.banker + ints.tie + ints.player !== 100) throw new Error("Validation failed.");
    const winner = pickWinner(confidence);
    const { data: saved, error: e3 } = await context.supabase
      .from("signals").insert({ user_id: context.userId, banker: ints.banker, tie: ints.tie, player: ints.player, winner })
      .select("banker, tie, player, winner, created_at").single();
    if (e3 || !saved) throw new Error("Could not save the signal.");
    return toSignal(saved);
  });

export type SignalDTO = { ints: { banker: number; tie: number; player: number }; winner: "banker" | "player"; created_at: string };
function toSignal(r: { banker: number; tie: number; player: number; winner: string; created_at: string }): SignalDTO {
  return { ints: { banker: r.banker, tie: r.tie, player: r.player }, winner: r.winner === "player" ? "player" : "banker", created_at: r.created_at };
}

export type LiveRoadDTO =
  | { status: "off" }
  | { status: "live"; stats: { banker: number; player: number; tie: number }; rounds: number }
  | { status: "unavailable" };

/** Live table state read on the server (the address and session never reach the browser). */
export const getLiveRoad = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LiveRoadDTO> => {
    await assertActive(context);
    const url = await liveUrl(context);
    if (!url) return { status: "off" };
    const { diagnoseSocketUrl } = await import("./road");
    if (diagnoseSocketUrl(url).length) return { status: "unavailable" };
    const { cachedLiveRoad } = await import("./live-probe.server");
    const r = await cachedLiveRoad(url);
    return r.status === "live" ? { status: "live", stats: r.road.stats, rounds: r.road.history.length } : { status: "unavailable" };
  });
