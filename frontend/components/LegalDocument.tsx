import Link from "next/link";
import type { ReactNode } from "react";

type LegalDocumentProps = {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
};

export function LegalDocument({
  eyebrow,
  title,
  summary,
  children,
}: LegalDocumentProps) {
  return (
    <main className="cp-legal-page">
      <div className="cp-legal-shell">
        <header className="cp-legal-header">
          <Link href="/" className="cp-legal-brand">
            <span aria-hidden="true" className="cp-legal-brand__mark">
              C
            </span>
            <span>
              <span className="cp-legal-brand__name">ClearPath</span>
              <span className="cp-legal-brand__tagline">
                อากาศทั่วประเทศไทย
              </span>
            </span>
          </Link>
          <Link href="/" className="cp-legal-back">
            กลับหน้าแผนที่
          </Link>
        </header>

        <article className="cp-legal-document">
          <div className="cp-legal-hero">
            <p className="cp-legal-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="cp-legal-summary">{summary}</p>
            <p className="cp-legal-updated">
              มีผลตั้งแต่ 26 สิงหาคม 2569 · ปรับปรุงล่าสุด 26 สิงหาคม 2569
            </p>
          </div>

          <div className="cp-legal-content">{children}</div>
        </article>

        <nav aria-label="เอกสารทางกฎหมาย" className="cp-legal-nav">
          <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
          <Link href="/terms">ข้อกำหนดการใช้งาน</Link>
        </nav>
      </div>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="cp-legal-section">
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}
