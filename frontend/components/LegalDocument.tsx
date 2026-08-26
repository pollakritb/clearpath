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
    <main className="min-h-screen bg-[#edf6f2] px-4 py-5 text-[#163b37] sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-4 flex items-center justify-between gap-3 rounded-3xl border border-[#d6e5df] bg-white px-4 py-3 shadow-sm sm:px-5">
          <Link
            href="/"
            className="flex min-h-11 items-center gap-3 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b766f]"
          >
            <span
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-2xl bg-[#0b9488] text-xl font-extrabold text-white"
            >
              C
            </span>
            <span>
              <span className="block text-lg font-extrabold leading-tight">
                ClearPath
              </span>
              <span className="block text-xs font-semibold text-[#617773]">
                อากาศทั่วประเทศไทย
              </span>
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-2xl border border-[#cbdcd6] px-4 text-sm font-bold text-[#0b766f] transition-colors hover:bg-[#edf8f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b766f]"
          >
            กลับหน้าแผนที่
          </Link>
        </header>

        <article className="overflow-hidden rounded-[2rem] border border-[#d6e5df] bg-white shadow-[0_16px_44px_rgba(18,72,65,0.08)]">
          <div className="border-b border-[#dce9e4] bg-gradient-to-br from-[#0b766f] to-[#0a9487] px-5 py-8 text-white sm:px-8 sm:py-10">
            <p className="mb-2 text-xs font-extrabold tracking-[0.16em] text-[#c8f2eb] uppercase">
              {eyebrow}
            </p>
            <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#e2f6f2] sm:text-base">
              {summary}
            </p>
            <p className="mt-4 text-xs font-semibold text-[#c8f2eb]">
              มีผลตั้งแต่ 26 สิงหาคม 2569 · ปรับปรุงล่าสุด 26 สิงหาคม 2569
            </p>
          </div>

          <div className="space-y-8 px-5 py-7 sm:px-8 sm:py-9">{children}</div>
        </article>

        <nav
          aria-label="เอกสารทางกฎหมาย"
          className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 text-sm font-bold text-[#0b766f]"
        >
          <Link
            className="min-h-11 content-center hover:underline"
            href="/privacy"
          >
            นโยบายความเป็นส่วนตัว
          </Link>
          <Link
            className="min-h-11 content-center hover:underline"
            href="/terms"
          >
            ข้อกำหนดการใช้งาน
          </Link>
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
    <section>
      <h2 className="text-xl font-extrabold text-[#123f3a]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-[#49635f] [&_a]:font-bold [&_a]:text-[#0b766f] [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
