
alter table public.incidents
  drop constraint if exists incidents_incident_type_check;

alter table public.incidents
  add constraint incidents_incident_type_check
  check (incident_type in ('FALTANTE','SOBRANTE','DANADO','DIFERENCIA','SIN_DOCUMENTACION','OTRO'));

insert into public.email_rules
  (incident_type, auto_send, to_addresses, cc_addresses)
values
  ('SOBRANTE', false, '{}', '{}')
on conflict (incident_type) do nothing;
