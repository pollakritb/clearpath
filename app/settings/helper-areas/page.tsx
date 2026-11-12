import type { Metadata } from "next";
import HelperAreasPage from "@/frontend/components/measurement/HelperAreasPage";

export const metadata: Metadata = { title: "พื้นที่รับคำขอ — ClearPath" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ request?: string | string[] }>;
}) {
  const { request } = await searchParams;
  return (
    <HelperAreasPage
      requestId={
        typeof request === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(request)
          ? request
          : undefined
      }
    />
  );
}
