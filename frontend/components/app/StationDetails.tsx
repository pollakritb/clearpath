import AppIcon from "@/frontend/components/ui/AppIcon";
import SourceBadge from "@/frontend/components/ui/SourceBadge";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { readingAgeLabel, sourceTimeLabel } from "@/frontend/lib/reading-time";
import { currentStationValue } from "@/frontend/lib/station-display";
import type { Station } from "@/frontend/types";
import panel from "./MapPanel.module.css";

/** Full-sheet context uses existing station data; no extra provider requests. */
export default function StationDetails({
  station,
  historical = false,
}: {
  station: Station;
  historical?: boolean;
}) {
  const validValue =
    station.pm25 != null && Number.isFinite(station.pm25) && station.pm25 >= 0;
  const level = classifyPm25(validValue ? station.pm25 : null);
  const current = !historical && currentStationValue(station) != null;
  const knownTime = Number.isFinite(Date.parse(station.recorded_at ?? ""));
  const status = historical
    ? "ข้อมูลย้อนหลัง"
    : current
      ? "ข้อมูลไม่เกิน 60 นาที"
      : knownTime
        ? "ข้อมูลก่อนหน้า"
        : "ไม่ทราบเวลาข้อมูล";

  return (
    <>
      <section className={panel.section} aria-label="การอ่านค่าฝุ่นสถานี">
        <h2>อ่านค่าฝุ่นนี้อย่างไร</h2>
        <p className={panel.explanation}>
          {validValue
            ? `ระดับของค่าที่บันทึก: ${level.level}`
            : "สถานีนี้ยังไม่มีค่า PM2.5 ที่ใช้แปลผลได้"}
        </p>
        <p className={panel.address}>
          {current
            ? "เป็นค่าที่รายงานจากสถานีนี้ ไม่ใช่ค่าตรวจวัด ณ ตำแหน่งของคุณ สภาพอากาศแต่ละจุดอาจต่างกัน"
            : "ระดับสีอธิบายค่าตามเวลาที่บันทึก ไม่ได้ยืนยันสภาพอากาศขณะนี้ เปิดย้อนหลังเพื่อดูค่าตามช่วงเวลา หรือพยากรณ์เพื่อดูแนวโน้ม"}
        </p>
      </section>

      <section className={panel.section} aria-label="ความใหม่ของข้อมูลสถานี">
        <h2>
          <span>ความใหม่ของข้อมูล</span>
          <AppIcon name="clock" size={18} />
        </h2>
        <dl className={panel.stationFacts}>
          <div>
            <dt>สถานะ</dt>
            <dd>{status}</dd>
          </div>
          <div>
            <dt>เวลาข้อมูลต้นทาง</dt>
            <dd>{sourceTimeLabel(station.recorded_at)}</dd>
          </div>
          {!historical && (
            <div>
              <dt>อายุข้อมูล</dt>
              <dd>
                {knownTime
                  ? readingAgeLabel(station.age_minutes)
                  : "ไม่ทราบอายุข้อมูล"}
              </dd>
            </div>
          )}
          <div>
            <dt>ใช้ประเมินสถานที่ขณะนี้</dt>
            <dd>
              {current
                ? "ใช้ได้เมื่ออยู่ในรัศมี 2 กม. และผ่านเงื่อนไขสถานที่"
                : "ไม่ใช้คำนวณค่าปัจจุบัน"}
            </dd>
          </div>
        </dl>
        <p className={panel.address}>
          อายุข้อมูลนับจากเวลาต้นทาง
          การซิงก์สำเร็จไม่ได้ทำให้ค่าที่วัดไว้ใหม่ขึ้น
        </p>
      </section>

      <section className={panel.section} aria-label="ข้อมูลสถานี">
        <h2>ข้อมูลสถานี</h2>
        <dl className={panel.stationFacts}>
          {station.name_en && station.name_en !== station.name_th && (
            <div>
              <dt>ชื่อภาษาอังกฤษ</dt>
              <dd>{station.name_en}</dd>
            </div>
          )}
          <div>
            <dt>พื้นที่</dt>
            <dd>{station.province ?? "ไม่ระบุพื้นที่"}</dd>
          </div>
          <div>
            <dt>รหัสสถานี {station.id}</dt>
            <dd>
              <SourceBadge kind="official" compact />
            </dd>
          </div>
          <div>
            <dt>หน่วย PM2.5</dt>
            <dd>µg/m³ · ไมโครกรัมต่อลูกบาศก์เมตร</dd>
          </div>
        </dl>
      </section>

      <section className={panel.section} aria-label="ที่มาข้อมูลสถานี">
        <h2>ที่มาและข้อควรรู้</h2>
        <p className={panel.address}>
          ค่าตรวจวัดจาก Air4Thai ตามเวลาที่ระบุบนรายงาน ข้อมูลสถานี
          ข้อมูลจากชุมชน และค่าพยากรณ์เป็นคนละแหล่งกัน
        </p>
        <p className={panel.address}>
          ค่าพยากรณ์เป็นผลจากแบบจำลอง ไม่ใช่ผลตรวจวัดล่วงหน้าของสถานี
        </p>
        <a
          className={`${panel.action} cp-focus`}
          href="https://air4thai.pcd.go.th/"
          target="_blank"
          rel="noopener noreferrer"
        >
          ดูข้อมูลจาก Air4Thai (เปิดแท็บใหม่)
        </a>
      </section>
    </>
  );
}
