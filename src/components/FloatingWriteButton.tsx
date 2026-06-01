"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

type Props = {
  hasSession: boolean;
  handle: string | null;
};

/** 플로팅 버튼을 숨길 경로 — 글쓰기/후기작성/온보딩 본인 화면에서는 중복 노출 X */
const HIDDEN_PREFIXES = ["/write", "/review", "/onboarding", "/signup", "/login"];

const FAB_COLOR = "#4CBFF2";

/**
 * 우하단 플로팅 작성 버튼 — 위성 메뉴(P4).
 * - 탭하면 위성 3개가 펼쳐짐: "시술 후기" → /review/new, "글쓰기" → /write, "보관함" → /{handle}.
 * - 검색/태그 페이지에서 진입하면 현재 태그를 ?procedure 로 미리선택 전달.
 * - 비로그인은 /login?next=... 로 유도.
 * - 글쓰기/후기/온보딩 등 자기 자신 맥락 페이지에서는 숨김.
 * - 데스크탑(sm:↑): 메인 버튼 위로 라벨 알약 + 아이콘 원 세로 스택.
 * - 모바일(기본): 메인 버튼 둘레로 부채꼴(arc) 배치 (아이콘 원 + 아래 작은 라벨).
 * - iOS safe-area 대응.
 */
export default function FloatingWriteButton({ hasSession, handle }: Props) {
  const pathname = usePathname() || "";
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  // 현재 화면에서 미리선택할 태그 추출 — 검색(q) 또는 토픽 경로.
  let tag = "";
  if (pathname === "/search") tag = (sp.get("q") ?? "").trim();
  else if (pathname.startsWith("/topics/"))
    tag = decodeURIComponent(pathname.slice("/topics/".length)).trim();

  // 시술 후기 — 태그가 있으면 ?procedure 로 미리선택 전달.
  const reviewBase = tag
    ? `/review/new?procedure=${encodeURIComponent(tag)}`
    : "/review/new";
  const reviewHref = hasSession
    ? reviewBase
    : `/login?next=${encodeURIComponent(reviewBase)}`;

  // 글쓰기.
  const writeHref = hasSession ? "/write" : "/login?next=/write";

  // 보관함 — 로그인 + handle 있으면 /{handle}, 아니면 로그인 후 홈.
  const libraryHref =
    hasSession && handle ? `/${handle}` : "/login?next=/";

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
        className="fab-root fixed z-40 flex flex-col items-end gap-3"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
          right: "20px",
        }}
      >
        {open && (
          <>
            {/* ① 시술 후기 — 모바일 왼쪽 / 데스크탑 세로 스택 */}
            <SatelliteItem
              className="fab-sat fab-sat-review"
              href={reviewHref}
              label="시술 후기"
              onClick={() => setOpen(false)}
            >
              {/* 별(후기) 아이콘 */}
              <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                <path d="M12 17.3l-5.6 3.3 1.5-6.3-4.9-4.3 6.4-.5L12 3.5l2.6 6 6.4.5-4.9 4.3 1.5 6.3z" />
              </svg>
            </SatelliteItem>

            {/* ② 글쓰기 — 모바일 좌상단 / 데스크탑 세로 스택 */}
            <SatelliteItem
              className="fab-sat fab-sat-write"
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

            {/* ③ 보관함 — 모바일 위 / 데스크탑 세로 스택 */}
            <SatelliteItem
              className="fab-sat fab-sat-library"
              href={libraryHref}
              label="보관함"
              onClick={() => setOpen(false)}
            >
              {/* 북마크(저장) 아이콘 */}
              <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
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
          className="flex cursor-pointer items-center justify-center rounded-full text-white shadow-[0_8px_20px_rgba(139,195,222,0.35)] transition-all hover:shadow-[0_10px_24px_rgba(139,195,222,0.45)] active:scale-95"
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

      {/*
        반응형 레이아웃 — styled-jsx.
        - 모바일(기본): 위성을 컨테이너(메인 버튼) 우하단 기준 absolute 부채꼴로 배치.
          아이콘 원(46px) + 그 아래 작은 라벨. 메인 버튼은 컨테이너 흐름에 그대로 둠.
        - 데스크탑(≥640px): absolute 무효화하고 세로 스택(라벨 알약 + 아이콘 원).
      */}
      <style jsx>{`
        /* ── 모바일 부채꼴 (기본) ── */
        .fab-root :global(.fab-sat) {
          position: absolute;
          flex-direction: column-reverse;
          align-items: center;
          gap: 4px;
          animation: fab-pop 0.18s ease-out both;
        }
        /* 시술 후기 → 왼쪽 */
        .fab-root :global(.fab-sat-review) {
          bottom: 4px;
          right: 84px;
        }
        /* 글쓰기 → 좌상단 */
        .fab-root :global(.fab-sat-write) {
          bottom: 60px;
          right: 60px;
        }
        /* 보관함 → 위 */
        .fab-root :global(.fab-sat-library) {
          bottom: 84px;
          right: 4px;
        }
        /* 모바일: 라벨 숨김 (아이콘만으로 충분) */
        .fab-root :global(.fab-sat .fab-label) {
          display: none;
        }

        @keyframes fab-pop {
          from {
            opacity: 0;
            transform: scale(0.6);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        /* ── 데스크탑(≥640px) 세로 스택 ── */
        @media (min-width: 640px) {
          .fab-root :global(.fab-sat) {
            position: static;
            flex-direction: row;
            align-items: center;
            gap: 8px;
            animation: none;
          }
          .fab-root :global(.fab-sat .fab-label) {
            display: inline-flex;
            align-items: center;
            font-size: 14px;
            padding: 4px 12px;
            white-space: nowrap;
          }
        }
      `}</style>
    </>
  );
}

/** 위성 항목 — 라벨 알약 + 아이콘 원형(링크). 배치/방향은 부모 className(반응형 CSS)이 제어. */
function SatelliteItem({
  href,
  label,
  onClick,
  className,
  children,
}: {
  href: string;
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex cursor-pointer ${className ?? ""}`}
      aria-label={label}
    >
      <span className="fab-label rounded-full bg-white font-semibold text-[var(--text)] shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
        {label}
      </span>
      <span
        className="flex cursor-pointer items-center justify-center rounded-full shadow-[0_6px_16px_rgba(139,195,222,0.35)] transition-transform active:scale-95"
        style={{ width: 46, height: 46, backgroundColor: FAB_COLOR }}
      >
        {children}
      </span>
    </Link>
  );
}
