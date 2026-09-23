-- A receipt line retains the physical count and its linked incident.
alter table public.replenishment_receipt_lines
  add column if not exists quantity_received numeric(14,3) check (quantity_received >= 0),
  add column if not exists delivery_date date,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id),
  add column if not exists verification_incident_id uuid references public.incidents(id) on delete set null;

create index if not exists replenishment_lines_verification_incident_idx
  on public.replenishment_receipt_lines(verification_incident_id);

create policy "replenishment_lines_verify_scope"
on public.replenishment_receipt_lines for update to authenticated
using (exists (
  select 1 from public.replenishment_receipts r
  where r.id = receipt_id and (
    r.created_by = (select auth.uid())
    or (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
    or ((select private.current_user_komtrol_role()) = 'COORDINADOR'
        and r.warehouse is not distinct from (select private.current_user_warehouse()))
  )
))
with check (exists (
  select 1 from public.replenishment_receipts r
  where r.id = receipt_id and (
    r.created_by = (select auth.uid())
    or (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
    or ((select private.current_user_komtrol_role()) = 'COORDINADOR'
        and r.warehouse is not distinct from (select private.current_user_warehouse()))
  )
));
grant update on public.replenishment_receipt_lines to authenticated;

alter table public.incidents add column if not exists verification_email_subject text;
