create table if not exists public.incident_attachments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  attachment_type text not null default 'OTRO'
    check (attachment_type in ('GUIA','FOTO','REPORTE','OTRO')),
  bucket text not null default 'incident-evidence',
  storage_path text not null,
  file_name text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists incident_attachments_incident_idx
  on public.incident_attachments(incident_id);

alter table public.incident_attachments enable row level security;

create policy "incident_attachments_select_authenticated"
on public.incident_attachments for select
to authenticated
using (true);

create policy "incident_attachments_insert_own"
on public.incident_attachments for insert
to authenticated
with check ((select auth.uid()) = uploaded_by);

create policy "incident_attachments_delete_own"
on public.incident_attachments for delete
to authenticated
using ((select auth.uid()) = uploaded_by);

insert into storage.buckets (id, name, public)
values ('incident-evidence', 'incident-evidence', false)
on conflict (id) do nothing;

create policy "incident_evidence_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'incident-evidence');

create policy "incident_evidence_insert_authenticated"
on storage.objects for insert
to authenticated
with check (bucket_id = 'incident-evidence');

create policy "incident_evidence_update_own"
on storage.objects for update
to authenticated
using (bucket_id = 'incident-evidence' and owner_id = (select auth.uid()::text))
with check (bucket_id = 'incident-evidence' and owner_id = (select auth.uid()::text));

create policy "incident_evidence_delete_own"
on storage.objects for delete
to authenticated
using (bucket_id = 'incident-evidence' and owner_id = (select auth.uid()::text));
