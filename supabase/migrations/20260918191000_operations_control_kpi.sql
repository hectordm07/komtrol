create or replace function private.can_manage_warehouse(target_warehouse text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and p.active = true
      and (
        p.role in ('SUPERVISOR','ADMINISTRADOR')
        or (p.role = 'COORDINADOR' and p.warehouse is not distinct from target_warehouse)
      )
  )
$$;

revoke all on function private.can_manage_warehouse(text) from public;
grant usage on schema private to authenticated;
grant execute on function private.can_manage_warehouse(text) to authenticated;

create table if not exists public.consignment_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  guide_no text,
  reference text,
  material_no text not null,
  stock_code text,
  description text,
  quantity numeric(14,3) not null default 0,
  unit text,
  warehouse text,
  location text,
  status text not null default 'RECEPCIONADO'
    check (status in ('PENDIENTE','RECEPCIONADO','UBICADO','OBSERVADO','CERRADO')),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.consignment_entries enable row level security;
create index if not exists consign_created_by_idx on public.consignment_entries(created_by);
create index if not exists consign_warehouse_idx on public.consignment_entries(warehouse);
create index if not exists consign_material_idx on public.consignment_entries(material_no);

drop policy if exists "consign_select_scope" on public.consignment_entries;
create policy "consign_select_scope"
on public.consignment_entries for select to authenticated
using (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)));

drop policy if exists "consign_insert_self" on public.consignment_entries;
create policy "consign_insert_self"
on public.consignment_entries for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "consign_update_scope" on public.consignment_entries;
create policy "consign_update_scope"
on public.consignment_entries for update to authenticated
using (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)))
with check (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)));

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  os_no text,
  material_no text not null,
  description text,
  quantity numeric(14,3) not null default 0,
  person_area text,
  warehouse text,
  delivery_date date,
  return_date date,
  status text not null default 'PENDIENTE'
    check (status in ('PENDIENTE','ENTREGADO','DEVUELTO','OBSERVADO')),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.loans enable row level security;
create index if not exists loans_created_by_idx on public.loans(created_by);
create index if not exists loans_warehouse_idx on public.loans(warehouse);
create index if not exists loans_status_idx on public.loans(status);

drop policy if exists "loans_select_scope" on public.loans;
create policy "loans_select_scope"
on public.loans for select to authenticated
using (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)));

drop policy if exists "loans_insert_self" on public.loans;
create policy "loans_insert_self"
on public.loans for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "loans_update_scope" on public.loans;
create policy "loans_update_scope"
on public.loans for update to authenticated
using (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)))
with check (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)));

create table if not exists public.outbound_movements (
  id uuid primary key default gen_random_uuid(),
  movement_date date not null default current_date,
  warehouse text,
  material_no text not null,
  stock_code text,
  description text,
  quantity numeric(14,3) not null default 0,
  destination text,
  reference text,
  responsible text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.outbound_movements enable row level security;
create index if not exists outbound_created_by_idx on public.outbound_movements(created_by);
create index if not exists outbound_warehouse_idx on public.outbound_movements(warehouse);
create index if not exists outbound_date_idx on public.outbound_movements(movement_date);

drop policy if exists "outbound_select_scope" on public.outbound_movements;
create policy "outbound_select_scope"
on public.outbound_movements for select to authenticated
using (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)));

drop policy if exists "outbound_insert_self" on public.outbound_movements;
create policy "outbound_insert_self"
on public.outbound_movements for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "outbound_update_scope" on public.outbound_movements;
create policy "outbound_update_scope"
on public.outbound_movements for update to authenticated
using (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)))
with check (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)));

create table if not exists public.inventories (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2020 and 2100),
  month integer not null check (month between 1 and 12),
  warehouse text,
  inventory_type text,
  scheduled_date date,
  completed_date date,
  responsible text,
  result text,
  notes text,
  status text not null default 'PROGRAMADO'
    check (status in ('PROGRAMADO','EN_PROCESO','REALIZADO','NO_REALIZADO','EN_PROCESO_CIERRE')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.inventories enable row level security;
create index if not exists inventories_created_by_idx on public.inventories(created_by);
create index if not exists inventories_warehouse_idx on public.inventories(warehouse);
create index if not exists inventories_period_idx on public.inventories(year, month);

drop policy if exists "inventories_select_scope" on public.inventories;
create policy "inventories_select_scope"
on public.inventories for select to authenticated
using (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)));

