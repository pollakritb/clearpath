import type { ParticipationRank } from "@/frontend/types/xp";
import RankEmblem from "./RankEmblem";
export default function ParticipationBadge({
  rank,
}: {
  rank: ParticipationRank;
}) {
  return (
    <span className="cp-xp-badge" data-rank={rank.code}>
      <RankEmblem rank={rank} decorative /> {rank.label}
    </span>
  );
}
