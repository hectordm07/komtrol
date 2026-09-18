create schema if not exists private;

create or replace function private.current_user_komtrol_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select up.role
  from public.user_profiles up
  where up.user_id = auth.uid()
  limit 1
$$;

revoke all on function private.current_user_komtrol_role() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_komtrol_role() to authenticated;

drop policy if exists "profiles_select_own_or_manager" on public.user_profiles;
create policy "profiles_select_own_or_manager"
on public.user_profiles for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (select private.current_user_komtrol_role()) in ('COORDINADOR','ADMINISTRADOR')
);

drop policy if exists "profiles_admin_update" on public.user_profiles;
create policy "profiles_admin_update"
on public.user_profiles for update
to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "incidents_select_authenticated" on public.incidents;
create policy "incidents_select_authenticated"
on public.incidents for select
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('COORDINADOR','ADMINISTRADOR')
);

drop policy if exists "incidents_update_role" on public.incidents;
create policy "incidents_update_role"
on public.incidents for update
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('COORDINADOR','ADMINISTRADOR')
)
with check (
  created_by = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('COORDINADOR','ADMINISTRADOR')
);

drop policy if exists "incidents_delete_admin" on public.incidents;
create policy "incidents_delete_admin"
on public.incidents for delete
to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "email_rules_admin_insert" on public.email_rules;
create policy "email_rules_admin_insert"
on public.email_rules for insert
to authenticated
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "email_rules_admin_update" on public.email_rules;
create policy "email_rules_admin_update"
on public.email_rules for update
to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "email_rules_admin_delete" on public.email_rules;
create policy "email_rules_admin_delete"
on public.email_rules for delete
to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "notifications_select_role" on public.email_notifications;
create policy "notifications_select_role"
on public.email_notifications for select
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('COORDINADOR','ADMINISTRADOR')
);

drop policy if exists "incident_attachments_select_role" on public.incident_attachments;
create policy "incident_attachments_select_role"
on public.incident_attachments for select
to authenticated
using (
  uploaded_by = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('COORDINADOR','ADMINISTRADOR')
);

drop function if exists public.current_user_komtrol_role();
