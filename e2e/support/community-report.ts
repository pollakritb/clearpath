import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { APIRequestContext } from "@playwright/test";

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

function uniquePngEvidence(value: string): Buffer {
  const image = readFileSync(
    resolve("docs/assets/ui-archive/clearpath-mobile-final.png"),
  );
  const type = Buffer.from("tEXt", "ascii");
  const data = Buffer.from(`clearpath-e2e\0${value}`, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  const chunk = Buffer.concat([length, type, data, checksum]);
  return Buffer.concat([image.subarray(0, -12), chunk, image.subarray(-12)]);
}

export async function createPendingReport(
  request: APIRequestContext,
  options: { deviceModel?: string; pm25?: number } = {},
): Promise<{ id: string; status: string; pm25: number | null }> {
  const sessionResponse = await request.post("/api/community/capture-session");
  if (!sessionResponse.ok()) {
    throw new Error(`capture session failed: ${await sessionResponse.text()}`);
  }
  const session = await sessionResponse.json();
  const evidence = uniquePngEvidence(randomUUID());
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
  if (draftResponse.status() !== 201) {
    throw new Error(`report draft failed: ${await draftResponse.text()}`);
  }
  const draft = await draftResponse.json();
  const submitResponse = await request.post(
    `/api/community/report-drafts/${draft.id}/submit`,
    {
      data: {
        user_claimed_pm25: options.pm25 ?? 42.5,
        hide_identity: true,
        device_model: options.deviceModel ?? "Acceptance Meter",
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
  if (submitResponse.status() !== 201) {
    throw new Error(`report submit failed: ${await submitResponse.text()}`);
  }
  return (await submitResponse.json()).report;
}
