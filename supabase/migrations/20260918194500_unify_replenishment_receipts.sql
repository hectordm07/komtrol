create sequence if not exists public.replenishment_receipt_seq start with 1 increment by 1;

alter table public.guides
  add column if not exists supplier text,
  add column if not exists data_source text not null default 'SCANNER';

alter table public.guides
  drop constraint if exists guides_supplier_check;
alter table public.guides
  add constraint guides_supplier_check
  check (supplier is null or supplier in ('KOMATSU','CUMMINS','POR_VALIDAR'));

alter table public.guides
  drop constraint if exists guides_data_source_check;
alter table public.guides
  add constraint guides_data_source_check
  check (data_source in ('SCANNER','CARGA_MASIVA','MANUAL','MIGRADO'));

create table if not exists public.replenishment_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique default (
    'ING-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.replenishment_receipt_seq')::text, 6, '0')
  ),
  receipt_date date not null default current_date,
  supplier text not null default 'POR_VALIDAR'
    check (supplier in ('KOMATSU','CUMMINS','POR_VALIDAR')),
  guide_id uuid unique references public.guides(id) on delete set null,
  guide_no text,
  reference text,
  document_no text,
  warehouse text,
  source text not null default 'SCANNER'
    check (source in ('SCANNER','CARGA_MASIVA','MANUAL','MIGRADO')),
  line_count integer not null default 0 check (line_count >= 0),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.replenishment_receipts enable row level security;

create index if not exists replenishment_receipts_created_by_idx on public.replenishment_receipts(created_by);
create index if not exists replenishment_receipts_warehouse_idx on public.replenishment_receipts(warehouse);
create index if not exists replenishment_receipts_date_idx on public.replenishment_receipts(receipt_date);
create index if not exists replenishment_receipts_supplier_idx on public.replenishment_receipts(supplier);
create index if not exists replenishment_receipts_source_idx on public.replenishment_receipts(source);

drop policy if exists "replenishment_receipts_select_scope" on public.replenishment_receipts;
create policy "replenishment_receipts_select_scope"
on public.replenishment_receipts for select
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or (
    (select private.current_user_komtrol_role()) = 'COORDINADOR'
    and warehouse is not distinct from (select private.current_user_warehouse())
  )
);

drop policy if exists "replenishment_receipts_insert_self" on public.replenishment_receipts;
create policy "replenishment_receipts_insert_self"
on public.replenishment_receipts for insert
to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "replenishment_receipts_update_scope" on public.replenishment_receipts;
create policy "replenishment_receipts_update_scope"
on public.replenishment_receipts for update
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
  or (
    (select private.current_user_komtrol_role()) = 'COORDINADOR'
    and warehouse is not distinct from (select private.current_user_warehouse())
  )
)
with check (
  created_by = (select auth.uid())
  or (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
  or (
    (select private.current_user_komtrol_role()) = 'COORDINADOR'
    and warehouse is not distinct from (select private.current_user_warehouse())
  )
);

create table if not exists public.replenishment_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.replenishment_receipts(id) on delete cascade,
  guide_line_id uuid unique references public.guide_lines(id) on delete set null,
  line_no integer not null,
  part_no text,
  description text,
  quantity numeric(14,3),
  unit text,
  created_at timestamptz not null default now(),
  unique (receipt_id, line_no)
);

alter table public.replenishment_receipt_lines enable row level security;

create index if not exists replenishment_receipt_lines_receipt_idx on public.replenishment_receipt_lines(receipt_id);
create index if not exists replenishment_receipt_lines_part_idx on public.replenishment_receipt_lines(part_no);

drop policy if exists "replenishment_lines_select_scope" on public.replenishment_receipt_lines;
create policy "replenishment_lines_select_scope"
on public.replenishment_receipt_lines for select
to authenticated
using (
  exists (
    select 1 from public.replenishment_receipts r
    where r.id = receipt_id
      and (
        r.created_by = (select auth.uid())
        or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
        or (
          (select private.current_user_komtrol_role()) = 'COORDINADOR'
          and r.warehouse is not distinct from (select private.current_user_warehouse())
        )
      )
  )
);

