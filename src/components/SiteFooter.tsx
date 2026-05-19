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
            href="/terms"
            className="hover:text-[var(--primary)] hover:underline"
          >
            이용약관
          </Link>
          <Link
            href="/privacy"
            className="hover:text-[var(--primary)] hover:underline"
          >
            개인정보 처리방침
          </Link>
          <Link
            href="/doctor-guidelines"
            className="hover:text-[var(--primary)] hover:underline"
          >
            의사 답변 가이드라인
          </Link>
          <Link
            href="/disclaimer"
            className="hover:text-[var(--primary)] hover:underline"
          >
            의료정보 안내
          </Link>
          <Link
            href="/report"
            className="hover:text-[var(--primary)] hover:underline"
          >
            신고하기
          </Link>
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
          신고하기
        </Link>
      </p>
    </footer>
  );
}
