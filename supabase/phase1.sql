create table if not exists public.allowed_emails (email text primary key);
alter table public.allowed_emails enable row level security;
insert into public.allowed_emails (email) values (lower('YOUR_EMAIL@gmail.com'));

create or replace function public.restrict_signups()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.allowed_emails where email = lower(new.email)) then
    raise exception 'Sign-up not allowed';
  end if;
  return new;
end; $$;

drop trigger if exists restrict_signups on auth.users;
create trigger restrict_signups before insert on auth.users
for each row execute function public.restrict_signups();