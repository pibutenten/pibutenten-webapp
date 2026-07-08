"use client";

/**
 * WriteFab — 모바일 우하단 글쓰기 FAB(Floating Action Button).
 *
 * 하단 5탭에서 '글쓰기'를 분리(투데이/내 노트/피드/쇼핑/마이)하면서, 글쓰기 진입을
 * 우하단 떠 있는 버튼으로 제공한다. 누르면 /write(시술노트/시술후기/끄적끄적 탭)로 이동.
 *
 * 단일 배선: layout 에 한 번만 렌더하고 경로로 노출을 제어한다.
 *   - AppShell 은 z-index:100 풀뷰포트 오버레이라, FAB 는 그 위(z-[110])에 떠야 보인다.
 *   - 모바일~태블릿 전용(min-[900px]:hidden) — ≥900px 부터는 데스크탑 헤더 우측 '글쓰기' 버튼이
 *     담당한다(데스크탑 헤더 .btnWriteTop 노출 분기점과 일치시켜 640~899px 전환 갭을 없앤다).
 *   - 하단 탭바 위(약 90px + safe-area)로 띄워 탭과 겹치지 않게 한다.
 *
 * 노출 경로(화이트리스트): 홈(/) · 투데이(/today) · 내 노트(/notes 이하) · 리포트 허브(/reports) ·
 *   글상세(회원/의사). 그 외는 모두 숨김.
 *   소프트 키보드가 열리면(댓글 입력 등) 입력을 가리지 않도록 FAB 를 숨긴다.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isPostDetailPath } from "@/lib/route-class";
import { useSoftKeyboardOpen } from "@/lib/useSoftKeyboardOpen";

// 글쓰기 진입이 자연스러운 화면에서만 FAB 를 노출한다(화이트리스트).
//   노출 = 홈/피드(/) · 투데이(/today) · 내 노트(/notes 이하) · 리포트 허브(/reports) ·
//          글상세(회원 /{handle}/{shortcode}, 의사 4세그).
//   리포트 상세(/reports/{시술})는 2026-07-08 UI 개편(D4)부터 하단 고정 바(저장/공유)가
//   그 자리를 쓰므로 FAB 제외 — 허브 분기(===)는 유지.
//   그 외(프로필 /{handle}·토픽·관리자·원장 대시보드·인증·온보딩 등)는 숨김(의도된 동작).
function isVisible(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/today" ||
    pathname === "/notes" ||
    pathname.startsWith("/notes/") ||
    pathname === "/reports" ||
    isPostDetailPath(pathname)
  );
}

export default function WriteFab() {
  const pathname = usePathname();
  const keyboardOpen = useSoftKeyboardOpen();
  if (!isVisible(pathname)) return null;
  // 키보드가 열리면(댓글 입력 등) FAB 가 입력 영역을 가리므로 숨긴다.
  if (keyboardOpen) return null;

  return (
    <Link
      href="/write"
      aria-label="글쓰기"
      title="글쓰기"
      className="fixed right-[18px] z-[110] flex h-14 w-14 items-center justify-center rounded-full text-white transition-transform active:scale-95 min-[900px]:hidden"
      style={{
        bottom: "calc(90px + env(safe-area-inset-bottom))",
        background: "#4cbff2",
      }}
    >
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </Link>
  );
}
