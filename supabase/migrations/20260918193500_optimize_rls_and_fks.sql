create index if not exists categories_created_by_idx on public.categories(created_by);
create index if not exists guide_history_changed_by_idx on public.guide_history(changed_by);
create index if not exists kpi_records_created_by_idx on public.kpi_records(created_by);
create index if not exists kpi_targets_created_by_idx on public.kpi_targets(created_by);
create index if not exists material_history_changed_by_idx on public.material_history(changed_by);
create index if not exists materials_updated_by_idx on public.materials(updated_by);
create index if not exists operational_groups_created_by_idx on public.operational_groups(created_by);
create index if not exists periods_closed_by_idx on public.periods(closed_by);
create index if not exists projects_created_by_idx on public.projects(created_by);
create index if not exists task_comments_created_by_idx on public.task_comments(created_by);
create index if not exists warehouses_created_by_idx on public.warehouses(created_by);

drop policy if exists "categories_admin_write" on public.categories;
create policy "categories_admin_insert" on public.categories for insert to authenticated
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "categories_admin_update" on public.categories for update to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "categories_admin_delete" on public.categories for delete to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "kpi_records_admin_write" on public.kpi_records;
create policy "kpi_records_admin_insert" on public.kpi_records for insert to authenticated
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "kpi_records_admin_update" on public.kpi_records for update to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "kpi_records_admin_delete" on public.kpi_records for delete to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "kpi_targets_admin_write" on public.kpi_targets;
create policy "kpi_targets_admin_insert" on public.kpi_targets for insert to authenticated
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "kpi_targets_admin_update" on public.kpi_targets for update to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "kpi_targets_admin_delete" on public.kpi_targets for delete to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "materials_admin_write" on public.materials;
create policy "materials_admin_insert" on public.materials for insert to authenticated
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "materials_admin_update" on public.materials for update to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "materials_admin_delete" on public.materials for delete to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "groups_admin_write" on public.operational_groups;
create policy "groups_admin_insert" on public.operational_groups for insert to authenticated
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "groups_admin_update" on public.operational_groups for update to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "groups_admin_delete" on public.operational_groups for delete to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "periods_admin_write" on public.periods;
create policy "periods_admin_insert" on public.periods for insert to authenticated
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "periods_admin_update" on public.periods for update to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "periods_admin_delete" on public.periods for delete to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "projects_admin_write" on public.projects;
create policy "projects_admin_insert" on public.projects for insert to authenticated
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "projects_admin_update" on public.projects for update to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "projects_admin_delete" on public.projects for delete to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "warehouses_admin_write" on public.warehouses;
create policy "warehouses_admin_insert" on public.warehouses for insert to authenticated
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "warehouses_admin_update" on public.warehouses for update to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
create policy "warehouses_admin_delete" on public.warehouses for delete to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
