import OwnedReportPage from "@/frontend/components/pages/OwnedReportPage";

export default async function Page({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  return <OwnedReportPage reportId={reportId} />;
}
