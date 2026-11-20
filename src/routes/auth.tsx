import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, MessageCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { loginWithUsername, registerAccount, getPublicSettings } from "@/lib/auth.functions";
import { DEFAULT_WHATSAPP, whatsappUrl } from "@/lib/config";
import { getMe } from "@/lib/app.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Bac Bo Live" },
      { name: "description", content: "Acesso à plataforma Bac Bo Live." },
    ],
  }),
  loader: () => getPublicSettings(),
  component: AuthPage,
});

type Mode = "login" | "register";

function AuthPage() {
  const settings = Route.useLoaderData();
  const navigate = useNavigate();
  const login = useServerFn(loginWithUsername);
  const register = useServerFn(registerAccount);
  const meFn = useServerFn(getMe);
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/painel", replace: true });
    });
  }, [navigate]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!username.trim() || !password) return setError("Introduza utilizador e palavra-passe.");
    setLoading(true);
    try {
      const r = await login({ data: { username: username.trim(), password } });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const { error: se } = await supabase.auth.setSession({
        access_token: r.access_token,
        refresh_token: r.refresh_token,
      });
      if (se) {
        setError("Não foi possível iniciar a sessão.");
        return;
      }
      setPassword("");
      await qc.cancelQueries();
      qc.clear();
      const me = await meFn();
      navigate({ to: me.isAdmin ? "/admin" : "/painel", replace: true });
    } catch {
      setError("Sem ligação ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!username.trim() || password.length < 10)
      return setError("Utilizador (mín. 3) e palavra-passe (mín. 10 caracteres).");
    setLoading(true);
    try {
      const r = await register({ data: { username: username.trim(), password } });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(r.message);
      setPassword("");
      setMode("login");
    } catch {
      setError("Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-stage relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Casino ambient background */}
      <div className="pointer-events-none absolute inset-0 auth-casino-bg" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/40 via-background/75 to-background" />

      <div className="relative z-10 w-full max-w-md animate-rise">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo className="scale-110" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Sinais inteligentes · Acesso privado
          </p>
        </div>

        <div className="glass-card overflow-hidden">
          {/* Tabs */}
          <div className="grid grid-cols-2 border-b border-white/8">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={`py-3.5 text-sm font-bold uppercase tracking-wider transition ${
                mode === "login"
                  ? "bg-white/5 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
                setSuccess(null);
              }}
              className={`py-3.5 text-sm font-bold uppercase tracking-wider transition ${
                mode === "register"
                  ? "bg-white/5 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Criar conta
            </button>
          </div>

          <form
            onSubmit={mode === "login" ? onLogin : onRegister}
            className="space-y-4 p-6 sm:p-7"
            noValidate
          >
            {success && (
              <div className="flex gap-2.5 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="u">Utilizador</Label>
              <Input
                id="u"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-12 rounded-xl border-white/10 bg-white/5"
                maxLength={64}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="p">Palavra-passe</Label>
              <div className="relative">
                <Input
                  id="p"
                  type={show ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-xl border-white/10 bg-white/5 pr-12"
                  maxLength={128}
                  placeholder={mode === "register" ? "Mínimo 10 caracteres" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Ocultar" : "Mostrar"}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="hero"
              className="h-13 w-full rounded-xl text-base font-extrabold"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  A processar…
                </>
              ) : mode === "login" ? (
                "Entrar"
              ) : (
                "Criar conta"
              )}
            </Button>

            {mode === "register" && (
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                Após criar a conta, o acesso fica <strong className="text-foreground/80">pendente</strong> até o
                administrador aprovar.
              </p>
            )}

            <div className="border-t border-white/8 pt-4 text-center">
              <Button asChild variant="whatsapp" className="h-11 w-full rounded-xl text-sm">
                <a
                  href={whatsappUrl(settings?.whatsapp ?? DEFAULT_WHATSAPP)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-4 w-4" />
                  Contactar suporte
                </a>
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
