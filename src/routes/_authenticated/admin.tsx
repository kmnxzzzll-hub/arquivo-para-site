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
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminOverview, adminSetActive, adminResetPassword, adminCreateAccounts, adminSetWhatsapp, adminSetSocketUrl, adminTestSocket } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administration — Bac Bo Live" }, { name: "description", content: "Private Bac Bo Live account management." }, { property: "og:title", content: "Administration — Bac Bo Live" }, { property: "og:description", content: "Private Bac Bo Live account management." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: Admin,
});

const STATUS = { criada: "created", duplicada: "duplicate", erro: "error" } as const;
const online = (t: string | null | undefined) => !!t && Date.now() - new Date(t).getTime() < 2 * 60_000;
const fmt = (t: string | null | undefined) => (t ? new Date(t).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "Never");

function Admin() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(adminOverview);
  const activeFn = useServerFn(adminSetActive);
  const resetFn = useServerFn(adminResetPassword);
  const createFn = useServerFn(adminCreateAccounts);
  const waFn = useServerFn(adminSetWhatsapp);
  const sockFn = useServerFn(adminSetSocketUrl);
  const testFn = useServerFn(adminTestSocket);
  const [test, setTest] = useState<Awaited<ReturnType<typeof testFn>> | null>(null);
  const testing = useMutation({ mutationFn: () => testFn({ data: { url: sock.trim() } }), onMutate: () => setTest(null), onSuccess: setTest, onError: () => toast.error("Could not run the test. Try again.") });
  const q = useQuery({ queryKey: ["admin"], queryFn: () => overviewFn(), retry: false, refetchInterval: 30_000 });
  const [wa, setWa] = useState("");
  const [csv, setCsv] = useState("");
  const [sock, setSock] = useState("");
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [report, setReport] = useState<Awaited<ReturnType<typeof createFn>>["report"] | null>(null);
  useEffect(() => { if (q.data) { setWa(q.data.whatsapp); setSock(q.data.socketUrl); } }, [q.data]);
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
  const createOne = useMutation({
    mutationFn: () => createFn({ data: { accounts: [{ username: newUser.trim(), password: newPass }] } }),
    onSuccess: (r) => {
      const row = r.report[0];
      if (row?.status === "criada") { toast.success(`Account "${row.username}" created.`); setNewUser(""); setNewPass(""); refresh(); }
      else if (row?.status === "duplicada") toast.error("That username already exists.");
      else toast.error(row?.message ?? "Could not create the account.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (q.isError) return <div className="py-6 text-center"><p role="alert" className="mb-4 text-sm text-destructive">{q.error.message === "Access denied." ? "This session does not belong to an administrator account. Sign out and sign in with the admin account." : "Could not load the administration. Try again."}</p><Button variant="secondary" onClick={() => q.refetch()}>Try again</Button></div>;
  const d = q.data;
  if (!d) return null;

  async function reset(id: string, username: string) {
    const pw = window.prompt(`New password for ${username} (min. 10 characters):`);
    if (!pw) return;
    const r = await resetFn({ data: { id, password: pw } }).catch(() => ({ ok: false as const, error: "Error" }));
    r.ok ? toast.success("Password reset.") : toast.error(r.error);
  }

  return (
    <>
      <PageTitle title="Administration" />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Accounts", d.users.length], ["Active", d.users.filter((u) => u.active).length], ["Online", d.users.filter((u) => online(u.last_seen_at)).length], ["Rounds", d.counts.rounds]].map(([k, v]) => (
          <div key={k} className="panel p-3 text-center"><div className="text-xs font-semibold text-muted-foreground">{k}</div><div className="font-display text-xl font-extrabold tracking-tight">{v}</div></div>
        ))}
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-4 grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-secondary p-1 sm:grid-cols-4">
          <TabsTrigger value="users" className="rounded-lg py-2 font-semibold">Users</TabsTrigger>
          <TabsTrigger value="accounts" className="rounded-lg py-2 font-semibold">Create Accounts</TabsTrigger>
          <TabsTrigger value="settings" className="rounded-lg py-2 font-semibold">Settings</TabsTrigger>
          <TabsTrigger value="activity" className="rounded-lg py-2 font-semibold">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.users.map((u) => {
              const on = online(u.last_seen_at);
              return (
                <div key={u.id} className={`panel flex flex-col gap-3 p-4 ${!u.active ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{u.username}</div>
                      {u.isAdmin && <span className="mt-1 inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/80">admin</span>}
                    </div>
                    <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${on ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-success" : "bg-muted-foreground"}`} />{on ? "Online" : "Offline"}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-1 text-xs">
                    <dt className="text-muted-foreground">Last sign-in</dt><dd className="text-right">{fmt(u.lastSignIn)}</dd>
                    <dt className="text-muted-foreground">Last activity</dt><dd className="text-right">{fmt(u.last_seen_at)}</dd>
                    <dt className="text-muted-foreground">Account</dt><dd className={`text-right font-semibold ${u.active ? "text-success" : "text-destructive"}`}>{u.active ? "Active" : "Deactivated"}</dd>
                  </dl>
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                    <Switch checked={u.active} disabled={u.isAdmin || toggle.isPending} onCheckedChange={(v) => toggle.mutate({ id: u.id, active: v })} aria-label={`Activate account ${u.username}`} />
                    <Button size="sm" variant="secondary" onClick={() => reset(u.id, u.username)}>Reset password</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="accounts" className="grid gap-4 md:grid-cols-2">
          <form className="panel flex flex-col gap-3 p-4" onSubmit={(e) => { e.preventDefault(); createOne.mutate(); }}>
            <h2 className="text-sm font-bold tracking-tight">New account</h2>
            <div className="grid gap-1.5">
              <Label htmlFor="new-user">Username</Label>
              <Input id="new-user" value={newUser} onChange={(e) => setNewUser(e.target.value)} autoComplete="off" autoCapitalize="none" placeholder="e.g. john.smith" className="bg-secondary" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-pass">Password</Label>
              <Input id="new-pass" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} autoComplete="new-password" placeholder="Minimum 10 characters" className="bg-secondary" />
            </div>
            <Button type="submit" disabled={newUser.trim().length < 3 || newPass.length < 10 || createOne.isPending}>{createOne.isPending ? "Creating…" : "Create account"}</Button>
          </form>

          <div className="panel flex flex-col gap-2 p-4">
            <h2 className="text-sm font-bold tracking-tight">Import multiple accounts</h2>
            <p className="text-xs text-muted-foreground">One account per line: <code>username;password</code>. Duplicates are skipped. Passwords are never shown or logged.</p>
            <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={5} className="w-full rounded-md border border-input bg-secondary p-2 font-mono text-sm" aria-label="Accounts to import" />
            <Button variant="secondary" disabled={!csv.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Importing…" : "Import accounts"}</Button>
          </div>

          {report && <ul className="panel p-4 text-xs md:col-span-2">{report.map((r) => <li key={r.line} className={r.status === "criada" ? "text-success" : r.status === "duplicada" ? "text-muted-foreground" : "text-destructive"}>Line {r.line} {r.username}: {STATUS[r.status]}{r.message ? ` — ${r.message}` : ""}</li>)}</ul>}
        </TabsContent>

        <TabsContent value="settings" className="grid gap-4 md:grid-cols-2">
          <section className="panel p-4">
            <h2 className="mb-2 text-sm font-bold tracking-tight">WhatsApp number</h2>
            <div className="flex gap-2">
              <Input value={wa} onChange={(e) => setWa(e.target.value.replace(/\D/g, ""))} className="bg-secondary" inputMode="numeric" aria-label="WhatsApp number" />
              <Button onClick={() => waFn({ data: { number: wa } }).then(() => { toast.success("Number saved."); refresh(); }).catch(() => toast.error("Invalid number."))}>Save</Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">International format without "+", e.g. 244956125296.</p>
          </section>

          <section className="panel p-4">
            <h2 className="mb-2 text-sm font-bold tracking-tight">Live table connection</h2>
            <textarea value={sock} onChange={(e) => setSock(e.target.value)} rows={3} placeholder="wss://…/public/bacbo/player/game/…/socket?messageFormat=json&…" className="w-full break-all rounded-md border border-input bg-secondary p-2 font-mono text-xs" aria-label="Live table connection" />
            <div className="mt-2 flex gap-2">
              <Button onClick={() => sockFn({ data: { url: sock.trim() } }).then((r) => {
                if (!r.ok) { setTest({ ok: false, problems: r.problems, message: null, stats: null }); toast.error("Not saved: the address has problems."); return; }
                toast.success(sock.trim() ? "Connection saved." : "Connection removed."); refresh(); qc.invalidateQueries({ queryKey: ["live-road"] });
              }).catch(() => toast.error("Could not save. Try again."))}>Save</Button>
              <Button variant="secondary" disabled={testing.isPending || (!sock.trim() && !d.socketUrl)} onClick={() => testing.mutate()}>{testing.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Testing…</> : "Test connection"}</Button>
              {d.socketUrl && <Button variant="secondary" onClick={() => setSock("")}>Clear</Button>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Paste the full live table connection address (including the session). When the session expires or the table refuses the connection, the panel falls back to recorded rounds.</p>
            {test && (
              <div role="status" className={`mt-3 rounded-lg border p-3 text-xs ${test.ok ? "border-success/50 bg-success/10" : "border-destructive/50 bg-destructive/10"}`}>
                <div className={`mb-1 font-bold ${test.ok ? "text-success" : "text-destructive"}`}>{test.ok ? "✅ Live table connected" : "❌ Live table not connected"}</div>
                {test.problems.length > 0 && <ul className="list-disc space-y-0.5 pl-4">{test.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
                {test.message && <p>{test.message}</p>}
                {test.stats && <p className="num mt-1 text-sm">🔴 {test.stats.banker} · 🔵 {test.stats.player} · 🟡 {test.stats.tie}</p>}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="activity" className="grid gap-4 md:grid-cols-2">
          <p className="text-xs text-muted-foreground md:col-span-2">Database: <b className="text-success">operational</b> · Authentication: <b className={d.authOk ? "text-success" : "text-destructive"}>{d.authOk ? "operational" : "error"}</b> · Live table: <b>{d.socketUrl ? "configured" : "not configured"}</b> · Analyses: <b>{d.counts.analyses}</b></p>
          <div className="panel p-4">
            <h2 className="mb-2 text-sm font-bold tracking-tight">Recent sign-in attempts</h2>
            <ul className="max-h-72 overflow-auto text-xs">{d.attempts.map((a, i) => <li key={i} className="flex justify-between gap-2 py-0.5"><span>{a.username}</span><span className={a.success ? "text-success" : "text-destructive"}>{a.success ? "success" : "failed"}</span><span className="text-muted-foreground">{new Date(a.created_at).toLocaleString("en-GB")}</span></li>)}</ul>
          </div>
          <div className="panel p-4">
            <h2 className="mb-2 text-sm font-bold tracking-tight">Operations log</h2>
            {d.logs.length ? <ul className="max-h-72 overflow-auto text-xs">{d.logs.map((l: any) => <li key={l.id} className="py-0.5">{new Date(l.created_at).toLocaleString("en-GB")} — {l.action} {l.detail ?? ""}</li>)}</ul> : <p className="text-xs text-muted-foreground">No operations logged.</p>}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
