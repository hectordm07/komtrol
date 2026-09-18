drop policy if exists "kpi_records_select_authenticated" on public.kpi_records;
create policy "kpi_records_select_scope"
on public.kpi_records for select
to authenticated
using (
  (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or warehouse = 'GLOBAL'
  or warehouse is not distinct from (select private.current_user_warehouse())
);

drop policy if exists "kpi_targets_select_authenticated" on public.kpi_targets;
create policy "kpi_targets_select_scope"
on public.kpi_targets for select
to authenticated
using (
  (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or warehouse = 'GLOBAL'
  or warehouse is not distinct from (select private.current_user_warehouse())
);
