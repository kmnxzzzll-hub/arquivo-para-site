import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Users, UserPlus, Settings, Activity, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PageTitle } from "@/components/AppShell";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  adminOverview,
  adminSetActive,
  adminResetPassword,
  adminCreateAccounts,
  adminSetWhatsapp,
  adminSetApiUrl,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [{ title: "Admin — Bac Bo Live" }, { name: "robots", content: "noindex" }],
  }),
  component: Admin,
});

const online = (t: string | null | undefined) => !!t && Date.now() - new Date(t).getTime() < 2 * 60_000;
const fmt = (t: string | null | undefined) =>
  t ? new Date(t).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "—";

function Admin() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(adminOverview);
  const activeFn = useServerFn(adminSetActive);
  const resetFn = useServerFn(adminResetPassword);
  const createFn = useServerFn(adminCreateAccounts);
  const waFn = useServerFn(adminSetWhatsapp);
  const apiFn = useServerFn(adminSetApiUrl);

  const q = useQuery({ queryKey: ["admin"], queryFn: () => overviewFn(), retry: false, refetchInterval: 30_000 });
  const [wa, setWa] = useState("");
  const [api, setApi] = useState("");
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");

  useEffect(() => {
    if (q.data) {
      setWa(q.data.whatsapp);
      setApi(q.data.apiUrl);
    }
  }, [q.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });

  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => activeFn({ data: v }),
    onSuccess: () => {
      refresh();
      toast.success("Estado atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createOne = useMutation({
    mutationFn: () => createFn({ data: { accounts: [{ username: newUser.trim(), password: newPass }] } }),
    onSuccess: (r) => {
      const row = r.report[0];
      if (row?.status === "criada") {
        toast.success(`Conta "${row.username}" criada e ativa.`);
        setNewUser("");
        setNewPass("");
        refresh();
      } else if (row?.status === "duplicada") toast.error("Utilizador já existe.");
      else toast.error(row?.message ?? "Erro ao criar.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (q.isError)
    return (
      <div className="py-8 text-center">
        <p className="mb-4 text-sm text-destructive">{q.error.message}</p>
        <Button variant="secondary" onClick={() => q.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );

  const d = q.data;
  if (!d) return null;

  const pending = d.users.filter((u) => !u.active && !u.isAdmin);

  async function reset(id: string, username: string) {
    const pw = window.prompt(`Nova palavra-passe para ${username} (mín. 10):`);
    if (!pw) return;
    const r = await resetFn({ data: { id, password: pw } }).catch(() => ({ ok: false as const, error: "Erro" }));
    r.ok ? toast.success("Palavra-passe redefinida.") : toast.error(r.error);
  }

  return (
    <>
      <PageTitle title="Administração" subtitle="Aprovar contas, gerir utilizadores e ligar a API do robô." />

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          ["Contas", d.users.length],
          ["Ativas", d.users.filter((u) => u.active).length],
          ["Pendentes", pending.length],
          ["Online", d.users.filter((u) => online(u.last_seen_at)).length],
        ].map(([k, v]) => (
          <div key={k as string} className="glass-card p-3 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k}</div>
            <div className="num mt-1 text-xl">{v}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-5 grid h-auto w-full grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1.5 sm:grid-cols-4">
          <TabsTrigger value="users" className="gap-1.5 rounded-xl py-2.5 text-xs font-semibold sm:text-sm">
            <Users className="h-3.5 w-3.5" /> Utilizadores
          </TabsTrigger>
          <TabsTrigger value="accounts" className="gap-1.5 rounded-xl py-2.5 text-xs font-semibold sm:text-sm">
            <UserPlus className="h-3.5 w-3.5" /> Contas
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-1.5 rounded-xl py-2.5 text-xs font-semibold sm:text-sm">
            <Plug className="h-3.5 w-3.5" /> API / Robô
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5 rounded-xl py-2.5 text-xs font-semibold sm:text-sm">
            <Activity className="h-3.5 w-3.5" /> Atividade
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-3">
          {pending.length > 0 && (
            <div className="rounded-xl border border-tie/30 bg-tie/5 px-3 py-2 text-xs font-semibold text-tie">
              {pending.length} conta(s) à espera de aprovação
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.users.map((u) => {
              const on = online(u.last_seen_at);
              return (
                <div key={u.id} className={`glass-card flex flex-col gap-3 p-4 ${!u.active ? "opacity-80" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{u.username}</div>
                      {u.isAdmin && (
                        <span className="mt-1 inline-block rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase">
                          admin
                        </span>
                      )}
                      {!u.active && !u.isAdmin && (
                        <span className="mt-1 inline-block rounded-full border border-tie/40 bg-tie/10 px-2 py-0.5 text-[10px] font-bold uppercase text-tie">
                          pendente
                        </span>
                      )}
                    </div>
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        on ? "bg-success/15 text-success" : "bg-white/5 text-muted-foreground"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-success" : "bg-muted-foreground"}`} />
                      {on ? "Online" : "Offline"}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-1 text-xs">
                    <dt className="text-muted-foreground">Último login</dt>
                    <dd className="text-right">{fmt(u.lastSignIn)}</dd>
                    <dt className="text-muted-foreground">Atividade</dt>
                    <dd className="text-right">{fmt(u.last_seen_at)}</dd>
                  </dl>
                  <div className="flex items-center justify-between gap-2 border-t border-white/8 pt-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={u.active}
                        disabled={u.isAdmin || toggle.isPending}
                        onCheckedChange={(v) => toggle.mutate({ id: u.id, active: v })}
                        aria-label={`Ativar ${u.username}`}
                      />
                      <span className="text-[11px] text-muted-foreground">{u.active ? "Ativo" : "Aprovar"}</span>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => reset(u.id, u.username)}>
                      Password
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="accounts">
          <form
            className="glass-card flex max-w-md flex-col gap-3 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              createOne.mutate();
            }}
          >
            <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight">
              <UserPlus className="h-4 w-4" /> Nova conta (já ativa)
            </h2>
            <div className="grid gap-1.5">
              <Label htmlFor="nu">Utilizador</Label>
              <Input
                id="nu"
                value={newUser}
                onChange={(e) => setNewUser(e.target.value)}
                className="bg-white/5"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="np">Palavra-passe</Label>
              <Input
                id="np"
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="bg-white/5"
                autoComplete="new-password"
              />
            </div>
            <Button
              type="submit"
              disabled={newUser.trim().length < 3 || newPass.length < 10 || createOne.isPending}
            >
              {createOne.isPending ? "A criar…" : "Criar conta ativa"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Contas criadas aqui ficam ativas de imediato. Contas do registo público precisam de aprovação no separador
              Utilizadores.
            </p>
          </form>
        </TabsContent>

        <TabsContent value="api" className="grid gap-4 md:grid-cols-2">
          <section className="glass-card space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Plug className="h-4 w-4" /> URL da API do robô
            </h2>
            <p className="text-xs text-muted-foreground">
              Endpoint HTTPS que o backend usa para obter dados da mesa / sinais. Substitui o WebSocket antigo.
            </p>
            <Input
              value={api}
              onChange={(e) => setApi(e.target.value)}
              placeholder="https://api.exemplo.com/bacbo/..."
              className="bg-white/5 font-mono text-xs"
            />
            <Button
              onClick={() =>
                apiFn({ data: { url: api.trim() } })
                  .then((r) => {
                    if (!r.ok) toast.error(r.error);
                    else {
                      toast.success(api.trim() ? "API guardada." : "API removida.");
                      refresh();
                    }
                  })
                  .catch(() => toast.error("Erro ao guardar."))
              }
            >
              Guardar API
            </Button>
          </section>

          <section className="glass-card space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Settings className="h-4 w-4" /> WhatsApp
            </h2>
            <Input
              value={wa}
              onChange={(e) => setWa(e.target.value.replace(/\D/g, ""))}
              className="bg-white/5"
              inputMode="numeric"
              placeholder="2449..."
            />
            <Button
              onClick={() =>
                waFn({ data: { number: wa } })
                  .then(() => {
                    toast.success("Número guardado.");
                    refresh();
                  })
                  .catch(() => toast.error("Número inválido."))
              }
            >
              Guardar
            </Button>
          </section>
        </TabsContent>

        <TabsContent value="activity" className="grid gap-4 md:grid-cols-2">
          <div className="glass-card p-4">
            <h2 className="mb-2 text-sm font-bold">Tentativas de login</h2>
            <ul className="max-h-72 space-y-1 overflow-auto text-xs">
              {d.attempts.map((a, i) => (
                <li key={i} className="flex justify-between gap-2 py-0.5">
                  <span>{a.username}</span>
                  <span className={a.success ? "text-success" : "text-destructive"}>
                    {a.success ? "ok" : "falhou"}
                  </span>
                  <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-PT")}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="glass-card p-4">
            <h2 className="mb-2 text-sm font-bold">Operações</h2>
            {d.logs.length ? (
              <ul className="max-h-72 space-y-1 overflow-auto text-xs">
                {d.logs.map((l: any) => (
                  <li key={l.id} className="py-0.5">
                    {new Date(l.created_at).toLocaleString("pt-PT")} — {l.action} {l.detail ?? ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Sem registos.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
