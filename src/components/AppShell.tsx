import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { Shield, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMe } from "@/lib/app.functions";
import { Logo } from "./Logo";
import { Button } from "./ui/button";

export function useMe() {
  const fn = useServerFn(getMe);
  return useQuery({ queryKey: ["me"], queryFn: () => fn(), refetchInterval: 60_000 });
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen pb-8">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3">
          <span className="flex items-center gap-2 justify-self-start text-xs font-bold uppercase tracking-wide">
            <span aria-hidden className="live-dot h-2.5 w-2.5" />
            LIVE
          </span>
          <Link to="/painel" className="shrink-0 justify-self-center"><Logo className="w-24" /></Link>
          <div className="flex min-w-0 items-center justify-self-end gap-1">
            {me.data?.isAdmin && <Link to="/admin" className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold uppercase text-foreground hover:bg-secondary" aria-label="Administration"><Shield className="h-5 w-5" /><span className="hidden sm:inline">Admin</span></Link>}
            <Button variant="ghost" size="icon" onClick={signOut} title="Sign out" aria-label="Sign out" className="shrink-0 text-muted-foreground"><LogOut className="h-5 w-5" /></Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6 text-center">
      <h1 className="text-2xl font-extrabold uppercase tracking-wider sm:text-3xl">{title}</h1>
      {subtitle && <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function Disclaimer() {
  return (
    <p className="mt-6 text-center text-xs text-muted-foreground">
      Past results do not determine future rounds. Each round is independent. This platform is for statistical analysis and does not recommend bets.
    </p>
  );
}
