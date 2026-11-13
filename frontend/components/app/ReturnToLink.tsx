"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, type ComponentProps } from "react";
import { settingsOrigin } from "@/frontend/lib/settings-navigation";

type Props = Omit<ComponentProps<typeof Link>, "href"> & {
  fallback: string;
  href?: string;
};
function ReturnLink({ fallback, href, ...props }: Props) {
  return <Link replace data-safe-back {...props} href={href ?? fallback} />;
}
function OriginReturn(props: Props) {
  const params = useSearchParams();
  return (
    <ReturnLink
      {...props}
      href={
        props.href ?? settingsOrigin(params?.get("returnTo")) ?? props.fallback
      }
    />
  );
}
export default function ReturnToLink(props: Props) {
  return (
    <Suspense fallback={<ReturnLink {...props} />}>
      <OriginReturn {...props} />
    </Suspense>
  );
}
