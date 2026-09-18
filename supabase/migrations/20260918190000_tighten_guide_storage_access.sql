drop policy if exists "guide_documents_select" on storage.objects;

create policy "guide_documents_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'guide-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
  )
);
