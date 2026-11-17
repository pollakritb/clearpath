// Local PGlite only. Rehearse the hosted migration order without production I/O.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const pg = new PGlite();
const migration = (suffix) => {
  const files = readdirSync("supabase/migrations").filter((name) =>
    name.endsWith(`_${suffix}.sql`),
  );
  assert.equal(files.length, 1);
  return readFileSync(`supabase/migrations/${files[0]}`, "utf8");
};
const scalar =
  "public.read_cams_grid_point(bigint,integer,timestamptz,timestamptz)";
const definition = async (signature) =>
  (
    await pg.query("select pg_get_functiondef($1::regprocedure) body", [
      signature,
    ])
  ).rows[0].body;
const transaction = async (sql) => {
  await pg.exec("begin");
  try {
    await pg.exec(sql);
    await pg.exec("commit");
  } catch (error) {
    await pg.exec("rollback");
    throw error;
  }
};

try {
  await pg.exec(
    readFileSync("backend/tests/fixtures/identifiers_baseline.sql", "utf8"),
  );
  await pg.exec(migration("identifier_rollout_control"));
  await pg.exec(migration("readable_identifiers_expand"));
  await pg.exec("update private.identifier_control set maintenance=true");
  await pg.exec(migration("numeric_identifier_cutover"));
  await transaction(migration("private_identifier_aliases"));
  await pg.exec("update private.identifier_control set maintenance=false");
  await pg.exec(
    "create table private.history_retention_state(singleton boolean primary key,last_completed_at timestamptz,result jsonb)",
  );
  await pg.exec(migration("retire_model_feature_storage"));
  // Hosted order: coordinate reader is already present, broad rollout is absent.
  await pg.exec(migration("coordinate_forecast_grid_reader"));
  await pg.exec(
    readFileSync("backend/tests/fixtures/cams_pre_delta.sql", "utf8"),
  );
  const readerBefore = await definition(scalar);
  const publisher = "public.publish_cams_grid(bigint,uuid,jsonb,text)";
  const publisherBefore = await definition(publisher);
  const delta = migration("complete_cams_retention_delta");

  await pg.exec("update private.identifier_control set maintenance=true");
  await assert.rejects(transaction(delta), /identifier_state_changed/);
  await pg.exec("update private.identifier_control set maintenance=false");
  await pg.exec("begin");
  await pg.exec(
    "create or replace function public.identifier_schema_state() returns jsonb language sql stable as $$select '{}'::jsonb$$",
  );
  await assert.rejects(pg.exec(delta), /identifier_state_changed/);
  await pg.exec("rollback");

  await pg.exec(`grant execute on function ${scalar} to anon`);
  await assert.rejects(transaction(delta), /reader_permissions_changed/);
  assert.equal(await definition(publisher), publisherBefore);
  await pg.exec(`revoke execute on function ${scalar} from anon`);

  await pg.exec("begin");
  await pg.exec(`alter function ${scalar} set statement_timeout='1s'`);
  await assert.rejects(
    pg.exec(delta),
    /read_cams_grid_point_definition_changed/,
  );
  await pg.exec("rollback");

  await pg.exec("begin");
  await pg.exec(
    "alter function public.publish_cams_grid(bigint,uuid,jsonb,text) set statement_timeout='1s'",
  );
  await assert.rejects(pg.exec(delta), /publish_cams_grid_definition_changed/);
  await pg.exec("rollback");
  assert.equal(await definition(publisher), publisherBefore);

  // An error after both function replacements must roll back the complete DDL.
  await assert.rejects(
    transaction(delta + "\nselect 1/0;"),
    /division by zero/,
  );
  assert.equal(await definition(publisher), publisherBefore);
  assert.equal(await definition(scalar), readerBefore);

  await transaction(delta);
  assert.equal(await definition(scalar), readerBefore);
  assert.notEqual(await definition(publisher), publisherBefore);
  // Fresh-schema migration chains may already contain the intended definitions.
  await transaction(delta);
  assert.equal(await definition(scalar), readerBefore);
  if (process.argv.includes("--fingerprints")) {
    for (const signature of [
      publisher,
      "private.prune_recent_history(integer)",
    ])
      console.log(
        signature,
        createHash("md5")
          .update(await definition(signature))
          .digest("hex"),
      );
  }
  assert.deepEqual(
    (
      await pg.query(
        `select has_function_privilege('anon',$1,'EXECUTE') anon,
         has_function_privilege('authenticated',$1,'EXECUTE') authenticated,
         has_function_privilege('service_role',$1,'EXECUTE') service`,
        [scalar],
      )
    ).rows[0],
    { anon: false, authenticated: false, service: true },
  );
  await pg.exec(
    "insert into cams_grid_definitions(id,latitudes,longitudes) values('test',array[13.6,14.0],array[100.0,100.4])",
  );
  const generation = async (age) =>
    (
      await pg.query(
        "insert into cams_grid_generations(grid_id,status,started_at,retrieved_at) values('test','ready',now()-$1::interval,now()-$1::interval) returning id",
        [age],
      )
    ).rows[0].id;
  const current = await generation("1 hour");
  const backup = await generation("80 hours");
  const leased = await generation("100 hours");
  const expired = await generation("90 hours");
  const expiredSecond = await generation("95 hours");
  await pg.query("insert into cams_grid_active values(1,$1)", [current]);
  await pg.query(
    `insert into cams_grid_jobs(slot,generation_id,status,batch_count,created_at,lease_until,lease_token)
     values(now(),$1,'running',1,now()-interval '100 hours',now()+interval '5 minutes',gen_random_uuid())`,
    [leased],
  );
  // Realistic account/report references must survive telemetry retention intact.
  const authId = "00000000-0000-0000-0000-000000000001";
  await pg.query("insert into auth.users values($1)", [authId]);
  const owner = (
    await pg.query(
      "insert into profiles(auth_user_id) values($1) returning id",
      [authId],
    )
  ).rows[0].id;
  const capture = (
    await pg.query(
      "insert into capture_sessions(user_id,issued_at,expires_at) values($1,now(),now()+interval '5 minutes') returning id",
      [owner],
    )
  ).rows[0].id;
  await pg.query(
    "insert into community_reports(user_id,capture_session_id,lat,lon,captured_at,status,pm25) values($1,$2,14,100,now(),'approved',25)",
    [owner, capture],
  );
  const beforeReports = (
    await pg.query("select * from community_reports order by id")
  ).rows;
  const beforeProfiles = (await pg.query("select * from profiles order by id"))
    .rows;
  const beforeAliases = (
    await pg.query(
      "select * from private.identifier_aliases where entity in ('profiles','community_reports','capture_sessions') order by entity,numeric_id",
    )
  ).rows;
  await pg.query("select private.prune_recent_history(500)");
  const retained = (
    await pg.query("select id from cams_grid_generations order by id")
  ).rows.map((row) => row.id);
  // One expired generation maximum per call, not an unbounded cascade sweep.
  assert.deepEqual(retained, [current, backup, leased, expired]);
  assert(!retained.includes(expiredSecond));
  await pg.query("select private.prune_recent_history(500)");
  assert.deepEqual(
    (
      await pg.query("select id from cams_grid_generations order by id")
    ).rows.map((row) => row.id),
    [current, backup, leased],
  );
  assert.deepEqual(
    (await pg.query("select * from community_reports order by id")).rows,
    beforeReports,
  );
  assert.deepEqual(
    (await pg.query("select * from profiles order by id")).rows,
    beforeProfiles,
  );
  assert.deepEqual(
    (
      await pg.query(
        "select * from private.identifier_aliases where entity in ('profiles','community_reports','capture_sessions') order by entity,numeric_id",
      )
    ).rows,
    beforeAliases,
  );

  const token = "00000000-0000-0000-0000-000000000010";
  const draft = (
    await pg.query(
      "insert into cams_grid_generations(grid_id,status,started_at) values('test','staging',now()) returning id",
    )
  ).rows[0].id;
  const job = (
    await pg.query(
      `insert into cams_grid_jobs(slot,generation_id,status,batch_count,next_batch,lease_token,lease_until)
      values(now()+interval '6 hours',$1,'running',1,1,$2,now()+interval '5 minutes') returning id`,
      [draft, token],
    )
  ).rows[0].id;
  await pg.query(
    "insert into cams_grid_chunks(job_id,batch_index,payload) values($1,0,'{}')",
    [job],
  );
  const firstTime = new Date(Date.now() + 3600000).toISOString();
  const secondTime = new Date(Date.now() + 7200000).toISOString();
  const publish = (frames, fingerprint = "local-test") =>
    pg.query("select publish_cams_grid($1,$2,$3,$4) result", [
      job,
      token,
      JSON.stringify(frames),
      fingerprint,
    ]);
  const valid = { valid_at: firstTime, values: [10, null, 30, 40] };
  // The first frame is inserted before the invalid second frame. SQL atomicity
  // must remove it and preserve both the old active pointer and recoverable job.
  await assert.rejects(
    publish([valid, { valid_at: secondTime, values: [1, 2] }]),
    /grid_frame_shape_invalid/,
  );
  assert.equal(
    (await pg.query("select generation_id from cams_grid_active where id=1"))
      .rows[0].generation_id,
    current,
  );
  assert.equal(
    (
      await pg.query(
        "select count(*) n from cams_grid_frames where generation_id=$1",
        [draft],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (await pg.query("select status from cams_grid_jobs where id=$1", [job]))
      .rows[0].status,
    "running",
  );
  await pg.query(
    "update cams_grid_jobs set lease_until=now()-interval '1 second' where id=$1",
    [job],
  );
  await assert.rejects(publish([valid]), /grid_incomplete_or_lease_lost/);
  await pg.query(
    "update cams_grid_jobs set lease_until=now()+interval '5 minutes' where id=$1",
    [job],
  );
  assert.equal((await publish([valid])).rows[0].result.status, "ready");
  assert.equal(
    (await pg.query("select generation_id from cams_grid_active where id=1"))
      .rows[0].generation_id,
    draft,
  );
  assert.deepEqual(
    (
      await pg.query(
        "select values from cams_grid_frames where generation_id=$1",
        [draft],
      )
    ).rows[0].values,
    [10, null, 30, 40],
  );
  assert.equal(
    (
      await pg.query(
        "select count(*) n from cams_grid_chunks where job_id=$1",
        [job],
      )
    ).rows[0].n,
    0,
  );
  // Publishing may not bulk-delete old data. Retention alone owns that work.
  assert.equal(
    (
      await pg.query(
        "select count(*) n from cams_grid_generations where id=$1",
        [leased],
      )
    ).rows[0].n,
    1,
  );
  await pg.exec("set role anon");
  await assert.rejects(
    pg.query("select private.prune_recent_history(500)"),
    /permission denied/,
  );
  await pg.exec("reset role");
  console.log(
    "PASS: hosted-order delta, guards, DDL rollback, atomic publication, expired leases, unchanged reader/user data, bounded protected retention",
  );
} finally {
  await pg.close();
}
