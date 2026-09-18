alter table public.incidents
  add column if not exists detection_mode text,
  add column if not exists barcode_value text,
  add column if not exists stock_code text,
  add column if not exists location text,
  add column if not exists qty_damaged numeric,
  add column if not exists detected_at timestamptz not null default now(),
  add column if not exists auto_email_status text not null default 'PENDIENTE';

alter table public.incidents
  drop constraint if exists incidents_detection_mode_check;
alter table public.incidents
  add constraint incidents_detection_mode_check
  check (
    detection_mode is null
    or detection_mode in ('VERIFICACION_INVENTARIO','MATERIAL_DANADO')
  );

alter table public.incidents
  drop constraint if exists incidents_auto_email_status_check;
alter table public.incidents
  add constraint incidents_auto_email_status_check
  check (auto_email_status in ('PENDIENTE','ENVIANDO','ENVIADO','ERROR','NO_CONFIGURADO'));

alter table public.incidents
  drop constraint if exists incidents_qty_damaged_check;
alter table public.incidents
  add constraint incidents_qty_damaged_check
  check (qty_damaged is null or qty_damaged >= 0);

create index if not exists incidents_detection_mode_idx on public.incidents(detection_mode);
create index if not exists incidents_barcode_value_idx on public.incidents(barcode_value);
create index if not exists incidents_auto_email_status_idx on public.incidents(auto_email_status);

create or replace function private.classify_receiving_incident()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.detection_mode = 'VERIFICACION_INVENTARIO' then
    if new.qty_expected is null or new.qty_received is null then
      raise exception 'Cantidad requerida y cantidad llegada son obligatorias';
    end if;

    if new.qty_received > new.qty_expected then
      new.incident_type := 'SOBRANTE';
    elsif new.qty_received < new.qty_expected then
      new.incident_type := 'FALTANTE';
    else
      raise exception 'No existe incidencia: cantidad requerida y llegada son iguales';
    end if;

    new.qty_damaged := null;
  elsif new.detection_mode = 'MATERIAL_DANADO' then
    if coalesce(new.qty_damaged, 0) <= 0 then
      raise exception 'La cantidad dañada debe ser mayor a cero';
    end if;
    new.incident_type := 'DANADO';
  end if;

  if new.detected_at is null then
    new.detected_at := now();
  end if;

  return new;
end;
$$;

revoke all on function private.classify_receiving_incident() from public;

drop trigger if exists trg_classify_receiving_incident on public.incidents;
create trigger trg_classify_receiving_incident
before insert or update of detection_mode, qty_expected, qty_received, qty_damaged
on public.incidents
for each row execute function private.classify_receiving_incident();

create table if not exists public.incident_email_destinations (
  id uuid primary key default gen_random_uuid(),
  warehouse text not null unique,
  enabled boolean not null default true,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.incident_email_destinations enable row level security;

drop policy if exists "incident_email_destinations_admin_select" on public.incident_email_destinations;
create policy "incident_email_destinations_admin_select"
on public.incident_email_destinations for select
to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "incident_email_destinations_admin_insert" on public.incident_email_destinations;
create policy "incident_email_destinations_admin_insert"
on public.incident_email_destinations for insert
to authenticated
with check (
  (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
  and updated_by = (select auth.uid())
);

drop policy if exists "incident_email_destinations_admin_update" on public.incident_email_destinations;
create policy "incident_email_destinations_admin_update"
on public.incident_email_destinations for update
to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check (
  (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
  and updated_by = (select auth.uid())
);

drop policy if exists "incident_email_destinations_admin_delete" on public.incident_email_destinations;
create policy "incident_email_destinations_admin_delete"
on public.incident_email_destinations for delete
to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

grant select, insert, update, delete on public.incident_email_destinations to authenticated;

insert into public.incident_email_destinations (warehouse, enabled)
select code, true
from public.warehouses
where active = true
on conflict (warehouse) do nothing;

update public.email_rules
set auto_send = true,
    updated_at = now()
where incident_type in ('FALTANTE','SOBRANTE','DANADO');