import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { usernameToEmail, LOGIN_MAX_FAILS, LOGIN_WINDOW_MIN, DEFAULT_WHATSAPP } from "./config";

const GENERIC = "Não foi possível entrar. Verifique os dados e tente de novo.";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const loginWithUsername = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        username: z.string().trim().min(3).max(254).regex(/^[A-Za-z0-9._@+-]+$/),
        password: z.string().min(1).max(128),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uname = data.username.toLowerCase();
    try {
      const since = new Date(Date.now() - LOGIN_WINDOW_MIN * 60_000).toISOString();
      const { count } = await supabaseAdmin
        .from("login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("username", uname)
        .eq("success", false)
        .gte("created_at", since);
      if ((count ?? 0) >= LOGIN_MAX_FAILS)
        return {
          ok: false as const,
          error: `Demasiadas tentativas. Aguarde ${LOGIN_WINDOW_MIN} minutos.`,
        };

      const { data: s, error } = await publicClient().auth.signInWithPassword({
        email: uname.includes("@") ? uname : usernameToEmail(uname),
        password: data.password,
      });
      let ok = !error && !!s.session;
      let pending = false;
      if (ok) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("active")
          .eq("id", s.user!.id)
          .maybeSingle();
        if (!prof?.active) {
          ok = false;
          pending = true;
        }
      }
      await supabaseAdmin.from("login_attempts").insert({ username: uname, success: ok });
      if (pending)
        return {
          ok: false as const,
          error: "A sua conta está pendente de aprovação pelo administrador.",
        };
      if (!ok || !s.session) return { ok: false as const, error: GENERIC };
      return {
        ok: true as const,
        access_token: s.session.access_token,
        refresh_token: s.session.refresh_token,
      };
    } catch (e) {
      console.error("login failure", e instanceof Error ? e.message : "unknown");
      return { ok: false as const, error: "Serviço de login temporariamente indisponível." };
    }
  });

/** Public self-registration — account stays inactive until admin approves. */
export const registerAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        username: z
          .string()
          .trim()
          .min(3)
          .max(64)
          .regex(/^[A-Za-z0-9._-]+$/, "Utilizador inválido"),
        password: z.string().min(10).max(128),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = data.username.trim().toLowerCase();
    try {
      const { data: exists } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("username", username)
        .maybeSingle();
      if (exists) return { ok: false as const, error: "Este utilizador já existe." };

      const { data: u, error } = await supabaseAdmin.auth.admin.createUser({
        email: usernameToEmail(username),
        password: data.password,
        email_confirm: true,
        user_metadata: { username },
      });
      if (error || !u.user)
        return { ok: false as const, error: "Não foi possível criar a conta. Tente outro utilizador." };

      await supabaseAdmin.from("profiles").insert({
        id: u.user.id,
        username,
        active: false,
      });
      await supabaseAdmin.from("user_roles").insert({ user_id: u.user.id, role: "user" });
      // Ban until approved so tokens cannot be used
      await supabaseAdmin.auth.admin.updateUserById(u.user.id, { ban_duration: "876000h" });

      return {
        ok: true as const,
        message:
          "Conta criada. A aprovação está pendente — o administrador irá ativar o seu acesso em breve.",
      };
    } catch (e) {
      console.error("register failure", e instanceof Error ? e.message : "unknown");
      return { ok: false as const, error: "Erro ao criar conta. Tente novamente." };
    }
  });

export const getPublicSettings = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { data } = await publicClient()
      .from("app_settings")
      .select("value")
      .eq("key", "whatsapp_number")
      .maybeSingle();
    return { whatsapp: data?.value ?? DEFAULT_WHATSAPP };
  } catch {
    return { whatsapp: DEFAULT_WHATSAPP };
  }
});
