-- Push notifications: which phones asked for them, and what was already sent.
-- Run after schema.sql.

create table public.push_subscriptions (
  endpoint text primary key,
  pension_id uuid not null references public.pensions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- one row per notification sent, so overlapping runs never send twice
create table public.push_log (
  pension_id uuid not null references public.pensions (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (pension_id, key)
);

alter table public.push_subscriptions enable row level security;
alter table public.push_log enable row level security;
create policy "own subscriptions" on public.push_subscriptions for select using (user_id = auth.uid());
-- push_log has no policies: only the server function reads and writes it

create function public.save_push_subscription(p_pension uuid, p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_pension) then raise exception 'no access'; end if;
  insert into push_subscriptions (endpoint, pension_id, user_id, p256dh, auth)
    values (p_endpoint, p_pension, auth.uid(), p_p256dh, p_auth)
    on conflict (endpoint) do update set pension_id = excluded.pension_id, user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create function public.delete_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke execute on function public.save_push_subscription(uuid, text, text, text), public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(uuid, text, text, text), public.delete_push_subscription(text) to authenticated;
