drop policy if exists "audit_admin_insert" on public.audit_log;
create policy "audit_admin_insert"
on public.audit_log for insert
to authenticated
with check (
  (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
  and actor_user_id = (select auth.uid())
);
