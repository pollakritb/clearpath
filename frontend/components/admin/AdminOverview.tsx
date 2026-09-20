import AppIcon from "@/frontend/components/ui/AppIcon";
import type { AdminSyncRun, DataHealthResponse } from "@/frontend/types/ui";

import { formatRelative, type AdminView } from "./admin-navigation";

interface AdminOverviewProps {
  reportCount: number;
  loading: boolean;
  error: string | null;
  latestRun?: AdminSyncRun;
  dataHealth: DataHealthResponse | null;
  openIssueCount: number;
  isAdmin: boolean;
  onNavigate: (view: AdminView) => void;
}

export default function AdminOverview({
  reportCount,
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
          <span className="cp-eyebrow">ศูนย์ตรวจสอบระบบ</span>
          <h2>ติดตามการทำงาน ไม่ตัดสินรายงานแทนระบบ</h2>
          <p>
            ระบบตรวจ GPS และภาพซ้ำก่อนให้ OCR อ่านตัวเลข PM2.5
            หากอ่านได้จะเผยแพร่ทันที ผู้ดูแลใช้หน้านี้ดูประวัติ ภาพ และ audit
            log เท่านั้น
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("reports")}
          className="cp-admin-button cp-focus"
        >
          เปิดประวัติรายงาน
        </button>
      </div>

      {error && (
        <div className="cp-admin-feedback" data-error>
          {error}
        </div>
      )}

      <div className="cp-admin-stat-grid">
        <button
          type="button"
          onClick={() => onNavigate("reports")}
          className="cp-admin-stat-card cp-focus"
          data-tone="healthy"
        >
          <span className="cp-admin-stat-card__icon">
            <AppIcon name="shield" size={22} />
          </span>
          <span>
            <small>รายงานที่บันทึกไว้</small>
            <strong>{loading ? "…" : reportCount}</strong>
            <em>ดูภาพและผลตรวจอัตโนมัติย้อนหลัง</em>
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
              <h3>ขั้นตอนตรวจรายงานอัตโนมัติ</h3>
              <p>ทุก submission ได้ผลสุดท้ายทันที ไม่มีคิวอนุมัติด้วยคน</p>
            </div>
          </div>
          <ol className="cp-admin-workflow">
            <li>
              <span>1</span>
              <div>
                <strong>ตรวจข้อมูลก่อนอ่านภาพ</strong>
                <small>ยืนยัน GPS และป้องกันภาพซ้ำแบบ exact duplicate</small>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>อ่านตัวเลขด้วย OCR</strong>
                <small>อ่านเฉพาะตัวเลข PM2.5 จากภาพเครื่องวัด</small>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>เผยแพร่หรือให้ถ่ายใหม่</strong>
                <small>
                  อ่านเลขได้เผยแพร่ทันที อ่านไม่ได้แจ้งให้ผู้ใช้ถ่ายใหม่
                </small>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>บันทึกหลักฐานและ audit log</strong>
                <small>ผู้ดูแลเปิดดูย้อนหลังได้ แต่ไม่มีปุ่มแก้ผลตรวจ</small>
              </div>
            </li>
          </ol>
        </article>

        <article className="cp-admin-overview-card">
          <div className="cp-admin-card-heading">
            <div>
              <h3>ขอบเขตสิทธิ์ของผู้ดูแล</h3>
              <p>แยกงานตรวจสอบระบบออกจากการตัดสินข้อมูลผู้ใช้</p>
            </div>
          </div>
          <div className="cp-admin-permission-list">
            <div data-allowed>
              <AppIcon name="check" size={17} />
              ดูภาพ รายละเอียด ผล OCR และเหตุผลย้อนหลัง
            </div>
            <div data-allowed>
              <AppIcon name="check" size={17} />
              ดูสุขภาพข้อมูล Air4Thai และ audit log
            </div>
            <div data-allowed={isAdmin || undefined}>
              <AppIcon name={isAdmin ? "check" : "alert"} size={17} />
              สร้างประกาศและกิจกรรม {isAdmin ? "" : "(Admin เท่านั้น)"}
            </div>
            <div>
              <AppIcon name="close" size={17} />
              ไม่มีสิทธิ์อนุมัติหรือปฏิเสธรายงานด้วยคน
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
