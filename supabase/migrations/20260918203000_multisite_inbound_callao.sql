alter table public.user_profiles
  add column if not exists shift_name text;

alter table public.tasks
  add column if not exists shift_name text;

create index if not exists tasks_shift_name_idx on public.tasks(shift_name);

alter table public.incidents
  add column if not exists warehouse text,
  add column if not exists project text,
  add column if not exists group_name text,
  add column if not exists shift_name text,
  add column if not exists operation_area text not null default 'GENERAL',
  add column if not exists assigned_to uuid references auth.users(id);

alter table public.incidents
  drop constraint if exists incidents_operation_area_check;
alter table public.incidents
  add constraint incidents_operation_area_check
  check (operation_area in ('GENERAL','INBOUND'));

create index if not exists incidents_warehouse_idx on public.incidents(warehouse);
create index if not exists incidents_group_name_idx on public.incidents(group_name);
create index if not exists incidents_shift_name_idx on public.incidents(shift_name);
create index if not exists incidents_operation_area_idx on public.incidents(operation_area);
create index if not exists incidents_assigned_to_idx on public.incidents(assigned_to);

create or replace function private.populate_incident_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select warehouse, project, group_name, shift_name
    into p
  from public.user_profiles
  where user_id = new.created_by
  limit 1;

  if new.warehouse is null then new.warehouse := p.warehouse; end if;
  if new.project is null then new.project := p.project; end if;
  if new.group_name is null then new.group_name := p.group_name; end if;
  if new.shift_name is null then new.shift_name := p.shift_name; end if;

  return new;
end;
$$;

revoke all on function private.populate_incident_scope() from public;

drop trigger if exists trg_populate_incident_scope on public.incidents;
create trigger trg_populate_incident_scope
before insert on public.incidents
for each row execute function private.populate_incident_scope();

drop policy if exists "incidents_select_authenticated" on public.incidents;
drop policy if exists "incidents_select_scope" on public.incidents;
create policy "incidents_select_scope"
on public.incidents for select
to authenticated
using (
  created_by = (select auth.uid())
  or assigned_to = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or warehouse is not distinct from (select private.current_user_warehouse())
);

drop policy if exists "incidents_insert_own" on public.incidents;
create policy "incidents_insert_own"
on public.incidents for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.user_profiles p
    where p.user_id = (select auth.uid()) and p.active = true
  )
);

drop policy if exists "incidents_update_own" on public.incidents;
drop policy if exists "incidents_update_scope" on public.incidents;
create policy "incidents_update_scope"
on public.incidents for update
to authenticated
using (
  created_by = (select auth.uid())
  or assigned_to = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or (
    (select private.current_user_komtrol_role()) = 'COORDINADOR'
    and warehouse is not distinct from (select private.current_user_warehouse())
  )
)
with check (
  created_by = (select auth.uid())
  or assigned_to = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or (
    (select private.current_user_komtrol_role()) = 'COORDINADOR'
    and warehouse is not distinct from (select private.current_user_warehouse())
  )
);

drop policy if exists "incidents_delete_scope" on public.incidents;
create policy "incidents_delete_scope"
on public.incidents for delete
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or (
    (select private.current_user_komtrol_role()) = 'COORDINADOR'
    and warehouse is not distinct from (select private.current_user_warehouse())
  )
);

create table if not exists public.inbound_boxes (
  id uuid primary key default gen_random_uuid(),
  box_no text not null unique,
  warehouse text not null default 'CALLAO',
  title text,
  status text not null default 'ABIERTA'
    check (status in ('ABIERTA','CERRADA','DESPACHADA','ANULADA')),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inbound_boxes enable row level security;

create index if not exists inbound_boxes_warehouse_idx on public.inbound_boxes(warehouse);
create index if not exists inbound_boxes_status_idx on public.inbound_boxes(status);
create index if not exists inbound_boxes_created_by_idx on public.inbound_boxes(created_by);

drop policy if exists "inbound_boxes_select_scope" on public.inbound_boxes;
create policy "inbound_boxes_select_scope"
on public.inbound_boxes for select
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or warehouse is not distinct from (select private.current_user_warehouse())
);

drop policy if exists "inbound_boxes_insert_scope" on public.inbound_boxes;
create policy "inbound_boxes_insert_scope"
on public.inbound_boxes for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
    or warehouse is not distinct from (select private.current_user_warehouse())
  )
);

drop policy if exists "inbound_boxes_update_scope" on public.inbound_boxes;
create policy "inbound_boxes_update_scope"
on public.inbound_boxes for update
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or (
    (select private.current_user_komtrol_role()) = 'COORDINADOR'
    and warehouse is not distinct from (select private.current_user_warehouse())
  )
)
with check (
  created_by = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or (
    (select private.current_user_komtrol_role()) = 'COORDINADOR'
    and warehouse is not distinct from (select private.current_user_warehouse())
  )
);

