import type { HelperLocationEmoji } from "@/frontend/types/measurement";

export const HELPER_LOCATION_EMOJIS: {
  emoji: HelperLocationEmoji;
  label: string;
}[] = [
  { emoji: "🏠", label: "บ้าน" },
  { emoji: "🏢", label: "ที่ทำงาน" },
  { emoji: "🏫", label: "โรงเรียน" },
  { emoji: "🏥", label: "โรงพยาบาล" },
  { emoji: "🏡", label: "บ้านและสวน" },
  { emoji: "🏪", label: "ร้านค้า" },
  { emoji: "🌳", label: "สวน" },
  { emoji: "📍", label: "จุดที่บันทึก" },
];
export function helperLocationEmoji(value?: string): HelperLocationEmoji {
  return (
    HELPER_LOCATION_EMOJIS.find((choice) => choice.emoji === value)?.emoji ??
    "📍"
  );
}
