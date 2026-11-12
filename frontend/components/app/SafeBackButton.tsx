"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/** Only use browser Back when this entry was reached through an in-app link. */
export default function SafeBackButton({
  fallback,
  className,
}: {
  fallback: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      data-safe-back
      className={className ?? "cp-focus"}
      onClick={(event) => {
        if (window.history.state?.cpInternalEntry === true) {
          event.preventDefault();
          router.back();
        }
      }}
    >
      ← กลับ
    </Link>
  );
}
