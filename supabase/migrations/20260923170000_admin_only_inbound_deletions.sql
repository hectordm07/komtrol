-- The database enforces the same permissions as the Inbound interface.
drop policy if exists "incidents_delete_scope" on public.incidents;
create policy "incidents_delete_scope" on public.incidents
  for delete to authenticated
  using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "inbound_boxes_delete_scope" on public.inbound_boxes;
create policy "inbound_boxes_delete_scope" on public.inbound_boxes
  for delete to authenticated
  using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "inbound_box_items_delete_scope" on public.inbound_box_items;
create policy "inbound_box_items_delete_scope" on public.inbound_box_items
  for delete to authenticated
  using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "surplus_kardex_admin_delete_closed_box" on public.surplus_kardex_movements;
create policy "surplus_kardex_admin_delete" on public.surplus_kardex_movements
  for delete to authenticated
  using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

-- Deleting a box also removes its stock entries, in the same transaction.
create or replace function public.admin_delete_inbound_box(p_box_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (select private.current_user_komtrol_role()) is distinct from 'ADMINISTRADOR' then
    raise exception 'Solo el Administrador puede eliminar cajas';
  end if;
  if not exists (select 1 from public.inbound_boxes where id = p_box_id for update) then
    raise exception 'Caja no encontrada';
  end if;
  delete from public.surplus_kardex_movements where box_id = p_box_id;
  delete from public.inbound_boxes where id = p_box_id;
end;
$$;
revoke all on function public.admin_delete_inbound_box(uuid) from public, anon;
grant execute on function public.admin_delete_inbound_box(uuid) to authenticated;

-- Transfers are paired entries; remove both sides or neither. Keep initial-load
-- batch totals in sync with the actual remaining stock entries.
create or replace function public.admin_delete_kardex_movement(p_movement_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.surplus_kardex_movements%rowtype;
  partner_id uuid;
  partner_count integer;
begin
  if auth.uid() is null or (select private.current_user_komtrol_role()) is distinct from 'ADMINISTRADOR' then
    raise exception 'Solo el Administrador puede eliminar movimientos del Kardex';
  end if;
  select * into target from public.surplus_kardex_movements
    where id = p_movement_id for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;

  if target.source_type in ('TRANSFERENCIA_OUT', 'TRANSFERENCIA_IN') then
    select count(*), min(id::text)::uuid into partner_count, partner_id
    from public.surplus_kardex_movements
    where id <> target.id
      and source_type = case target.source_type when 'TRANSFERENCIA_IN' then 'TRANSFERENCIA_OUT' else 'TRANSFERENCIA_IN' end
      and warehouse = target.warehouse and material_no = target.material_no
      and stock_code is not distinct from target.stock_code
      and box_no is not distinct from target.box_no
      and shipment_no is not distinct from target.shipment_no
      and reference_no is not distinct from target.reference_no
      and quantity = target.quantity and created_by = target.created_by
      and abs(extract(epoch from created_at - target.created_at)) < 10;
    if partner_count <> 1 then
      raise exception 'No se pudo identificar un par único para la transferencia';
    end if;
    delete from public.surplus_kardex_movements where id in (target.id, partner_id);
  else
    delete from public.surplus_kardex_movements where id = target.id;
  end if;

  if target.initial_batch_id is not null then
    update public.surplus_kardex_initial_batches b
    set total_rows = (select count(*) from public.surplus_kardex_movements where initial_batch_id = b.id),
        total_quantity = (select coalesce(sum(quantity), 0) from public.surplus_kardex_movements where initial_batch_id = b.id)
    where b.id = target.initial_batch_id;
  end if;
end;
$$;
revoke all on function public.admin_delete_kardex_movement(uuid) from public, anon;
grant execute on function public.admin_delete_kardex_movement(uuid) to authenticated;
