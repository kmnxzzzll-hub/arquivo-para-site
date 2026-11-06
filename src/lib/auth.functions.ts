import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { usernameToEmail, LOGIN_MAX_FAILS, LOGIN_WINDOW_MIN, DEFAULT_WHATSAPP } from "./config";

const GENERIC = "Could not sign in. Check your details and try again.";

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
    z.object({ username: z.string().trim().min(3).max(254).regex(/^[A-Za-z0-9._@+-]+$/), password: z.string().min(1).max(128) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uname = data.username.toLowerCase();
    try {
      const since = new Date(Date.now() - LOGIN_WINDOW_MIN * 60_000).toISOString();
      const { count } = await supabaseAdmin
        .from("login_attempts").select("id", { count: "exact", head: true })
        .eq("username", uname).eq("success", false).gte("created_at", since);
      if ((count ?? 0) >= LOGIN_MAX_FAILS)
        return { ok: false as const, error: `Too many attempts. Wait ${LOGIN_WINDOW_MIN} minutes and try again.` };

      const { data: s, error } = await publicClient().auth.signInWithPassword({ email: uname.includes("@") ? uname : usernameToEmail(uname), password: data.password });
      let ok = !error && !!s.session;
      if (ok) {
        const { data: prof } = await supabaseAdmin.from("profiles").select("active").eq("id", s.user!.id).maybeSingle();
        if (!prof?.active) ok = false;
      }
      await supabaseAdmin.from("login_attempts").insert({ username: uname, success: ok });
      if (!ok || !s.session) return { ok: false as const, error: GENERIC };
      return { ok: true as const, access_token: s.session.access_token, refresh_token: s.session.refresh_token };
    } catch (e) {
      console.error("login failure", e instanceof Error ? e.message : "unknown");
      return { ok: false as const, error: "The sign-in service is temporarily unavailable. Try again." };
    }
  });

export const getPublicSettings = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { data } = await publicClient().from("app_settings").select("value").eq("key", "whatsapp_number").maybeSingle();
    return { whatsapp: data?.value ?? DEFAULT_WHATSAPP };
  } catch {
    return { whatsapp: DEFAULT_WHATSAPP };
  }
});