drop policy if exists "inbound_boxes_delete_scope" on public.inbound_boxes;
create policy "inbound_boxes_delete_scope"
on public.inbound_boxes for delete
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  or (
    (select private.current_user_komtrol_role()) = 'COORDINADOR'
    and warehouse is not distinct from (select private.current_user_warehouse())
  )
);

create table if not exists public.inbound_box_items (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.inbound_boxes(id) on delete cascade,
  incident_id uuid references public.incidents(id) on delete set null,
  material_no text,
  stock_code text,
  description text,
  quantity numeric(14,3) not null default 0,
  unit text not null default 'UND',
  location text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.inbound_box_items enable row level security;

create index if not exists inbound_box_items_box_idx on public.inbound_box_items(box_id);
create index if not exists inbound_box_items_incident_idx on public.inbound_box_items(incident_id);
create index if not exists inbound_box_items_material_idx on public.inbound_box_items(material_no);

drop policy if exists "inbound_box_items_select_scope" on public.inbound_box_items;
create policy "inbound_box_items_select_scope"
on public.inbound_box_items for select
to authenticated
using (
  exists (
    select 1 from public.inbound_boxes b
    where b.id = box_id
      and (
        b.created_by = (select auth.uid())
        or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
        or b.warehouse is not distinct from (select private.current_user_warehouse())
      )
  )
);

drop policy if exists "inbound_box_items_insert_scope" on public.inbound_box_items;
create policy "inbound_box_items_insert_scope"
on public.inbound_box_items for insert
to authenticated
with check (
  exists (
    select 1 from public.inbound_boxes b
    where b.id = box_id
      and (
        b.created_by = (select auth.uid())
        or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
        or (
          (select private.current_user_komtrol_role()) = 'COORDINADOR'
          and b.warehouse is not distinct from (select private.current_user_warehouse())
        )
      )
  )
);

drop policy if exists "inbound_box_items_update_scope" on public.inbound_box_items;
create policy "inbound_box_items_update_scope"
on public.inbound_box_items for update
to authenticated
using (
  exists (
    select 1 from public.inbound_boxes b
    where b.id = box_id
      and (
        b.created_by = (select auth.uid())
        or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
        or (
          (select private.current_user_komtrol_role()) = 'COORDINADOR'
          and b.warehouse is not distinct from (select private.current_user_warehouse())
        )
      )
  )
)
with check (
  exists (
    select 1 from public.inbound_boxes b
    where b.id = box_id
      and (
        b.created_by = (select auth.uid())
        or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
        or (
          (select private.current_user_komtrol_role()) = 'COORDINADOR'
          and b.warehouse is not distinct from (select private.current_user_warehouse())
        )
      )
  )
);

drop policy if exists "inbound_box_items_delete_scope" on public.inbound_box_items;
create policy "inbound_box_items_delete_scope"
on public.inbound_box_items for delete
to authenticated
using (
  exists (
    select 1 from public.inbound_boxes b
    where b.id = box_id
      and (
        b.created_by = (select auth.uid())
        or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
        or (
          (select private.current_user_komtrol_role()) = 'COORDINADOR'
          and b.warehouse is not distinct from (select private.current_user_warehouse())
        )
      )
  )
);

grant select, insert, update, delete on public.inbound_boxes to authenticated;
grant select, insert, update, delete on public.inbound_box_items to authenticated;

insert into public.warehouses (code,name,active)
values
  ('ANTAMINA','ANTAMINA',true),
  ('CALLAO','CALLAO',true)
on conflict (code) do update
set name = excluded.name, active = true, updated_at = now();

insert into public.projects (code,name,warehouse_code,active)
values
  ('ALM_ANTAMINA','ALMACEN ANTAMINA','ANTAMINA',true),
  ('INBOUND_CALLAO','INBOUND CALLAO','CALLAO',true)
on conflict (code) do update
set name = excluded.name,
    warehouse_code = excluded.warehouse_code,
    active = true,
    updated_at = now();

insert into public.operational_groups (project_code,name,active)
values
  ('ALM_ANTAMINA','PALAS',true),
  ('INBOUND_CALLAO','INBOUND',true)
on conflict (project_code,name) do update
set active = true;

update public.user_profiles
set warehouse = 'ANTAMINA',
    project = 'ALMACEN ANTAMINA',
    group_name = 'PALAS',
    shift_name = 'GUARDIA A',
    position = coalesce(position,'ADMINISTRADOR')
where full_name = 'Administrador KOMTROL'
  and role = 'ADMINISTRADOR';
