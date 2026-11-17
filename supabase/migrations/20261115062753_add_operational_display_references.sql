-- LOCAL CANDIDATE ONLY: additive references, not a PK/FK conversion.
-- No row backfill during apply. Existing rows remain NULL until separately batched.
-- Hosted apply requires the verified Mac recovery copy and measured headroom.
set local lock_timeout='5s';
set local statement_timeout='30s';

create function private.assign_operational_reference() returns trigger
language plpgsql security invoker set search_path='' as $$
declare prefix text; serial bigint;
begin
 if tg_table_schema <> 'public' then raise exception 'reference_table_invalid'; end if;
 prefix := case tg_table_name
  when 'account_privacy_requests' then 'APR'
  when 'community_coverage_missions' then 'MSN'
  when 'community_device_evaluations' then 'DVE'
  when 'community_evidence_outcomes' then 'EVO'
  when 'measurement_notification_batches' then 'NBT'
  else null end;
 if prefix is null then raise exception 'reference_table_invalid'; end if;
 if tg_op='UPDATE' and old.code is not null then
  if new.code is distinct from old.code then raise exception 'reference_immutable'; end if;
  return new;
 end if;
 -- Caller-supplied codes never select an identity or override allocation.
 serial := nextval(('private.'||tg_table_name||'_reference_seq')::regclass);
 new.code := prefix||'-'||lpad(serial::text,greatest(6,length(serial::text)),'0');
 return new;
end $$;
revoke all on function private.assign_operational_reference() from public,anon,authenticated,service_role;

do $ddl$
declare item record;
begin
 for item in select * from (values
  ('account_privacy_requests','APR'),('community_coverage_missions','MSN'),
  ('community_device_evaluations','DVE'),('community_evidence_outcomes','EVO'),
  ('measurement_notification_batches','NBT')
 ) as refs(table_name,prefix) loop
  -- Adding a nullable column with no default avoids a data rewrite/backfill.
  execute format('alter table public.%I add column code text',item.table_name);
  execute format('create sequence private.%I as bigint',item.table_name||'_reference_seq');
  execute format('revoke all on sequence private.%I from public,anon,authenticated',item.table_name||'_reference_seq');
  execute format('grant usage on sequence private.%I to service_role',item.table_name||'_reference_seq');
  execute format('alter table public.%I add constraint %I check(code is null or code ~ %L)',
   item.table_name,item.table_name||'_reference_format','^'||item.prefix||'-[0-9]{6,19}$');
  execute format('create unique index %I on public.%I(code) where code is not null',item.table_name||'_reference_unique',item.table_name);
  execute format('create trigger assign_operational_reference before insert or update on public.%I for each row execute function private.assign_operational_reference()',item.table_name);
 end loop;
end $ddl$;

-- Internal operator helper. Not callable through the browser or service API.
-- It only touches a fixed entity allowlist, at most 500 missing references/call.
create function private.backfill_operational_references(p_table text,p_limit integer default 100)
returns integer language plpgsql security invoker set search_path='' as $$
declare n integer; batch integer;
begin
 if p_table is null or p_table not in ('account_privacy_requests','community_coverage_missions',
  'community_device_evaluations','community_evidence_outcomes','measurement_notification_batches') then
  raise exception 'reference_table_invalid';
 end if;
 batch := greatest(1,least(coalesce(p_limit,100),500));
 execute format('with targets as (select id from public.%I where code is null order by id limit $1 for update skip locked)
  update public.%I t set code=t.code from targets x where t.id=x.id',p_table,p_table) using batch;
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function private.backfill_operational_references(text,integer) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
