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
      { title: "Entrar — Bac Bo Live" },
      { name: "description", content: "Acesso à plataforma Bac Bo Live." },
      { property: "og:title", content: "Entrar — Bac Bo Live" },
      { property: "og:type", content: "website" },
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
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/painel", replace: true });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) return setError("Introduza o utilizador e a palavra-passe.");
    if (!/^[A-Za-z0-9._@+-]{3,254}$/.test(username.trim()))
      return setError("Não foi possível entrar. Verifique os dados.");
    setLoading(true);
    try {
      const r = await login({ data: { username: username.trim(), password } });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: r.access_token,
        refresh_token: r.refresh_token,
      });
      if (error) {
        setError("Não foi possível iniciar a sessão. Tente de novo.");
        return;
      }
      setPassword("");
      await qc.cancelQueries();
      qc.clear();
      const me = await meFn();
      navigate({ to: me.isAdmin ? "/admin" : "/painel", replace: true });
    } catch {
      setError("Sem ligação ao servidor. Verifique a internet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-rise">
        <div className="mb-2 flex justify-center">
          <Logo className="text-2xl tracking-[0.2em]" />
        </div>
        <p className="mb-6 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Acesso privado
        </p>

        <form onSubmit={onSubmit} className="glass-card space-y-5 p-6 sm:p-7" noValidate>
          <h1 className="text-center text-lg font-bold uppercase tracking-[0.12em]">Entrar</h1>

          <div className="space-y-2">
            <Label htmlFor="u">Utilizador</Label>
            <Input
              id="u"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-12 rounded-xl bg-white/5 border-white/10"
              maxLength={254}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="p">Palavra-passe</Label>
            <div className="relative">
              <Input
                id="p"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-xl bg-white/5 border-white/10 pr-12"
                maxLength={128}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" variant="hero" className="h-13 w-full rounded-xl text-base" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> A verificar…
              </>
            ) : (
              "Entrar"
            )}
          </Button>

          <div className="border-t border-white/8 pt-5 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Ainda sem acesso?
            </p>
            <Button asChild variant="whatsapp" className="h-12 w-full rounded-xl">
              <a
                href={whatsappUrl(settings?.whatsapp ?? DEFAULT_WHATSAPP)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-5 w-5" />
                Pedir acesso
              </a>
            </Button>
            <p className="mt-3 text-[11px] text-muted-foreground/70">
              Os logins são aprovados pelo administrador.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
