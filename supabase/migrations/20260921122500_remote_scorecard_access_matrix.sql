create or replace function private.warehouse_remote_group(target_warehouse text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select w.remote_group
      from public.warehouses w
      where upper(w.name)=upper(target_warehouse)
         or upper(w.code)=upper(target_warehouse)
      order by w.active desc
      limit 1
    ),
    (
      select w.remote_group
      from public.warehouse_centers c
      join public.warehouses w on w.code=c.warehouse_code
      where upper(c.name)=upper(target_warehouse)
         or upper(c.code)=upper(target_warehouse)
      order by c.active desc,w.active desc
      limit 1
    )
  )
$$;

create or replace function private.can_view_remote_scorecard_warehouse(target_warehouse text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_own_warehouse text;
  v_own_group text;
  v_target_group text;
begin
  if v_uid is null then return false; end if;

  select role,warehouse
  into v_role,v_own_warehouse
  from public.user_profiles
  where user_id=v_uid and active=true;

  if v_role='ADMINISTRADOR' then
    return true;
  end if;

  v_own_group := private.warehouse_remote_group(v_own_warehouse);
  v_target_group := private.warehouse_remote_group(target_warehouse);

  return v_own_group in ('PROYECTO_MINERO','SUCURSAL')
     and v_target_group in ('PROYECTO_MINERO','SUCURSAL');
end;
$$;

revoke all on function private.warehouse_remote_group(text) from public;
revoke all on function private.can_view_remote_scorecard_warehouse(text) from public;
grant execute on function private.warehouse_remote_group(text) to authenticated;
grant execute on function private.can_view_remote_scorecard_warehouse(text) to authenticated;

drop policy if exists "scorecard_rows_select_scope" on public.scorecard_rows;
create policy "scorecard_rows_select_scope"
on public.scorecard_rows for select
to authenticated
using (
  (select private.current_user_komtrol_role())='ADMINISTRADOR'
  or private.can_view_remote_scorecard_warehouse(warehouse)
);

drop policy if exists "scorecard_imports_select_scope" on public.scorecard_imports;
create policy "scorecard_imports_select_scope"
on public.scorecard_imports for select
to authenticated
using (
  (select private.current_user_komtrol_role())='ADMINISTRADOR'
  or (
    warehouse is not null
    and private.can_view_remote_scorecard_warehouse(warehouse)
  )
  or uploaded_by=(select auth.uid())
);
