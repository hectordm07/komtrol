-- Import the user's inventory workbook as replenishment receipts. The whole
-- workbook succeeds or fails in one transaction, and guides are deduplicated.
create or replace function public.import_replenishment_verification(
  p_groups jsonb, p_warehouse text, p_supplier text default 'POR_VALIDAR'
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  user_id uuid := auth.uid();
  user_role text := (select private.current_user_komtrol_role());
  user_warehouse text := (select private.current_user_warehouse());
  warehouse_name text := upper(trim(p_warehouse));
  group_row jsonb;
  line_row jsonb;
  ingress_id uuid;
  receipt_id uuid;
  stock text;
  bin_location text;
  created_count integer := 0;
  skipped_count integer := 0;
  line_no integer;
  guide_no text;
  receipt_date date;
begin
  if user_id is null or user_role not in ('ADMINISTRADOR','COORDINADOR','TRABAJADOR') then
    raise exception 'Perfil sin permiso para importar verificaciones';
  end if;
  if warehouse_name is null or warehouse_name = '' or (user_role <> 'ADMINISTRADOR' and warehouse_name <> upper(coalesce(user_warehouse,''))) then
    raise exception 'Solo puedes importar registros de tu almacén';
  end if;
  if p_supplier not in ('KOMATSU','CUMMINS','POR_VALIDAR') then
    raise exception 'Proveedor no válido';
  end if;
  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 or jsonb_array_length(p_groups) > 100 then
    raise exception 'El archivo debe tener entre 1 y 100 guías';
  end if;

  for group_row in select value from jsonb_array_elements(p_groups) loop
    guide_no := upper(trim(coalesce(group_row->>'guide_no','')));
    if guide_no = '' or jsonb_typeof(group_row->'lines') <> 'array'
      or jsonb_array_length(group_row->'lines') = 0 or jsonb_array_length(group_row->'lines') > 500 then
      raise exception 'Guía o líneas inválidas en el archivo';
    end if;
    receipt_date := coalesce(nullif(group_row->>'receipt_date','')::date,current_date);
    if exists (select 1 from public.replenishment_receipts r
      where upper(coalesce(r.guide_no,'')) = guide_no and upper(coalesce(r.warehouse,'')) = warehouse_name) then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    insert into public.replenishment_ingresses(ingress_date,supplier,warehouse)
    values (receipt_date,p_supplier,warehouse_name)
    on conflict (ingress_date,supplier,warehouse) do update set updated_at=now()
    returning id into ingress_id;

    insert into public.replenishment_receipts(
      receipt_date,supplier,guide_no,warehouse,source,line_count,notes,created_by,ingress_id
    ) values (
      receipt_date,p_supplier,guide_no,warehouse_name,'CARGA_MASIVA',
      jsonb_array_length(group_row->'lines'),
      'Importado desde formato de verificación de inventario',user_id,ingress_id
    ) returning id into receipt_id;

    line_no := 0;
    for line_row in select value from jsonb_array_elements(group_row->'lines') loop
      line_no := line_no + 1;
      if nullif(trim(coalesce(line_row->>'part_no','')),'') is null
        or coalesce((line_row->>'quantity')::numeric,-1) < 0
        or coalesce((line_row->>'quantity_received')::numeric,-1) < 0 then
        raise exception 'Código o cantidades inválidas en guía %',guide_no;
      end if;
      select m.stock_code,m.location into stock,bin_location
      from public.materials m
      where upper(m.material_no) = upper(line_row->>'part_no')
        and (m.warehouse = warehouse_name or m.warehouse is null)
      order by case when m.warehouse = warehouse_name then 0 else 1 end limit 1;
      insert into public.replenishment_receipt_lines(
        receipt_id,line_no,part_no,description,quantity,quantity_received,stock_code,location
      ) values (
        receipt_id,line_no,upper(trim(line_row->>'part_no')),
        nullif(trim(coalesce(line_row->>'description','')),''),
        (line_row->>'quantity')::numeric,(line_row->>'quantity_received')::numeric,
        stock,bin_location
      );
    end loop;
    created_count := created_count + 1;
  end loop;
  return jsonb_build_object('created',created_count,'skipped',skipped_count);
end;
$$;
revoke all on function public.import_replenishment_verification(jsonb,text,text) from public,anon;
grant execute on function public.import_replenishment_verification(jsonb,text,text) to authenticated;
