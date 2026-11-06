-- Independent reporter audits only. Does not activate any policy or rewrite XP.
create table public.community_reporter_audits (
 audit_key text primary key check(length(audit_key) between 8 and 200),
 case_key text not null check(length(case_key) between 8 and 200),
 sample_key text not null check(length(sample_key) between 8 and 200),
 user_id bigint not null references public.profiles(id),
 report_id bigint not null references public.community_reports(id),
 revision integer not null check(revision between 1 and 10000),
 outcome text not null check(outcome in ('pass','problem','unresolved')),
 fault_domain text not null check(fault_domain in ('reporting','device','system','unknown')),
 evaluator_key text not null check(length(evaluator_key) between 8 and 200),
 evidence_ref text not null check(length(evidence_ref) between 10 and 2000),
 evaluated_at timestamptz not null,
 policy_version text not null default 'reporter-trust-v1' check(policy_version='reporter-trust-v1'),
 payload jsonb not null,
 unique(case_key,revision)
);
create index reporter_audits_user on public.community_reporter_audits(user_id,audit_key);
alter table public.community_reporter_audits enable row level security;
revoke all on public.community_reporter_audits from public,anon,authenticated,service_role;
grant select on public.community_reporter_audits to service_role;

create function public.ingest_reporter_audit(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user bigint; v_report bigint; old public.community_reporter_audits;
 prior public.community_reporter_audits; v_revision integer;
begin
 v_user:=private.identifier_number('profiles',p_payload->>'user_id');
 v_report:=private.identifier_number('community_reports',p_payload->>'report_id');
 if not exists(select 1 from public.community_reports where id=v_report and user_id=v_user) then
  raise exception 'audit_subject_mismatch';
 end if;
 if (p_payload->>'evaluated_at')::timestamptz>now() then raise exception 'future_audit';end if;
 if not p_payload ?& array['audit_key','case_key','sample_key','revision','outcome','fault_domain','evaluator_key','evidence_ref','evaluated_at'] then
  raise exception 'audit_fields_missing';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('reporter-audit:'||(p_payload->>'case_key'),0));
 select * into old from public.community_reporter_audits where audit_key=p_payload->>'audit_key';
 if found then
  if old.payload is distinct from p_payload then raise exception 'audit_key_conflict';end if;
  return old.payload;
 end if;
 select * into prior from public.community_reporter_audits where case_key=p_payload->>'case_key' order by revision desc limit 1;
 v_revision:=(p_payload->>'revision')::integer;
 if found then
  if prior.user_id<>v_user or prior.report_id<>v_report or prior.sample_key<>p_payload->>'sample_key' then raise exception 'audit_case_identity_immutable';end if;
  if v_revision<>prior.revision+1 or (p_payload->>'evaluated_at')::timestamptz<prior.evaluated_at then raise exception 'audit_revision_conflict';end if;
 elsif v_revision<>1 then raise exception 'initial_audit_revision_must_be_one';
 end if;
 insert into public.community_reporter_audits(audit_key,case_key,sample_key,user_id,report_id,revision,outcome,fault_domain,evaluator_key,evidence_ref,evaluated_at,payload)
 values(p_payload->>'audit_key',p_payload->>'case_key',p_payload->>'sample_key',v_user,v_report,v_revision,p_payload->>'outcome',p_payload->>'fault_domain',p_payload->>'evaluator_key',p_payload->>'evidence_ref',(p_payload->>'evaluated_at')::timestamptz,p_payload);
 update public.community_reporter_review_requests r set status='reviewed'
 where r.status='pending' and r.user_id=v_user and exists(
  select 1 from public.community_reporter_audits a where a.audit_key=r.audit_key
  and a.case_key=p_payload->>'case_key' and a.revision<v_revision
 );
 return p_payload;
end $$;
revoke all on function public.ingest_reporter_audit(jsonb) from public,anon,authenticated;
grant execute on function public.ingest_reporter_audit(jsonb) to service_role;

-- Owner may request an independent recheck; this never edits an audit or score.
create table public.community_reporter_review_requests (
 id uuid primary key default gen_random_uuid(),
 user_id bigint not null references public.profiles(id),
 audit_key text not null references public.community_reporter_audits(audit_key),
 message text not null check(length(btrim(message)) between 10 and 1000),
 status text not null default 'pending' check(status in ('pending','reviewed')),
 created_at timestamptz not null default now()
);
create unique index reporter_review_one_pending on public.community_reporter_review_requests(user_id,audit_key) where status='pending';
alter table public.community_reporter_review_requests enable row level security;
revoke all on public.community_reporter_review_requests from public,anon,authenticated,service_role;
grant select on public.community_reporter_review_requests to service_role;
create function public.request_reporter_review(p_user bigint,p_audit text,p_message text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result public.community_reporter_review_requests; a public.community_reporter_audits;
begin
 select * into a from public.community_reporter_audits where audit_key=p_audit and user_id=p_user;
 if not found then raise exception 'review_subject_mismatch';end if;
 perform pg_advisory_xact_lock(hashtextextended('reporter-audit:'||a.case_key,0));
 if exists(select 1 from public.community_reporter_audits where case_key=a.case_key and revision>a.revision) then raise exception 'audit_case_updated';end if;
 perform pg_advisory_xact_lock(hashtextextended('reporter-review:'||p_user||':'||p_audit,0));
 select * into result from public.community_reporter_review_requests where user_id=p_user and audit_key=p_audit and status='pending';
 if not found then
  insert into public.community_reporter_review_requests(user_id,audit_key,message) values(p_user,p_audit,p_message) returning * into result;
 end if;
 return jsonb_build_object('id',result.id,'status',result.status);
end $$;
revoke all on function public.request_reporter_review(bigint,text,text) from public,anon,authenticated;
grant execute on function public.request_reporter_review(bigint,text,text) to service_role;
