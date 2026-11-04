import RequestsPage from "@/frontend/components/measurement/RequestsPage";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const { group } = await searchParams;
  return <RequestsPage groupId={group} />;
}
