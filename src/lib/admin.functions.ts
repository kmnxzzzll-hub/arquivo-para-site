import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { usernameToEmail } from "./config";

async function requireAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error("Não foi possível verificar o acesso.");
  if (!data) throw new Error("Acesso negado.");
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
    const [
      { data: profiles },
      { data: roles },
      list,
      { data: logs },
      { data: setting },
      { data: attempts },
      { data: apiKey },
    ] = await Promise.all([
      admin.from("profiles").select("id, username, active, created_at, last_seen_at").order("created_at", { ascending: false }),
      admin.from("user_roles").select("user_id, role"),
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(40),
      admin.from("app_settings").select("value").eq("key", "whatsapp_number").maybeSingle(),
      admin.from("login_attempts").select("username, success, created_at").order("created_at", { ascending: false }).limit(25),
      admin.from("private_settings").select("value").eq("key", "signal_api_url").maybeSingle(),
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
      whatsapp: setting?.value ?? "",
      apiUrl: apiKey?.value ?? "",
      authOk: !list.error,
    };
  });

export const adminSetActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context);
    if (data.id === context.userId) throw new Error("Não pode desativar a própria conta.");
    await admin.from("profiles").update({ active: data.active }).eq("id", data.id);
    await admin.auth.admin.updateUserById(data.id, {
      ban_duration: data.active ? "none" : "876000h",
    });
    await audit(admin, context.userId, data.active ? "aprovar_conta" : "desativar_conta", data.id);
    return { ok: true };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), password: z.string().min(10).max(128) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context);
    const { error } = await admin.auth.admin.updateUserById(data.id, { password: data.password });
    if (error) return { ok: false as const, error: "Não foi possível redefinir a palavra-passe." };
    await audit(admin, context.userId, "redefinir_palavra_passe", data.id);
    return { ok: true as const };
  });

const accountSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9._-]+$/),
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
      if (!parsed.success) {
        report.push({ line: i + 1, username: "", status: "erro", message: "Campos inválidos." });
        continue;
      }
      const { username, password } = parsed.data;
      const key = username.toLowerCase();
      const { data: exists } = await admin.from("profiles").select("id").ilike("username", key).maybeSingle();
      if (seen.has(key) || exists) {
        report.push({ line: i + 1, username, status: "duplicada" });
        continue;
      }
      seen.add(key);
      const { data: u, error } = await admin.auth.admin.createUser({
        email: usernameToEmail(username),
        password,
        email_confirm: true,
        user_metadata: { username },
      });
      if (error || !u.user) {
        report.push({ line: i + 1, username, status: "erro", message: "Serviço recusou a conta." });
        continue;
      }
      // Admin-created accounts are active immediately
      await admin.from("profiles").insert({ id: u.user.id, username, active: true });
      await admin.from("user_roles").insert({ user_id: u.user.id, role: "user" });
      report.push({ line: i + 1, username, status: "criada" });
    }
    await audit(
      admin,
      context.userId,
      "criar_contas",
      `${report.filter((r) => r.status === "criada").length} criadas`,
    );
    return { report };
  });

export const adminSetWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ number: z.string().regex(/^\d{8,15}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context);
    await admin
      .from("app_settings")
      .upsert({ key: "whatsapp_number", value: data.number, updated_at: new Date().toISOString() });
    await audit(admin, context.userId, "alterar_whatsapp", data.number);
    return { ok: true };
  });

/** API endpoint for the signal robot (replaces WebSocket). */
export const adminSetApiUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ url: z.string().trim().max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context);
    if (data.url === "") {
      await admin.from("private_settings").delete().eq("key", "signal_api_url");
    } else {
      try {
        const u = new URL(data.url);
        if (u.protocol !== "https:" && u.protocol !== "http:")
          return { ok: false as const, error: "A URL deve começar por https://" };
      } catch {
        return { ok: false as const, error: "URL inválida." };
      }
      await admin.from("private_settings").upsert({
        key: "signal_api_url",
        value: data.url,
        updated_at: new Date().toISOString(),
      });
    }
    await audit(admin, context.userId, "alterar_api_robo", data.url ? "configurada" : "removida");
    return { ok: true as const };
  });
