import Link from "next/link";
import {
  POLICY_NAV,
  PAGE_TO_CATEGORY,
  type InfoPageKey,
} from "@/lib/policy-nav";

/**
 * 안내 페이지 사이의 2단 chip 네비게이션 (2026-05-28 v2).
 *
 * 1단 (4개 대분류): 소개 / 콘텐츠 정책 / 이용 안내 / 문의·신고
 * 2단 (활성 카테고리의 sub-chip): 해당 카테고리에 속한 페이지들
 *
 * 매핑 SSOT: src/lib/policy-nav.ts (POLICY_NAV)
 *   - chip nav 와 SiteFooter 가 같은 SSOT 참조
 *   - 페이지 추가·삭제 시 policy-nav.ts 한 곳만 수정
 *
 * 디자인 룰:
 *   - 1단 active: 진한 primary 채움 (solid)
 *   - 2단 active: 옅은 primary 배경 + primary 텍스트 (soft)
 *   - 1단 inactive: 흰 배경 + 회색 텍스트
 *   - 2단 inactive: 회색 outline + muted 텍스트
 *   - 모바일 좁은 폭: flex-wrap (2~3개 chip 한 줄, 자연 줄바꿈)
 *
 * 접근성:
 *   - <nav aria-label> 두 개 (대분류 / 세부 정책)
 *   - aria-current="page" 활성 chip 에 표시
 */

export type { InfoPageKey };

export default function InfoPageNav({ current }: { current: InfoPageKey }) {
  const activeCategoryKey = PAGE_TO_CATEGORY[current];
  const activeCategory = POLICY_NAV.find((c) => c.key === activeCategoryKey);
  const subItems = activeCategory?.items ?? [];
  const showSubChips = subItems.length > 1; // 1개뿐이면 굳이 sub-chip 안 보임

  return (
    <div className="mt-10 space-y-2">
      <nav aria-label="정책 대분류" className="flex flex-wrap gap-2">
        {POLICY_NAV.map((cat) => {
          const isActive = cat.key === activeCategoryKey;
          return (
            <Link
              key={cat.key}
              href={cat.defaultHref}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "rounded-full bg-[var(--primary)] px-3 py-1.5 text-[12px] font-semibold text-white"
                  : "rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
              }
            >
              {cat.label}
            </Link>
          );
        })}
      </nav>

      {showSubChips && (
        <nav aria-label="세부 정책" className="flex flex-wrap gap-1.5">
          {subItems.map((item) => {
            const isActive = item.key === current;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "rounded-full bg-[color:color-mix(in_oklab,var(--primary)_18%,white)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary)]"
                    : "rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
