import MapPageClient from "@/frontend/components/pages/MapPageClient";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ layer?: string | string[] }>;
}) {
  const { layer } = await searchParams;
  return <MapPageClient showFiresInitially={layer === "fires"} />;
}
