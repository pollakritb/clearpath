"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { MeasurementRequestView } from "@/frontend/types";

/** One action from the map, list or detail: claim once, then open reporting. */
export default function HelpRequestButton({
  request,
  now,
}: {
  request: MeasurementRequestView;
  now: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open =
    request.status === "active" && Date.parse(request.starts_at) <= now;
  const continuing =
    request.help_claim && Date.parse(request.help_claim.deadline) > now;
  if (
    (request.status !== "active" && request.status !== "scheduled") ||
    request.is_owner ||
    request.declined ||
    Date.parse(request.expires_at) <= now ||
    (!open && !continuing)
  )
    return null;
  return (
    <div className="cp-help-request">
      <button
        type="button"
        className="cp-measure-primary cp-focus"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            if (request.xp_enabled && !request.automatic_help_enabled)
              await api.claimMeasurementHelp(request.id);
            router.push(`/report?request=${encodeURIComponent(request.id)}`);
          } catch (error) {
            setError(
              apiErrorMessage(error, "เริ่มช่วยวัดไม่สำเร็จ กรุณาลองอีกครั้ง"),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "กำลังเปิดหน้ารายงาน…"
          : continuing
            ? "วัดต่อจากภารกิจเดิม"
            : "ช่วยรายงานค่าฝุ่น"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
