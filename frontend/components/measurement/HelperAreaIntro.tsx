"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCurrentUserId } from "@/frontend/components/auth/AuthProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { api } from "@/frontend/lib/api-client";
import {
  REQUEST_CREATED,
  deferredHelperAreaRequest,
  rememberHelperAreaIntro,
  shouldOfferHelperAreas,
} from "@/frontend/lib/helper-area-intro";

export default function HelperAreaIntro({
  active = true,
}: {
  active?: boolean;
}) {
  const account = useCurrentUserId();
  const [offer, setOffer] = useState<{
    account: string;
    requestId: string;
  } | null>(null);
  useEffect(() => {
    if (!account || !active) return;
    let alive = true;
    let checking = false;
    const created = async (event: Event) => {
      const requestId = (event as CustomEvent<{ requestId: string }>).detail
        ?.requestId;
      if (!requestId || checking || !shouldOfferHelperAreas(account)) return;
      checking = true;
      try {
        const settings = await api.measurementHelper();
        if (
          alive &&
          settings.registered_locations_enabled &&
          !(settings.locations ?? []).length
        )
          setOffer({ account, requestId });
      } catch {
        /* Never block a submitted request when settings are unavailable. */
      } finally {
        checking = false;
      }
    };
    window.addEventListener(REQUEST_CREATED, created);
    const deferred = deferredHelperAreaRequest(account);
    if (deferred)
      void created(
        new CustomEvent(REQUEST_CREATED, { detail: { requestId: deferred } }),
      );
    return () => {
      alive = false;
      window.removeEventListener(REQUEST_CREATED, created);
    };
  }, [account, active]);
  if (!active || !offer || offer.account !== account) return null;
  return (
    <IntroDialog
      requestId={offer.requestId}
      onChoose={(choice) => {
        rememberHelperAreaIntro(
          offer.account,
          choice,
          Date.now(),
          offer.requestId,
        );
        setOffer(null);
      }}
    />
  );
}
function IntroDialog({
  requestId,
  onChoose,
}: {
  requestId: string;
  onChoose: (choice: "setup" | "later" | "never") => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.showModal();
    return () => {
      document.body.style.overflow = previous;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="cp-helper-intro"
      aria-labelledby="cp-helper-intro-title"
      aria-describedby="cp-helper-intro-copy"
      onCancel={(e) => {
        e.preventDefault();
        onChoose("later");
      }}
    >
      <button
        type="button"
        className="cp-helper-intro-close cp-focus"
        aria-label="ปิดคำแนะนำพื้นที่รับคำขอ"
        onClick={() => onChoose("later")}
      >
        <AppIcon name="close" size={21} />
      </button>
      <span className="cp-helper-intro-icon">
        <AppIcon name="community" size={30} />
      </span>
      <h2 id="cp-helper-intro-title">รับคำขอจากคนใกล้คุณ</h2>
      <p id="cp-helper-intro-copy">
        ส่งคำขอของคุณแล้ว หากคุณมีเครื่องวัด
        ลองเพิ่มบ้านหรือที่ทำงานไว้ช่วยวัดให้คนใกล้พื้นที่
      </p>
      <p className="cp-helper-intro-private">
        <AppIcon name="shield" size={17} /> บันทึกได้ 2 จุด · พิกัดเห็นเฉพาะคุณ
      </p>
      <Link
        className="cp-measure-primary cp-focus"
        href={`/settings/helper-areas?request=${encodeURIComponent(requestId)}`}
        onClick={() => onChoose("setup")}
      >
        ตั้งค่าพื้นที่ตอนนี้
        <AppIcon name="chevron" size={18} />
      </Link>
      <button
        type="button"
        className="cp-helper-intro-later cp-focus"
        onClick={() => onChoose("later")}
      >
        เตือนภายหลัง
      </button>
      <button
        type="button"
        className="cp-helper-intro-never cp-focus"
        onClick={() => onChoose("never")}
      >
        ไม่แสดงคำแนะนำนี้อีก
      </button>
      <small>ตั้งค่าได้เสมอที่ การตั้งค่า → การแจ้งเตือน</small>
    </dialog>
  );
}
