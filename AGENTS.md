<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Bac Bo Live
- Login is username-only: usernames map to synthetic emails via `usernameToEmail` in src/lib/config.ts; public signup is disabled. Why: owner issues fixed private accounts.
- Login goes through the `loginWithUsername` server fn (rate limit + active check) and the client calls `setSession`. Why: server-side throttling and deactivation enforcement.
- Admin operations live in src/lib/admin.functions.ts and must check `has_role(...,'admin')` before loading supabaseAdmin. Why: privileges are verified server-side only.
- Statistics are pure functions in src/lib/stats.ts (tested); never present random numbers as predictions. Why: owner requires honest, documented methods.
- Displayed probabilities use largest-remainder rounding to integer tenths in the statistics module. Why: visible percentages must total exactly 100% without falsifying estimates.
- The home cards highlight the larger of red/blue via a tested pure function in the statistics module; no random outcome is shown. Why: owner removed simulated signals.
- The panel has no trend map/grid (owner removed it); src/lib/road.ts and the admin socket URL setting (`private_settings`, readable only by active users) are kept unused for a possible return. Why: the URL contains a session and must not be public like `app_settings`.
- Each generated signal is computed and stored server-side in `signals`; the panel shows the latest stored one on load. Why: the active signal must survive a page reload.
