alter table public.legacy_migration_attachments
  enable row level security;

drop policy if exists "legacy_attachments_select_scope"
  on public.legacy_migration_attachments;

create policy "legacy_attachments_select_scope"
on public.legacy_migration_attachments
for select
to authenticated
using (
  (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
  or exists (
    select 1
    from public.tasks t
    where t.id = legacy_migration_attachments.migrated_task_id
  )
  or exists (
    select 1
    from public.task_comments c
    join public.tasks t on t.id = c.task_id
    where c.id = legacy_migration_attachments.migrated_comment_id
  )
);

drop policy if exists "legacy_attachments_insert_admin"
  on public.legacy_migration_attachments;

create policy "legacy_attachments_insert_admin"
on public.legacy_migration_attachments
for insert
to authenticated
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "legacy_attachments_update_admin"
  on public.legacy_migration_attachments;

create policy "legacy_attachments_update_admin"
on public.legacy_migration_attachments
for update
to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "legacy_attachments_delete_admin"
  on public.legacy_migration_attachments;

create policy "legacy_attachments_delete_admin"
on public.legacy_migration_attachments
for delete
to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

grant select, insert, update, delete
on public.legacy_migration_attachments
to authenticated;
