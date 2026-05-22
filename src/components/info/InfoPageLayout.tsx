import type { ReactNode } from "react";
import BackButton from "@/components/BackButton";
import InfoPageNav, { type InfoPageKey } from "@/components/info/InfoPageNav";
import InfoPageFooter from "@/components/info/InfoPageFooter";

/**
 * 안내 페이지 공통 layout (2026-05-22).
 *
 * 적용 대상: /about, /terms, /privacy, /doctor-guidelines, /disclaimer, /report
 *
 * 통일 항목:
 *   - max-width 720px + 좌우 padding
 *   - BackButton (mb-1 -ml-1)
 *   - H1 26px / 30px (mobile/desktop)
 *   - subtitle muted
 *   - 본문 article (자식 prop)
 *   - 하단 InfoPageNav (6개 칩, 현재 페이지 활성)
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
    <div className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6">
      <BackButton fallbackHref="/" />
      <h1 className="text-[26px] font-bold leading-[1.35] text-[var(--text)] sm:text-[30px]">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">{subtitle}</p>
      )}
      <article className="mt-6 text-[14px] leading-[1.7] text-[var(--text-secondary)]">
        {children}
      </article>
      <InfoPageNav current={current} />
      <InfoPageFooter />
    </div>
  );
}
