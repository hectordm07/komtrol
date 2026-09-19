-- WM-inspired Kardex de Sobrantes: stock inicial, dimensiones físicas y transferencias.

alter table public.surplus_kardex_movements
  add column if not exists center text,
  add column if not exists storage_type text,
  add column if not exists storage_section text,
  add column if not exists box_no text,
  add column if not exists stock_type text not null default 'SOBRANTE',
  add column if not exists cut_off_date date,
  add column if not exists initial_batch_id uuid;

create table if not exists public.surplus_kardex_initial_batches (
  id uuid primary key default gen_random_uuid(),
  warehouse text not null,
  file_name text not null,
  cut_off_date date not null,
  total_rows integer not null default 0,
  total_quantity numeric not null default 0,
  status text not null default 'CONFIRMADO'
    check (status in ('CONFIRMADO','ANULADO')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'surplus_kardex_movements_initial_batch_id_fkey'
  ) then
    alter table public.surplus_kardex_movements
      add constraint surplus_kardex_movements_initial_batch_id_fkey
      foreign key (initial_batch_id)
      references public.surplus_kardex_initial_batches(id)
      on delete set null;
  end if;
end $$;

alter table public.surplus_kardex_initial_batches enable row level security;

create unique index if not exists surplus_initial_batch_warehouse_cutoff_uidx
  on public.surplus_kardex_initial_batches(warehouse, cut_off_date)
  where status = 'CONFIRMADO';

create index if not exists surplus_initial_batch_created_by_idx
  on public.surplus_kardex_initial_batches(created_by);

create index if not exists surplus_kardex_dimensions_idx
  on public.surplus_kardex_movements(
    warehouse, material_no, stock_code, location, box_no, shipment_no
  );

create index if not exists surplus_kardex_initial_batch_idx
  on public.surplus_kardex_movements(initial_batch_id);

create index if not exists surplus_kardex_box_id_idx
  on public.surplus_kardex_movements(box_id);

create index if not exists surplus_kardex_incident_id_idx
  on public.surplus_kardex_movements(incident_id);

update public.surplus_kardex_movements m
set box_no = b.box_no
from public.inbound_boxes b
where m.box_id = b.id
  and m.box_no is null;

drop policy if exists "surplus_initial_batches_select_scope"
  on public.surplus_kardex_initial_batches;
create policy "surplus_initial_batches_select_scope"
on public.surplus_kardex_initial_batches
for select
to authenticated
using (
  (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
  or warehouse = (
    select up.warehouse
    from public.user_profiles up
    where up.user_id = (select auth.uid())
    limit 1
  )
);

drop policy if exists "surplus_initial_batches_insert_scope"
  on public.surplus_kardex_initial_batches;
create policy "surplus_initial_batches_insert_scope"
on public.surplus_kardex_initial_batches
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.current_user_komtrol_role()) in ('COORDINADOR','ADMINISTRADOR')
  and (
    (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
    or warehouse = (
      select up.warehouse
      from public.user_profiles up
      where up.user_id = (select auth.uid())
      limit 1
    )
  )
);

grant select, insert on public.surplus_kardex_initial_batches to authenticated;

drop policy if exists "surplus_kardex_insert_initial"
  on public.surplus_kardex_movements;
create policy "surplus_kardex_insert_initial"
on public.surplus_kardex_movements
for insert
to authenticated
with check (
  movement_type = 'ENTRADA'
  and source_type = 'SALDO_INICIAL'
  and created_by = (select auth.uid())
  and (select private.current_user_komtrol_role()) in ('COORDINADOR','ADMINISTRADOR')
  and (
    (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
    or warehouse = (
      select up.warehouse
      from public.user_profiles up
      where up.user_id = (select auth.uid())
      limit 1
    )
  )
);

drop policy if exists "surplus_kardex_insert_transfer"
  on public.surplus_kardex_movements;
create policy "surplus_kardex_insert_transfer"
on public.surplus_kardex_movements
for insert
to authenticated
with check (
  source_type in ('TRANSFERENCIA_OUT','TRANSFERENCIA_IN')
  and created_by = (select auth.uid())
  and (select private.current_user_komtrol_role()) in ('TRABAJADOR','COORDINADOR','ADMINISTRADOR')
  and (
    (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
    or warehouse = (
      select up.warehouse
      from public.user_profiles up
      where up.user_id = (select auth.uid())
      limit 1
    )
  )
);

grant insert on public.surplus_kardex_movements to authenticated;

create or replace function public.import_surplus_initial_stock(
  p_warehouse text,
  p_file_name text,
  p_cut_off_date date,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  batch_id uuid;
  inserted_rows integer;
  total_qty numeric;
begin
  if uid is null then
    raise exception 'Usuario no autenticado';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No hay filas válidas para importar';
  end if;

  insert into public.surplus_kardex_initial_batches(
    warehouse, file_name, cut_off_date, total_rows, total_quantity, created_by
  )
  values (
    upper(trim(p_warehouse)),
    p_file_name,
    p_cut_off_date,
    jsonb_array_length(p_rows),
    0,
    uid
  )
  returning id into batch_id;

  insert into public.surplus_kardex_movements(
    warehouse,
    center,
    storage_type,
    storage_section,
    location,
    box_no,
    shipment_no,
    stock_type,
    movement_type,
    source_type,
    reference_no,
    material_no,
    stock_code,
    description,
    quantity,
    unit,
    notes,
    cut_off_date,
    initial_batch_id,
    created_by,
    created_at
  )
  select
    upper(trim(p_warehouse)),
    nullif(upper(trim(x.center)), ''),
    nullif(upper(trim(x.storage_type)), ''),
    nullif(upper(trim(x.storage_section)), ''),
    nullif(upper(trim(x.location)), ''),
    nullif(upper(trim(x.box_no)), ''),
    nullif(upper(trim(x.shipment_no)), ''),
    coalesce(nullif(upper(trim(x.stock_type)), ''), 'SOBRANTE'),
    'ENTRADA',
    'SALDO_INICIAL',
    'CARGA-INICIAL',
    upper(trim(x.material_no)),
    nullif(trim(x.stock_code), ''),
    nullif(trim(x.description), ''),
    x.quantity,
    coalesce(nullif(upper(trim(x.unit)), ''), 'UND'),
    nullif(trim(x.notes), ''),
    p_cut_off_date,
    batch_id,
    uid,
    (p_cut_off_date::timestamp + interval '12 hours') at time zone 'America/Lima'
  from jsonb_to_recordset(p_rows) as x(
    center text,
    storage_type text,
    storage_section text,
    location text,
    box_no text,
    shipment_no text,
    stock_type text,
    material_no text,
    stock_code text,
    description text,
    quantity numeric,
    unit text,
    notes text
  )
  where x.quantity > 0
    and nullif(trim(x.material_no), '') is not null;

  get diagnostics inserted_rows = row_count;

  select coalesce(sum(quantity),0)
  into total_qty
  from public.surplus_kardex_movements
  where initial_batch_id = batch_id;

  update public.surplus_kardex_initial_batches
  set total_rows = inserted_rows,
      total_quantity = total_qty
  where id = batch_id;

  return jsonb_build_object(
    'batch_id', batch_id,
    'rows', inserted_rows,
    'quantity', total_qty,
    'warehouse', upper(trim(p_warehouse)),
    'cut_off_date', p_cut_off_date
  );
end;
$$;

revoke all on function public.import_surplus_initial_stock(text,text,date,jsonb) from public;
revoke all on function public.import_surplus_initial_stock(text,text,date,jsonb) from anon;
grant execute on function public.import_surplus_initial_stock(text,text,date,jsonb) to authenticated;

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

  insert into public.surplus_kardex_movements(
    warehouse, center, movement_type, source_type, reference_no,
    shipment_no, box_no, stock_type, material_no, stock_code, description,
    location, quantity, unit, notes, created_by
  )
  values (
    upper(trim(p_warehouse)), nullif(upper(trim(p_center)),''),
    'SALIDA','RETIRO',
    coalesce(nullif(trim(p_reference_no),''),'RETIRO'),
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

revoke all on function public.register_surplus_withdrawal_v2(
  text,text,text,text,text,text,text,text,text,numeric,text,text,text
) from public;
revoke all on function public.register_surplus_withdrawal_v2(
  text,text,text,text,text,text,text,text,text,numeric,text,text,text
) from anon;
grant execute on function public.register_surplus_withdrawal_v2(
  text,text,text,text,text,text,text,text,text,numeric,text,text,text
) to authenticated;

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

  ref := coalesce(nullif(trim(p_reference_no),''),
    'TRF-' || to_char(clock_timestamp() at time zone 'America/Lima','YYYYMMDD-HH24MISS'));

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

revoke all on function public.register_surplus_transfer(
  text,text,text,text,text,text,text,text,text,text,numeric,text,text,text
) from public;
revoke all on function public.register_surplus_transfer(
  text,text,text,text,text,text,text,text,text,text,numeric,text,text,text
) from anon;
grant execute on function public.register_surplus_transfer(
  text,text,text,text,text,text,text,text,text,text,numeric,text,text,text
) to authenticated;

alter function public.register_surplus_withdrawal(text,text,text,text,text,numeric,text,text,text)
  security invoker;
revoke execute on function public.register_surplus_withdrawal(text,text,text,text,text,numeric,text,text,text) from anon;
revoke execute on function public.register_surplus_withdrawal(text,text,text,text,text,numeric,text,text,text) from public;
grant execute on function public.register_surplus_withdrawal(text,text,text,text,text,numeric,text,text,text) to authenticated;

drop policy if exists "surplus_kardex_insert_withdrawal" on public.surplus_kardex_movements;
create policy "surplus_kardex_insert_withdrawal"
on public.surplus_kardex_movements
for insert
to authenticated
with check (
  movement_type = 'SALIDA'
  and source_type = 'RETIRO'
  and created_by = (select auth.uid())
  and (select private.current_user_komtrol_role()) in ('TRABAJADOR','COORDINADOR','ADMINISTRADOR')
  and (
    (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
    or warehouse = (
      select up.warehouse from public.user_profiles up
      where up.user_id = (select auth.uid()) limit 1
    )
  )
);

create or replace function private.track_surplus_box_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.inbound_boxes%rowtype;
  delta numeric;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.quantity,0) <= 0 or new.material_no is null then return new; end if;
    select * into b from public.inbound_boxes where id = new.box_id;
    insert into public.surplus_kardex_movements(
      warehouse,movement_type,source_type,reference_no,shipment_no,box_no,box_id,box_item_id,incident_id,
      material_no,stock_code,description,location,quantity,unit,notes,created_by
    ) values (
      b.warehouse,'ENTRADA','CAJA_SOBRANTE',b.box_no,b.shipment_no,b.box_no,b.id,new.id,new.incident_id,
      new.material_no,new.stock_code,new.description,new.location,new.quantity,coalesce(new.unit,'UND'),new.notes,b.created_by
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and new.quantity is distinct from old.quantity then
    select * into b from public.inbound_boxes where id = new.box_id;
    delta := coalesce(new.quantity,0) - coalesce(old.quantity,0);
    if delta <> 0 and new.material_no is not null then
      insert into public.surplus_kardex_movements(
        warehouse,movement_type,source_type,reference_no,shipment_no,box_no,box_id,box_item_id,incident_id,
        material_no,stock_code,description,location,quantity,unit,notes,created_by
      ) values (
        b.warehouse,case when delta > 0 then 'ENTRADA' else 'SALIDA' end,'AJUSTE_CAJA',b.box_no,b.shipment_no,b.box_no,
        b.id,new.id,new.incident_id,new.material_no,new.stock_code,new.description,new.location,abs(delta),
        coalesce(new.unit,'UND'),'Ajuste automático por cambio de cantidad de caja',coalesce(b.created_by,(select auth.uid()))
      );
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if coalesce(old.quantity,0) <= 0 or old.material_no is null then return old; end if;
    select * into b from public.inbound_boxes where id = old.box_id;
    insert into public.surplus_kardex_movements(
      warehouse,movement_type,source_type,reference_no,shipment_no,box_no,box_id,box_item_id,incident_id,
      material_no,stock_code,description,location,quantity,unit,notes,created_by
    ) values (
      coalesce(b.warehouse,'CALLAO'),'SALIDA','ANULACION_CAJA',coalesce(b.box_no,'CAJA ELIMINADA'),
      b.shipment_no,b.box_no,b.id,old.id,old.incident_id,old.material_no,old.stock_code,old.description,
      old.location,old.quantity,coalesce(old.unit,'UND'),'Reversión automática por eliminación de ítem de caja',
      coalesce(b.created_by,(select auth.uid()))
    );
    return old;
  end if;

  return coalesce(new,old);
end;
$$;

revoke all on function private.track_surplus_box_item() from public;
