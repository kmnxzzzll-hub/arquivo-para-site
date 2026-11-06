import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), privilegedLoaded: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: (args: unknown) => unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => {
  mocks.privilegedLoaded();
  return { supabaseAdmin: {} };
});
import { adminOverview } from "./admin.functions";

const overview = adminOverview as unknown as (args: { context: { supabase: { rpc: typeof mocks.rpc }; userId: string } }) => Promise<unknown>;
const context = { supabase: { rpc: mocks.rpc }, userId: "current-user" };
describe("acesso administrativo", () => {
  beforeEach(() => vi.clearAllMocks());
  it("recusa um utilizador sem papel admin antes de carregar privilégios", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(overview({ context })).rejects.toThrow("Acesso negado.");
    expect(mocks.rpc).toHaveBeenCalledWith("has_role", { _user_id: "current-user", _role: "admin" });
    expect(mocks.privilegedLoaded).not.toHaveBeenCalled();
  });
  it("não confunde falha de verificação com ausência de papel admin", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    await expect(overview({ context })).rejects.toThrow("Não foi possível verificar o acesso.");
    expect(mocks.privilegedLoaded).not.toHaveBeenCalled();
  });
});