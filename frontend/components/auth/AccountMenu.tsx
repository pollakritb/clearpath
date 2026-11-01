"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import AppIcon from "@/frontend/components/ui/AppIcon";
import { safeGoogleAvatarUrl } from "@/frontend/lib/reporter-profile";
import AuthControl from "./AuthControl";
import { useAuth } from "./AuthProvider";

export default function AccountMenu() {
  const auth = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const metadata = auth.user?.user_metadata;
  const avatarUrl =
    safeGoogleAvatarUrl(metadata?.avatar_url) ??
    safeGoogleAvatarUrl(metadata?.picture);
  const name =
    (typeof metadata?.full_name === "string" && metadata.full_name) ||
    (typeof metadata?.name === "string" && metadata.name) ||
    (auth.localDemo ? "บัญชีทดสอบ" : "บัญชีของฉัน");
  const signedIn = Boolean(auth.user || auth.localDemo);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="cp-account-trigger cp-focus"
        aria-label="เปิดโปรไฟล์"
        title="โปรไฟล์"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          dialogRef.current?.showModal();
          setOpen(true);
        }}
      >
        <AccountAvatar
          key={`${auth.user?.id}:${avatarUrl}`}
          url={avatarUrl}
          compact
        />
      </button>
      <dialog
        ref={dialogRef}
        className="cp-account-dialog"
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="cp-account-dialog__content">
          <header className="cp-account-dialog__header">
            <h2 id={titleId}>โปรไฟล์</h2>
            <button
              type="button"
              className="cp-account-dialog__close cp-focus"
              aria-label="ปิดโปรไฟล์"
              onClick={close}
              autoFocus
            >
              <AppIcon name="close" size={20} />
            </button>
          </header>
          {signedIn ? (
            <div className="cp-account-dialog__identity">
              <span className="cp-account-dialog__avatar" aria-hidden="true">
                <AccountAvatar
                  key={`${auth.user?.id}:${avatarUrl}`}
                  url={avatarUrl}
                />
              </span>
              <div>
                <strong>{name}</strong>
                {auth.user?.email && <span>{auth.user.email}</span>}
              </div>
            </div>
          ) : (
            <div className="cp-account-dialog__login">
              <AuthControl compact />
            </div>
          )}
          <nav aria-label="เมนูบัญชี" className="cp-account-dialog__links">
            <Link href="/profile" onClick={close} className="cp-focus">
              <AppIcon name="community" size={20} />
              <span>ผลงานและอันดับ</span>
              <AppIcon name="chevron" size={17} />
            </Link>
            <Link href="/settings" onClick={close} className="cp-focus">
              <AppIcon name="settings" size={20} />
              <span>การตั้งค่า</span>
              <AppIcon name="chevron" size={17} />
            </Link>
            {["admin", "moderator"].includes(auth.role) && (
              <Link href="/admin" onClick={close} className="cp-focus">
                <AppIcon name="admin" size={20} />
                <span>ภาพรวมผู้ดูแล</span>
                <AppIcon name="chevron" size={17} />
              </Link>
            )}
            {auth.user && (
              <button
                type="button"
                className="cp-account-dialog__signout cp-focus"
                disabled={signingOut}
                onClick={() => {
                  setSigningOut(true);
                  setError("");
                  void auth
                    .signOut()
                    .then(close)
                    .catch(() => setError("ออกจากระบบไม่สำเร็จ ลองอีกครั้ง"))
                    .finally(() => setSigningOut(false));
                }}
              >
                {signingOut ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
              </button>
            )}
          </nav>
          {error && <p role="alert">{error}</p>}
        </div>
      </dialog>
    </>
  );
}

function AccountAvatar({
  url,
  compact = false,
}: {
  url: string | null;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <AppIcon name="user" size={compact ? 20 : 23} />;
  return (
    // Google supplies a small remote avatar; load it directly without an image proxy.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={compact ? 44 : 48}
      height={compact ? 44 : 48}
      className="cp-account-avatar-image"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
