import type { ParticipationRank } from "@/frontend/types/xp";
const SYMBOL: Record<string, string> = {
  explorer: "◇",
  reporter: "✦",
  caretaker: "❖",
  guardian: "✧",
  champion: "★",
};
export default function ParticipationBadge({
  rank,
}: {
  rank: ParticipationRank;
}) {
  return (
    <span className="cp-xp-badge" data-rank={rank.code}>
      <span aria-hidden="true">{SYMBOL[rank.code] ?? "◇"}</span> {rank.label}
    </span>
  );
}
