alter table public.user_profiles
  add column if not exists username text;

create or replace function private.komtrol_username_from_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  with parts as (
    select regexp_split_to_array(
      trim(regexp_replace(coalesce(p_name,''), '\\s+', ' ', 'g')),
      '\\s+'
    ) as a
  ),
  picked as (
    select
      coalesce(a[1], '') as first_name,
      case
        when array_length(a,1) >= 3 then a[array_length(a,1)-1]
        when array_length(a,1) = 2 then a[2]
        else ''
      end as first_surname
    from parts
  )
  select trim(both '.' from lower(
    regexp_replace(
      translate(first_name, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'),
      '[^A-Za-z0-9]+', '', 'g'
    )
    || case when first_surname <> '' then '.' else '' end ||
    regexp_replace(
      translate(first_surname, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'),
      '[^A-Za-z0-9]+', '', 'g'
    )
  ))
  from picked;
$$;

update public.user_profiles
set username = private.komtrol_username_from_name(full_name)
where username is null or trim(username) = '';

create unique index if not exists user_profiles_username_lower_uidx
  on public.user_profiles (lower(username))
  where username is not null and trim(username) <> '';

create or replace function private.set_komtrol_username()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.username is null or trim(new.username) = '' then
    new.username := private.komtrol_username_from_name(new.full_name);
  else
    new.username := lower(trim(new.username));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_komtrol_username on public.user_profiles;
create trigger trg_set_komtrol_username
before insert or update of username on public.user_profiles
for each row
execute function private.set_komtrol_username();
