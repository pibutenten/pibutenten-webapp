"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * /admin 하위 페이지 좌상단 백 링크.
 *  - /admin 대시보드 본 페이지에선 숨김
 *  - 그 외 하위 페이지에서 "← 대시보드"로 대시보드 복귀
 *  - 라운드 박스 없이 단순 텍스트 링크 (호버 시 primary 강조)
 */
export default function AdminBackLink() {
  const pathname = usePathname() ?? "";
  // /admin 대시보드 본 페이지는 백 링크 불필요
  if (pathname === "/admin" || pathname === "/admin/") return null;
  // 그 외 /admin/* 하위에서만 노출
  if (!pathname.startsWith("/admin")) return null;
  return (
    <div className="mb-3 -mt-2 sm:-mt-1">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
      >
        <span aria-hidden>←</span>
        <span>대시보드</span>
      </Link>
    </div>
  );
}
