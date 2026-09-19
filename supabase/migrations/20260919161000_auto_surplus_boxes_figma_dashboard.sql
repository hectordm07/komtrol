alter table public.incidents
  add column if not exists inbound_box_id uuid references public.inbound_boxes(id) on delete set null;

alter table public.inbound_boxes
  add column if not exists opened_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references auth.users(id);

create index if not exists incidents_inbound_box_idx on public.incidents(inbound_box_id);
create index if not exists inbound_boxes_closed_by_idx on public.inbound_boxes(closed_by);
create unique index if not exists inbound_boxes_one_open_per_shipment_uidx
  on public.inbound_boxes(warehouse,shipment_no)
  where status='ABIERTA' and shipment_no is not null;
create unique index if not exists inbound_box_items_incident_uidx
  on public.inbound_box_items(incident_id)
  where incident_id is not null;

drop trigger if exists trg_surplus_box_item_kardex on public.inbound_box_items;

create or replace function private.next_surplus_box_no(p_warehouse text,p_shipment_no text)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  next_no integer;
  shipment text := upper(trim(coalesce(p_shipment_no,'SIN-EMBARQUE')));
begin
  perform pg_advisory_xact_lock(hashtext(upper(trim(coalesce(p_warehouse,''))) || '|' || shipment));
  select count(*)+1 into next_no
  from public.inbound_boxes
  where warehouse=upper(trim(p_warehouse)) and shipment_no=shipment;
  return shipment || '-' || lpad(next_no::text,4,'0');
end;
$$;
revoke all on function private.next_surplus_box_no(text,text) from public;

create or replace function private.ensure_inbound_surplus_box()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  shipment text;
  target_box public.inbound_boxes%rowtype;
  surplus_qty numeric;
begin
  if new.incident_type<>'SOBRANTE'
     or upper(coalesce(new.warehouse,''))<>'CALLAO'
     or upper(coalesce(new.operation_area,''))<>'INBOUND' then
    return new;
  end if;

  shipment := upper(trim(coalesce(nullif(new.document_no,''),nullif(new.guide_no,''),'SIN-EMBARQUE')));
  surplus_qty := greatest(coalesce(new.qty_received,0)-coalesce(new.qty_expected,0),0);
  if surplus_qty<=0 then return new; end if;

  perform pg_advisory_xact_lock(hashtext('CALLAO|'||shipment));

  select * into target_box
  from public.inbound_boxes
  where warehouse='CALLAO' and shipment_no=shipment and status='ABIERTA'
  order by created_at desc limit 1;

  if target_box.id is null then
    insert into public.inbound_boxes(
      box_no,warehouse,shipment_no,title,status,notes,created_by,opened_at,created_at,updated_at
    ) values(
      private.next_surplus_box_no('CALLAO',shipment),'CALLAO',shipment,
      'Sobrantes Inbound · Embarque '||shipment,'ABIERTA',
      'Caja generada automáticamente desde incidencia de sobrante.',
      new.created_by,now(),now(),now()
    ) returning * into target_box;
  end if;

  insert into public.inbound_box_items(
    box_id,incident_id,material_no,stock_code,description,quantity,unit,location,notes
  ) values(
    target_box.id,new.id,new.material_no,new.stock_code,new.description,
    surplus_qty,'UND',new.location,new.notes
  )
  on conflict (incident_id) where incident_id is not null
  do update set
    box_id=excluded.box_id,
    material_no=excluded.material_no,
    stock_code=excluded.stock_code,
    description=excluded.description,
    quantity=excluded.quantity,
    location=excluded.location,
    notes=excluded.notes;

  if new.inbound_box_id is distinct from target_box.id then
    update public.incidents set inbound_box_id=target_box.id
    where id=new.id and inbound_box_id is distinct from target_box.id;
  end if;
  return new;
end;
$$;
revoke all on function private.ensure_inbound_surplus_box() from public;

drop trigger if exists trg_ensure_inbound_surplus_box on public.incidents;
create trigger trg_ensure_inbound_surplus_box
after insert or update on public.incidents
for each row execute function private.ensure_inbound_surplus_box();

drop policy if exists "surplus_kardex_insert_closed_box" on public.surplus_kardex_movements;
create policy "surplus_kardex_insert_closed_box"
on public.surplus_kardex_movements
for insert to authenticated
with check (
  movement_type='ENTRADA'
  and source_type='CAJA_SOBRANTE_CERRADA'
  and created_by=(select auth.uid())
  and (select private.current_user_komtrol_role()) in ('TRABAJADOR','COORDINADOR','ADMINISTRADOR')
  and (
    (select private.current_user_komtrol_role())='ADMINISTRADOR'
    or warehouse=(select up.warehouse from public.user_profiles up where up.user_id=(select auth.uid()) limit 1)
  )
);

