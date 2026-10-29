"use client";
import { requestPlaceParts } from "@/frontend/lib/request-place";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { MeasurementRequestView } from "@/frontend/types";
export default function RequestContext({ requestId }: { requestId: string }) {
  const auth = useAuth();
  const signedIn = Boolean(auth.user || auth.localDemo);
  const account = auth.user?.id ?? (auth.localDemo ? "local" : "guest");
  const [loaded, setLoaded] = useState<{
    account: string;
    requestId: string;
    row: MeasurementRequestView;
  } | null>(null);
  const row =
    loaded?.account === account && loaded.requestId === requestId
      ? loaded.row
      : null;
  const [error, setError] = useState("");
  useEffect(() => {
    if (auth.loading || !signedIn) return;
    let active = true;
    void api
      .measurementRequest(requestId)
      .then((r) => {
        if (active) setLoaded({ account, requestId, row: r });
      })
      .catch((e) => {
        if (active) setError(apiErrorMessage(e, "โหลดคำขอไม่สำเร็จ"));
      });
    return () => {
      active = false;
    };
  }, [requestId, account, signedIn, auth.loading]);
  return (
    <aside className="cp-measure-card">
      {row ? (
        <>
          <strong>
            ช่วยรายงาน · {requestPlaceParts(row.place_name).title}
          </strong>
          {requestPlaceParts(row.place_name).address && (
            <p>{requestPlaceParts(row.place_name).address}</p>
          )}
          <p>
            วง {row.radius_km} กม. · ก่อน{" "}
            {new Date(row.expires_at).toLocaleString("th-TH")}
          </p>
          <small>
            {row.status === "active"
              ? "ระบบใช้เวลาและ GPS ของภาพตรวจพื้นที่อัตโนมัติ ไม่ต้องกรอกเพิ่ม"
              : "คำขอนี้ยังไม่เปิดรับหรือสิ้นสุดแล้ว รายงานยังส่งเข้าชุมชนตามปกติได้"}
          </small>
          <Link href={`/requests/${row.id}`} className="cp-measure-link">
            ดูสถานะคำขอ
          </Link>
        </>
      ) : (
        <p role={error ? "alert" : "status"}>{error || "กำลังโหลดคำขอ…"}</p>
      )}
    </aside>
  );
}
