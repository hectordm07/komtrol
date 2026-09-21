create table if not exists public.warehouse_centers (
  id uuid primary key default gen_random_uuid(),
  warehouse_code text not null references public.warehouses(code) on update cascade on delete restrict,
  code text not null unique,
  name text not null,
  business_unit text not null default 'GENERAL'
    check (business_unit in ('KMMP','DCP','CUMMINS','GENERAL')),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_code, name)
);

alter table public.warehouse_centers enable row level security;

drop policy if exists "warehouse_centers_select_authenticated" on public.warehouse_centers;
create policy "warehouse_centers_select_authenticated"
on public.warehouse_centers for select
to authenticated
using (true);

drop policy if exists "warehouse_centers_admin_insert" on public.warehouse_centers;
create policy "warehouse_centers_admin_insert"
on public.warehouse_centers for insert
to authenticated
with check ((select private.current_user_komtrol_role())='ADMINISTRADOR');

drop policy if exists "warehouse_centers_admin_update" on public.warehouse_centers;
create policy "warehouse_centers_admin_update"
on public.warehouse_centers for update
to authenticated
using ((select private.current_user_komtrol_role())='ADMINISTRADOR')
with check ((select private.current_user_komtrol_role())='ADMINISTRADOR');

drop policy if exists "warehouse_centers_admin_delete" on public.warehouse_centers;
create policy "warehouse_centers_admin_delete"
on public.warehouse_centers for delete
to authenticated
using ((select private.current_user_komtrol_role())='ADMINISTRADOR');

grant select, insert, update, delete on public.warehouse_centers to authenticated;

insert into public.warehouses (code,name,warehouse_scope,remote_group,active)
values
  ('ANTAPACAY','ANTAPACAY','REMOTO','PROYECTO_MINERO',true),
  ('TOQUEPALA','TOQUEPALA','REMOTO','PROYECTO_MINERO',true),
  ('CUAJONE','CUAJONE','REMOTO','PROYECTO_MINERO',true),
  ('BAYOVAR','BAYOVAR','REMOTO','PROYECTO_MINERO',true),
  ('ANTAMINA','ANTAMINA','REMOTO','PROYECTO_MINERO',true),
  ('LAS_BAMBAS','LAS BAMBAS','REMOTO','PROYECTO_MINERO',true),
  ('QUELLAVECO','QUELLAVECO','REMOTO','PROYECTO_MINERO',true),

  ('CAJAMARCA','CAJAMARCA','REMOTO','SUCURSAL',true),
  ('PIURA','PIURA','REMOTO','SUCURSAL',true),
  ('IQUITOS','IQUITOS','REMOTO','SUCURSAL',true),
  ('TRUJILLO','TRUJILLO','REMOTO','SUCURSAL',true),
  ('AREQUIPA','AREQUIPA','REMOTO','SUCURSAL',true),

  ('SAN_LUIS','SAN LUIS','REMOTO','TIENDA',true),
  ('HUANCAYO','HUANCAYO','REMOTO','TIENDA',true),
  ('LOS_OLIVOS','LOS OLIVOS','REMOTO','TIENDA',true),
  ('ILO','ILO','REMOTO','TIENDA',true),
  ('CHICLAYO','CHICLAYO','REMOTO','TIENDA',true),
  ('CUZCO','CUZCO','REMOTO','TIENDA',true),
  ('TARAPOTO','TARAPOTO','REMOTO','TIENDA',true),
  ('CHIMBOTE','CHIMBOTE','REMOTO','TIENDA',true),
  ('TACNA','TACNA','REMOTO','TIENDA',true),

  ('CALLAO','CALLAO','CENTRAL',null,true),
  ('PUCUSANA','PUCUSANA','CENTRAL',null,true)
on conflict (code) do update
set name=excluded.name,
    warehouse_scope=excluded.warehouse_scope,
    remote_group=excluded.remote_group,
    active=true,
    updated_at=now();

update public.warehouses
set active=false, updated_at=now()
where code in (
  'ANTAPACAY_KMMP','ANTAPACAY_DCP',
  'TOQUEPALA_KMMP','TOQUEPALA_DCP',
  'CUAJONE_KMMP','CUAJONE_DCP',
  'BAYOVAR_KMMP','BAYOVAR_DCP',
  'ANTAMINA_KMMP','ANTAMINA_DCP',
  'LAS_BAMBAS_KMMP','LAS_BAMBAS_DCP',
  'QUELLAVECO_DCP',
  'CAJAMARCA_KMMP','CAJAMARCA_DCP',
  'PIURA_KMMP','PIURA_DCP',
  'IQUITOS_KMMP',
  'TRUJILLO_KMMP','TRUJILLO_DCP',
  'AREQUIPA_KMMP','AREQUIPA_CUMMINS',
  'SAN_LUIS_KMMP','SAN_LUIS_DCP',
  'HUANCAYO_KMMP','HUANCAYO_DCP',
  'LOS_OLIVOS_DCP',
  'CHICLAYO_DCP',
  'TACNA_DCP'
);