drop policy if exists "surplus_kardex_insert_manual" on public.surplus_kardex_movements;
create policy "surplus_kardex_insert_manual"
on public.surplus_kardex_movements
for insert to authenticated
with check (
  movement_type='ENTRADA'
  and source_type='INGRESO_MANUAL'
  and created_by=(select auth.uid())
  and (select private.current_user_komtrol_role()) in ('TRABAJADOR','COORDINADOR','ADMINISTRADOR')
  and (
    (select private.current_user_komtrol_role())='ADMINISTRADOR'
    or warehouse=(select up.warehouse from public.user_profiles up where up.user_id=(select auth.uid()) limit 1)
  )
);

create or replace function public.open_inbound_surplus_box(
  p_warehouse text,p_shipment_no text,p_title text default null,p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  role_name text;
  user_warehouse text;
  shipment text := upper(trim(coalesce(p_shipment_no,'')));
  new_id uuid;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  if shipment='' then raise exception 'N° de embarque requerido'; end if;
  select role,warehouse into role_name,user_warehouse
  from public.user_profiles where user_id=uid and active=true;
  if role_name not in ('TRABAJADOR','COORDINADOR','ADMINISTRADOR') then
    raise exception 'Perfil sin permiso para abrir cajas';
  end if;
  if role_name<>'ADMINISTRADOR' and upper(coalesce(user_warehouse,''))<>upper(trim(p_warehouse)) then
    raise exception 'No puedes abrir cajas de otro almacén';
  end if;
  if exists(select 1 from public.inbound_boxes
    where warehouse=upper(trim(p_warehouse)) and shipment_no=shipment and status='ABIERTA') then
    raise exception 'Ya existe una caja abierta para el embarque %',shipment;
  end if;
  insert into public.inbound_boxes(
    box_no,warehouse,shipment_no,title,status,notes,created_by,opened_at,created_at,updated_at
  ) values(
    private.next_surplus_box_no(p_warehouse,shipment),upper(trim(p_warehouse)),shipment,
    coalesce(nullif(trim(p_title),''),'Sobrantes Inbound · Embarque '||shipment),
    'ABIERTA',nullif(trim(p_notes),''),uid,now(),now(),now()
  ) returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.open_inbound_surplus_box(text,text,text,text) from public;
revoke all on function public.open_inbound_surplus_box(text,text,text,text) from anon;
grant execute on function public.open_inbound_surplus_box(text,text,text,text) to authenticated;

create or replace function public.close_inbound_surplus_box(p_box_id uuid,p_notes text default null)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  role_name text;
  user_warehouse text;
  b public.inbound_boxes%rowtype;
  inserted_count integer:=0;
  inserted_qty numeric:=0;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  select role,warehouse into role_name,user_warehouse
  from public.user_profiles where user_id=uid and active=true;
  if role_name not in ('TRABAJADOR','COORDINADOR','ADMINISTRADOR') then
    raise exception 'Perfil sin permiso para cerrar cajas';
  end if;
  select * into b from public.inbound_boxes where id=p_box_id for update;
  if b.id is null then raise exception 'Caja no encontrada'; end if;
  if role_name<>'ADMINISTRADOR' and upper(coalesce(user_warehouse,''))<>upper(coalesce(b.warehouse,'')) then
    raise exception 'No puedes cerrar cajas de otro almacén';
  end if;
  if b.status<>'ABIERTA' then raise exception 'La caja % no está abierta',b.box_no; end if;
  if not exists(select 1 from public.inbound_box_items where box_id=b.id and quantity>0) then
    raise exception 'No se puede cerrar una caja vacía';
  end if;

  insert into public.surplus_kardex_movements(
    warehouse,center,storage_type,storage_section,movement_type,source_type,
    reference_no,shipment_no,box_no,box_id,box_item_id,incident_id,
    stock_type,material_no,stock_code,description,location,quantity,unit,notes,created_by,created_at
  )
  select
    b.warehouse,m.center,'SOBRANTES','INBOUND','ENTRADA','CAJA_SOBRANTE_CERRADA',
    b.box_no,b.shipment_no,b.box_no,b.id,i.id,i.incident_id,'SOBRANTE',
    upper(i.material_no),i.stock_code,i.description,i.location,i.quantity,
    coalesce(i.unit,'UND'),coalesce(i.notes,b.notes),uid,now()
  from public.inbound_box_items i
  left join lateral (
    select center from public.materials mat
    where mat.material_no=i.material_no and (mat.warehouse=b.warehouse or mat.warehouse is null)
    order by (mat.warehouse=b.warehouse) desc,mat.updated_at desc limit 1
  ) m on true
  where i.box_id=b.id and i.quantity>0 and i.material_no is not null
    and not exists(
      select 1 from public.surplus_kardex_movements k
      where k.box_item_id=i.id
        and k.source_type in ('CAJA_SOBRANTE_CERRADA','CAJA_SOBRANTE','CAJA_SOBRANTE_HISTORICO')
    );
  get diagnostics inserted_count=row_count;

  select coalesce(sum(i.quantity),0) into inserted_qty
  from public.inbound_box_items i where i.box_id=b.id;

  update public.inbound_boxes
  set status='CERRADA',closed_at=now(),closed_by=uid,
      notes=coalesce(nullif(trim(p_notes),''),notes),updated_at=now()
  where id=b.id;

  return jsonb_build_object(
    'box_id',b.id,'box_no',b.box_no,'shipment_no',b.shipment_no,
    'movements_created',inserted_count,'quantity',inserted_qty
  );
end;
$$;
revoke all on function public.close_inbound_surplus_box(uuid,text) from public;
revoke all on function public.close_inbound_surplus_box(uuid,text) from anon;
grant execute on function public.close_inbound_surplus_box(uuid,text) to authenticated;

drop policy if exists "surplus_kardex_admin_delete_closed_box" on public.surplus_kardex_movements;
create policy "surplus_kardex_admin_delete_closed_box"
on public.surplus_kardex_movements
for delete to authenticated
using (
  source_type='CAJA_SOBRANTE_CERRADA'
  and (select private.current_user_komtrol_role())='ADMINISTRADOR'
);
grant delete on public.surplus_kardex_movements to authenticated;

create or replace function public.reopen_inbound_surplus_box(p_box_id uuid)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  role_name text;
  b public.inbound_boxes%rowtype;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  select role into role_name from public.user_profiles where user_id=uid and active=true;
  if role_name<>'ADMINISTRADOR' then raise exception 'Solo Administrador puede reabrir cajas'; end if;
  select * into b from public.inbound_boxes where id=p_box_id for update;
  if b.id is null then raise exception 'Caja no encontrada'; end if;
  if b.status<>'CERRADA' then raise exception 'Solo se puede reabrir una caja cerrada'; end if;
  delete from public.surplus_kardex_movements
  where box_id=b.id and source_type='CAJA_SOBRANTE_CERRADA';
  update public.inbound_boxes
  set status='ABIERTA',closed_at=null,closed_by=null,updated_at=now()
  where id=b.id;
  return b.id;
end;
$$;
revoke all on function public.reopen_inbound_surplus_box(uuid) from public;
revoke all on function public.reopen_inbound_surplus_box(uuid) from anon;
grant execute on function public.reopen_inbound_surplus_box(uuid) to authenticated;

create or replace function public.register_surplus_manual_entry(
  p_warehouse text,p_center text,p_storage_type text,p_storage_section text,
  p_shipment_no text,p_box_no text,p_material_no text,p_stock_code text,
  p_description text,p_location text,p_quantity numeric,p_unit text default 'UND',
  p_reference_no text default null,p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  role_name text;
  user_warehouse text;
  new_id uuid;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  select role,warehouse into role_name,user_warehouse
  from public.user_profiles where user_id=uid and active=true;
  if role_name not in ('TRABAJADOR','COORDINADOR','ADMINISTRADOR') then
    raise exception 'Perfil sin permiso para agregar sobrantes';
  end if;
  if role_name<>'ADMINISTRADOR' and upper(coalesce(user_warehouse,''))<>upper(trim(p_warehouse)) then
    raise exception 'No puedes agregar sobrantes a otro almacén';
  end if;
  if nullif(trim(p_shipment_no),'') is null then raise exception 'Embarque requerido'; end if;
  if nullif(trim(p_material_no),'') is null then raise exception 'Material requerido'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Cantidad inválida'; end if;

  insert into public.surplus_kardex_movements(
    warehouse,center,storage_type,storage_section,movement_type,source_type,
    reference_no,shipment_no,box_no,stock_type,material_no,stock_code,
    description,location,quantity,unit,notes,created_by,created_at
  ) values(
    upper(trim(p_warehouse)),nullif(upper(trim(p_center)),''),
    nullif(upper(trim(p_storage_type)),''),nullif(upper(trim(p_storage_section)),''),
    'ENTRADA','INGRESO_MANUAL',coalesce(nullif(trim(p_reference_no),''),'INGRESO-MANUAL'),
    upper(trim(p_shipment_no)),nullif(upper(trim(p_box_no)),''),
    'SOBRANTE',upper(trim(p_material_no)),nullif(trim(p_stock_code),''),
    nullif(trim(p_description),''),nullif(upper(trim(p_location)),''),
    p_quantity,coalesce(nullif(upper(trim(p_unit)),''),'UND'),nullif(trim(p_notes),''),uid,now()
  ) returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.register_surplus_manual_entry(
  text,text,text,text,text,text,text,text,text,text,numeric,text,text,text
) from public;
revoke all on function public.register_surplus_manual_entry(
  text,text,text,text,text,text,text,text,text,text,numeric,text,text,text
) from anon;
grant execute on function public.register_surplus_manual_entry(
  text,text,text,text,text,text,text,text,text,text,numeric,text,text,text
) to authenticated;

update public.incidents
set inbound_box_id=inbound_box_id
where warehouse='CALLAO' and operation_area='INBOUND' and incident_type='SOBRANTE';
