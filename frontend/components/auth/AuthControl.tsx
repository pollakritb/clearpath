"use client";

import { useState } from "react";

import { T } from "@/frontend/lib/ui";

import { useAuth } from "./AuthProvider";

export default function AuthControl({
  compact = false,
}: {
  compact?: boolean;
}) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [googleSending, setGoogleSending] = useState(false);

  if (auth.loading)
    return <span style={{ fontSize: ".68em" }}>กำลังตรวจ session…</span>;
  if (auth.localDemo) {
    return (
      <span style={{ fontSize: ".68em", color: T.teal }}>
        Local demo · Admin
      </span>
    );
  }
  if (auth.user) {
    return (
      <div className="cp-auth-session">
        {!compact && (
          <span style={{ fontSize: ".68em", color: T.subInk }}>
            {auth.user.email} · {auth.role}
          </span>
        )}
        <button
          type="button"
          onClick={() => void auth.signOut()}
          className="cp-focus"
        >
          ออกจากระบบ
        </button>
      </div>
    );
  }

  return (
    <div className="cp-auth-form">
      {!compact && (
        <b style={{ fontSize: ".76em" }}>เข้าสู่ระบบก่อนร่วมรายงาน</b>
      )}
      <button
        type="button"
        disabled={googleSending || sending || !auth.configured}
        className="cp-auth-google cp-focus"
        onClick={() => {
          setGoogleSending(true);
          setMessage(null);
          setError(null);
          void auth
            .signInWithGoogle()
            .catch((cause: unknown) =>
              setError(
                cause instanceof Error
                  ? cause.message
                  : "เข้าสู่ระบบด้วย Google ไม่สำเร็จ",
              ),
            )
            .finally(() => setGoogleSending(false));
        }}
      >
        <span aria-hidden className="cp-auth-google__mark">
          G
        </span>
        <span>
          {googleSending ? "กำลังเชื่อมต่อ…" : "เข้าสู่ระบบด้วย Google"}
        </span>
      </button>
      <div className="cp-auth-divider" aria-hidden>
        <span>หรือรับลิงก์ทางอีเมล</span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSending(true);
          setMessage(null);
          setError(null);
          void auth
            .signInWithOtp(email)
            .then(() => setMessage("ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว"))
            .catch((cause: unknown) =>
              setError(
                cause instanceof Error ? cause.message : "ส่ง OTP ไม่สำเร็จ",
              ),
            )
            .finally(() => setSending(false));
        }}
        className="cp-auth-form__row"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          aria-label="อีเมลสำหรับเข้าสู่ระบบ"
          style={{ minWidth: 0, flex: 1 }}
        />
        <button
          type="submit"
          disabled={sending || googleSending || !auth.configured}
          className="cp-focus"
        >
          {sending ? "…" : "ส่ง OTP"}
        </button>
      </form>
      {!auth.configured && (
        <span role="alert" style={{ fontSize: ".66em", color: T.red }}>
          ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SUPABASE_URL/ANON_KEY
        </span>
      )}
      {message && (
        <span aria-live="polite" style={{ fontSize: ".66em", color: T.teal }}>
          {message}
        </span>
      )}
      {error && (
        <span role="alert" style={{ fontSize: ".66em", color: T.red }}>
          {error}
        </span>
      )}
    </div>
  );
}
