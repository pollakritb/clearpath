import RequestsPage from "@/frontend/components/measurement/RequestsPage";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RequestsPage requestId={id} />;
}
