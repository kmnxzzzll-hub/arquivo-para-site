create type public.app_role as enum ('admin','user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  winner text not null check (winner in ('player','tie','banker')),
  player_sum smallint check (player_sum between 2 and 12),
  banker_sum smallint check (banker_sum between 2 and 12),
  source text not null default 'manual' check (source in ('manual','import')),
  created_at timestamptz not null default now()
);
create index rounds_user_created on public.rounds(user_id, created_at desc);
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('real','simulated')),
  method text not null,
  observations int not null,
  theoretical jsonb not null,
  observed jsonb not null,
  estimate jsonb not null,
  chi2 double precision,
  p_value double precision,
  status text not null default 'ok'
);
create index analyses_user_created on public.analyses(user_id, created_at desc);
create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
create table public.login_attempts (
  id bigserial primary key,
  username text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_user_time on public.login_attempts(username, created_at desc);
create table public.audit_logs (
  id bigserial primary key,
  actor uuid,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

grant select on public.profiles to authenticated; grant all on public.profiles to service_role;
grant select on public.user_roles to authenticated; grant all on public.user_roles to service_role;
grant select, insert, delete on public.rounds to authenticated; grant all on public.rounds to service_role;
grant select, insert, delete on public.analyses to authenticated; grant all on public.analyses to service_role;
grant select on public.app_settings to anon, authenticated; grant all on public.app_settings to service_role;
grant all on public.login_attempts to service_role; grant usage on sequence public.login_attempts_id_seq to service_role;
grant select on public.audit_logs to authenticated; grant all on public.audit_logs to service_role; grant usage on sequence public.audit_logs_id_seq to service_role;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.rounds enable row level security;
alter table public.analyses enable row level security;
alter table public.app_settings enable row level security;
alter table public.login_attempts enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "own profile or admin" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own roles or admin" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own rounds read" on public.rounds for select to authenticated using (user_id = auth.uid());
create policy "own rounds insert" on public.rounds for insert to authenticated with check (user_id = auth.uid());
create policy "own rounds delete" on public.rounds for delete to authenticated using (user_id = auth.uid());
create policy "own analyses read" on public.analyses for select to authenticated using (user_id = auth.uid());
create policy "own analyses insert" on public.analyses for insert to authenticated with check (user_id = auth.uid());
create policy "own analyses delete" on public.analyses for delete to authenticated using (user_id = auth.uid());
create policy "settings public read" on public.app_settings for select to anon, authenticated using (true);
create policy "admin audit read" on public.audit_logs for select to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;
revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

insert into public.app_settings(key,value) values ('whatsapp_number','244956125296');