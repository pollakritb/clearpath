export type DashboardTab = "overview" | "report" | "community";
export type SheetSnap = "peek" | "half" | "full";
export type ViewMode = "map" | "list";

export const SHEET_Y: Record<SheetSnap, string> = {
  peek: "82%",
  half: "45%",
  full: "2%",
};
