create table if not exists public.dashboard_layout_configs (
  id uuid primary key default gen_random_uuid(),
  report_code text not null check (
    report_code in (
      'inbound-outbound','eri','sobrantes-faltantes','diferencias-inventario',
      'danados-scorecard','dashboard-transitos','activos-inactivos','uca',
      'ahorros','perfect-ship-outbound','perfect-ship-inbound','safe'
    )
  ),
  viewport text not null check (viewport in ('desktop','tablet','mobile')),
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_code, viewport)
);

alter table public.dashboard_layout_configs enable row level security;

create index if not exists dashboard_layout_configs_report_idx
  on public.dashboard_layout_configs(report_code, viewport)
  where active = true;

drop policy if exists "dashboard_layout_configs_read" on public.dashboard_layout_configs;
create policy "dashboard_layout_configs_read"
on public.dashboard_layout_configs
for select
to authenticated
using (active = true or (select private.current_user_komtrol_role()) = 'ADMINISTRADOR');

drop policy if exists "dashboard_layout_configs_admin_write" on public.dashboard_layout_configs;
create policy "dashboard_layout_configs_admin_write"
on public.dashboard_layout_configs
for all
to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check (
  (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
  and coalesce(updated_by, created_by, (select auth.uid())) = (select auth.uid())
);

comment on table public.dashboard_layout_configs is
  'Administrador visual de los 12 dashboards Scorecard. Guarda estilos y offsets por reporte y viewport.';
