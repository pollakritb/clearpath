-- Requests only. No delete, Auth mutation, notification or retention policy change.
create table public.account_privacy_requests (
 id uuid primary key default gen_random_uuid(),
 user_id bigint not null references public.profiles(id),
 status text not null default 'pending' check(status in ('pending','processing','completed','cancelled')),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 check((status='completed')=(completed_at is not null))
);
create unique index account_privacy_one_open on public.account_privacy_requests(user_id) where status in ('pending','processing');
create index account_privacy_owner on public.account_privacy_requests(user_id,created_at desc);
alter table public.account_privacy_requests enable row level security;
revoke all on public.account_privacy_requests from public,anon,authenticated,service_role;
grant select on public.account_privacy_requests to service_role;
create function public.request_account_erasure(p_user bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.account_privacy_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended('account-privacy:'||p_user,0));
 select * into result from public.account_privacy_requests where user_id=p_user and status in ('pending','processing');
 if not found then insert into public.account_privacy_requests(user_id) values(p_user) returning * into result;end if;
 return to_jsonb(result)-'user_id';
end $$;
revoke all on function public.request_account_erasure(bigint) from public,anon,authenticated;
grant execute on function public.request_account_erasure(bigint) to service_role;