insert into public.warehouse_centers (warehouse_code,code,name,business_unit,active)
values
  ('ANTAPACAY','ANTAPACAY_KMMP','ANTAPACAY KMMP','KMMP',true),
  ('ANTAPACAY','ANTAPACAY_DCP','ANTAPACAY DCP','DCP',true),
  ('TOQUEPALA','TOQUEPALA_KMMP','TOQUEPALA KMMP','KMMP',true),
  ('TOQUEPALA','TOQUEPALA_DCP','TOQUEPALA DCP','DCP',true),
  ('CUAJONE','CUAJONE_KMMP','CUAJONE KMMP','KMMP',true),
  ('CUAJONE','CUAJONE_DCP','CUAJONE DCP','DCP',true),
  ('BAYOVAR','BAYOVAR_KMMP','BAYOVAR KMMP','KMMP',true),
  ('BAYOVAR','BAYOVAR_DCP','BAYOVAR DCP','DCP',true),
  ('ANTAMINA','ANTAMINA_KMMP','ANTAMINA KMMP','KMMP',true),
  ('ANTAMINA','ANTAMINA_DCP','ANTAMINA DCP','DCP',true),
  ('LAS_BAMBAS','LAS_BAMBAS_KMMP','LAS BAMBAS KMMP','KMMP',true),
  ('LAS_BAMBAS','LAS_BAMBAS_DCP','LAS BAMBAS DCP','DCP',true),
  ('QUELLAVECO','QUELLAVECO_DCP','QUELLAVECO DCP','DCP',true),

  ('CAJAMARCA','CAJAMARCA_KMMP','CAJAMARCA KMMP','KMMP',true),
  ('CAJAMARCA','CAJAMARCA_DCP','CAJAMARCA DCP','DCP',true),
  ('PIURA','PIURA_KMMP','PIURA KMMP','KMMP',true),
  ('PIURA','PIURA_DCP','PIURA DCP','DCP',true),
  ('IQUITOS','IQUITOS_KMMP','IQUITOS KMMP','KMMP',true),
  ('TRUJILLO','TRUJILLO_KMMP','TRUJILLO KMMP','KMMP',true),
  ('TRUJILLO','TRUJILLO_DCP','TRUJILLO DCP','DCP',true),
  ('AREQUIPA','AREQUIPA_KMMP','AREQUIPA KMMP','KMMP',true),
  ('AREQUIPA','AREQUIPA_CUMMINS','AREQUIPA CUMMINS','CUMMINS',true),

  ('SAN_LUIS','SAN_LUIS_KMMP','SAN LUIS KMMP','KMMP',true),
  ('SAN_LUIS','SAN_LUIS_DCP','SAN LUIS DCP','DCP',true),
  ('HUANCAYO','HUANCAYO_KMMP','HUANCAYO KMMP','KMMP',true),
  ('HUANCAYO','HUANCAYO_DCP','HUANCAYO DCP','DCP',true),
  ('LOS_OLIVOS','LOS_OLIVOS_DCP','LOS OLIVOS DCP','DCP',true),
  ('ILO','ILO','ILO','GENERAL',true),
  ('CHICLAYO','CHICLAYO_DCP','CHICLAYO DCP','DCP',true),
  ('CHICLAYO','CHICLAYO','CHICLAYO','GENERAL',true),
  ('CUZCO','CUZCO','CUZCO','GENERAL',true),
  ('TARAPOTO','TARAPOTO','TARAPOTO','GENERAL',true),
  ('CHIMBOTE','CHIMBOTE','CHIMBOTE','GENERAL',true),
  ('TACNA','TACNA_DCP','TACNA DCP','DCP',true),

  ('CALLAO','CALLAO','CALLAO','GENERAL',true),
  ('PUCUSANA','PUCUSANA','PUCUSANA','GENERAL',true)
on conflict (code) do update
set warehouse_code=excluded.warehouse_code,
    name=excluded.name,
    business_unit=excluded.business_unit,
    active=true,
    updated_at=now();

insert into public.operational_groups(project_code,name,active)
values ('ALM_ANTAMINA','CAMIONES',true)
on conflict (project_code,name) do update set active=true;

update public.operational_groups
set active=false
where project_code is null
  and name in ('CAMIONES','PALAS');
