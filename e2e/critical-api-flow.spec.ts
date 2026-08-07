import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function addPngTextChunk(image: Buffer, value: string): Buffer {
  const type = Buffer.from("tEXt", "ascii");
  const data = Buffer.from(`clearpath-e2e\0${value}`, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  const chunk = Buffer.concat([length, type, data, checksum]);
  return Buffer.concat([image.subarray(0, -12), chunk, image.subarray(-12)]);
}

test("readiness verifies a fresh local source of truth", async ({
  request,
}) => {
  const response = await request.get("/api/ready");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("ready");
  expect(body.fresh_station_count).toBeGreaterThan(0);
});

test("uncertain report remains private and enters the exception queue", async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-360",
    "Stateful submission runs once so duplicate-image protection remains enabled.",
  );
  const sessionResponse = await request.post("/api/community/capture-session");
  expect(sessionResponse.status()).toBe(200);
  const session = await sessionResponse.json();
  const evidence = addPngTextChunk(
    readFileSync(resolve("docs/assets/ui-archive/clearpath-mobile-final.png")),
    randomUUID(),
  );

  const draftResponse = await request.post("/api/community/report-drafts", {
    multipart: {
      lat: "13.8199",
      lon: "100.0622",
      gps_accuracy_m: "15",
      camera_session_token: session.token,
      client_captured_at: session.issued_at,
      image: {
        name: "e2e-meter.png",
        mimeType: "image/png",
        buffer: evidence,
      },
    },
  });
  const draftBody = await draftResponse.text();
  expect(draftResponse.status(), draftBody).toBe(201);
  const draft = JSON.parse(draftBody);
  expect(draft.ocr_available).toBe(false);

  const submitResponse = await request.post(
    `/api/community/report-drafts/${draft.id}/submit`,
    {
      data: {
        user_claimed_pm25: 42.5,
        display_name: "E2E Tester",
        device_model: "Acceptance Meter",
        device_calibrated: true,
        calibrated_at: "2026-07-01",
        measurement_environment: "outdoor",
        measurement_stable: true,
        near_emission_source: false,
        measurement_note: "automated acceptance test",
        averaging_period: "1_minute",
        measurement_duration_seconds: 60,
      },
    },
  );
  const submitBody = await submitResponse.text();
  expect(submitResponse.status(), submitBody).toBe(201);
  const result = JSON.parse(submitBody);
  expect(result.review_outcome).toBe("pending_manual_review");
  expect(result.report.status).toBe("pending");
  expect(result.report.pm25).toBeNull();

  const publicResponse = await request.get("/api/community/reports");
  const publicBody = await publicResponse.json();
  expect(
    publicBody.reports.map((report: { id: string }) => report.id),
  ).not.toContain(result.report.id);

  const adminResponse = await request.get("/api/admin/reports");
  expect(adminResponse.status()).toBe(200);
  const adminBody = await adminResponse.json();
  expect(
    adminBody.reports.map((report: { id: string }) => report.id),
  ).toContain(result.report.id);
});
