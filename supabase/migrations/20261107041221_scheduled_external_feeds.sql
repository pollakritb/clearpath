-- Server-only metadata and durable snapshots. Public clients read the FastAPI API.
begin;

create table public.external_news_items (
  id text primary key,
  guid text not null unique,
  source_url text not null unique check (source_url ~ '^https://'),
  title text not null check (length(title) between 1 and 2000),
  source_name text not null check (length(source_name) between 1 and 500),
  published_at timestamptz not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index external_news_published_idx on public.external_news_items (published_at desc, id);
create index external_news_last_seen_idx on public.external_news_items (last_seen_at);

create table public.external_feed_sources (
  source text primary key check (source in ('google_news', 'nasa_firms')),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  first_attempt_at timestamptz,
  last_success_at timestamptz,
  checked_at timestamptz,
  failures integer not null default 0 check (failures >= 0),
  last_error text,
  lease_token uuid,
  lease_until timestamptz,
  validators jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb
);
insert into public.external_feed_sources(source) values ('google_news'), ('nasa_firms');

create table public.external_feed_runs (
  id bigint generated always as identity primary key,
  source text not null references public.external_feed_sources(source),
  token uuid not null unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('running','success','failed')),
  received_count integer not null default 0,
  filtered_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  duplicate_count integer not null default 0,
  not_modified boolean not null default false,
  error_code text
);
create index external_feed_runs_started_idx on public.external_feed_runs (started_at);

alter table public.external_news_items enable row level security;
alter table public.external_feed_sources enable row level security;
alter table public.external_feed_runs enable row level security;
revoke all on public.external_news_items, public.external_feed_sources, public.external_feed_runs from public, anon, authenticated;
grant select, insert, update, delete on public.external_news_items, public.external_feed_sources, public.external_feed_runs to service_role;
grant usage, select on sequence public.external_feed_runs_id_seq to service_role;

