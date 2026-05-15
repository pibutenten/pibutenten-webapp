"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  hasSession: boolean;
};

/** 플로팅 버튼을 숨길 경로 — 글쓰기/온보딩 본인 화면에서는 중복 노출 X */
const HIDDEN_PREFIXES = ["/write", "/onboarding", "/signup", "/login"];

/**
 * 우하단 플로팅 글쓰기 버튼 (Threads 스타일).
 * - 로그인/비로그인 모두 노출 — 비로그인은 클릭 시 /login?next=/write로 유도
 * - 글쓰기/온보딩 등 자기 자신 맥락 페이지에서는 숨김
 * - iOS safe-area 대응
 * - 색상: 로고 primary(#5FA8D3)보다 한 단계 연한 톤 (#4CBFF2) — 부담스럽지 않게
 */
export default function FloatingWriteButton({ hasSession }: Props) {
  const pathname = usePathname() || "";
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  const href = hasSession ? "/write" : "/login?next=/write";
  return (
    <Link
      href={href}
      aria-label="글쓰기"
      className="floating-write fixed z-40 flex items-center justify-center rounded-full text-white shadow-[0_8px_20px_rgba(139,195,222,0.35)] transition-all hover:shadow-[0_10px_24px_rgba(139,195,222,0.45)] active:scale-95"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        right: "20px",
        width: 56,
        height: 56,
        backgroundColor: "#4CBFF2",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
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
