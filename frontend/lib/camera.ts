const MAX_CAPTURE_EDGE_PX = 1920;

export function fitCaptureDimensions(
  width: number,
  height: number,
  maxEdge = MAX_CAPTURE_EDGE_PX,
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || maxEdge <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function cameraErrorMessage(name: string): string {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "กรุณาอนุญาตการใช้กล้องในการตั้งค่าเว็บไซต์ แล้วกดเปิดกล้องอีกครั้ง";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "ไม่พบกล้องบนอุปกรณ์นี้ กรุณาตรวจว่ากล้องพร้อมใช้งาน";
    case "NotReadableError":
    case "TrackStartError":
      return "กล้องกำลังถูกแอปอื่นใช้งาน กรุณาปิดแอปนั้นแล้วลองใหม่";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "กล้องไม่รองรับค่าที่ร้องขอ กรุณาลองเปิดกล้องอีกครั้ง";
    case "AbortError":
      return "การเปิดกล้องถูกยกเลิก กรุณาลองใหม่";
    default:
      return "เปิดกล้องไม่สำเร็จ กรุณาตรวจสิทธิ์กล้องแล้วลองใหม่";
  }
}
