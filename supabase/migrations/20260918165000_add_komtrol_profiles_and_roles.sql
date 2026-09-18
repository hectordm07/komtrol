create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dni text not null unique,
  full_name text not null,
  role text not null default 'TRABAJADOR'
    check (role in ('TRABAJADOR','COORDINADOR','ADMINISTRADOR')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "profiles_select_own_or_manager"
on public.user_profiles for select
to authenticated
using (
  (select auth.uid()) = user_id
  or coalesce((select auth.jwt()->'app_metadata'->>'role'), '') in ('COORDINADOR','ADMINISTRADOR')
);

create policy "profiles_admin_update"
on public.user_profiles for update
to authenticated
using (coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'ADMINISTRADOR')
with check (coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'ADMINISTRADOR');

drop policy if exists "incidents_select_authenticated" on public.incidents;
create policy "incidents_select_authenticated"
on public.incidents for select
to authenticated
using (
  created_by = (select auth.uid())
  or coalesce((select auth.jwt()->'app_metadata'->>'role'), '') in ('COORDINADOR','ADMINISTRADOR')
);

drop policy if exists "incidents_update_own" on public.incidents;
create policy "incidents_update_role"
on public.incidents for update
to authenticated
using (
  created_by = (select auth.uid())
  or coalesce((select auth.jwt()->'app_metadata'->>'role'), '') in ('COORDINADOR','ADMINISTRADOR')
)
with check (
  created_by = (select auth.uid())
  or coalesce((select auth.jwt()->'app_metadata'->>'role'), '') in ('COORDINADOR','ADMINISTRADOR')
);

create policy "incidents_delete_admin"
on public.incidents for delete
to authenticated
using (coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'ADMINISTRADOR');

create policy "email_rules_admin_insert"
on public.email_rules for insert
to authenticated
with check (coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'ADMINISTRADOR');

create policy "email_rules_admin_update"
on public.email_rules for update
to authenticated
using (coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'ADMINISTRADOR')
with check (coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'ADMINISTRADOR');

create policy "email_rules_admin_delete"
on public.email_rules for delete
to authenticated
using (coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'ADMINISTRADOR');

drop policy if exists "notifications_select_authenticated" on public.email_notifications;
create policy "notifications_select_role"
on public.email_notifications for select
to authenticated
using (
  created_by = (select auth.uid())
  or coalesce((select auth.jwt()->'app_metadata'->>'role'), '') in ('COORDINADOR','ADMINISTRADOR')
);

drop policy if exists "incident_attachments_select_authenticated" on public.incident_attachments;
create policy "incident_attachments_select_role"
on public.incident_attachments for select
to authenticated
using (
  uploaded_by = (select auth.uid())
  or coalesce((select auth.jwt()->'app_metadata'->>'role'), '') in ('COORDINADOR','ADMINISTRADOR')
);
