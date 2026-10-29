import type { MeasurementRequestView } from "@/frontend/types";

export const REQUESTS_CHANGED = "clearpath:measurement-requests-changed";

export function announceRequestUpdate(request: MeasurementRequestView) {
  window.dispatchEvent(
    new CustomEvent(REQUESTS_CHANGED, { detail: { request } }),
  );
}
