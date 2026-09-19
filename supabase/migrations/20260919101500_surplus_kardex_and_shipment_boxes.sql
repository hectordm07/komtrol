alter table public.inbound_boxes
  add column if not exists shipment_no text;

create index if not exists inbound_boxes_shipment_no_idx
  on public.inbound_boxes(warehouse, shipment_no);

create table if not exists public.surplus_kardex_movements (
  id uuid primary key default gen_random_uuid(),
  warehouse text not null,
  movement_type text not null check (movement_type in ('ENTRADA','SALIDA')),
  source_type text not null default 'MANUAL',
  reference_no text,
  shipment_no text,
  box_id uuid references public.inbound_boxes(id) on delete set null,
  box_item_id uuid references public.inbound_box_items(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  material_no text not null,
  stock_code text,
  description text,
  location text,
  quantity numeric not null check (quantity > 0),
  unit text not null default 'UND',
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.surplus_kardex_movements enable row level security;

create index if not exists surplus_kardex_warehouse_idx
  on public.surplus_kardex_movements(warehouse, created_at desc);
create index if not exists surplus_kardex_material_idx
  on public.surplus_kardex_movements(warehouse, material_no, location);
create index if not exists surplus_kardex_created_by_idx
  on public.surplus_kardex_movements(created_by);
create index if not exists surplus_kardex_box_item_idx
  on public.surplus_kardex_movements(box_item_id);

drop policy if exists "surplus_kardex_select_scope" on public.surplus_kardex_movements;
create policy "surplus_kardex_select_scope"
on public.surplus_kardex_movements
for select
to authenticated
using (
  (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
  or warehouse = (
    select up.warehouse from public.user_profiles up
    where up.user_id = (select auth.uid()) limit 1
  )
);

grant select on public.surplus_kardex_movements to authenticated;

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
      warehouse,movement_type,source_type,reference_no,shipment_no,box_id,box_item_id,incident_id,
      material_no,stock_code,description,location,quantity,unit,notes,created_by
    ) values (
      b.warehouse,'ENTRADA','CAJA_SOBRANTE',b.box_no,b.shipment_no,b.id,new.id,new.incident_id,
      new.material_no,new.stock_code,new.description,new.location,new.quantity,coalesce(new.unit,'UND'),new.notes,b.created_by
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and new.quantity is distinct from old.quantity then
    select * into b from public.inbound_boxes where id = new.box_id;
    delta := coalesce(new.quantity,0) - coalesce(old.quantity,0);
    if delta <> 0 and new.material_no is not null then
      insert into public.surplus_kardex_movements(
        warehouse,movement_type,source_type,reference_no,shipment_no,box_id,box_item_id,incident_id,
        material_no,stock_code,description,location,quantity,unit,notes,created_by
      ) values (
        b.warehouse,case when delta > 0 then 'ENTRADA' else 'SALIDA' end,'AJUSTE_CAJA',b.box_no,b.shipment_no,
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
      warehouse,movement_type,source_type,reference_no,shipment_no,box_id,box_item_id,incident_id,
      material_no,stock_code,description,location,quantity,unit,notes,created_by
    ) values (
      coalesce(b.warehouse,'CALLAO'),'SALIDA','ANULACION_CAJA',coalesce(b.box_no,'CAJA ELIMINADA'),b.shipment_no,
      b.id,old.id,old.incident_id,old.material_no,old.stock_code,old.description,old.location,old.quantity,
      coalesce(old.unit,'UND'),'Reversión automática por eliminación de ítem de caja',coalesce(b.created_by,(select auth.uid()))
    );
    return old;
  end if;
  return coalesce(new,old);
end;
$$;

revoke all on function private.track_surplus_box_item() from public;

drop trigger if exists trg_surplus_box_item_kardex on public.inbound_box_items;
create trigger trg_surplus_box_item_kardex
after insert or update of quantity or delete on public.inbound_box_items
for each row execute function private.track_surplus_box_item();

create or replace function public.register_surplus_withdrawal(
  p_warehouse text,p_material_no text,p_stock_code text,p_description text,p_location text,
  p_quantity numeric,p_unit text default 'UND',p_reference_no text default null,p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  role_name text;
  user_warehouse text;
  available numeric;
  new_id uuid;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  select role, warehouse into role_name, user_warehouse
  from public.user_profiles where user_id = uid and active = true;

  if role_name not in ('TRABAJADOR','COORDINADOR','ADMINISTRADOR') then
    raise exception 'Perfil sin permiso para registrar salidas';
  end if;
  if role_name <> 'ADMINISTRADOR' and coalesce(user_warehouse,'') <> coalesce(p_warehouse,'') then
    raise exception 'No puedes retirar sobrantes de otro almacén';
  end if;
  if coalesce(p_quantity,0) <= 0 then raise exception 'Cantidad de salida inválida'; end if;

  select coalesce(sum(case when movement_type='ENTRADA' then quantity else -quantity end),0)
  into available
  from public.surplus_kardex_movements
  where warehouse=p_warehouse and material_no=p_material_no
    and stock_code is not distinct from nullif(p_stock_code,'')
    and location is not distinct from nullif(p_location,'');

  if available < p_quantity then
    raise exception 'Stock de sobrante insuficiente. Disponible: %', available;
  end if;

  insert into public.surplus_kardex_movements(
    warehouse,movement_type,source_type,reference_no,material_no,stock_code,description,location,
    quantity,unit,notes,created_by
  ) values (
    p_warehouse,'SALIDA','RETIRO',coalesce(nullif(p_reference_no,''),'RETIRO'),p_material_no,
    nullif(p_stock_code,''),nullif(p_description,''),nullif(p_location,''),p_quantity,
    coalesce(nullif(p_unit,''),'UND'),nullif(p_notes,''),uid
  ) returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.register_surplus_withdrawal(text,text,text,text,text,numeric,text,text,text) from public;
grant execute on function public.register_surplus_withdrawal(text,text,text,text,text,numeric,text,text,text) to authenticated;

insert into public.surplus_kardex_movements(
  warehouse,movement_type,source_type,reference_no,shipment_no,box_id,box_item_id,incident_id,
  material_no,stock_code,description,location,quantity,unit,notes,created_by,created_at
)
select b.warehouse,'ENTRADA','CAJA_SOBRANTE_HISTORICO',b.box_no,b.shipment_no,b.id,i.id,i.incident_id,
  i.material_no,i.stock_code,i.description,i.location,i.quantity,coalesce(i.unit,'UND'),i.notes,b.created_by,i.created_at
from public.inbound_box_items i
join public.inbound_boxes b on b.id=i.box_id
where i.quantity > 0 and i.material_no is not null
  and not exists (select 1 from public.surplus_kardex_movements m where m.box_item_id=i.id);
