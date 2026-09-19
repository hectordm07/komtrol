-- Store creator display name in Kardex rows so history can respect normal RLS.

alter table public.surplus_kardex_movements
  add column if not exists created_by_name text;

update public.surplus_kardex_movements m
set created_by_name = coalesce(up.full_name,'Usuario KOMTROL')
from public.user_profiles up
where up.user_id=m.created_by
  and (m.created_by_name is null or trim(m.created_by_name)='');

create or replace function private.populate_surplus_kardex_creator_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    select coalesce(up.full_name,'Usuario KOMTROL')
    into new.created_by_name
    from public.user_profiles up
    where up.user_id=new.created_by
    limit 1;
  end if;

  if new.created_by_name is null then
    new.created_by_name := 'Usuario KOMTROL';
  end if;

  return new;
end;
$$;

revoke all on function private.populate_surplus_kardex_creator_name() from public;
revoke all on function private.populate_surplus_kardex_creator_name() from anon;
revoke all on function private.populate_surplus_kardex_creator_name() from authenticated;

drop trigger if exists trg_surplus_kardex_creator_name on public.surplus_kardex_movements;
create trigger trg_surplus_kardex_creator_name
before insert or update of created_by
on public.surplus_kardex_movements
for each row
execute function private.populate_surplus_kardex_creator_name();

drop function if exists public.get_surplus_material_history(text,text);
