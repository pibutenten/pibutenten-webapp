import type { ReactNode } from "react";
import BackButton from "@/components/BackButton";
import InfoPageNav, { type InfoPageKey } from "@/components/info/InfoPageNav";
import InfoPageFooter from "@/components/info/InfoPageFooter";

/**
 * 안내 페이지 공통 layout (2026-05-22, 2026-05-28 폭·헤더 통일).
 *
 * 적용 대상: /about, /terms, /privacy, /doctor-guidelines, /disclaimer, /report,
 *           /contact, /editorial-policy, /medical-review, /corrections, /disclosures
 *
 * 2026-05-28: 대시보드(admin/*, doctor/*) 페이지 레이아웃과 통일.
 *   - 외부 layout 의 max-w-1080 컨테이너 활용 (자체 max-w 제거 → 본문 폭 확대)
 *   - section.w-full py-6
 *   - BackButton: mb-1 -ml-1 (admin 패턴 동일)
 *   - h1: text-2xl font-bold (=24px, admin/cards 등과 1:1)
 *   - subtitle: mt-1 text-xs text-muted (=12px, admin 헤더 보조와 동일)
 *
 * 통일 항목:
 *   - BackButton (mb-1 -ml-1)
 *   - H1 24px
 *   - subtitle muted xs
 *   - 본문 article (자식 prop)
 *   - 하단 InfoPageNav (4개 칩 — 2026-05-28 축소)
 *   - 하단 InfoPageFooter (사업자 정보 + 문의)
 */

export type Props = {
  current: InfoPageKey;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export default function InfoPageLayout({
  current,
  title,
  subtitle,
  children,
}: Props) {
  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1">
        <BackButton fallbackHref="/" />
      </div>
      <div className="mb-5 pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">{subtitle}</p>
        )}
      </div>
      <article className="text-[14px] leading-[1.7] text-[var(--text-secondary)]">
        {children}
      </article>
      <InfoPageNav current={current} />
      <InfoPageFooter />
    </section>
  );
}
