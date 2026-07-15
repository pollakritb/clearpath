// ตัวช่วยอ้าง design token (CSS variables) แบบ DRY สำหรับ inline style ในคอมโพเนนต์
// token ที่สลับได้ตาม high-contrast จะอ้างผ่าน var() เพื่อให้รีแมปอัตโนมัติ

export const T = {
  ink: "var(--cp-ink)",
  subInk: "var(--cp-subink)",
  line: "var(--cp-line)",
  appBg: "var(--cp-appbg)",
  panel: "var(--cp-panel)",
  chip: "var(--cp-chip)",
  input: "var(--cp-input)",
  mapBg: "var(--cp-mapbg)",

  teal: "var(--cp-teal)",
  tealBright: "var(--cp-teal-bright)",
  green: "var(--cp-green)",
  red: "var(--cp-red)",

  mono: "var(--font-mono), monospace",
  brandGrad: "linear-gradient(150deg,#0e7c79,#0aa3a0)",
  shadowSm: "var(--cp-shadow-sm)",
  shadowBrand: "var(--cp-shadow-brand)",
  shadowOverlay: "var(--cp-shadow-overlay)",
} as const;

// สีเส้นทางบนแผนที่ (recommended เน้น teal · เส้นอื่นจาง)
export const ROUTE_RECOMMENDED = "#0e7c79";
export const ROUTE_ALT = "#9aa0a6";