drop policy if exists "inventories_insert_self" on public.inventories;
create policy "inventories_insert_self"
on public.inventories for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "inventories_update_scope" on public.inventories;
create policy "inventories_update_scope"
on public.inventories for update to authenticated
using (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)))
with check (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)));

create table if not exists public.transits (
  id uuid primary key default gen_random_uuid(),
  transit_date date not null default current_date,
  guide_no text,
  reference text,
  origin text,
  destination text,
  warehouse text,
  material_no text,
  quantity numeric(14,3),
  value_amount numeric(16,2),
  status text not null default 'EN_TRANSITO'
    check (status in ('EN_TRANSITO','RECIBIDO','OBSERVADO','CERRADO')),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.transits enable row level security;
create index if not exists transits_created_by_idx on public.transits(created_by);
create index if not exists transits_warehouse_idx on public.transits(warehouse);
create index if not exists transits_date_idx on public.transits(transit_date);
create index if not exists transits_status_idx on public.transits(status);

drop policy if exists "transits_select_scope" on public.transits;
create policy "transits_select_scope"
on public.transits for select to authenticated
using (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)));

drop policy if exists "transits_insert_self" on public.transits;
create policy "transits_insert_self"
on public.transits for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "transits_update_scope" on public.transits;
create policy "transits_update_scope"
on public.transits for update to authenticated
using (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)))
with check (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)));

create table if not exists public.damaged_materials (
  id uuid primary key default gen_random_uuid(),
  event_date date not null default current_date,
  material_no text not null,
  stock_code text,
  description text,
  quantity numeric(14,3) not null default 0,
  warehouse text,
  reason text,
  status text not null default 'PENDIENTE'
    check (status in ('PENDIENTE','EN_REVISION','REGULARIZADO','CERRADO')),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.damaged_materials enable row level security;
create index if not exists damaged_created_by_idx on public.damaged_materials(created_by);
create index if not exists damaged_warehouse_idx on public.damaged_materials(warehouse);
create index if not exists damaged_status_idx on public.damaged_materials(status);

drop policy if exists "damaged_select_scope" on public.damaged_materials;
create policy "damaged_select_scope"
on public.damaged_materials for select to authenticated
using (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)));

drop policy if exists "damaged_insert_self" on public.damaged_materials;
create policy "damaged_insert_self"
on public.damaged_materials for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "damaged_update_scope" on public.damaged_materials;
create policy "damaged_update_scope"
on public.damaged_materials for update to authenticated
using (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)))
with check (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)));

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_name text not null,
  description text,
  asset_code text,
  location text,
  warehouse text,
  responsible text,
  status text not null default 'ACTIVO'
    check (status in ('ACTIVO','INACTIVO','OBSERVADO','MANTENIMIENTO')),
  last_review date,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.assets enable row level security;
create index if not exists assets_created_by_idx on public.assets(created_by);
create index if not exists assets_warehouse_idx on public.assets(warehouse);
create index if not exists assets_status_idx on public.assets(status);

drop policy if exists "assets_select_scope" on public.assets;
create policy "assets_select_scope"
on public.assets for select to authenticated
using (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)));

drop policy if exists "assets_insert_self" on public.assets;
create policy "assets_insert_self"
on public.assets for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "assets_update_scope" on public.assets;
create policy "assets_update_scope"
on public.assets for update to authenticated
using (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)))
with check (created_by = (select auth.uid()) or (select private.can_manage_warehouse(warehouse)));

create table if not exists public.kpi_records (
  id uuid primary key default gen_random_uuid(),
  indicator text not null,
  year integer not null check (year between 2020 and 2100),
  month integer not null check (month between 1 and 12),
  warehouse text not null default 'GLOBAL',
  value numeric(18,4) not null,
  amount numeric(18,2),
  unit text not null default '%',
  source text not null default 'CARGA_MASIVA'
    check (source in ('KOMTROL','CARGA_MASIVA','CALCULO')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (indicator, year, month, warehouse)
);
alter table public.kpi_records enable row level security;
create index if not exists kpi_records_period_idx on public.kpi_records(year, month);
create index if not exists kpi_records_warehouse_idx on public.kpi_records(warehouse);
create index if not exists kpi_records_indicator_idx on public.kpi_records(indicator);

drop policy if exists "kpi_records_select_authenticated" on public.kpi_records;
create policy "kpi_records_select_authenticated"
on public.kpi_records for select to authenticated
using (true);

drop policy if exists "kpi_records_admin_write" on public.kpi_records;
create policy "kpi_records_admin_write"
on public.kpi_records for all to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
