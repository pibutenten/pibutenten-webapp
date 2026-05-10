import Link from "next/link";

/**
 * 사이트 글로벌 푸터.
 *  - 의료 정보 사이트(YMYL) 신뢰 신호 — 운영 주체 + 면책 링크
 *  - "전문의 검수" 한 줄 노출 → AI/검색엔진에 사이트 성격 명시
 */
export default function SiteFooter() {
  return (
    <footer className="mx-auto mt-12 w-full max-w-[1080px] border-t border-[var(--border)] px-4 py-6 text-[12px] leading-[1.6] text-[var(--text-muted)] sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <strong className="font-semibold text-[var(--text-secondary)]">
            피부텐텐
          </strong>{" "}
          · 피부과 전문의가 함께 만드는 Q&amp;A SNS · 주식회사 진솔컴퍼니
        </p>
        <nav className="flex flex-wrap gap-3">
          <Link
            href="/about"
            className="hover:text-[var(--primary)] hover:underline"
          >
            사이트 안내
          </Link>
          <Link
            href="/doctors"
            className="hover:text-[var(--primary)] hover:underline"
          >
            전문의
          </Link>
          <Link
            href="/"
            className="hover:text-[var(--primary)] hover:underline"
          >
            피드
          </Link>
        </nav>
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        본 사이트의 전문의 답변은 일반 의학 정보이며 개인의 진단·치료를 대체하지
        않습니다. 자세한 내용은{" "}
        <Link href="/about" className="underline hover:text-[var(--primary)]">
          사이트 안내
        </Link>
        를 참고해주세요.
      </p>
    </footer>
  );
}
