alter table public.replenishment_receipts
  add column if not exists sap_kmmp_no text,
  add column if not exists sap_fiori_no text;

alter table public.replenishment_receipts
  drop constraint if exists replenishment_receipts_sap_kmmp_no_check;
alter table public.replenishment_receipts
  add constraint replenishment_receipts_sap_kmmp_no_check
  check (
    sap_kmmp_no is null
    or sap_kmmp_no = ''
    or sap_kmmp_no ~ '^18[0-9]+$'
  );

alter table public.replenishment_receipts
  drop constraint if exists replenishment_receipts_sap_fiori_no_check;
alter table public.replenishment_receipts
  add constraint replenishment_receipts_sap_fiori_no_check
  check (
    sap_fiori_no is null
    or sap_fiori_no = ''
    or sap_fiori_no ~ '^50[0-9]+$'
  );

alter table public.replenishment_receipts
  drop column if exists sap_status;

alter table public.replenishment_receipts
  add column sap_status text generated always as (
    case
      when coalesce(sap_kmmp_no, '') ~ '^18[0-9]+$'
        or coalesce(sap_fiori_no, '') ~ '^50[0-9]+$'
      then 'INGRESADO'
      else 'PENDIENTE'
    end
  ) stored;

create index if not exists replenishment_receipts_sap_status_idx
  on public.replenishment_receipts(sap_status);
