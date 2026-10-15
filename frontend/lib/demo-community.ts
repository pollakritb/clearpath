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

function demoMeterImage(pm25: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640" role="img" aria-label="Demo PM2.5 meter reading ${pm25}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dcebe7"/><stop offset="1" stop-color="#9fc5ba"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="22" stdDeviation="20" flood-color="#173d36" flood-opacity=".25"/></filter>
  </defs>
  <rect width="960" height="640" fill="url(#bg)"/>
  <circle cx="105" cy="105" r="170" fill="#fff" opacity=".16"/><circle cx="865" cy="575" r="230" fill="#fff" opacity=".12"/>
  <g filter="url(#shadow)"><rect x="185" y="65" width="590" height="510" rx="46" fill="#f8fbfa"/>
    <rect x="225" y="110" width="510" height="330" rx="28" fill="#172925"/>
    <text x="480" y="165" fill="#b8d2cb" font-family="Arial, sans-serif" font-size="28" text-anchor="middle">PM2.5</text>
    <text x="480" y="325" fill="#6fd19f" font-family="Arial, sans-serif" font-size="155" font-weight="700" text-anchor="middle">${pm25}</text>
    <text x="480" y="382" fill="#b8d2cb" font-family="Arial, sans-serif" font-size="28" text-anchor="middle">ug/m3</text>
    <circle cx="480" cy="505" r="31" fill="#e9f1ef" stroke="#9eb5af" stroke-width="4"/>
    <path d="M480 487v20m-12-14a18 18 0 1 0 24 0" fill="none" stroke="#52726a" stroke-width="5" stroke-linecap="round"/>
  </g>
  <rect x="28" y="566" width="320" height="48" rx="24" fill="#fff" opacity=".92"/>
  <text x="188" y="598" fill="#315b52" font-family="Arial, sans-serif" font-size="22" font-weight="700" text-anchor="middle">CLEARPATH - DEMO IMAGE</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function isCommunityDemoMode() {
  if (typeof window === "undefined") return false;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE !== "true"
  ) {
    return false;
  }
  return (
    new URLSearchParams(window.location.search).get("demo") === "community"
  );
}

export function buildDemoCommunityReports(now = Date.now()): CommunityReport[] {
  return LOCATIONS.map(([baseLat, baseLon, subdistrict, district], index) => {
    const ageMinutes = 8 + index * 7;
    const capturedAt = new Date(now - ageMinutes * 60_000).toISOString();
    const pm25 = Math.round((9 + seeded(index, 2) * 38) * 10) / 10;

    return {
      id: `demo-individual-${index + 1}`,
      user_id: `demo-user-${index + 1}`,
      display_name: DISPLAY_NAMES[index],
      reporter_avatar_url: null,
      show_reporter_profile: index % 3 !== 0,
      lat: baseLat + (seeded(index, 3) - 0.5) * 0.002,
      lon: baseLon + (seeded(index, 4) - 0.5) * 0.002,
      pm25,
      verified_pm25: pm25,
      ocr_pm25: pm25,
      user_claimed_pm25: null,
      admin_verified_pm25: null,
      ocr_confidence: 0.9,
      captured_at: capturedAt,
      created_at: capturedAt,
      status: "approved",
      trust_score: Math.round(68 + seeded(index, 5) * 27),
      trust_reasons: ["ข้อมูลจำลองสำหรับนำเสนอ", "หลักฐานผ่านเกณฑ์ตัวอย่าง"],
      peer_up: Math.floor(seeded(index, 6) * 12),
      peer_down: 0,
      image_url: demoMeterImage(pm25),
      admin_verified: false,
      verification_method: "automatic",
      data_role: "supplementary",
      nearest_official_distance_km: null,
      nearest_official_pm25: null,
      eligible_for_gap_fill: false,
      is_fresh: true,
      age_minutes: ageMinutes,
      location_precision_m: Math.round(120 + seeded(index, 7) * 130),
      device_model: DEVICES[index % DEVICES.length],
      source_type: "individual",
      device_calibrated: false,
      calibrated_at: null,
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
      moderated_at: null,
      clock_warning: false,
      ocr_mismatch: false,
      rejection_reason_code: null,
      moderation_checks: {},
      evidence_purged_at: null,
      policy_version: "demo-v1",
      rating_count: 1 + Math.floor(seeded(index, 8) * 8),
      rating_average: Math.round((3.8 + seeded(index, 9) * 1.2) * 10) / 10,
      like_count: 2 + Math.floor(seeded(index, 10) * 12),
      dislike_count: Math.floor(seeded(index, 11) * 3),
      comment_count: Math.floor(seeded(index, 12) * 5),
    };
  });
}
