"use client";
import { useEffect, useState } from "react";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { XPAdminOverview } from "@/frontend/types/xp";
export default function AdminXPPanel() {
  const [data, setData] = useState<XPAdminOverview | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
  async function reverse() {
    if (!selected || reason.trim().length < 10) return;
    setBusy(true);
    try {
      await api.reverseXP(selected, reason.trim());
      setData(await api.xpAdminOverview());
      setSelected(null);
      setReason("");
    } catch (e) {
      setError(apiErrorMessage(e, "ยกเลิกคะแนนไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cp-xp">
      <h2>ตรวจสอบคะแนนการมีส่วนร่วม</h2>
      <p>
        ยกเลิกเฉพาะ XP ที่ตรวจพบการทุจริต ไม่เปลี่ยนการเผยแพร่รายงานหรือ Trust
      </p>
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
              {e.points > 0 && !e.reversed ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSelected(e.id);
                    setReason("");
                  }}
                >
                  ตรวจและยกเลิก XP
                </button>
              ) : e.reversed ? (
                <small>ยกเลิกแล้ว</small>
              ) : null}
            </div>
          ))}
        </>
      )}
      {selected && (
        <div>
          <label>
            เหตุผลที่ยืนยันว่าคะแนนนี้ไม่ถูกต้อง
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={10}
              maxLength={500}
            />
          </label>
          <button
            type="button"
            disabled={busy || reason.trim().length < 10}
            onClick={() => void reverse()}
          >
            บันทึกการยกเลิกคะแนน
          </button>
          <button type="button" onClick={() => setSelected(null)}>
            ปิด
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
