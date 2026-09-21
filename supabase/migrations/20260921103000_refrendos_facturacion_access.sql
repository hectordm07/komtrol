-- Refrendos masivos + control de envío a Facturación + acceso Comercial/Documentario

alter table public.user_profiles
  add column if not exists oc_cargo_access_level text;

alter table public.user_profiles
  drop constraint if exists user_profiles_oc_cargo_access_level_check;

alter table public.user_profiles
  add constraint user_profiles_oc_cargo_access_level_check
  check (oc_cargo_access_level is null or oc_cargo_access_level in ('COMERCIAL','DOCUMENTARIO'));

alter table public.oc_cargo_followups
  add column if not exists billing_status text not null default 'PENDIENTE',
  add column if not exists billing_sent_at timestamptz,
  add column if not exists billing_sent_by uuid references auth.users(id),
  add column if not exists billing_sent_by_name text;

alter table public.oc_cargo_followups
  drop constraint if exists oc_cargo_followups_billing_status_check;

alter table public.oc_cargo_followups
  add constraint oc_cargo_followups_billing_status_check
  check (billing_status in ('PENDIENTE','ENVIADO','OBSERVADO','REENVIADO','CONFIRMADO'));

create index if not exists oc_cargo_followups_billing_status_idx
  on public.oc_cargo_followups(billing_status);

create index if not exists oc_cargo_followups_billing_sent_at_idx
  on public.oc_cargo_followups(billing_sent_at);

create table if not exists public.guide_refrendos (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  reference_detected text,
  file_bucket text not null default 'guide-documents',
  file_path text not null,
  file_name text not null,
  source_file_name text,
  page_from integer,
  page_to integer,
  confidence numeric(5,2),
  extraction_method text not null default 'PDF_TEXT'
    check (extraction_method in ('PDF_TEXT','OCR','MANUAL')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.guide_refrendos enable row level security;

create index if not exists guide_refrendos_guide_idx on public.guide_refrendos(guide_id);
create index if not exists guide_refrendos_created_by_idx on public.guide_refrendos(created_by);
create index if not exists guide_refrendos_created_at_idx on public.guide_refrendos(created_at desc);

drop policy if exists "guides_select_scope" on public.guides;
create policy "guides_select_scope"
on public.guides for select
to authenticated
using (
  created_by = (select auth.uid())
  or responsible_user_id = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or (
    (select private.current_user_komtrol_role()) = 'COORDINADOR'
    and warehouse is not distinct from (select private.current_user_warehouse())
  )
  or (
    guide_type in ('ORDEN_COMPRA','CARGO_DIRECTO')
    and exists (
      select 1
      from public.user_profiles up
      where up.user_id = (select auth.uid())
        and up.active = true
        and up.oc_cargo_access_level in ('COMERCIAL','DOCUMENTARIO')
    )
  )
);

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
        or exists (
          select 1
          from public.user_profiles up
          where up.user_id = (select auth.uid())
            and up.active = true
            and up.oc_cargo_access_level in ('COMERCIAL','DOCUMENTARIO')
        )
      )
  )
);

drop policy if exists "guide_refrendos_select_scope" on public.guide_refrendos;
create policy "guide_refrendos_select_scope"
on public.guide_refrendos for select
to authenticated
using (
  created_by = (select auth.uid())
  or exists (
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
        or exists (
          select 1
          from public.user_profiles up
          where up.user_id = (select auth.uid())
            and up.active = true
            and up.oc_cargo_access_level in ('COMERCIAL','DOCUMENTARIO')
        )
      )
  )
);

drop policy if exists "guide_refrendos_insert_scope" on public.guide_refrendos;
create policy "guide_refrendos_insert_scope"
on public.guide_refrendos for insert
to authenticated
with check (
  created_by = (select auth.uid())
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
        or exists (
          select 1
          from public.user_profiles up
          where up.user_id = (select auth.uid())
            and up.active = true
            and up.oc_cargo_access_level = 'DOCUMENTARIO'
        )
      )
  )
);

drop policy if exists "guide_refrendos_delete_scope" on public.guide_refrendos;
create policy "guide_refrendos_delete_scope"
on public.guide_refrendos for delete
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
);

grant select, insert, delete on public.guide_refrendos to authenticated;

drop policy if exists "guide_documents_select" on storage.objects;
create policy "guide_documents_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'guide-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
    or (select private.current_user_komtrol_role()) = 'COORDINADOR'
    or exists (
      select 1
      from public.user_profiles up
      where up.user_id = (select auth.uid())
        and up.active = true
        and up.oc_cargo_access_level in ('COMERCIAL','DOCUMENTARIO')
    )
  )
);
