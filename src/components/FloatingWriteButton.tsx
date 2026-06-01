"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Props = {
  hasSession: boolean;
};

/** 플로팅 버튼을 숨길 경로 — 글쓰기/후기작성/온보딩 본인 화면에서는 중복 노출 X */
const HIDDEN_PREFIXES = ["/write", "/review", "/onboarding", "/signup", "/login"];

const FAB_COLOR = "#4CBFF2";

/**
 * 우하단 플로팅 작성 버튼 — 위성 메뉴(P4).
 * - 탭하면 위로 두 진입점이 펼쳐짐: "시술 후기" → /review/new, "글쓰기" → /write.
 * - 비로그인은 /login?next=... 로 유도.
 * - 글쓰기/후기/온보딩 등 자기 자신 맥락 페이지에서는 숨김.
 * - iOS safe-area 대응.
 */
export default function FloatingWriteButton({ hasSession }: Props) {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const writeHref = hasSession ? "/write" : "/login?next=/write";
  const reviewHref = hasSession ? "/review/new" : "/login?next=/review/new";

  return (
    <>
      {/* 펼침 시 바깥 클릭으로 닫기 */}
      {open && (
        <div
          className="fixed inset-0 z-30"
          aria-hidden
          onClick={() => setOpen(false)}
        />
      )}

      <div
        className="fixed z-40 flex flex-col items-end gap-3"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
          right: "20px",
        }}
      >
        {open && (
          <>
            <SatelliteItem
              href={reviewHref}
              label="시술 후기"
              onClick={() => setOpen(false)}
            >
              {/* 별(후기) 아이콘 */}
              <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                <path d="M12 17.3l-5.6 3.3 1.5-6.3-4.9-4.3 6.4-.5L12 3.5l2.6 6 6.4.5-4.9 4.3 1.5 6.3z" />
              </svg>
            </SatelliteItem>

            <SatelliteItem
              href={writeHref}
              label="글쓰기"
              onClick={() => setOpen(false)}
            >
              {/* 연필 아이콘 */}
              <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </SatelliteItem>
          </>
        )}

        {/* 메인 토글 버튼 */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "작성 메뉴 닫기" : "작성 메뉴 열기"}
          aria-expanded={open}
          className="flex items-center justify-center rounded-full text-white shadow-[0_8px_20px_rgba(139,195,222,0.35)] transition-all hover:shadow-[0_10px_24px_rgba(139,195,222,0.45)] active:scale-95"
          style={{ width: 56, height: 56, backgroundColor: FAB_COLOR }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6 transition-transform"
            style={{ transform: open ? "rotate(45deg)" : "none" }}
            aria-hidden
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>
    </>
  );
}

/** 위성 항목 — 라벨 알약 + 아이콘 원형(링크). */
function SatelliteItem({
  href,
  label,
  onClick,
  children,
}: {
  href: string;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2"
      aria-label={label}
    >
      <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[var(--text)] shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
        {label}
      </span>
      <span
        className="flex items-center justify-center rounded-full shadow-[0_6px_16px_rgba(139,195,222,0.35)] transition-transform active:scale-95"
        style={{ width: 46, height: 46, backgroundColor: FAB_COLOR }}
      >
        {children}
      </span>
    </Link>
  );
}
