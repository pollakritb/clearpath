"use client";
import { useEffect, useState } from "react";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { XPAdminOverview } from "@/frontend/types/xp";
export default function AdminXPPanel() {
  const [data, setData] = useState<XPAdminOverview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api
      .xpAdminOverview()
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(apiErrorMessage(e, "โหลดคะแนนไม่สำเร็จ"));
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="cp-xp">
      <h2>ตรวจสอบคะแนนการมีส่วนร่วม</h2>
      <p>ดูคะแนน งานค้าง และประวัติการให้ XP</p>
      {data && (
        <>
          <p>
            งานค้าง {data.pending_jobs} · บัญชี {data.accounts} ·
            คู่ช่วยซ้ำถึงเพดาน {data.repeated_pairs}
          </p>
          <details>
            <summary>เหตุผลที่ไม่ได้ XP ใน 7 วัน</summary>
            {Object.entries(data.zero_reasons).map(([key, n]) => (
              <p key={key}>
                {key}: {n}
              </p>
            ))}
          </details>
          {data.events.map((e) => (
            <div key={e.id} className="cp-xp-event">
              <span>
                <strong>
                  {e.kind} · {e.points} XP
                </strong>
                <small>
                  {e.user_id} · {e.reason} ·{" "}
                  {new Date(e.recorded_at).toLocaleString("th-TH")}
                </small>
              </span>
              {e.reversed && <small>ยกเลิกแล้ว</small>}
            </div>
          ))}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
