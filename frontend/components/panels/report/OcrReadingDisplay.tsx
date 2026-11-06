import AppIcon from "@/frontend/components/ui/AppIcon";
import styles from "./ReportFeedback.module.css";

export default function OcrReadingDisplay({
  value,
  capturedAt,
}: {
  value: number;
  capturedAt: string;
}) {
  return (
    <section
      className={styles.reading}
      role="group"
      aria-label="ค่าฝุ่นที่อ่านจากภาพ"
    >
      <div className={styles.meter}>
        <header>
          <AppIcon name="sensor" size={18} />
          <strong>ค่าที่อ่านจากภาพ (OCR)</strong>
        </header>
        <div className={styles.screen}>
          <div className={styles.screenHeading}>
            <span>PM2.5</span>
            <span>
              <AppIcon name="check" size={14} />
              อ่านสำเร็จ
            </span>
          </div>
          <div className={styles.digits}>
            <output aria-label={`PM2.5 ${value} µg/m³`}>{value}</output>
            <span>µg/m³</span>
          </div>
        </div>
      </div>
      <p className={styles.caption}>ระบบจะเผยแพร่ค่านี้เมื่อคุณส่งรายงาน</p>
      <p className={styles.time}>
        เวลาที่วัด{" "}
        <time dateTime={capturedAt}>
          {new Date(capturedAt).toLocaleString("th-TH")}
        </time>
      </p>
    </section>
  );
}
