import Link from "next/link";
import { FOOTER_ITEMS } from "@/lib/policy-nav";

/**
 * 사이트 글로벌 푸터.
 *  - 의료 정보 사이트(YMYL) 신뢰 신호 — 운영 주체 + 면책 링크
 *  - "전문의 검수" 한 줄 노출 → AI/검색엔진에 사이트 성격 명시
 *  - 2026-05-28 v2: FOOTER_ITEMS SSOT (src/lib/policy-nav.ts) 사용.
 *    11개 → 8개로 정제 (법적 의무 4 + 신뢰성 4).
 *    빠진 3개 (이해상충 / 정정 정책 / 의사 답변 가이드라인) 는
 *    상단 sub-chip + sitemap 으로 접근·색인 보장.
 */
export default function SiteFooter() {
  return (
    <footer className="mx-auto mt-12 w-full max-w-[1080px] border-t border-[var(--border)] px-4 py-6 text-[12px] leading-[1.6] text-[var(--text-muted)] sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <strong className="font-semibold text-[var(--text-secondary)]">
            피부텐텐
          </strong>{" "}
          · 피부과 전문의가 직접 답하는 리프팅 · 스킨부스터 · 안티에이징 · 피부시술 커뮤니티 · 주식회사 진솔컴퍼니
        </p>
        <nav aria-label="사이트 정책" className="flex flex-wrap gap-3">
          {/* 전문의 진입점 — 상단바 통일로 nav 에서 빠진 EEAT(전문성) 내부링크 보강. */}
          <Link
            href="/doctors"
            className="font-medium text-[var(--text-secondary)] hover:text-[var(--primary)] hover:underline"
          >
            전문의
          </Link>
          {FOOTER_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="hover:text-[var(--primary)] hover:underline"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        본 사이트의 전문의 답변은 일반 의학 정보이며 개인의 진단·치료를 대체하지
        않습니다.{" "}
        <Link
          href="/disclaimer"
          className="underline hover:text-[var(--primary)]"
        >
          자세히 보기
        </Link>
      </p>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        문의:{" "}
        <a
          href="mailto:pibutenten@gmail.com"
          className="underline hover:text-[var(--primary)]"
        >
          pibutenten@gmail.com
        </a>{" "}
        · 신고는{" "}
        <Link
          href="/report"
          className="underline hover:text-[var(--primary)]"
        >
          콘텐츠 신고
        </Link>
      </p>
    </footer>
  );
}
