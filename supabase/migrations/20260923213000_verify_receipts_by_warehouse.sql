-- Any warehouse worker can verify a replenishment registered by a colleague
-- from the same warehouse; other warehouses remain inaccessible.
create policy "replenishment_receipts_select_warehouse_worker"
on public.replenishment_receipts for select to authenticated
using (
  (select private.current_user_komtrol_role()) = 'TRABAJADOR'
  and warehouse is not null
  and warehouse = (select private.current_user_warehouse())
);

create policy "replenishment_lines_select_warehouse_worker"
on public.replenishment_receipt_lines for select to authenticated
using (exists (
  select 1 from public.replenishment_receipts r
  where r.id = receipt_id
    and (select private.current_user_komtrol_role()) = 'TRABAJADOR'
    and r.warehouse is not null
    and r.warehouse = (select private.current_user_warehouse())
));

drop policy "replenishment_lines_verify_scope" on public.replenishment_receipt_lines;
create policy "replenishment_lines_verify_scope"
on public.replenishment_receipt_lines for update to authenticated
using (exists (
  select 1 from public.replenishment_receipts r
  where r.id = receipt_id and (
    r.created_by = (select auth.uid())
    or (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
    or ((select private.current_user_komtrol_role()) in ('COORDINADOR', 'TRABAJADOR')
        and r.warehouse is not null
        and r.warehouse = (select private.current_user_warehouse()))
  )
))
with check (exists (
  select 1 from public.replenishment_receipts r
  where r.id = receipt_id and (
    r.created_by = (select auth.uid())
    or (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
    or ((select private.current_user_komtrol_role()) in ('COORDINADOR', 'TRABAJADOR')
        and r.warehouse is not null
        and r.warehouse = (select private.current_user_warehouse()))
  )
));
