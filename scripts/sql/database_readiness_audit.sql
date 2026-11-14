-- Metadata-only audit. Never includes cron commands, row contents or query text.
select jsonb_build_object(
 'as_of',now(),
 'database_bytes',pg_database_size(current_database()),
 'tables',(select coalesce(jsonb_agg(jsonb_build_object(
   'schema',s.schemaname,'name',s.relname,'estimated_rows',s.n_live_tup,
   'dead_rows',s.n_dead_tup,'total_bytes',pg_total_relation_size(s.relid),
   'index_bytes',pg_indexes_size(s.relid),'last_autovacuum',s.last_autovacuum,
   'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity
  ) order by s.schemaname,s.relname),'[]') from pg_stat_user_tables s join pg_class c on c.oid=s.relid),
 'columns',(select jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name,'name',column_name,'type',data_type,'nullable',is_nullable,'identity',is_identity,'generated',is_generated) order by table_schema,table_name,ordinal_position) from information_schema.columns where table_schema in ('public','private','review','community_trust_private')),
 'constraints',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',t.relname,'name',c.conname,'type',c.contype,'validated',c.convalidated,'definition',pg_get_constraintdef(c.oid))) from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname in ('public','private','community_trust_private')),
 'indexes',(select jsonb_agg(to_jsonb(i)) from pg_indexes i where schemaname in ('public','private','community_trust_private')),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname in ('public','private','review','community_trust_private','storage')),
 'grants',(select jsonb_agg(to_jsonb(g)) from information_schema.role_table_grants g where table_schema in ('public','private','review','community_trust_private')),
 'routines',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','community_trust_private') and p.prokind='f'),
 'migrations',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
 'cron',(select jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active)) from cron.job),
 'connections',(select jsonb_agg(t) from (select state,count(*) from pg_stat_activity where datname=current_database() group by state)t),
 'long_transactions',(select count(*) from pg_stat_activity where datname=current_database() and xact_start<now()-interval '1 minute' and pid<>pg_backend_pid()),
 'ungranted_locks',(select count(*) from pg_locks where not granted),
 'storage',(select jsonb_build_object('objects',count(*),'bytes',coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0)) from storage.objects),
 'buckets',(select jsonb_agg(jsonb_build_object('name',name,'public',public)) from storage.buckets),
 'active_grid',(select jsonb_build_object('id',g.id,'retrieved_at',g.retrieved_at,'times',cardinality(g.valid_times),'last_time',g.valid_times[cardinality(g.valid_times)]) from public.cams_grid_active a join public.cams_grid_generations g on g.id=a.generation_id)
) audit;
