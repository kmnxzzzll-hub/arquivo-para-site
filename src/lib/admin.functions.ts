import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { usernameToEmail } from "./config";
import { isValidSocketUrl } from "./road";

async function requireAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error("Could not verify access. Try again.");
  if (!data) throw new Error("Access denied.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function audit(admin: any, actor: string, action: string, detail?: string) {
  await admin.from("audit_logs").insert({ actor, action, detail: detail ?? null });
}

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context);
    const [{ data: profiles }, { data: roles }, list, { data: logs }, { count: rounds }, { count: analyses }, { data: setting }, { data: attempts }, { data: socket }] =
      await Promise.all([
        admin.from("profiles").select("id, username, active, created_at, last_seen_at").order("username"),
        admin.from("user_roles").select("user_id, role"),
        admin.auth.admin.listUsers({ perPage: 1000 }),
        admin.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50),
        admin.from("rounds").select("id", { count: "exact", head: true }),
        admin.from("analyses").select("id", { count: "exact", head: true }),
        admin.from("app_settings").select("value").eq("key", "whatsapp_number").maybeSingle(),
        admin.from("login_attempts").select("username, success, created_at").order("created_at", { ascending: false }).limit(30),
        admin.from("private_settings").select("value").eq("key", "evo_socket_url").maybeSingle(),
      ]);
    const lastSign = new Map((list.data?.users ?? []).map((u: any) => [u.id, u.last_sign_in_at as string | null]));
    return {
      users: (profiles ?? []).map((p: any) => ({
        ...p,
        isAdmin: (roles ?? []).some((r: any) => r.user_id === p.id && r.role === "admin"),
        lastSignIn: lastSign.get(p.id) ?? null,
      })),
      logs: logs ?? [],
      attempts: attempts ?? [],
      counts: { rounds: rounds ?? 0, analyses: analyses ?? 0 },
      whatsapp: setting?.value ?? "",
      socketUrl: socket?.value ?? "",
      authOk: !list.error,
    };
  });

export const adminSetActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context);
    if (data.id === context.userId) throw new Error("You cannot deactivate your own account.");
    await admin.from("profiles").update({ active: data.active }).eq("id", data.id);
    // Banir no serviço de autenticação impede novos tokens e renovações de sessão.
    await admin.auth.admin.updateUserById(data.id, { ban_duration: data.active ? "none" : "876000h" });
    await audit(admin, context.userId, data.active ? "ativar_conta" : "desativar_conta", data.id);
    return { ok: true };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), password: z.string().min(10).max(128) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context);
    const { error } = await admin.auth.admin.updateUserById(data.id, { password: data.password });
    if (error) return { ok: false as const, error: "Could not reset the password." };
    await audit(admin, context.userId, "redefinir_palavra_passe", data.id);
    return { ok: true as const };
  });

const accountSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9._-]+$/, "Invalid username"),
  password: z.string().min(10).max(128),
});

export const adminCreateAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ accounts: z.array(z.unknown()).min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context);
    const report: { line: number; username: string; status: "criada" | "duplicada" | "erro"; message?: string }[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < data.accounts.length; i++) {
      const parsed = accountSchema.safeParse(data.accounts[i]);
      if (!parsed.success) { report.push({ line: i + 1, username: "", status: "erro", message: "Invalid fields (username, or password shorter than 10 characters)." }); continue; }
      const { username, password } = parsed.data;
      const key = username.toLowerCase();
      const { data: exists } = await admin.from("profiles").select("id").ilike("username", key).maybeSingle();
      if (seen.has(key) || exists) { report.push({ line: i + 1, username, status: "duplicada" }); continue; }
      seen.add(key);
      const { data: u, error } = await admin.auth.admin.createUser({ email: usernameToEmail(username), password, email_confirm: true, user_metadata: { username } });
      if (error || !u.user) { report.push({ line: i + 1, username, status: "erro", message: "The sign-in service refused the account." }); continue; }
      await admin.from("profiles").insert({ id: u.user.id, username });
      await admin.from("user_roles").insert({ user_id: u.user.id, role: "user" });
      report.push({ line: i + 1, username, status: "criada" });
    }
    await audit(admin, context.userId, "importar_contas", `${report.filter((r) => r.status === "criada").length} criadas`);
    return { report };
  });

export const adminSetWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ number: z.string().regex(/^\d{8,15}$/, "Invalid number") }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context);
    await admin.from("app_settings").upsert({ key: "whatsapp_number", value: data.number, updated_at: new Date().toISOString() });
    await audit(admin, context.userId, "alterar_whatsapp", data.number);
    return { ok: true };
  });

export const adminSetSocketUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ url: z.string().trim().max(4000).refine((u) => u === "" || isValidSocketUrl(u), "Invalid connection (must start with wss://)") }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context);
    if (data.url === "") await admin.from("private_settings").delete().eq("key", "evo_socket_url");
    else await admin.from("private_settings").upsert({ key: "evo_socket_url", value: data.url, updated_at: new Date().toISOString() });
    await audit(admin, context.userId, "alterar_ligacao_mesa", data.url ? "configurada" : "removida");
    return { ok: true };
  });
