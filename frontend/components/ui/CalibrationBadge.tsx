import AppIcon from "./AppIcon";

export default function CalibrationBadge({ date }: { date?: string | null }) {
  return (
    <span className="cp-calibration-badge">
      <AppIcon name="calibration" size={15} />
      <span>
        {date ? `สอบเทียบ ${formatCalibrationDate(date)}` : "สอบเทียบแล้ว"}
      </span>
    </span>
  );
}

function formatCalibrationDate(value: string) {
  const parts = value.slice(0, 10).split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${Number(parts[0]) + 543}`;
}
