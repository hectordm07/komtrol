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

  return v_own_group in ('PROYECTO_MINERO','SUCURSAL','TIENDA')
     and v_target_group in ('PROYECTO_MINERO','SUCURSAL','TIENDA');
end;
$$;

revoke all on function private.can_view_remote_scorecard_warehouse(text) from public;
grant execute on function private.can_view_remote_scorecard_warehouse(text) to authenticated;
