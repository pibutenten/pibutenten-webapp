"use client";

import { useRouter } from "next/navigation";

/**
 * 글 상세 페이지 좌상단 뒤로가기 버튼.
 *
 * 정책 (2026-05-17):
 * - 같은 탭 안에서 한 번이라도 SPA navigation 이 일어났으면 → `router.back()` (피드/스크롤 복원).
 * - 외부에서 단독글 URL 로 바로 진입한 경우 (새 탭, 공유 링크 등) → `fallbackHref` 로 이동.
 * - 판별 기준: **`window.history.length > 1`** 단일 조건.
 *   이전엔 `document.referrer` 비교도 함께 했는데, 홈 → 단독글로 SPA 이동 시 referrer 는
 *   초기 외부 referrer 그대로 유지(또는 빈 문자열) 이라 검사가 실패 → 글쓴이 프로필로
 *   잘못 fallback 되는 버그가 있었음 (사용자 보고 2026-05-17). referrer 검사 제거.
 */
export default function BackButton({
  fallbackHref = "/",
  className = "",
}: {
  fallbackHref?: string;
  className?: string;
}) {
  const router = useRouter();
  function go() {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }
  return (
    <button
      type="button"
      onClick={go}
      aria-label="뒤로가기"
      title="뒤로"
      className={
        "inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--primary)] " +
        className
      }
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
      <span>뒤로</span>
    </button>
  );
}
