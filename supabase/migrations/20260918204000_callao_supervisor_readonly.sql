drop policy if exists "incidents_insert_own" on public.incidents;
create policy "incidents_insert_own"
on public.incidents for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.user_profiles p
    where p.user_id = (select auth.uid())
      and p.active = true
      and not (p.role = 'SUPERVISOR' and operation_area = 'INBOUND')
  )
);

drop policy if exists "incidents_update_scope" on public.incidents;
create policy "incidents_update_scope"
on public.incidents for update
to authenticated
using (
  case
    when operation_area = 'INBOUND' then
      (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
      or (
        (select private.current_user_komtrol_role()) = 'COORDINADOR'
        and warehouse is not distinct from (select private.current_user_warehouse())
      )
      or (
        (select private.current_user_komtrol_role()) = 'TRABAJADOR'
        and (created_by = (select auth.uid()) or assigned_to = (select auth.uid()))
      )
    else
      created_by = (select auth.uid())
      or assigned_to = (select auth.uid())
      or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
      or (
        (select private.current_user_komtrol_role()) = 'COORDINADOR'
        and warehouse is not distinct from (select private.current_user_warehouse())
      )
  end
)
with check (
  case
    when operation_area = 'INBOUND' then
      (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
      or (
        (select private.current_user_komtrol_role()) = 'COORDINADOR'
        and warehouse is not distinct from (select private.current_user_warehouse())
      )
      or (
        (select private.current_user_komtrol_role()) = 'TRABAJADOR'
        and (created_by = (select auth.uid()) or assigned_to = (select auth.uid()))
      )
    else
      created_by = (select auth.uid())
      or assigned_to = (select auth.uid())
      or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
      or (
        (select private.current_user_komtrol_role()) = 'COORDINADOR'
        and warehouse is not distinct from (select private.current_user_warehouse())
      )
  end
);

drop policy if exists "incidents_delete_scope" on public.incidents;
create policy "incidents_delete_scope"
on public.incidents for delete
to authenticated
using (
  case
    when operation_area = 'INBOUND' then
      (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
      or (
        (select private.current_user_komtrol_role()) = 'COORDINADOR'
        and warehouse is not distinct from (select private.current_user_warehouse())
      )
      or (
        (select private.current_user_komtrol_role()) = 'TRABAJADOR'
        and created_by = (select auth.uid())
      )
    else
      created_by = (select auth.uid())
      or (select private.current_user_komtrol_role()) in ('SUPERVISOR','ADMINISTRADOR')
      or (
        (select private.current_user_komtrol_role()) = 'COORDINADOR'
        and warehouse is not distinct from (select private.current_user_warehouse())
      )
  end
);

drop policy if exists "inbound_boxes_insert_scope" on public.inbound_boxes;
create policy "inbound_boxes_insert_scope"
on public.inbound_boxes for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
    or (
      (select private.current_user_komtrol_role()) = 'COORDINADOR'
      and warehouse is not distinct from (select private.current_user_warehouse())
    )
    or (
      (select private.current_user_komtrol_role()) = 'TRABAJADOR'
      and warehouse is not distinct from (select private.current_user_warehouse())
    )
  )
);

drop policy if exists "inbound_boxes_update_scope" on public.inbound_boxes;
create policy "inbound_boxes_update_scope"
on public.inbound_boxes for update
to authenticated
using (
  (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
  or (
    (select private.current_user_komtrol_role()) = 'COORDINADOR'
    and warehouse is not distinct from (select private.current_user_warehouse())
  )
  or (
    (select private.current_user_komtrol_role()) = 'TRABAJADOR'
    and created_by = (select auth.uid())
  )
)
with check (
  (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
  or (
    (select private.current_user_komtrol_role()) = 'COORDINADOR'
    and warehouse is not distinct from (select private.current_user_warehouse())
  )
  or (
    (select private.current_user_komtrol_role()) = 'TRABAJADOR'
    and created_by = (select auth.uid())
  )
);

drop policy if exists "inbound_boxes_delete_scope" on public.inbound_boxes;
create policy "inbound_boxes_delete_scope"
on public.inbound_boxes for delete
to authenticated
using (
  (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
  or (
    (select private.current_user_komtrol_role()) = 'COORDINADOR'
    and warehouse is not distinct from (select private.current_user_warehouse())
  )
  or (
    (select private.current_user_komtrol_role()) = 'TRABAJADOR'
    and created_by = (select auth.uid())
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
        (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
        or (
          (select private.current_user_komtrol_role()) = 'COORDINADOR'
          and b.warehouse is not distinct from (select private.current_user_warehouse())
        )
        or (
          (select private.current_user_komtrol_role()) = 'TRABAJADOR'
          and b.created_by = (select auth.uid())
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
        (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
        or (
          (select private.current_user_komtrol_role()) = 'COORDINADOR'
          and b.warehouse is not distinct from (select private.current_user_warehouse())
        )
        or (
          (select private.current_user_komtrol_role()) = 'TRABAJADOR'
          and b.created_by = (select auth.uid())
        )
      )
  )
)
with check (
  exists (
    select 1 from public.inbound_boxes b
    where b.id = box_id
      and (
        (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
        or (
          (select private.current_user_komtrol_role()) = 'COORDINADOR'
          and b.warehouse is not distinct from (select private.current_user_warehouse())
        )
        or (
          (select private.current_user_komtrol_role()) = 'TRABAJADOR'
          and b.created_by = (select auth.uid())
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
        (select private.current_user_komtrol_role()) = 'ADMINISTRADOR'
        or (
          (select private.current_user_komtrol_role()) = 'COORDINADOR'
          and b.warehouse is not distinct from (select private.current_user_warehouse())
        )
        or (
          (select private.current_user_komtrol_role()) = 'TRABAJADOR'
          and b.created_by = (select auth.uid())
        )
      )
  )
);
