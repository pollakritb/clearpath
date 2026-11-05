import type { ReactionLocation } from "@/frontend/types";

/** One fresh browser fix per vote. The server decides eligibility privately. */
export function requestReactionLocation(): Promise<ReactionLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new Error(
          "อุปกรณ์นี้ไม่รองรับตำแหน่ง กรุณาใช้อุปกรณ์ที่เปิดตำแหน่งได้",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
          observed_at: new Date(position.timestamp).toISOString(),
        }),
      (error) =>
        reject(
          new Error(
            error.code === 1
              ? "กรุณาอนุญาตตำแหน่งเพื่อโหวต แสดงความคิดเห็นได้โดยไม่ใช้ตำแหน่ง"
              : "ยังรับตำแหน่งไม่ได้ กรุณาลองอีกครั้งเมื่อสัญญาณพร้อม",
          ),
        ),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}
