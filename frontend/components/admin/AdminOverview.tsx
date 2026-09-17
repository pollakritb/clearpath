import AppIcon from "@/frontend/components/ui/AppIcon";
import type { AdminSyncRun, DataHealthResponse } from "@/frontend/types/ui";

import { formatRelative, type AdminView } from "./admin-navigation";

interface AdminOverviewProps {
  queueCount: number;
  loading: boolean;
  error: string | null;
  latestRun?: AdminSyncRun;
  dataHealth: DataHealthResponse | null;
  openIssueCount: number;
  isAdmin: boolean;
  onNavigate: (view: AdminView) => void;
}

export default function AdminOverview({
  queueCount,
  loading,
  error,
  latestRun,
  dataHealth,
  openIssueCount,
  isAdmin,
  onNavigate,
}: AdminOverviewProps) {
  return (
    <section>
      <div className="cp-admin-welcome">
        <div>
          <span className="cp-eyebrow">ศูนย์ควบคุมรายวัน</span>
          <h2>สิ่งที่ต้องดูแลวันนี้</h2>
          <p>
            ดูเคสที่ระบบตรวจอัตโนมัติยังสรุปไม่ได้ ติดตามข้อมูล Air4Thai
            และจัดการปัญหาที่ผู้ใช้แจ้ง
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("moderation")}
          className="cp-admin-button cp-focus"
        >
          เปิดคิวตรวจข้อยกเว้น
        </button>
      </div>

      {error && (
        <div role="alert" className="cp-admin-feedback" data-error>
          {error}
        </div>
      )}

      <div className="cp-admin-stat-grid">
        <button
          type="button"
          onClick={() => onNavigate("moderation")}
          className="cp-admin-stat-card cp-focus"
          data-tone="attention"
        >
          <span className="cp-admin-stat-card__icon">
            <AppIcon name="shield" size={22} />
          </span>
          <span>
            <small>รอตรวจข้อยกเว้น</small>
            <strong>{loading ? "…" : queueCount}</strong>
            <em>เฉพาะเคสที่หลักฐานไม่ครบ</em>
          </span>
          <AppIcon name="chevron" size={18} />
        </button>
        <button
          type="button"
          onClick={() => onNavigate("operations")}
          className="cp-admin-stat-card cp-focus"
          data-tone={latestRun?.status === "failed" ? "danger" : "healthy"}
        >
          <span className="cp-admin-stat-card__icon">
            <AppIcon name="database" size={22} />
          </span>
          <span>
            <small>Air4Thai sync</small>
            <strong>{latestRun?.status ?? "—"}</strong>
            <em>
              {formatRelative(latestRun?.completed_at ?? latestRun?.started_at)}
            </em>
          </span>
          <AppIcon name="chevron" size={18} />
        </button>
        <button
          type="button"
          onClick={() => onNavigate("operations")}
          className="cp-admin-stat-card cp-focus"
        >
          <span className="cp-admin-stat-card__icon">
            <AppIcon name="station" size={22} />
          </span>
          <span>
            <small>สถานีข้อมูลสด</small>
            <strong>
              {loading
                ? "…"
                : `${dataHealth?.fresh_station_count ?? "—"}/${dataHealth?.station_count ?? "—"}`}
            </strong>
            <em>สถานีที่ข้อมูลยังไม่หมดอายุ</em>
          </span>
          <AppIcon name="chevron" size={18} />
        </button>
        <button
          type="button"
          onClick={() => onNavigate("operations")}
          className="cp-admin-stat-card cp-focus"
          data-tone={openIssueCount > 0 ? "attention" : "healthy"}
        >
          <span className="cp-admin-stat-card__icon">
            <AppIcon name="alert" size={22} />
          </span>
          <span>
            <small>ปัญหาข้อมูลใหม่</small>
            <strong>{loading ? "…" : openIssueCount}</strong>
            <em>รายการที่ผู้ใช้แจ้งเข้ามา</em>
          </span>
          <AppIcon name="chevron" size={18} />
        </button>
      </div>

      <div className="cp-admin-overview-grid">
        <article className="cp-admin-overview-card">
          <div className="cp-admin-card-heading">
            <div>
              <h3>ขั้นตอนตรวจเคสที่ระบบส่งต่อ</h3>
              <p>ใช้เฉพาะเมื่อหลักฐานไม่ผ่านเกณฑ์อัตโนมัติ</p>
            </div>
          </div>
          <ol className="cp-admin-workflow">
            <li>
              <span>1</span>
              <div>
                <strong>ระบบอ่านภาพด้วย OCR</strong>
                <small>ตรวจค่าบนหน้าจอ ความชัด และความต่อเนื่องของภาพ</small>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>ระบบตรวจหลักฐานร่วม</strong>
                <small>ตรวจ GPS เวลา ภาพซ้ำ และความสมเหตุสมผลของค่า</small>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>เคสมั่นใจสูงเผยแพร่อัตโนมัติ</strong>
                <small>ไม่ต้องรอผู้ดูแลตรวจทีละรายงาน</small>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>ส่งต่อเฉพาะข้อยกเว้น</strong>
                <small>
                  พักรายงานที่หลักฐานขัดแย้งไว้ ไม่เผยแพร่โดยอัตโนมัติ
                </small>
              </div>
            </li>
          </ol>
        </article>

        <article className="cp-admin-overview-card">
          <div className="cp-admin-card-heading">
            <div>
              <h3>ขอบเขตสิทธิ์ของคุณ</h3>
              <p>การทำงานแยกตาม role อย่างชัดเจน</p>
            </div>
          </div>
          <div className="cp-admin-permission-list">
            <div data-allowed>
              <AppIcon name="check" size={17} />
              จัดการข้อยกเว้นจากระบบตรวจอัตโนมัติ
            </div>
            <div data-allowed>
              <AppIcon name="check" size={17} />
              ดูสุขภาพข้อมูล Air4Thai และการแจ้งเตือน
            </div>
            <div data-allowed={isAdmin || undefined}>
              <AppIcon name={isAdmin ? "check" : "alert"} size={17} />
              สร้างประกาศและกิจกรรม {isAdmin ? "" : "(Admin เท่านั้น)"}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
