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
 * - 로그인 사용자만 노출
 * - 글쓰기/온보딩 등 자기 자신 맥락 페이지에서는 숨김
 * - iOS safe-area 대응
 */
export default function FloatingWriteButton({ hasSession }: Props) {
  const pathname = usePathname() || "";
  if (!hasSession) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return (
    <Link
      href="/write"
      aria-label="글쓰기"
      className="floating-write fixed z-40 flex items-center justify-center rounded-full text-white shadow-[0_8px_20px_rgba(95,168,211,0.35)] transition-all hover:shadow-[0_10px_24px_rgba(95,168,211,0.45)] active:scale-95"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        right: "20px",
        width: 56,
        height: 56,
        backgroundColor: "#5FA8D3",
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
