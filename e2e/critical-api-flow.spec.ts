import { expect, test } from "@playwright/test";

import { createPendingReport } from "./support/community-report";

test("readiness verifies a fresh local source of truth", async ({
  request,
}) => {
  const response = await request.get("/api/ready");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("ready");
  expect(body.fresh_station_count).toBeGreaterThan(0);
});

test("uncertain report remains private and enters the exception queue @stateful-360", async ({
  request,
}) => {
  const report = await createPendingReport(request);
  expect(report.status).toBe("pending");
  expect(report.pm25).toBeNull();

  const publicResponse = await request.get("/api/community/reports");
  const publicBody = await publicResponse.json();
  expect(
    publicBody.reports.map((report: { id: string }) => report.id),
  ).not.toContain(report.id);

  const adminResponse = await request.get("/api/admin/reports");
  expect(adminResponse.status()).toBe(200);
  const adminBody = await adminResponse.json();
  expect(
    adminBody.reports.map((report: { id: string }) => report.id),
  ).toContain(report.id);
});
