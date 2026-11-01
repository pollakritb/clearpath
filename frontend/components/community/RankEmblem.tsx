import AppIcon, { type AppIconName } from "@/frontend/components/ui/AppIcon";
import type { ParticipationRank } from "@/frontend/types/xp";

const ICONS: Record<string, AppIconName> = {
  explorer: "compass",
  reporter: "wind",
  caretaker: "sprout",
  guardian: "rank-shield",
  champion: "crown",
};

/** Participation only: never use a verified/checkmark symbol for a rank. */
export default function RankEmblem({
  rank,
  decorative = false,
}: {
  rank: ParticipationRank;
  decorative?: boolean;
}) {
  const icon = ICONS[rank.code];
  if (!icon) return null;
  return (
    <span
      className="cp-rank-emblem"
      data-rank={rank.code}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `ยศ ${rank.label}`}
      aria-hidden={decorative || undefined}
    >
      <AppIcon name={icon} size={16} />
    </span>
  );
}
