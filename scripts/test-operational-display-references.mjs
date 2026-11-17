// Isolated local PostgreSQL. UUID/Auth/PK/FK identities must not change.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const pg = new PGlite();
const migration = (suffix) =>
  readFileSync(
    "supabase/migrations/" +
      readdirSync("supabase/migrations").find((n) =>
        n.endsWith("_" + suffix + ".sql"),
      ),
    "utf8",
  );
try {
  await pg.exec(
    readFileSync("backend/tests/fixtures/identifiers_baseline.sql", "utf8"),
  );
  await pg.exec(migration("identifier_rollout_control"));
  await pg.exec(migration("readable_identifiers_expand"));
  await pg.exec("update private.identifier_control set maintenance=true");
  await pg.exec(migration("numeric_identifier_cutover"));
  await pg.exec("begin");
  await pg.exec(migration("private_identifier_aliases"));
  await pg.exec("commit");
  await pg.exec("update private.identifier_control set maintenance=false");
  await pg.exec(migration("registered_measurement_locations"));
  await pg.exec(
    "alter table report_reactions add column reason_code text;alter table report_reactions add column geofence_policy text",
  );
  await pg.exec(migration("contribution_v3_prerequisites"));
  // Exercise the actual privacy lifecycle, not a simplified privacy table.
  await pg.exec(migration("community_identity_preferences"));
  await pg.exec(migration("line_nearest_pin_notifications"));
  await pg.exec(migration("account_erasure_lifecycle"));
  await pg.exec(migration("account_erasure_identity_guard_fix"));
  await pg.exec(migration("account_erasure_comment_scope"));
  await pg.exec(migration("account_closure_retention_fix"));
  const auth = "00000000-0000-0000-0000-000000000001";
  await pg.query("insert into auth.users values($1)", [auth]);
  const owner = (
    await pg.query(
      "insert into profiles(auth_user_id) values($1) returning id",
      [auth],
    )
  ).rows[0].id;
  const cap = (
    await pg.query(
      "insert into capture_sessions(user_id,issued_at,expires_at) values($1,now(),now()+interval '1 hour') returning id",
      [owner],
    )
  ).rows[0].id;
  const report = (
    await pg.query(
      "insert into community_reports(user_id,capture_session_id,lat,lon,captured_at,status,pm25) values($1,$2,14,100,now(),'approved',25) returning id",
      [owner, cap],
    )
  ).rows[0].id;
  const insert = {
    account_privacy_requests: () =>
      pg.query(
        "insert into account_privacy_requests(user_id) values($1) returning *",
        [owner],
      ),
    community_coverage_missions: () =>
      pg.query(
        "insert into community_coverage_missions(area_key,place_name,lat,lon,expires_at,inputs) values(gen_random_uuid()::text,'Local fixture',14,100,now()+interval '1 day','{}') returning *",
      ),
    community_device_evaluations: () =>
      pg.query(
        "insert into community_device_evaluations(user_id,report_id,source_key,method,reference_instrument,evaluated_at,valid_until,conditions,provenance,evaluation_key) values($1,$2,'fixture','fixture','fixture',now(),now()+interval '1 day','{}','fixture',gen_random_uuid()::text) returning *",
        [owner, report],
      ),
    community_evidence_outcomes: () =>
      pg.query(
        "insert into community_evidence_outcomes(user_id,report_id,scope,outcome,evaluation_key,provenance,policy_version) values($1,$2,'image','pass',gen_random_uuid()::text,'fixture','fixture') returning *",
        [owner, report],
      ),
    measurement_notification_batches: () =>
      pg.query(
        "insert into measurement_notification_batches(user_id) values($1) returning *",
        [owner],
      ),
  };
  const prefixes = {
    account_privacy_requests: "APR",
    community_coverage_missions: "MSN",
    community_device_evaluations: "DVE",
    community_evidence_outcomes: "EVO",
    measurement_notification_batches: "NBT",
  };
  const existing = {};
  for (const [table, fn] of Object.entries(insert))
    existing[table] = (await fn()).rows[0];
  const identities = (await pg.query("select id,auth_user_id from profiles"))
    .rows;
  const constraints = () =>
    pg.query(
      "select conname,pg_get_constraintdef(oid) definition from pg_constraint where contype in ('p','f') order by conname,definition",
    );
  const beforeConstraints = (await constraints()).rows;
  const sql = migration("add_operational_display_references");
  // Failure after DDL must remove the new schema objects as one transaction.
  await pg.exec("begin");
  await pg.exec(sql);
  await assert.rejects(pg.query("select 1/0"), /division by zero/);
  await pg.exec("rollback");
  assert.equal(
    (
      await pg.query(
        "select count(*) n from information_schema.columns where table_schema='public' and table_name='account_privacy_requests' and column_name='code'",
      )
    ).rows[0].n,
    0,
  );
  await pg.exec("begin");
  await pg.exec(sql);
  await pg.exec("commit");
  assert.deepEqual((await constraints()).rows, beforeConstraints);
  for (const [table, row] of Object.entries(existing)) {
    const after = (
      await pg.query(`select * from ${table} where id=$1`, [row.id])
    ).rows[0];
    assert.equal(after.code, null);
    delete after.code;
    assert.deepEqual(after, row);
    assert.equal(
      (
        await pg.query(
          "select private.backfill_operational_references($1,1) n",
          [table],
        )
      ).rows[0].n,
      1,
    );
    const coded = (
      await pg.query(`select * from ${table} where id=$1`, [row.id])
    ).rows[0];
    assert.equal(coded.code, prefixes[table] + "-000001");
    delete coded.code;
    assert.deepEqual(coded, row);
    assert.equal(
      (
        await pg.query(
          "select private.backfill_operational_references($1,1) n",
          [table],
        )
      ).rows[0].n,
      0,
    );
    await assert.rejects(
      pg.query(`update ${table} set code='FORGED-000001' where id=$1`, [
        row.id,
      ]),
      /reference_immutable/,
    );
  }
  assert.deepEqual(
    (await pg.query("select id,auth_user_id from profiles")).rows,
    identities,
  );
  await assert.rejects(
    pg.query("select private.backfill_operational_references('profiles',500)"),
    /reference_table_invalid/,
  );
  await assert.rejects(
    pg.query("select private.backfill_operational_references(null,500)"),
    /reference_table_invalid/,
  );
  // Simulate pre-migration/restore rows inside this disposable local database.
  await pg.exec(
    "alter table measurement_notification_batches disable trigger assign_operational_reference",
  );
  await pg.query(
    "insert into measurement_notification_batches(user_id) select $1 from generate_series(1,505)",
    [owner],
  );
  await pg.exec(
    "alter table measurement_notification_batches enable trigger assign_operational_reference",
  );
  assert.equal(
    (
      await pg.query(
        "select private.backfill_operational_references('measurement_notification_batches',999999) n",
      )
    ).rows[0].n,
    500,
  );
  assert.equal(
    (
      await pg.query(
        "select private.backfill_operational_references('measurement_notification_batches',100) n",
      )
    ).rows[0].n,
    5,
  );
  assert.equal(
    (
      await pg.query(
        "select private.backfill_operational_references('measurement_notification_batches',100) n",
      )
    ).rows[0].n,
    0,
  );
  // New references allocate server-side, ignoring caller-selected identity.
  await pg.exec("set role service_role");
  const fresh = (await insert.measurement_notification_batches()).rows[0];
  assert.equal(fresh.code, "NBT-000507");
  const forged = (
    await pg.query(
      "insert into measurement_notification_batches(user_id,code) values($1,'NBT-000001') returning code",
      [owner],
    )
  ).rows[0];
  assert.equal(forged.code, "NBT-000508");
  await assert.rejects(
    pg.query(
      "select private.backfill_operational_references('measurement_notification_batches',1)",
    ),
    /permission denied/,
  );
  await pg.exec("reset role");
  await pg.query(
    "select setval('private.measurement_notification_batches_reference_seq',999999,true)",
  );
  assert.equal(
    (await insert.measurement_notification_batches()).rows[0].code,
    "NBT-1000000",
  );
  // Readable references do not grant browser access to restricted records.
  for (const role of ["anon", "authenticated"]) {
    await pg.exec(`set role ${role}`);
    for (const table of Object.keys(insert))
      await assert.rejects(
        pg.query(`select code from ${table}`),
        /permission denied/,
      );
    await pg.exec("reset role");
  }
  // The real erasure RPC must retain its opaque UUID contract and stable code
  // across retries, Auth removal and completion. No external Auth call occurs.
  await pg.query(
    "update account_privacy_requests set status='cancelled' where user_id=$1",
    [owner],
  );
  const requested = (
    await pg.query("select request_account_erasure($1) result", [owner])
  ).rows[0].result;
  assert.equal(requested.status, "processing");
  assert.match(requested.id, /^[0-9a-f-]{36}$/);
  assert.equal(requested.code, "APR-000002");
  const retry = (
    await pg.query("select request_account_erasure($1) result", [owner])
  ).rows[0].result;
  assert.deepEqual(retry, requested);
  await assert.rejects(
    pg.query("select complete_account_erasure($1)", [requested.id]),
    /auth_deletion_not_completed/,
  );
  await pg.query("delete from auth.users where id=$1", [auth]);
  const completed = (
    await pg.query("select complete_account_erasure($1) result", [requested.id])
  ).rows[0].result;
  assert.equal(completed.status, "completed");
  assert.equal(completed.id, requested.id);
  assert.equal(completed.code, requested.code);
  assert.equal(
    (
      await pg.query("select complete_account_erasure($1) result", [
        requested.id,
      ])
    ).rows[0].result.code,
    requested.code,
  );
  console.log(
    "PASS: five references, DDL rollback, UUID/PK/FK/Auth preservation, bounded resume, immutability, role isolation, >6 digits, actual erasure RPC retry/completion",
  );
} finally {
  await pg.close();
}