drop policy if exists "replenishment_lines_insert_scope" on public.replenishment_receipt_lines;
create policy "replenishment_lines_insert_scope"
on public.replenishment_receipt_lines for insert
to authenticated
with check (
  exists (
    select 1 from public.replenishment_receipts r
    where r.id = receipt_id
      and (
        r.created_by = (select auth.uid())
        or (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
      )
  )
);

create or replace function private.sync_replenishment_receipt_from_guide()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.guide_type = 'REPOSICION' then
    insert into public.replenishment_receipts (
      receipt_date, supplier, guide_id, guide_no, reference, document_no,
      warehouse, source, line_count, notes, created_by, updated_at
    )
    values (
      coalesce(new.reception_at::date, new.created_at::date, current_date),
      coalesce(new.supplier, 'POR_VALIDAR'),
      new.id, new.guide_no, new.reference, new.document_no, new.warehouse,
      coalesce(new.data_source, 'SCANNER'), new.line_count, new.notes,
      new.created_by, now()
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
        updated_at = now();
  elsif tg_op = 'UPDATE' then
    delete from public.replenishment_receipts where guide_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_replenishment_receipt_from_guide() from public;

drop trigger if exists trg_sync_replenishment_receipt_from_guide on public.guides;
create trigger trg_sync_replenishment_receipt_from_guide
after insert or update of guide_type, supplier, guide_no, reference, document_no, warehouse, line_count, notes, emission_date, data_source
on public.guides
for each row
execute function private.sync_replenishment_receipt_from_guide();

create or replace function private.sync_replenishment_line_from_guide_line()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_receipt_id uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.replenishment_receipt_lines
    where guide_line_id = old.id;
    return old;
  end if;

  select r.id into target_receipt_id
  from public.replenishment_receipts r
  where r.guide_id = new.guide_id
  limit 1;

  if target_receipt_id is not null then
    insert into public.replenishment_receipt_lines (
      receipt_id, guide_line_id, line_no, part_no, description, quantity, unit
    )
    values (
      target_receipt_id, new.id, new.line_no, new.part_no, new.description, new.quantity, new.unit
    )
    on conflict (guide_line_id) do update
    set receipt_id = excluded.receipt_id,
        line_no = excluded.line_no,
        part_no = excluded.part_no,
        description = excluded.description,
        quantity = excluded.quantity,
        unit = excluded.unit;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_replenishment_line_from_guide_line() from public;

drop trigger if exists trg_sync_replenishment_line_from_guide_line on public.guide_lines;
create trigger trg_sync_replenishment_line_from_guide_line
after insert or update or delete
on public.guide_lines
for each row
execute function private.sync_replenishment_line_from_guide_line();

grant select, insert, update on public.replenishment_receipts to authenticated;
grant select, insert on public.replenishment_receipt_lines to authenticated;
grant usage, select on sequence public.replenishment_receipt_seq to authenticated;

insert into public.replenishment_receipts (
  receipt_date, supplier, guide_id, guide_no, reference, document_no,
  warehouse, source, line_count, notes, created_by
)
select
  coalesce(g.reception_at::date, g.created_at::date, current_date),
  coalesce(g.supplier, 'POR_VALIDAR'),
  g.id, g.guide_no, g.reference, g.document_no, g.warehouse,
  coalesce(g.data_source, 'MIGRADO'), g.line_count, g.notes, g.created_by
from public.guides g
where g.guide_type = 'REPOSICION'
on conflict (guide_id) do nothing;

insert into public.replenishment_receipt_lines (
  receipt_id, guide_line_id, line_no, part_no, description, quantity, unit
)
select
  r.id, gl.id, gl.line_no, gl.part_no, gl.description, gl.quantity, gl.unit
from public.guide_lines gl
join public.replenishment_receipts r on r.guide_id = gl.guide_id
on conflict (guide_line_id) do nothing;
