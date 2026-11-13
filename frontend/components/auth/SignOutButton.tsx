"use client";

import { useRef, useState } from "react";
import { useAuth } from "./AuthProvider";

export default function SignOutButton({
  className = "cp-focus",
}: {
  className?: string;
}) {
  const auth = useAuth();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="cp-signout-control">
      <button
        type="button"
        className={className}
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          setError("");
          try {
            await auth.signOut();
          } catch {
            setError("ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง");
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
      </button>
      {error && (
        <span className="cp-signout-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
