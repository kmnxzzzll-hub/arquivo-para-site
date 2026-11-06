import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { loginWithUsername, getPublicSettings } from "@/lib/auth.functions";
import { DEFAULT_WHATSAPP, whatsappUrl } from "@/lib/config";
import { getMe } from "@/lib/app.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Bac Bo Live" },
      { name: "description", content: "Sign in to the private Bac Bo Live platform." },
      { property: "og:title", content: "Sign in — Bac Bo Live" },
      { property: "og:description", content: "Sign in to the private Bac Bo Live platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: () => getPublicSettings(),
  component: AuthPage,
});

function AuthPage() {
  const settings = Route.useLoaderData();
  const navigate = useNavigate();
  const login = useServerFn(loginWithUsername);
  const meFn = useServerFn(getMe);
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: "/painel", replace: true }); });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) return setError("Enter your username and password.");
    if (!/^[A-Za-z0-9._@+-]{3,254}$/.test(username.trim())) return setError("Could not sign in. Check your details and try again.");
    setLoading(true);
    try {
      const r = await login({ data: { username: username.trim(), password } });
      if (!r.ok) { setError(r.error); return; }
      const { error } = await supabase.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
      if (error) { setError("Could not start the session. Try again."); return; }
      setPassword("");
      await qc.cancelQueries();
      qc.clear();
      const me = await meFn();
      navigate({ to: me.isAdmin ? "/admin" : "/painel", replace: true });
    } catch {
      setError("No connection to the server. Check your internet connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-rise">
        <Logo className="mx-auto w-64 max-w-full sm:w-72" />
        <form onSubmit={onSubmit} className="panel mt-6 space-y-5 p-6" noValidate>
          <h1 className="text-center text-xl font-bold uppercase tracking-wider">Platform access</h1>
          <div className="space-y-2">
            <Label htmlFor="u">Username</Label>
            <Input id="u" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className="h-12 bg-secondary" maxLength={254} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p">Password</Label>
            <div className="relative">
              <Input id="p" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 bg-secondary pr-12" maxLength={128} />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          {error && <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <Button type="submit" variant="hero" className="h-14 w-full text-base" disabled={loading}>
            {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Verifying...</> : "Sign in"}
          </Button>
          <div className="border-t border-border pt-5 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">No access yet?</p>
            <Button asChild variant="whatsapp" className="h-12 w-full">
              <a href={whatsappUrl(settings?.whatsapp ?? DEFAULT_WHATSAPP)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-5 w-5" /> Get your login
              </a>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
