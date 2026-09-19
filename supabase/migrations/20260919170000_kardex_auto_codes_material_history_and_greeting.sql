-- Automatic Kardex movement codes + material history.

create sequence if not exists private.surplus_movement_code_seq;

create or replace function private.next_surplus_movement_code(p_prefix text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
  prefix text;
begin
  prefix := regexp_replace(upper(coalesce(p_prefix,'MOV')), '[^A-Z0-9]+', '', 'g');
  if prefix = '' then prefix := 'MOV'; end if;
  n := nextval('private.surplus_movement_code_seq'::regclass);
  return prefix
    || '-' || to_char(clock_timestamp() at time zone 'America/Lima','YYYYMMDD')
    || '-' || lpad(n::text, 6, '0');
end;
$$;

revoke all on function private.next_surplus_movement_code(text) from public;
revoke all on function private.next_surplus_movement_code(text) from anon;
grant execute on function private.next_surplus_movement_code(text) to authenticated;

create index if not exists surplus_kardex_history_idx
  on public.surplus_kardex_movements(warehouse, material_no, created_at desc);

create or replace function public.register_surplus_withdrawal_v2(
  p_warehouse text,
  p_center text,
  p_material_no text,
  p_stock_code text,
  p_description text,
  p_location text,
  p_box_no text,
  p_shipment_no text,
  p_stock_type text,
  p_quantity numeric,
  p_unit text default 'UND',
  p_reference_no text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  available numeric;
  new_id uuid;
  ref text;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  if coalesce(p_quantity,0) <= 0 then raise exception 'Cantidad de salida inválida'; end if;

  select coalesce(sum(case when movement_type='ENTRADA' then quantity else -quantity end),0)
  into available
  from public.surplus_kardex_movements
  where warehouse = upper(trim(p_warehouse))
    and material_no = upper(trim(p_material_no))
    and stock_code is not distinct from nullif(trim(p_stock_code),'')
    and location is not distinct from nullif(upper(trim(p_location)),'')
    and box_no is not distinct from nullif(upper(trim(p_box_no)),'')
    and shipment_no is not distinct from nullif(upper(trim(p_shipment_no)),'')
    and stock_type = coalesce(nullif(upper(trim(p_stock_type)),''),'SOBRANTE');

  if available < p_quantity then
    raise exception 'Stock de sobrante insuficiente. Disponible: %', available;
  end if;

  ref := private.next_surplus_movement_code('RET');

  insert into public.surplus_kardex_movements(
    warehouse, center, movement_type, source_type, reference_no,
    shipment_no, box_no, stock_type, material_no, stock_code, description,
    location, quantity, unit, notes, created_by
  )
  values (
    upper(trim(p_warehouse)), nullif(upper(trim(p_center)),''),
    'SALIDA','RETIRO',ref,
    nullif(upper(trim(p_shipment_no)),''),
    nullif(upper(trim(p_box_no)),''),
    coalesce(nullif(upper(trim(p_stock_type)),''),'SOBRANTE'),
    upper(trim(p_material_no)), nullif(trim(p_stock_code),''),
    nullif(trim(p_description),''),
    nullif(upper(trim(p_location)),''),
    p_quantity, coalesce(nullif(upper(trim(p_unit)),''),'UND'),
    nullif(trim(p_notes),''),
    uid
  )
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.register_surplus_transfer(
  p_warehouse text,
  p_center text,
  p_material_no text,
  p_stock_code text,
  p_description text,
  p_origin_location text,
  p_destination_location text,
  p_box_no text,
  p_shipment_no text,
  p_stock_type text,
  p_quantity numeric,
  p_unit text default 'UND',
  p_reference_no text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  available numeric;
  out_id uuid;
  in_id uuid;
  ref text;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  if coalesce(p_quantity,0) <= 0 then raise exception 'Cantidad de transferencia inválida'; end if;
  if nullif(upper(trim(p_destination_location)),'') is null then
    raise exception 'Ubicación destino requerida';
  end if;
  if upper(trim(coalesce(p_origin_location,''))) = upper(trim(coalesce(p_destination_location,''))) then
    raise exception 'Origen y destino no pueden ser iguales';
  end if;

  select coalesce(sum(case when movement_type='ENTRADA' then quantity else -quantity end),0)
  into available
  from public.surplus_kardex_movements
  where warehouse = upper(trim(p_warehouse))
    and material_no = upper(trim(p_material_no))
    and stock_code is not distinct from nullif(trim(p_stock_code),'')
    and location is not distinct from nullif(upper(trim(p_origin_location)),'')
    and box_no is not distinct from nullif(upper(trim(p_box_no)),'')
    and shipment_no is not distinct from nullif(upper(trim(p_shipment_no)),'')
    and stock_type = coalesce(nullif(upper(trim(p_stock_type)),''),'SOBRANTE');

  if available < p_quantity then
    raise exception 'Stock insuficiente para transferir. Disponible: %', available;
  end if;

  ref := private.next_surplus_movement_code('TRF');

  insert into public.surplus_kardex_movements(
    warehouse, center, movement_type, source_type, reference_no,
    shipment_no, box_no, stock_type, material_no, stock_code, description,
    location, quantity, unit, notes, created_by
  )
  values (
    upper(trim(p_warehouse)), nullif(upper(trim(p_center)),''),
    'SALIDA','TRANSFERENCIA_OUT',ref,
    nullif(upper(trim(p_shipment_no)),''),
    nullif(upper(trim(p_box_no)),''),
    coalesce(nullif(upper(trim(p_stock_type)),''),'SOBRANTE'),
    upper(trim(p_material_no)), nullif(trim(p_stock_code),''),
    nullif(trim(p_description),''),
    nullif(upper(trim(p_origin_location)),''),
    p_quantity, coalesce(nullif(upper(trim(p_unit)),''),'UND'),
    nullif(trim(p_notes),''),
    uid
  ) returning id into out_id;

  insert into public.surplus_kardex_movements(
    warehouse, center, movement_type, source_type, reference_no,
    shipment_no, box_no, stock_type, material_no, stock_code, description,
    location, quantity, unit, notes, created_by
  )
  values (
    upper(trim(p_warehouse)), nullif(upper(trim(p_center)),''),
    'ENTRADA','TRANSFERENCIA_IN',ref,
    nullif(upper(trim(p_shipment_no)),''),
    nullif(upper(trim(p_box_no)),''),
    coalesce(nullif(upper(trim(p_stock_type)),''),'SOBRANTE'),
    upper(trim(p_material_no)), nullif(trim(p_stock_code),''),
    nullif(trim(p_description),''),
    upper(trim(p_destination_location)),
    p_quantity, coalesce(nullif(upper(trim(p_unit)),''),'UND'),
    nullif(trim(p_notes),''),
    uid
  ) returning id into in_id;

  return jsonb_build_object(
    'reference', ref,
    'out_id', out_id,
    'in_id', in_id,
    'quantity', p_quantity
  );
end;
$$;

create or replace function public.register_surplus_manual_entry(
  p_warehouse text,
  p_center text,
  p_storage_type text,
  p_storage_section text,
  p_shipment_no text,
  p_box_no text,
  p_material_no text,
  p_stock_code text,
  p_description text,
  p_location text,
  p_quantity numeric,
  p_unit text default 'UND',
  p_reference_no text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  role_name text;
  user_warehouse text;
  new_id uuid;
  ref text;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;

  select role,warehouse into role_name,user_warehouse
  from public.user_profiles where user_id=uid and active=true;

  if role_name not in ('TRABAJADOR','COORDINADOR','ADMINISTRADOR') then
    raise exception 'Perfil sin permiso para agregar sobrantes';
  end if;
  if role_name <> 'ADMINISTRADOR'
     and upper(coalesce(user_warehouse,'')) <> upper(trim(p_warehouse)) then
    raise exception 'No puedes agregar sobrantes a otro almacén';
  end if;
  if nullif(trim(p_shipment_no),'') is null then raise exception 'Embarque requerido'; end if;
  if nullif(trim(p_material_no),'') is null then raise exception 'Material requerido'; end if;
  if coalesce(p_quantity,0) <= 0 then raise exception 'Cantidad inválida'; end if;

  ref := private.next_surplus_movement_code('ING');

  insert into public.surplus_kardex_movements(
    warehouse,center,storage_type,storage_section,movement_type,source_type,
    reference_no,shipment_no,box_no,stock_type,material_no,stock_code,
    description,location,quantity,unit,notes,created_by,created_at
  )
  values(
    upper(trim(p_warehouse)),
    nullif(upper(trim(p_center)),''),
    nullif(upper(trim(p_storage_type)),''),
    nullif(upper(trim(p_storage_section)),''),
    'ENTRADA','INGRESO_MANUAL',ref,
    upper(trim(p_shipment_no)),
    nullif(upper(trim(p_box_no)),''),
    'SOBRANTE',
    upper(trim(p_material_no)),
    nullif(trim(p_stock_code),''),
    nullif(trim(p_description),''),
    nullif(upper(trim(p_location)),''),
    p_quantity,
    coalesce(nullif(upper(trim(p_unit)),''),'UND'),
    nullif(trim(p_notes),''),
    uid,now()
  )
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.get_surplus_material_history(
  p_material_no text,
  p_warehouse text
)
returns table(
  movement_id uuid,
  warehouse text,
  center text,
  movement_type text,
  source_type text,
  reference_no text,
  shipment_no text,
  box_no text,
  material_no text,
  stock_code text,
  description text,
  location text,
  quantity numeric,
  unit text,
  notes text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  role_name text;
  user_warehouse text;
  requested_warehouse text := upper(trim(coalesce(p_warehouse,'')));
  requested_material text := upper(trim(coalesce(p_material_no,'')));
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  if requested_material = '' then raise exception 'Material requerido'; end if;
  if requested_warehouse = '' then raise exception 'Almacén requerido'; end if;

  select up.role, up.warehouse
  into role_name, user_warehouse
  from public.user_profiles up
  where up.user_id=uid and up.active=true
  limit 1;

  if role_name is null then raise exception 'Perfil operativo no configurado'; end if;
  if role_name <> 'ADMINISTRADOR'
     and requested_warehouse <> upper(coalesce(user_warehouse,'')) then
    raise exception 'No tienes acceso al historial de este almacén';
  end if;

  return query
  select
    m.id,
    m.warehouse,
    m.center,
    m.movement_type,
    m.source_type,
    m.reference_no,
    m.shipment_no,
    m.box_no,
    m.material_no,
    m.stock_code,
    m.description,
    m.location,
    m.quantity,
    m.unit,
    m.notes,
    m.created_by,
    coalesce(up.full_name,'Usuario KOMTROL') as created_by_name,
    m.created_at
  from public.surplus_kardex_movements m
  left join public.user_profiles up on up.user_id=m.created_by
  where m.warehouse=requested_warehouse
    and m.material_no=requested_material
  order by m.created_at desc, m.id desc;
end;
$$;

revoke all on function public.get_surplus_material_history(text,text) from public;
revoke all on function public.get_surplus_material_history(text,text) from anon;
grant execute on function public.get_surplus_material_history(text,text) to authenticated;
