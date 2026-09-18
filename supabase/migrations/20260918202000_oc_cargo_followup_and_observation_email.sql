create table if not exists public.oc_cargo_followups (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null unique references public.guides(id) on delete cascade,
  client_delivery_date date,
  refrendo_delivery_date date,
  oc_value_usd numeric(16,2),
  mine_warehouse_observations text,
  kmmp_warehouse_observation text,
  received_by text
    check (received_by is null or received_by in ('ANTAMINA','CONSIGNADO','OTRO')),
  final_status text not null default 'PENDIENTE'
    check (final_status in (
      'PENDIENTE',
      'EN_SEGUIMIENTO',
      'OBSERVADO',
      'ENTREGADO_CLIENTE',
      'REFRENDADO',
      'ANULADO',
      'CERRADO'
    )),
  cancellation_comments text,
  management_owner text,
  parts_location text,
  scan_sent_date date,
  scan_send_status text not null default 'PENDIENTE'
    check (scan_send_status in ('PENDIENTE','ENVIADO','OBSERVADO','NO_APLICA')),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.oc_cargo_followups enable row level security;

create index if not exists oc_cargo_followups_guide_idx on public.oc_cargo_followups(guide_id);
create index if not exists oc_cargo_followups_status_idx on public.oc_cargo_followups(final_status);
create index if not exists oc_cargo_followups_updated_by_idx on public.oc_cargo_followups(updated_by);

drop policy if exists "oc_cargo_followups_select_scope" on public.oc_cargo_followups;
create policy "oc_cargo_followups_select_scope"
on public.oc_cargo_followups for select
to authenticated
using (
  exists (
    select 1 from public.guides g
    where g.id = guide_id
      and (
        g.created_by = (select auth.uid())
        or g.responsible_user_id = (select auth.uid())
        or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
        or (
          (select private.current_user_komtrol_role()) = 'COORDINADOR'
          and g.warehouse is not distinct from (select private.current_user_warehouse())
        )
      )
  )
);

drop policy if exists "oc_cargo_followups_insert_scope" on public.oc_cargo_followups;
create policy "oc_cargo_followups_insert_scope"
on public.oc_cargo_followups for insert
to authenticated
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1 from public.guides g
    where g.id = guide_id
      and g.guide_type in ('ORDEN_COMPRA','CARGO_DIRECTO')
      and (
        g.created_by = (select auth.uid())
        or g.responsible_user_id = (select auth.uid())
        or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
        or (
          (select private.current_user_komtrol_role()) = 'COORDINADOR'
          and g.warehouse is not distinct from (select private.current_user_warehouse())
        )
      )
  )
);

drop policy if exists "oc_cargo_followups_update_scope" on public.oc_cargo_followups;
create policy "oc_cargo_followups_update_scope"
on public.oc_cargo_followups for update
to authenticated
using (
  exists (
    select 1 from public.guides g
    where g.id = guide_id
      and (
        g.created_by = (select auth.uid())
        or g.responsible_user_id = (select auth.uid())
        or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
        or (
          (select private.current_user_komtrol_role()) = 'COORDINADOR'
          and g.warehouse is not distinct from (select private.current_user_warehouse())
        )
      )
  )
)
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1 from public.guides g
    where g.id = guide_id
      and g.guide_type in ('ORDEN_COMPRA','CARGO_DIRECTO')
      and (
        g.created_by = (select auth.uid())
        or g.responsible_user_id = (select auth.uid())
        or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
        or (
          (select private.current_user_komtrol_role()) = 'COORDINADOR'
          and g.warehouse is not distinct from (select private.current_user_warehouse())
        )
      )
  )
);

create table if not exists public.guide_observation_emails (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  followup_id uuid references public.oc_cargo_followups(id) on delete set null,
  status text not null default 'PENDIENTE'
    check (status in ('PENDIENTE','ENVIANDO','ENVIADO','ERROR')),
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  subject text not null,
  body_text text not null,
  sent_at timestamptz,
  graph_request_id text,
  error_message text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.guide_observation_emails enable row level security;

create index if not exists guide_observation_emails_guide_idx on public.guide_observation_emails(guide_id);
create index if not exists guide_observation_emails_created_by_idx on public.guide_observation_emails(created_by);

drop policy if exists "guide_observation_emails_select_scope" on public.guide_observation_emails;
create policy "guide_observation_emails_select_scope"
on public.guide_observation_emails for select
to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.guides g
    where g.id = guide_id
      and (
        g.responsible_user_id = (select auth.uid())
        or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
        or (
          (select private.current_user_komtrol_role()) = 'COORDINADOR'
          and g.warehouse is not distinct from (select private.current_user_warehouse())
        )
      )
  )
);

grant select, insert, update on public.oc_cargo_followups to authenticated;
grant select on public.guide_observation_emails to authenticated;
