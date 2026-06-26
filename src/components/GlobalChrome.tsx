"use client";

/**
 * GlobalChrome — 루트 레이아웃의 전역 푸터(SiteFooter)를 경로별로 분기 렌더(ChromeFooter).
 *
 * 옛 전역 헤더(TopNav→BottomNav)는 AppShell 단일화로 폐기됨(2026-06-27, ChromeHeader 제거).
 * 헤더·탭바·캔버스는 각 라우트의 AppShell(fixed 오버레이)이 담당한다. 비-앱셸 경로(거의 전부
 * redirect/오버레이)에서만 SiteFooter 를 렌더하며, 앱 셸 라우트에선 isAppShell 판정으로 렌더 안 함.
 *
 * usePathname 은 SSR/CSR 동일 값이라 서버 렌더 HTML 부터 일관(하이드레이션 안전).
 * 화면을 앱 셸로 승격할 때마다 아래 isAppShell 목록에 그 경로를 추가한다.
 */

import { usePathname } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import { isPostDetailPath, RESERVED_FIRST_SEGMENT } from "@/lib/route-class";

/** 정확 일치로 승격된 라우트(자체 앱 셸 보유). 동적 하위경로(/record/[id], /write/[shortcode] 등)는 아래 APP_SHELL_PREFIX 로 승격. */
const APP_SHELL_EXACT = new Set<string>([
  "/", // 홈 피드 (Phase 1)
  "/today", // 투데이 (구 /record)
  "/weather", // 오늘의 피부 날씨 상세 (구 /record/weather)
  "/notes", // 내 노트 — 시술 노트 3토글 (구 /record/notes)
  "/write", // 글쓰기 (Phase 1b)
  "/doctor", // 원장 대시보드 (Phase 3, 관리자 방식 셸)
  "/admin", // 관리자 대시보드 (승격·단일화, 앱 셸)
  "/my", // 마이(역할 분기 redirect 경유지) — 옛 크롬 깜빡임 차단
  // 신뢰·법적·안내 페이지 (InfoShell)
  "/about",
  "/terms",
  "/privacy",
  "/contact",
  "/disclaimer",
  "/editorial-policy",
  "/medical-review",
  "/corrections",
  "/disclosures",
  "/doctor-guidelines",
  "/doctors", // 전문의 목록 (Phase 4)
  "/notifications", // 알림 (Phase 5)
  "/shop", // 쇼핑(준비중) — 옛 크롬 잔존 승격
  "/report", // 콘텐츠 신고 (InfoShell) — 옛 크롬 잔존 승격
  "/app", // 앱 다운로드 랜딩 — 자체 풀스크린 오버레이(z-100), 전역 크롬 제외 (HANDLE_RE 우연 의존 제거)
  // 진입(인증·온보딩) (Phase 5)
  "/login",
  "/login/conflict",
  "/signup",
  "/onboarding",
]);

/** prefix 로 승격된 동적 라우트군(하위 전체 포함). */
const APP_SHELL_PREFIX = [
  "/admin/", // 관리자 하위 전체 (승격·단일화, 앱 셸)
  "/topics/", // 토픽 허브 (Phase 4)
  "/reports/", // 시술 리포트 (Phase 4)
  "/review/", // 후기 작성·수정 (Phase 5: /review/new, /review/{shortcode}/edit)
  "/notes/", // 내 노트 하위 전체 (/notes/[id] 시술 기록 상세 등)
  "/write/", // 글쓰기 하위 전체 (/write/[shortcode] 수정) — 옛 크롬 잔존 승격
  "/my/", // 마이 하위 전체 (/my/recent 등) — 없으면 옛 크롬과 이중 헤더
];

// 회원 글상세/프로필 1~2세그 판정의 예약 세그먼트는 route-class 의 단일 SSOT 를 재사용.

/** 회원 핸들 = 소문자 영숫자/하이픈 3~30자 (운영 [handle] page 의 가드와 동일). */
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

function isAppShell(pathname: string | null): boolean {
  if (!pathname) return false;
  if (APP_SHELL_EXACT.has(pathname)) return true;
  if (APP_SHELL_PREFIX.some((p) => pathname.startsWith(p))) return true;
  const seg = pathname.split("/").filter(Boolean);
  // 의사 공개 프로필 /doctors/{slug} (2세그) — /doctors(목록)는 EXACT.
  if (seg.length === 2 && seg[0] === "doctors") return true;
  // 글상세(회원 /{handle}/{shortcode} 2세그 · 의사 /doctors/{slug}/{year}/{post} 4세그) — 공용 헬퍼 재사용.
  if (isPostDetailPath(pathname)) return true;
  // 회원 공개 프로필 /{handle} (1세그, 예약어 아님 + handle 정규식). /[handle] catch-all 승격.
  if (seg.length === 1 && !RESERVED_FIRST_SEGMENT.has(seg[0]) && HANDLE_RE.test(seg[0])) {
    return true;
  }
  return false;
}

export function ChromeFooter() {
  const pathname = usePathname();
  if (isAppShell(pathname)) return null;
  return <SiteFooter />;
}
