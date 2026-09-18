create sequence if not exists public.replenishment_ingress_no_seq start with 101 increment by 1;

create table if not exists public.replenishment_ingresses (
  id uuid primary key default gen_random_uuid(),
  ingress_no integer not null unique default nextval('public.replenishment_ingress_no_seq'),
  ingress_date date not null,
  supplier text not null check (supplier in ('KOMATSU','CUMMINS','POR_VALIDAR')),
  warehouse text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (ingress_date, supplier, warehouse)
);

alter table public.replenishment_ingresses enable row level security;

alter table public.replenishment_receipts
  add column if not exists ingress_id uuid references public.replenishment_ingresses(id) on delete set null;

alter table public.replenishment_receipt_lines
  add column if not exists stock_code text,
  add column if not exists location text,
  add column if not exists sap_ingress text not null default '0';

create index if not exists replenishment_ingresses_date_idx on public.replenishment_ingresses(ingress_date);
create index if not exists replenishment_ingresses_supplier_idx on public.replenishment_ingresses(supplier);
create index if not exists replenishment_ingresses_warehouse_idx on public.replenishment_ingresses(warehouse);
create index if not exists replenishment_receipts_ingress_idx on public.replenishment_receipts(ingress_id);

drop policy if exists "replenishment_ingresses_select_scope" on public.replenishment_ingresses;
create policy "replenishment_ingresses_select_scope"
on public.replenishment_ingresses for select
to authenticated
using (
  (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or warehouse is null
  or warehouse is not distinct from (select private.current_user_warehouse())
);

drop policy if exists "replenishment_ingresses_insert_scope" on public.replenishment_ingresses;
create policy "replenishment_ingresses_insert_scope"
on public.replenishment_ingresses for insert
to authenticated
with check (
  (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or warehouse is null
  or warehouse is not distinct from (select private.current_user_warehouse())
);

drop policy if exists "replenishment_ingresses_update_scope" on public.replenishment_ingresses;
create policy "replenishment_ingresses_update_scope"
on public.replenishment_ingresses for update
to authenticated
using (
  (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or warehouse is not distinct from (select private.current_user_warehouse())
)
with check (
  (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or warehouse is not distinct from (select private.current_user_warehouse())
);

grant select, insert, update on public.replenishment_ingresses to authenticated;
grant usage, select on sequence public.replenishment_ingress_no_seq to authenticated;

create or replace function private.assign_replenishment_ingress(
  target_date date,
  target_supplier text,
  target_warehouse text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_id uuid;
begin
  select i.id into result_id
  from public.replenishment_ingresses i
  where i.ingress_date = target_date
    and i.supplier = target_supplier
    and i.warehouse is not distinct from target_warehouse
  limit 1;

  if result_id is null then
    insert into public.replenishment_ingresses (ingress_date, supplier, warehouse)
    values (target_date, target_supplier, target_warehouse)
    on conflict (ingress_date, supplier, warehouse)
    do update set updated_at = now()
    returning id into result_id;
  end if;

  return result_id;
end;
$$;

revoke all on function private.assign_replenishment_ingress(date,text,text) from public;

create or replace function private.sync_replenishment_receipt_from_guide()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_receipt_date date;
  target_supplier text;
  target_ingress_id uuid;
begin
  if new.guide_type = 'REPOSICION' then
    target_receipt_date := coalesce(new.reception_at::date, new.created_at::date, current_date);
    target_supplier := coalesce(new.supplier, 'POR_VALIDAR');

    target_ingress_id := private.assign_replenishment_ingress(
      target_receipt_date,
      target_supplier,
      new.warehouse
    );

    insert into public.replenishment_receipts (
      receipt_date, supplier, guide_id, guide_no, reference, document_no,
      warehouse, source, line_count, notes, created_by, updated_at, ingress_id
    )
    values (
      target_receipt_date, target_supplier, new.id, new.guide_no, new.reference,
      new.document_no, new.warehouse, coalesce(new.data_source, 'SCANNER'),
      new.line_count, new.notes, new.created_by, now(), target_ingress_id
    )
    on conflict (guide_id) do update
    set receipt_date = excluded.receipt_date,
        supplier = excluded.supplier,
        guide_no = excluded.guide_no,
        reference = excluded.reference,
        document_no = excluded.document_no,
        warehouse = excluded.warehouse,
        source = excluded.source,
        line_count = excluded.line_count,
        notes = excluded.notes,
        ingress_id = excluded.ingress_id,
        updated_at = now();
  elsif tg_op = 'UPDATE' then
    delete from public.replenishment_receipts where guide_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_replenishment_receipt_from_guide() from public;

create or replace function private.sync_replenishment_line_from_guide_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_receipt_id uuid;
  target_warehouse text;
  material_stock text;
  material_location text;
begin
  if tg_op = 'DELETE' then
    delete from public.replenishment_receipt_lines where guide_line_id = old.id;
    return old;
  end if;

  select r.id, r.warehouse
    into target_receipt_id, target_warehouse
  from public.replenishment_receipts r
  where r.guide_id = new.guide_id
  limit 1;

  if target_receipt_id is not null then
    select m.stock_code, m.location
      into material_stock, material_location
    from public.materials m
    where upper(m.material_no) = upper(coalesce(new.part_no,''))
      and (m.warehouse is not distinct from target_warehouse or m.warehouse is null)
    order by case when m.warehouse is not distinct from target_warehouse then 0 else 1 end
    limit 1;

    insert into public.replenishment_receipt_lines (
      receipt_id, guide_line_id, line_no, part_no, description, quantity, unit,
      stock_code, location
    )
    values (
      target_receipt_id, new.id, new.line_no, new.part_no, new.description,
      new.quantity, new.unit, material_stock, material_location
    )
    on conflict (guide_line_id) do update
    set receipt_id = excluded.receipt_id,
        line_no = excluded.line_no,
        part_no = excluded.part_no,
        description = excluded.description,
        quantity = excluded.quantity,
        unit = excluded.unit,
        stock_code = excluded.stock_code,
        location = excluded.location;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_replenishment_line_from_guide_line() from public;

do $$
declare
  rec record;
  target_id uuid;
begin
  for rec in
    select id, receipt_date, supplier, warehouse
    from public.replenishment_receipts
  loop
    target_id := private.assign_replenishment_ingress(
      rec.receipt_date, rec.supplier, rec.warehouse
    );

    update public.replenishment_receipts
    set ingress_id = target_id
    where id = rec.id;
  end loop;
end;
$$;

update public.replenishment_receipt_lines l
set stock_code = coalesce(
      (
        select m.stock_code
        from public.materials m
        join public.replenishment_receipts r on r.id = l.receipt_id
        where upper(m.material_no) = upper(coalesce(l.part_no,''))
          and (m.warehouse is not distinct from r.warehouse or m.warehouse is null)
        order by case when m.warehouse is not distinct from r.warehouse then 0 else 1 end
        limit 1
      ),
      l.stock_code
    ),
    location = coalesce(
      (
        select m.location
        from public.materials m
        join public.replenishment_receipts r on r.id = l.receipt_id
        where upper(m.material_no) = upper(coalesce(l.part_no,''))
          and (m.warehouse is not distinct from r.warehouse or m.warehouse is null)
        order by case when m.warehouse is not distinct from r.warehouse then 0 else 1 end
        limit 1
      ),
      l.location
    );
