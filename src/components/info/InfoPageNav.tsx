import Link from "next/link";

/**
 * 안내 페이지 6개 사이의 칩 형태 네비게이션 (2026-05-22).
 *
 * 현재 페이지 = primary 배경 + 흰 글씨
 * 다른 페이지 = 회색 outline
 *
 * 사용처: /about, /terms, /privacy, /doctor-guidelines, /disclaimer, /report
 */

export type InfoPageKey =
  | "about"
  | "terms"
  | "privacy"
  | "doctor-guidelines"
  | "disclaimer"
  | "report";

const PAGES: ReadonlyArray<{ key: InfoPageKey; href: string; label: string }> = [
  { key: "about", href: "/about", label: "사이트 안내" },
  { key: "terms", href: "/terms", label: "이용약관" },
  { key: "privacy", href: "/privacy", label: "개인정보 처리방침" },
  { key: "doctor-guidelines", href: "/doctor-guidelines", label: "의사 답변 가이드라인" },
  { key: "disclaimer", href: "/disclaimer", label: "의료정보 안내" },
  { key: "report", href: "/report", label: "콘텐츠 신고" },
];

export default function InfoPageNav({ current }: { current: InfoPageKey }) {
  return (
    <nav
      aria-label="안내 페이지 둘러보기"
      className="mt-10 flex flex-wrap gap-2"
    >
      {PAGES.map((p) => {
        const isActive = p.key === current;
        return (
          <Link
            key={p.key}
            href={p.href}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "rounded-full bg-[var(--primary)] px-3 py-1.5 text-[12px] font-semibold text-white"
                : "rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
            }
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
