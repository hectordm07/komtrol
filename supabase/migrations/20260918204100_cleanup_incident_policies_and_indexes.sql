drop policy if exists "incidents_delete_admin" on public.incidents;
drop policy if exists "incidents_update_role" on public.incidents;

create index if not exists guide_observation_emails_followup_idx
  on public.guide_observation_emails(followup_id);