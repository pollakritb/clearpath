"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ComponentProps } from "react";
import {
  settingsHref,
  settingsOrigin,
} from "@/frontend/lib/settings-navigation";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

function OriginLink(props: Props) {
  const pathname = usePathname() ?? "/";
  const params = useSearchParams();
  const origin =
    pathname === "/settings" || pathname.startsWith("/settings/")
      ? (settingsOrigin(params?.get("returnTo")) ?? "/")
      : pathname + (params?.size ? `?${params.toString()}` : "");
  return <Link {...props} href={settingsHref(props.href, origin)} />;
}

/** Keep one explicit exit while moving through settings, including after reload. */
export default function SettingsLink(props: Props) {
  return (
    <Suspense fallback={<Link {...props} />}>
      <OriginLink {...props} />
    </Suspense>
  );
}
