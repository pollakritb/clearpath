"use client";
import { useEffect, useState } from "react";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
export default function CommunityTrustReviews() {
  const [rows, setRows] = useState<
    Awaited<ReturnType<typeof api.adminCommunityTrustReviews>>["requests"]
  >([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    api
      .adminCommunityTrustReviews()
      .then((r) => {
        if (live) {
          setRows(r.requests);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (live) {
          setError(apiErrorMessage(e, "โหลดคำขอทบทวนไม่สำเร็จ"));
          setLoaded(true);
        }
      });
    return () => {
      live = false;
    };
  }, [reload]);
  return (
    <section className="cp-admin-card">
      <h3>คำขอทบทวน Trust ชุมชน</h3>
      <p>
        อ่านอย่างเดียว · บันทึกข้อสรุปผ่านเครื่องมือฝั่งเซิร์ฟเวอร์ที่มี audit
        log
      </p>
      {!loaded ? (
        <p role="status">กำลังโหลด…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : rows.length ? (
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              <strong>
                {r.from_day ?? "อ้างอิงรายงาน"} – {r.to_day ?? ""}
              </strong>
              <p>{r.message}</p>
              <small>
                รหัสคำขอ {r.id} ·{" "}
                {new Date(r.created_at).toLocaleDateString("th-TH")}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p>ไม่มีคำขอรอทบทวน</p>
      )}
      <button
        className="cp-focus"
        onClick={() => {
          setError("");
          setLoaded(false);
          setReload((n) => n + 1);
        }}
      >
        โหลดคำขอใหม่
      </button>
    </section>
  );
}
