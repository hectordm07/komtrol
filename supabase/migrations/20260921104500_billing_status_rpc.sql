create or replace function public.set_oc_cargo_billing_status(
  p_guide_id uuid,
  p_status text
)
returns public.oc_cargo_followups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_current text;
  v_row public.oc_cargo_followups;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception 'Sesión no válida';
  end if;

  if p_status not in ('PENDIENTE','ENVIADO','OBSERVADO','REENVIADO','CONFIRMADO') then
    raise exception 'Estado de facturación no válido';
  end if;

  select exists (
    select 1
    from public.guides g
    where g.id = p_guide_id
      and g.guide_type in ('ORDEN_COMPRA','CARGO_DIRECTO')
      and (
        g.created_by = v_uid
        or g.responsible_user_id = v_uid
        or (select private.current_user_komtrol_role()) in ('COORDINADOR','SUPERVISOR','ADMINISTRADOR')
        or exists (
          select 1
          from public.user_profiles up
          where up.user_id = v_uid
            and up.active = true
            and up.oc_cargo_access_level = 'DOCUMENTARIO'
        )
      )
  ) into v_allowed;

  if not v_allowed then
    raise exception 'No tienes permiso para actualizar Facturación';
  end if;

  select full_name into v_name
  from public.user_profiles
  where user_id = v_uid;

  select billing_status into v_current
  from public.oc_cargo_followups
  where guide_id = p_guide_id;

  insert into public.oc_cargo_followups (
    guide_id,
    billing_status,
    billing_sent_at,
    billing_sent_by,
    billing_sent_by_name,
    updated_by,
    updated_at
  )
  values (
    p_guide_id,
    p_status,
    case when p_status in ('ENVIADO','REENVIADO') then now() else null end,
    case when p_status in ('ENVIADO','REENVIADO') then v_uid else null end,
    case when p_status in ('ENVIADO','REENVIADO') then coalesce(v_name,'Usuario KOMTROL') else null end,
    v_uid,
    now()
  )
  on conflict (guide_id) do update
  set
    billing_status = excluded.billing_status,
    billing_sent_at = case
      when excluded.billing_status in ('ENVIADO','REENVIADO')
        and public.oc_cargo_followups.billing_status is distinct from excluded.billing_status
        then now()
      else public.oc_cargo_followups.billing_sent_at
    end,
    billing_sent_by = case
      when excluded.billing_status in ('ENVIADO','REENVIADO')
        and public.oc_cargo_followups.billing_status is distinct from excluded.billing_status
        then v_uid
      else public.oc_cargo_followups.billing_sent_by
    end,
    billing_sent_by_name = case
      when excluded.billing_status in ('ENVIADO','REENVIADO')
        and public.oc_cargo_followups.billing_status is distinct from excluded.billing_status
        then coalesce(v_name,'Usuario KOMTROL')
      else public.oc_cargo_followups.billing_sent_by_name
    end,
    updated_by = v_uid,
    updated_at = now()
  returning * into v_row;

  insert into public.guide_history(guide_id, action, note, changed_by)
  values (
    p_guide_id,
    'FACTURACION_ACTUALIZADA',
    'Estado Facturación: ' || p_status,
    v_uid
  );

  return v_row;
end;
$$;

revoke all on function public.set_oc_cargo_billing_status(uuid,text) from public;
grant execute on function public.set_oc_cargo_billing_status(uuid,text) to authenticated;
