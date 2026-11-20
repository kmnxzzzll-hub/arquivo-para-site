import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, UserPlus, Settings, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Bac Bo Live" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

/**
 * Admin shell — functions cleared for rebuild from zero.
 * Menus kept as structure only. Next steps: approvals, API config, etc.
 */
function Admin() {
  return (
    <>
      <PageTitle title="Administração" subtitle="Painel em reconstrução. Estrutura de menus pronta." />

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-5 grid h-auto w-full grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1.5 sm:grid-cols-4">
          <TabsTrigger value="users" className="gap-1.5 rounded-xl py-2.5 text-xs font-semibold sm:text-sm">
            <Users className="h-3.5 w-3.5" />
            Utilizadores
          </TabsTrigger>
          <TabsTrigger value="accounts" className="gap-1.5 rounded-xl py-2.5 text-xs font-semibold sm:text-sm">
            <UserPlus className="h-3.5 w-3.5" />
            Contas
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 rounded-xl py-2.5 text-xs font-semibold sm:text-sm">
            <Settings className="h-3.5 w-3.5" />
            Definições
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5 rounded-xl py-2.5 text-xs font-semibold sm:text-sm">
            <Activity className="h-3.5 w-3.5" />
            Atividade
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <EmptyPanel
            title="Utilizadores"
            description="Lista de contas, estado ativo/pendente e aprovação de logins serão adicionados aqui."
          />
        </TabsContent>

        <TabsContent value="accounts">
          <EmptyPanel
            title="Criar / aprovar contas"
            description="Pedidos de acesso e criação de logins (aprovados pelo administrador) entram nesta secção."
          />
        </TabsContent>

        <TabsContent value="settings">
          <EmptyPanel
            title="Definições"
            description="Ligações de API, WhatsApp e preferências da plataforma serão configurados aqui. WebSocket removido."
          />
        </TabsContent>

        <TabsContent value="activity">
          <EmptyPanel
            title="Atividade"
            description="Logs de login, sinais e operações administrativas aparecerão neste separador."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="glass-card flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground/80">{description}</p>
    </div>
  );
}
