create extension if not exists pgcrypto;

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  incident_no text not null unique,
  incident_type text not null check (incident_type in ('FALTANTE','DANADO','DIFERENCIA','SIN_DOCUMENTACION','OTRO')),
  status text not null default 'ABIERTO' check (status in ('ABIERTO','EN_REVISION','NOTIFICADO','CERRADO')),
  guide_no text,
  document_no text,
  purchase_order text,
  material_no text,
  description text,
  qty_expected numeric,
  qty_received numeric,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_rules (
  id uuid primary key default gen_random_uuid(),
  incident_type text not null unique,
  enabled boolean not null default true,
  auto_send boolean not null default false,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  attach_guide boolean not null default true,
  attach_photos boolean not null default true,
  attach_report boolean not null default false,
  subject_template text not null default '[KOMTROL][{{incident_type}}] {{guide_no}} | {{purchase_order}}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_notifications (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  status text not null default 'PENDIENTE'
    check (status in ('PENDIENTE','ENVIANDO','ENVIADO','ERROR','REINTENTO')),
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  subject text not null,
  body_html text not null,
  sent_at timestamptz,
  graph_request_id text,
  error_message text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists incidents_created_by_idx on public.incidents(created_by);
create index if not exists incidents_status_idx on public.incidents(status);
create index if not exists incidents_type_idx on public.incidents(incident_type);
create index if not exists email_notifications_incident_idx on public.email_notifications(incident_id);
create index if not exists email_notifications_status_idx on public.email_notifications(status);

alter table public.incidents enable row level security;
alter table public.email_rules enable row level security;
alter table public.email_notifications enable row level security;

create policy "incidents_select_authenticated"
on public.incidents for select
to authenticated
using (true);

create policy "incidents_insert_own"
on public.incidents for insert
to authenticated
with check ((select auth.uid()) = created_by);

create policy "incidents_update_own"
on public.incidents for update
to authenticated
using ((select auth.uid()) = created_by)
with check ((select auth.uid()) = created_by);

create policy "email_rules_read_authenticated"
on public.email_rules for select
to authenticated
using (true);

create policy "notifications_select_authenticated"
on public.email_notifications for select
to authenticated
using (true);

create policy "notifications_insert_own"
on public.email_notifications for insert
to authenticated
with check ((select auth.uid()) = created_by);

insert into public.email_rules
  (incident_type, auto_send, to_addresses, cc_addresses)
values
  ('FALTANTE', false, '{}', '{}'),
  ('DANADO', false, '{}', '{}'),
  ('DIFERENCIA', false, '{}', '{}'),
  ('SIN_DOCUMENTACION', false, '{}', '{}'),
  ('OTRO', false, '{}', '{}')
on conflict (incident_type) do nothing;