-- Row lock + durable lease prevent concurrent scheduler requests from fetching twice.
create function public.claim_external_feed(p_source text, p_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.external_feed_sources%rowtype;
begin
  select * into s from public.external_feed_sources where source = p_source for update;
  if not found then raise exception 'unknown_feed'; end if;
  if s.lease_until > now() then return jsonb_build_object('status','in_progress'); end if;
  if s.next_attempt_at > now() then return jsonb_build_object('status','not_due'); end if;
  update public.external_feed_runs set status='failed', completed_at=now(), error_code='lease_expired'
    where source=p_source and status='running';
  update public.external_feed_sources set lease_token=p_token, lease_until=now()+interval '2 minutes', last_attempt_at=now(), first_attempt_at=coalesce(first_attempt_at,now())
    where source=p_source;
  insert into public.external_feed_runs(source,token,status) values(p_source,p_token,'running');
  return jsonb_build_object('status','claimed','validators',s.validators);
end $$;

-- Publication and run status commit together. A failed fetch never replaces good data.
create function public.finish_external_feed(p_source text, p_token uuid, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s public.external_feed_sources%rowtype;
  item jsonb;
  existing public.external_news_items%rowtype;
  n_insert integer := 0;
  n_update integer := 0;
  n_duplicate integer := 0;
  n_failed integer;
  next_time timestamptz;
  cadence interval;
  changed boolean;
begin
  select * into s from public.external_feed_sources where source=p_source for update;
  if not found or s.lease_token is distinct from p_token or s.lease_until <= now() then
    return jsonb_build_object('status','lease_lost');
  end if;
  cadence := case when p_source='google_news' then interval '1 hour' else interval '30 minutes' end;
  if coalesce((p_payload->>'ok')::boolean,false) then
    if p_source='nasa_firms' and (jsonb_typeof(p_payload->'snapshot') is distinct from 'object' or jsonb_typeof(p_payload->'snapshot'->'fires') is distinct from 'array') then
      raise exception 'invalid_hotspot_snapshot';
    end if;
    if p_source='google_news' and not coalesce((p_payload->>'not_modified')::boolean,false) then
      if jsonb_typeof(p_payload->'items') is distinct from 'array' then raise exception 'invalid_news_items'; end if;
      for item in select value from jsonb_array_elements(p_payload->'items') loop
        select * into existing from public.external_news_items
          where guid=item->>'guid' or source_url=item->>'source_url'
          order by first_seen_at, id limit 1;
        if found then
          changed := (existing.title,existing.source_name,existing.published_at,existing.source_url)
            is distinct from (item->>'title',item->>'source_name',(item->>'published_at')::timestamptz,item->>'source_url');
          update public.external_news_items set
            title=item->>'title', source_name=item->>'source_name',
            source_url=case when exists(select 1 from public.external_news_items other where other.source_url=item->>'source_url' and other.id<>existing.id) then existing.source_url else item->>'source_url' end,
            published_at=(item->>'published_at')::timestamptz,
            last_seen_at=now(), updated_at=case when changed then now() else updated_at end
            where id=existing.id;
          if changed then n_update:=n_update+1; else n_duplicate:=n_duplicate+1; end if;
        else
          insert into public.external_news_items(id,guid,source_url,title,source_name,published_at)
            values(item->>'id',item->>'guid',item->>'source_url',item->>'title',item->>'source_name',(item->>'published_at')::timestamptz);
          n_insert:=n_insert+1;
        end if;
      end loop;
    end if;
    next_time := case when p_source='google_news' then date_trunc('hour',now()) + interval '1 hour'
      else date_trunc('hour',now()) + (floor(extract(minute from now())/30)::integer+1)*interval '30 minutes' end;
    update public.external_feed_sources set last_success_at=now(), checked_at=now(), failures=0, last_error=null,
      next_attempt_at=next_time, lease_token=null, lease_until=null,
      validators=coalesce(p_payload->'validators', validators),
      snapshot=coalesce(p_payload->'snapshot', snapshot) where source=p_source;
  else
    n_failed:=s.failures+1;
    next_time:=date_trunc('hour',now()) + floor(extract(minute from now())/5)::integer*interval '5 minutes'
      +case when n_failed=1 then interval '5 minutes' when n_failed=2 then interval '15 minutes' else cadence end;
    update public.external_feed_sources set failures=n_failed, last_error=left(p_payload->>'error_code',100),
      next_attempt_at=next_time, lease_token=null, lease_until=null where source=p_source;
  end if;
  update public.external_feed_runs set completed_at=now(),
    status=case when coalesce((p_payload->>'ok')::boolean,false) then 'success' else 'failed' end,
    received_count=coalesce((p_payload->>'received_count')::integer,0),
    filtered_count=coalesce((p_payload->>'filtered_count')::integer,0),
    inserted_count=n_insert, updated_count=n_update, duplicate_count=n_duplicate,
    not_modified=coalesce((p_payload->>'not_modified')::boolean,false), error_code=left(p_payload->>'error_code',100)
    where token=p_token;
  -- Bounded retention of metadata/run logs only; original articles are never stored.
  delete from public.external_news_items where published_at < now()-interval '30 days';
  delete from public.external_feed_runs where started_at < now()-interval '30 days';
  return jsonb_build_object('status',case when coalesce((p_payload->>'ok')::boolean,false) then 'success' else 'failed' end,
    'inserted',n_insert,'updated',n_update,'duplicates',n_duplicate,'next_attempt_at',next_time);
end $$;
revoke all on function public.claim_external_feed(text,uuid) from public, anon, authenticated;
revoke all on function public.finish_external_feed(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.claim_external_feed(text,uuid), public.finish_external_feed(text,uuid,jsonb) to service_role;
-- JSON aggregation avoids PostgREST's row cap when merging with internal notices.
create function public.list_external_news(p_limit integer default 100)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(n) order by n.published_at desc, n.id), '[]'::jsonb)
  from (select id,title,source_name,source_url,published_at,first_seen_at,updated_at
    from public.external_news_items where published_at >= now()-interval '7 days'
    order by published_at desc,id limit least(greatest(p_limit,1),10011)) n;
$$;
revoke all on function public.list_external_news(integer) from public,anon,authenticated;
grant execute on function public.list_external_news(integer) to service_role;
commit;
