create index if not exists email_notifications_created_by_idx
  on public.email_notifications(created_by);

create index if not exists incident_attachments_uploaded_by_idx
  on public.incident_attachments(uploaded_by);
