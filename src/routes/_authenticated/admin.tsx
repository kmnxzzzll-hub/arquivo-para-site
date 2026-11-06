import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PageTitle } from "@/components/AppShell";
import { adminOverview, adminSetActive, adminResetPassword, adminCreateAccounts, adminSetWhatsapp } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administração — Bac Bo Live" }, { name: "description", content: "Gestão privada de contas Bac Bo Live." }, { property: "og:title", content: "Administração — Bac Bo Live" }, { property: "og:description", content: "Gestão privada de contas Bac Bo Live." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: Admin,
});

const online = (t: string | null | undefined) => !!t && Date.now() - new Date(t).getTime() < 2 * 60_000;
const fmt = (t: string | null | undefined) => (t ? new Date(t).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "Nunca");

function Admin() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(adminOverview);
  const activeFn = useServerFn(adminSetActive);
  const resetFn = useServerFn(adminResetPassword);
  const createFn = useServerFn(adminCreateAccounts);
  const waFn = useServerFn(adminSetWhatsapp);
  const q = useQuery({ queryKey: ["admin"], queryFn: () => overviewFn(), retry: false, refetchInterval: 30_000 });
  const [wa, setWa] = useState("");
  const [csv, setCsv] = useState("");
  const [report, setReport] = useState<Awaited<ReturnType<typeof createFn>>["report"] | null>(null);
  useEffect(() => { if (q.data) setWa(q.data.whatsapp); }, [q.data]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });

  const toggle = useMutation({ mutationFn: (v: { id: string; active: boolean }) => activeFn({ data: v }), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  const create = useMutation({
    mutationFn: () => {
      const accounts = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [username, password] = l.split(/[;,\t]/); return { username: username?.trim(), password: password?.trim() }; });
      return createFn({ data: { accounts } });
    },
    onSuccess: (r) => { setReport(r.report); setCsv(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (q.isError) return <div className="py-6 text-center"><p role="alert" className="mb-4 text-sm text-destructive">{q.error.message === "Acesso negado." ? "Esta sessão não pertence a uma conta de administrador. Termina a sessão e entra com a conta administrativa." : "Não foi possível carregar a administração. Tenta novamente."}</p><Button variant="secondary" onClick={() => q.refetch()}>Tentar novamente</Button></div>;
  const d = q.data;
  if (!d) return null;

  async function reset(id: string, username: string) {
    const pw = window.prompt(`Nova palavra-passe para ${username} (mín. 10 caracteres):`);
    if (!pw) return;
    const r = await resetFn({ data: { id, password: pw } }).catch(() => ({ ok: false as const, error: "Erro" }));
    r.ok ? toast.success("Palavra-passe redefinida.") : toast.error(r.error);
  }

  return (
    <>
      <PageTitle title="Administração" />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Contas", d.users.length], ["Ativas", d.users.filter((u) => u.active).length], ["Rodadas", d.counts.rounds], ["Análises", d.counts.analyses]].map(([k, v]) => (
          <div key={k} className="panel p-3 text-center"><div className="text-xs uppercase text-muted-foreground">{k}</div><div className="font-display text-xl font-bold">{v}</div></div>
        ))}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Base de dados: <b className="text-success">operacional</b> · Autenticação: <b className={d.authOk ? "text-success" : "text-destructive"}>{d.authOk ? "operacional" : "com erro"}</b> · Fonte de dados externa: <b>não configurada</b> (sem API autorizada disponível)</p>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-gold">Utilizadores · {d.users.filter((u) => online(u.last_seen_at)).length} online</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.users.map((u) => {
            const on = online(u.last_seen_at);
            return (
              <div key={u.id} className={`panel flex flex-col gap-3 p-4 ${!u.active ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{u.username}</div>
                    {u.isAdmin && <span className="text-xs font-bold uppercase text-gold">admin</span>}
                  </div>
                  <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${on ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-success" : "bg-muted-foreground"}`} />{on ? "Online" : "Offline"}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-1 text-xs">
                  <dt className="text-muted-foreground">Último login</dt><dd className="text-right">{fmt(u.lastSignIn)}</dd>
                  <dt className="text-muted-foreground">Última atividade</dt><dd className="text-right">{fmt(u.last_seen_at)}</dd>
                  <dt className="text-muted-foreground">Conta</dt><dd className={`text-right font-semibold ${u.active ? "text-success" : "text-destructive"}`}>{u.active ? "Ativa" : "Desativada"}</dd>
                </dl>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                  <Switch checked={u.active} disabled={u.isAdmin || toggle.isPending} onCheckedChange={(v) => toggle.mutate({ id: u.id, active: v })} aria-label={`Ativar conta ${u.username}`} />
                  <Button size="sm" variant="secondary" onClick={() => reset(u.id, u.username)}>Redefinir</Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel mb-6 p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-gold">Criar / importar contas</h2>
        <p className="mb-2 text-xs text-muted-foreground">Uma conta por linha: <code>utilizador;palavra-passe</code>. Duplicados são ignorados. As palavras-passe nunca são mostradas nem registadas.</p>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={4} className="w-full rounded-md border border-input bg-secondary p-2 font-mono text-sm" />
        <Button className="mt-2" disabled={!csv.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "A criar…" : "Criar contas"}</Button>
        {report && <ul className="mt-3 text-xs">{report.map((r) => <li key={r.line} className={r.status === "criada" ? "text-success" : r.status === "duplicada" ? "text-gold" : "text-destructive"}>Linha {r.line} {r.username}: {r.status}{r.message ? ` — ${r.message}` : ""}</li>)}</ul>}
      </section>

      <section className="panel mb-6 p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-gold">Número do WhatsApp</h2>
        <div className="flex gap-2">
          <Input value={wa} onChange={(e) => setWa(e.target.value.replace(/\D/g, ""))} className="bg-secondary" inputMode="numeric" />
          <Button onClick={() => waFn({ data: { number: wa } }).then(() => { toast.success("Número guardado."); refresh(); }).catch(() => toast.error("Número inválido."))}>Guardar</Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Formato internacional sem «+», ex.: 244956125296.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel p-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-gold">Tentativas de login recentes</h2>
          <ul className="max-h-64 overflow-auto text-xs">{d.attempts.map((a, i) => <li key={i} className="flex justify-between py-0.5"><span>{a.username}</span><span className={a.success ? "text-success" : "text-destructive"}>{a.success ? "sucesso" : "falha"}</span><span className="text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-PT")}</span></li>)}</ul>
        </div>
        <div className="panel p-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-gold">Registo de operações</h2>
          {d.logs.length ? <ul className="max-h-64 overflow-auto text-xs">{d.logs.map((l: any) => <li key={l.id} className="py-0.5">{new Date(l.created_at).toLocaleString("pt-PT")} — {l.action} {l.detail ?? ""}</li>)}</ul> : <p className="text-xs text-muted-foreground">Sem operações registadas.</p>}
        </div>
      </section>
    </>
  );
}
