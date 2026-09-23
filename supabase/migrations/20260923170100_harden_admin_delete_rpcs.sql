-- Use the caller's RLS policies even inside the atomic deletion functions.
create policy "surplus_initial_batches_admin_update"
on public.surplus_kardex_initial_batches for update to authenticated
using ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR')
with check ((select private.current_user_komtrol_role()) = 'ADMINISTRADOR');
grant update on public.surplus_kardex_initial_batches to authenticated;

alter function public.admin_delete_inbound_box(uuid) security invoker;
alter function public.admin_delete_kardex_movement(uuid) security invoker;
