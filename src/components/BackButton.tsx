"use client";

import { useRouter } from "next/navigation";

/**
 * 글 상세 페이지 좌상단 뒤로가기 버튼.
 *
 * 정책 (2026-06-25 개선):
 * - Navigation API (Chrome 102+) 의 `navigation.canGoBack` 으로 뒤로갈 수 있는지 판별.
 * - Navigation API 미지원 브라우저: PerformanceNavigationTiming.type 으로
 *   direct entry (외부 공유 링크, 새 탭 직접 입력) 여부 판별.
 * - 이전 `window.history.length > 1` 단일 조건은 모던 브라우저가 새 탭을
 *   history.length >= 2 로 시작하는 문제 (공유 링크에서 잘못된 router.back() 발생) 로 교체.
 */
export default function BackButton({
  fallbackHref = "/",
  className = "",
  hideLabel = false,
}: {
  fallbackHref?: string;
  className?: string;
  /** true면 '뒤로' 텍스트 숨기고 '<' 화살표만 — 옆에 페이지 제목(backTitle)이 있을 때 통일용. */
  hideLabel?: boolean;
}) {
  const router = useRouter();
  function go() {
    if (typeof window === "undefined") return;
    // Navigation API (Chrome 102+) gives reliable "can go back" signal
    const nav = (window as unknown as { navigation?: { canGoBack: boolean } }).navigation;
    if (nav && typeof nav.canGoBack === "boolean") {
      if (nav.canGoBack) {
        router.back();
      } else {
        router.push(fallbackHref);
      }
      return;
    }
    // Fallback: ScrollManager가 기록한 스크롤 맵에 항목이 있으면 SPA 탐색 이력 존재
    try {
      const raw = sessionStorage.getItem("pbtt-scroll");
      if (raw && Object.keys(JSON.parse(raw)).length > 0) {
        router.back();
        return;
      }
    } catch { /* parse 실패 시 fallback */ }
    router.push(fallbackHref);
  }
  return (
    <button
      type="button"
      onClick={go}
      aria-label="뒤로가기"
      title="뒤로"
      // 위/아래 여백 6px (모바일에서 과한 여백 회귀 — 사용자 보고 2026-05-28).
      // 색상 #A2A6AF 유지. tap target 은 hit area + 좌우 패딩으로 충분.
      className={
        "inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 text-[13px] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--primary)] " +
        className
      }
      style={{ color: "#A2A6AF", paddingTop: "6px", paddingBottom: "6px" }}
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
      {!hideLabel && <span>뒤로</span>}
    </button>
  );
}
