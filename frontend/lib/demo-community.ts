import type { CommunityReport } from "@/frontend/types";

export const DEMO_COMMUNITY_CENTER = { lat: 13.8199, lon: 100.0622 } as const;

const LOCATIONS = [
  [13.8199, 100.0622, "พระปฐมเจดีย์", "เมืองนครปฐม"],
  [13.8291, 100.0478, "นครปฐม", "เมืองนครปฐม"],
  [13.8062, 100.0741, "สนามจันทร์", "เมืองนครปฐม"],
  [13.8384, 100.0872, "บ่อพลับ", "เมืองนครปฐม"],
  [13.7918, 100.0435, "วังตะกู", "เมืองนครปฐม"],
  [13.8492, 100.0264, "หนองปากโลง", "เมืองนครปฐม"],
  [13.7764, 100.0951, "ถนนขาด", "เมืองนครปฐม"],
  [13.8611, 100.0718, "มาบแค", "เมืองนครปฐม"],
  [13.8088, 100.1115, "ธรรมศาลา", "เมืองนครปฐม"],
  [13.8832, 100.0206, "ลำพยา", "เมืองนครปฐม"],
  [13.7589, 100.0594, "ตาก้อง", "เมืองนครปฐม"],
  [13.8706, 100.1047, "ดอนยายหอม", "เมืองนครปฐม"],
] as const;

const DISPLAY_NAMES = [
  "กานต์",
  "มินตรา",
  "นนท์",
  "พิม",
  "ต้น",
  "แพรว",
  "นัท",
  "ฟ้า",
  "วิน",
  "เมย์",
  "อาร์ม",
  "ใบหม่อน",
] as const;

const DEVICES = [
  "Qingping Air Monitor",
  "Xiaomi Air Purifier 4 Lite",
  "Temtop M10",
  "AirGradient ONE",
] as const;

function seeded(index: number, salt: number) {
  const value = Math.sin((index + 1) * 9283 + salt * 127.1) * 10000;
  return value - Math.floor(value);
}

export function isCommunityDemoMode() {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get("demo") === "community"
  );
}

export function buildDemoCommunityReports(now = Date.now()): CommunityReport[] {
  return LOCATIONS.map(([baseLat, baseLon, subdistrict, district], index) => {
    const ageMinutes = 8 + index * 7;
    const capturedAt = new Date(now - ageMinutes * 60_000).toISOString();
    const calibrated = index % 4 === 0;
    const automatic = index % 3 !== 0;
    const pm25 = Math.round((9 + seeded(index, 2) * 38) * 10) / 10;

    return {
      id: `demo-individual-${index + 1}`,
      user_id: `demo-user-${index + 1}`,
      display_name: DISPLAY_NAMES[index],
      lat: baseLat + (seeded(index, 3) - 0.5) * 0.002,
      lon: baseLon + (seeded(index, 4) - 0.5) * 0.002,
      pm25,
      verified_pm25: pm25,
      ocr_pm25: null,
      user_claimed_pm25: null,
      admin_verified_pm25: null,
      ocr_confidence: 0,
      captured_at: capturedAt,
      created_at: capturedAt,
      status: "approved",
      trust_score: Math.round(68 + seeded(index, 5) * 27),
      trust_reasons: ["ข้อมูลจำลองสำหรับนำเสนอ", "หลักฐานผ่านเกณฑ์ตัวอย่าง"],
      peer_up: Math.floor(seeded(index, 6) * 12),
      peer_down: 0,
      image_url: null,
      admin_verified: !automatic,
      verification_method: automatic ? "automatic" : "admin",
      data_role: "supplementary",
      nearest_official_distance_km: null,
      nearest_official_pm25: null,
      eligible_for_gap_fill: false,
      is_fresh: true,
      age_minutes: ageMinutes,
      location_precision_m: Math.round(120 + seeded(index, 7) * 130),
      device_model: DEVICES[index % DEVICES.length],
      source_type: "individual",
      device_calibrated: calibrated,
      calibrated_at: calibrated ? "2026-08-15" : null,
      measurement_environment: "outdoor",
      measurement_stable: true,
      near_emission_source: false,
      measurement_note: "ข้อมูลจำลองสำหรับภาพนำเสนอ",
      gps_accuracy_m: null,
      duplicate_detected: false,
      corroboration_count: 0,
      gap_fill_basis: "none",
      eligibility_reason: "demo_not_used_for_calculation",
      official_recorded_at: null,
      averaging_period: index % 2 === 0 ? "1_minute" : "5_minutes",
      measurement_duration_seconds: index % 2 === 0 ? 60 : 300,
      province: "นครปฐม",
      district,
      subdistrict,
      camera_session_issued_at: null,
      client_captured_at: null,
      server_received_at: null,
      moderated_at: automatic ? null : capturedAt,
      clock_warning: false,
      ocr_mismatch: false,
      rejection_reason_code: null,
      moderation_checks: {},
      evidence_purged_at: null,
      policy_version: "demo-v1",
      rating_count: 1 + Math.floor(seeded(index, 8) * 8),
      rating_average: Math.round((3.8 + seeded(index, 9) * 1.2) * 10) / 10,
    };
  });
}
