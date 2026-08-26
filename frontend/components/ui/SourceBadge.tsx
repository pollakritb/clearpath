import { SOURCE_LABELS, type MapSourceKind } from "@/frontend/lib/source-kind";

import AppIcon from "./AppIcon";

export default function SourceBadge({
  kind,
  compact = false,
}: {
  kind: MapSourceKind;
  compact?: boolean;
}) {
  const icon =
    kind === "official"
      ? "station"
      : kind === "sensor"
        ? "community-station"
        : "user";

  return (
    <span className="cp-source-badge" data-source={kind}>
      <span className="cp-source-badge__icon">
        <AppIcon name={icon} size={compact ? 14 : 16} />
      </span>
      <span>
        {compact ? SOURCE_LABELS[kind].shortLabel : SOURCE_LABELS[kind].label}
      </span>
    </span>
  );
}
