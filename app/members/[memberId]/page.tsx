import MemberProfile from "@/frontend/components/community/MemberProfile";
export default async function MemberPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  return <MemberProfile memberId={memberId} />;
}
