"use client";

import Link from "next/link";

type Props = {
  hasSession: boolean;
};

/**
 * 우하단 플로팅 글쓰기 버튼 (Threads 스타일).
 * - 로그인 사용자만 노출
 * - 모든 페이지에서 항상 우하단에 떠 있음
 * - iOS safe-area 대응
 */
export default function FloatingWriteButton({ hasSession }: Props) {
  if (!hasSession) return null;
  return (
    <Link
      href="/write"
      aria-label="글쓰기"
      className="fixed z-40 flex items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-[0_8px_20px_rgba(0,0,0,0.18)] transition-all hover:bg-[var(--primary-dark)] hover:shadow-[0_10px_24px_rgba(0,0,0,0.22)] active:scale-95"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        right: "20px",
        width: 56,
        height: 56,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
    </Link>
  );
}
