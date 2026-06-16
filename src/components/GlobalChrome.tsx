"use client";

/**
 * GlobalChrome — 루트 레이아웃의 전역 크롬(TopNav/SiteFooter)을 경로별로 분기 렌더.
 *
 * 앱 스킨으로 "승격된" 라우트는 자체 셸(AppShell, fixed 오버레이)이 헤더·탭바·캔버스를
 * 담당한다. 그런 라우트에서 루트의 옛 TopNav/SiteFooter 를 함께 렌더하면, 첫 로딩에 옛 헤더가
 * 잠깐 보였다가 오버레이가 덮는 "깜빡임"이 생긴다. → 승격 라우트에선 옛 크롬을 아예 렌더하지
 * 않아(덮는 게 아니라 처음부터 신규 스킨만) 한 번에 가볍게 뜨도록 한다.
 *
 * usePathname 은 SSR/CSR 동일 값이라 서버 렌더 HTML 부터 옛 크롬이 빠진다(하이드레이션 안전).
 *
 * 전환 진행 규칙: 화면을 앱 셸로 승격할 때마다 아래 목록에 그 경로를 추가한다.
 * 전 화면 승격 완료(공개 전환) 시점에는 TopNav/SiteFooter 자체를 폐기하고 이 분기를 제거한다.
 */

import { usePathname } from "next/navigation";
import TopNav from "@/components/TopNav";
import SiteFooter from "@/components/SiteFooter";

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
];

/**
 * 회원 글상세 /{handle}/{shortcode} 매칭 시 첫 세그먼트가 핸들이 아닌 "예약 라우트"면 제외.
 *   (Next.js 정적 라우트 우선이라 이 이름의 핸들은 실제로 존재 불가하지만, GlobalChrome 은
 *    usePathname 만 보므로 /admin/reports 같은 2세그 경로가 shortcode 정규식에 오매칭돼 admin
 *    헤더가 사라지는 사고를 막기 위해 명시적으로 배제한다.)
 */
const RESERVED_FIRST_SEGMENT = new Set<string>([
  "admin", "api", "auth", "cards", "doctor", "doctors", "topics", "reports",
  "review", "settings", "u", "login", "signup", "onboarding", "write",
  "today", "notes", "weather",
  "my", "shop", "notifications", "search", "debug", "mockups",
  "old-skin", "report", "rss", "about", "terms", "privacy", "contact",
  "disclaimer", "editorial-policy", "medical-review", "corrections",
  "disclosures", "doctor-guidelines",
]);

/** 회원 글 shortcode = base58 6~12자 (운영 [handle]/[shortcode] page 의 fetchQa 가드와 동일). */
const SHORTCODE_RE = /^[1-9A-HJ-NP-Za-km-z]{6,12}$/;

/** 회원 핸들 = 소문자 영숫자/하이픈 3~30자 (운영 [handle] page 의 가드와 동일). */
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

function isAppShell(pathname: string | null): boolean {
  if (!pathname) return false;
  if (APP_SHELL_EXACT.has(pathname)) return true;
  if (APP_SHELL_PREFIX.some((p) => pathname.startsWith(p))) return true;
  const seg = pathname.split("/").filter(Boolean);
  // 의사 공개 프로필 /doctors/{slug} (2세그) — /doctors(목록)는 EXACT.
  if (seg.length === 2 && seg[0] === "doctors") return true;
  // 의사 글상세 /doctors/{slug}/{year}/{postSlug} (4세그).
  if (seg.length === 4 && seg[0] === "doctors") return true;
  // 회원 글상세 /{handle}/{shortcode} (2세그, 첫 세그 예약어 아님 + shortcode base58).
  if (
    seg.length === 2 &&
    !RESERVED_FIRST_SEGMENT.has(seg[0]) &&
    SHORTCODE_RE.test(seg[1])
  ) {
    return true;
  }
  // 회원 공개 프로필 /{handle} (1세그, 예약어 아님 + handle 정규식). /[handle] catch-all 승격.
  if (seg.length === 1 && !RESERVED_FIRST_SEGMENT.has(seg[0]) && HANDLE_RE.test(seg[0])) {
    return true;
  }
  return false;
}

export function ChromeHeader() {
  const pathname = usePathname();
  if (isAppShell(pathname)) return null;
  return <TopNav />;
}

export function ChromeFooter() {
  const pathname = usePathname();
  if (isAppShell(pathname)) return null;
  return <SiteFooter />;
}
