import AppIcon from "@/frontend/components/ui/AppIcon";
import type { AdminSyncRun } from "@/frontend/types/ui";

import { formatRelative, type AdminView } from "./admin-navigation";

interface AdminOverviewProps {
  queueCount: number;
  loading: boolean;
  error: string | null;
  latestRun?: AdminSyncRun;
  activeModels: number;
  modelCount: number;
  isAdmin: boolean;
  onNavigate: (view: AdminView) => void;
}

export default function AdminOverview({
  queueCount,
  loading,
  error,
  latestRun,
  activeModels,
  modelCount,
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
            ตรวจเฉพาะรายงานที่ระบบยังไม่มั่นใจ ติดตาม Air4Thai
            และดูว่าโมเดลใดผ่านเกณฑ์ใช้งาน
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
            <em>รายงานจากชุมชน</em>
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
            <AppIcon name="model" size={22} />
          </span>
          <span>
            <small>สถานะเปิดใช้โมเดล</small>
            <strong>
              {loading ? "…" : `${activeModels}/${modelCount || 5}`}
            </strong>
            <em>โมเดลที่เปิดใช้งาน</em>
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
                <strong>ตรวจภาพและเวลา</strong>
                <small>ภาพต้องมาจากกล้องในระบบและไม่ใช่ภาพซ้ำ</small>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>อ่านค่าจากหน้าจอเครื่องวัด</strong>
                <small>OCR เป็นเพียงข้อมูลช่วย ไม่ใช่ค่าตัดสินสุดท้าย</small>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>เทียบข้อมูลอ้างอิง</strong>
                <small>
                  ตรวจ GPS, Air4Thai ใกล้สุด และเหตุผิดปกติในพื้นที่
                </small>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>อนุมัติหรือปฏิเสธ</strong>
                <small>
                  บันทึกค่าที่อ่านจริงและหมายเหตุให้ตรวจสอบย้อนหลังได้
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
              ตรวจและตัดสินรายงานจากชุมชน
            </div>
            <div data-allowed>
              <AppIcon name="check" size={17} />
              ดูสถานะ sync และโมเดลพยากรณ์
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
