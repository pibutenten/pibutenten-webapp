"use client";

import { useRouter } from "next/navigation";

/**
 * 글 상세 페이지 좌상단 뒤로가기 버튼.
 * - history.back() 시도 — 같은 SPA 세션 안이면 옛 피드/스크롤 위치 복원 (사용자 요청)
 * - history depth 1 이하 (외부 직접 진입) 면 fallback / (홈) 으로 이동
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
    // history depth 가 있으면 back, 없으면 fallback
    if (window.history.length > 1 && document.referrer && document.referrer !== window.location.href) {
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
        "inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--text)] " +
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
        className="h-5 w-5"
        aria-hidden
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  );
}
