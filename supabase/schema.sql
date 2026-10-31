-- Dog-boarding: one pension = one shared document, readable and editable only by its members.
-- Paste into Supabase → SQL Editor → Run. Safe to run once on an empty project.

create table public.pensions (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'הפנסיון',
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  join_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table public.pension_members (
  pension_id uuid not null references public.pensions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (pension_id, user_id)
);

alter table public.pensions enable row level security;
alter table public.pension_members enable row level security;

create function public.is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pension_members where pension_id = p and user_id = auth.uid())
$$;

create policy "members read pension" on public.pensions for select using (public.is_member(id));
create policy "members read members" on public.pension_members for select using (public.is_member(pension_id));
-- no direct insert/update/delete: everything goes through the functions below

create function public.create_pension(p_name text, p_data jsonb) returns public.pensions
language plpgsql security definer set search_path = public as $$
declare r pensions;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into pensions (name, data, updated_by) values (coalesce(nullif(p_name, ''), 'הפנסיון'), coalesce(p_data, '{}'::jsonb), auth.uid()) returning * into r;
  insert into pension_members (pension_id, user_id, role) values (r.id, auth.uid(), 'owner');
  return r;
end $$;

create function public.join_pension(p_code text) returns public.pensions
language plpgsql security definer set search_path = public as $$
declare r pensions;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into r from pensions where join_code = upper(trim(p_code));
  if r.id is null then raise exception 'wrong code'; end if;
  insert into pension_members (pension_id, user_id) values (r.id, auth.uid()) on conflict do nothing;
  return r;
end $$;

-- Saves only if nobody else saved since p_version. Returns the new version, or -1 on conflict.
create function public.save_pension(p_id uuid, p_data jsonb, p_version bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if not is_member(p_id) then raise exception 'no access'; end if;
  update pensions set data = p_data, version = version + 1, updated_at = now(), updated_by = auth.uid()
    where id = p_id and version = p_version
    returning version into v;
  return coalesce(v, -1);
end $$;

revoke execute on function public.create_pension(text, jsonb), public.join_pension(text), public.save_pension(uuid, jsonb, bigint) from public, anon;
grant execute on function public.create_pension(text, jsonb), public.join_pension(text), public.save_pension(uuid, jsonb, bigint) to authenticated;

-- live updates between Yuval's and Itai's phones
alter publication supabase_realtime add table public.pensions;
