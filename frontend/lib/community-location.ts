import type { CommunityReport } from "@/frontend/types";

function withPrefix(value: string | null | undefined, prefix: string) {
  const cleaned = value?.trim();
  if (!cleaned) return null;
  return cleaned.startsWith(prefix) ? cleaned : `${prefix}${cleaned}`;
}

export function formatCommunityArea(
  report: Pick<CommunityReport, "subdistrict" | "district" | "province">,
) {
  const province = report.province?.trim();
  if (province && /(^|\s)[ตอ]\./u.test(province)) {
    return province.replace(/\s+(?=อ\.)/u, " · ").replace(/,\s*/u, " · จ.");
  }

  return (
    [
      withPrefix(report.subdistrict, "ต."),
      withPrefix(report.district, "อ."),
      withPrefix(province, "จ."),
    ]
      .filter(Boolean)
      .join(" · ") || "พื้นที่รายงานโดยประมาณ"
  );
}
