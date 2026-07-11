"use client";

/**
 * AppShell — 신규 스킨 공용 셸 (클라이언트). (구 app skin 프리뷰에서 운영 라우트로 승격.)
 *
 * 주요 페이지(피드=/ · 투데이=/today · 내 노트=/notes · 글 상세 · 글쓰기=/write · 마이=/my)가 공유하는 글로벌 크롬:
 *   - 풀뷰포트 오버레이(styles.root: position:fixed; inset:0; z-index:100; overflow-y:auto)
 *     → 루트 layout.tsx 의 TopNav/SiteFooter/main 을 시각적으로 가린다.
 *   - 헤더(로고 + 데스크탑 GNB·검색·글쓰기 / 모바일 아이콘) — 실제 프리뷰 경로 연결.
 *   - 하단 둥근 탭바(모바일) — 실제 프리뷰 경로 연결.
 *   - 캔버스 배경/토큰은 모두 app.module.css 의 .root 스코프에 격리.
 *
 * 페이지별 내용은 children 으로 주입. (옵션) chips 는 본문 상단 칩줄,
 * sidebar 는 데스크탑 2단 우측 칼럼. 둘 다 없으면 단일 칼럼.
 *
 * 모든 nav/tab/GNB 는 next/link 로 5개 운영 라우트를 실제로 오간다.
 * active prop 으로 현재 페이지를 강조.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./app.module.css";
import { useSession } from "@/lib/session-context";
import { addEngagement } from "@/lib/engagement-score";
import SearchPanel, { prefetchDiscover, type SearchPanelHandle } from "@/components/search/SearchPanel";
import { addRecent } from "@/lib/recent-search";
import { showToast } from "@/lib/toast";
import BackButton from "@/components/BackButton";
import GuardedLink from "@/components/GuardedLink";
import { useSoftKeyboardOpen } from "@/lib/useSoftKeyboardOpen";

/* ---------- 공유 라우트 맵 ---------- */
export const ROUTES = {
  today: "/today",
  notes: "/notes",
  feed: "/",
  // 리포트 허브(/reports) — 탭/GNB 의 '리포트' 슬롯이 진입점. 허브 페이지는 별도 신설.
  report: "/reports",
  // write 는 하단 탭에서 제외됐지만(글쓰기=우하단 FAB) 데스크탑 헤더 '글쓰기' 버튼이 사용 → 유지.
  write: "/write",
  // shop 은 준비중(comingSoon)이라 탭/GNB 에서 라우팅하지 않지만, 실재하는 /shop(ShopView 준비중 페이지)
  //   를 가리키도록 정합화 — href "#" dead 값 제거.
  shop: "/shop",
  my: "/my",
} as const;

// "글쓰기" 는 하단 탭에선 빠졌지만 글쓰기·후기 화면(WriteView/WriteEditShell/ReviewNew/ReviewEdit)의
//   active 톤으로 계속 쓰인다(탭바엔 해당 항목이 없어 강조되지 않음 — 의도된 동작).
export type NavTab = "투데이" | "내 노트" | "피드" | "리포트" | "글쓰기" | "쇼핑" | "마이";

/* ---------- 헤더 아이콘 ---------- */
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/* ---------- 탭바 아이콘 ---------- */
function IconNote() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3H8C9.06087 3 10.0783 3.42143 10.8284 4.17157C11.5786 4.92172 12 5.93913 12 7V21C12 20.2044 11.6839 19.4413 11.1213 18.8787C10.5587 18.3161 9.79565 18 9 18H2V3Z" />
      <path d="M22 3H16C14.9391 3 13.9217 3.42143 13.1716 4.17157C12.4214 4.92172 12 5.93913 12 7V21C12 20.2044 12.3161 19.4413 12.8787 18.8787C13.4413 18.3161 14.2044 18 15 18H22V3Z" />
    </svg>
  );
}
function IconToday() {
  // 투데이 = 해(오늘의 피부 날씨·오늘 기록 진입점) 아이콘.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function IconFeed() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11C6.38695 11 8.67613 11.9482 10.364 13.636C12.0518 15.3239 13 17.6131 13 20" />
      <path d="M4 4C8.24346 4 12.3131 5.68571 15.3137 8.68629C18.3143 11.6869 20 15.7565 20 20" />
      <path d="M5 20C5.55228 20 6 19.5523 6 19C6 18.4477 5.55228 18 5 18C4.44772 18 4 18.4477 4 19C4 19.5523 4.44772 20 5 20Z" />
    </svg>
  );
}
function IconShop() {
  return (
    <svg viewBox="0 0 23 23" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.70002 1.8999L2.85002 5.6999V18.9999C2.85002 19.5038 3.0502 19.9871 3.40652 20.3434C3.76284 20.6997 4.24611 20.8999 4.75002 20.8999H18.05C18.5539 20.8999 19.0372 20.6997 19.3935 20.3434C19.7498 19.9871 19.95 19.5038 19.95 18.9999V5.6999L17.1 1.8999H5.70002Z" />
      <path d="M2.85002 5.69995H19.95" />
      <path d="M15.2 9.5C15.2 10.5078 14.7997 11.4744 14.087 12.187C13.3744 12.8996 12.4078 13.3 11.4 13.3C10.3922 13.3 9.42565 12.8996 8.71302 12.187C8.00038 11.4744 7.60002 10.5078 7.60002 9.5" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5" />
    </svg>
  );
}
function IconReport() {
  // 리포트 = 막대그래프/차트(시술 후기 집계 리포트) 아이콘. 다른 탭 아이콘과 동일 시그니처.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.2135 16.9915V7.99148" />
      <path d="M14.0348 16.9915V3.1521" />
      <path d="M8.85614 16.9915L8.85614 11.9915" />
      <path d="M21.8985 20.8481H3.87069V3.28174" />
    </svg>
  );
}

/* nav 항목 공통 타입 — comingSoon 플래그로 '준비중'(쇼핑) 분기를 명시화(href "#" 해킹 폐기). */
type NavItem = { label: NavTab; href: string; icon?: ReactNode; comingSoon?: boolean };

/* 페이지별 캔버스 배경 variant (2026-07-08 UI 개편 Phase 0-4).
   app.module.css 의 variant 클래스(--tt-canvas/--tt-canvas-top 재정의만)와 1:1 매핑.
   2026-07-11 기본(.root)이 단색 #F5FBFF 로 통일되어 report/my/profile 은 기본과 동값(무해·존치).
   "gradient"=투데이 전용 — 기본 단색에서 기존 브랜드 그라데이션+헤더 유리 질감으로 복원. */
export type CanvasVariant = "report" | "my" | "profile" | "gradient";
const CANVAS_CLASS: Record<CanvasVariant, string> = {
  report: styles.canvasReport,
  my: styles.canvasMy,
  profile: styles.canvasProfile,
  gradient: styles.canvasGradient,
};

/* 탭바 항목 정의 — 글쓰기는 우하단 FAB(WriteFab)로 분리, 하단 탭은 5개.
   마이 슬롯을 리포트로 교체(마이는 헤더 우상단 아바타로 진입). 쇼핑은 준비중(딤드, 텍스트 배지 없음). */
const TABS: NavItem[] = [
  { label: "투데이", href: ROUTES.today, icon: <IconToday /> },
  { label: "내 노트", href: ROUTES.notes, icon: <IconNote /> },
  { label: "피드", href: ROUTES.feed, icon: <IconFeed /> },
  { label: "리포트", href: ROUTES.report, icon: <IconReport /> },
  { label: "쇼핑", href: ROUTES.shop, icon: <IconShop />, comingSoon: true },
];

/* GNB(데스크탑) 항목 — 투데이 / 내 노트 / 피드 / 리포트 / 쇼핑 (데스크탑 글쓰기는 헤더 우측 버튼) */
const GNB: NavItem[] = [
  { label: "투데이", href: ROUTES.today },
  { label: "내 노트", href: ROUTES.notes },
  { label: "피드", href: ROUTES.feed },
  { label: "리포트", href: ROUTES.report },
  { label: "쇼핑", href: ROUTES.shop, comingSoon: true },
];

export default function AppShell({
  active,
  children,
  chips,
  sidebar,
  sidebarMobileBelow = false,
  wide = false,
  keepCanvas = false,
  canvas,
  back,
  backTitle,
  backHeader,
  titleHeader,
  searchValue,
  onSearchChange,
  onSearchSubmit,
}: {
  active: NavTab;
  children: ReactNode;
  chips?: ReactNode;
  sidebar?: ReactNode;
  /** 모바일에서 사이드바를 숨기지 않고 본문 아래로 표시(글상세의 작성자 프로필·연관 Q&A 용). */
  sidebarMobileBelow?: boolean;
  /** 본문 좌상단 '< 뒤로' 버튼(운영 BackButton 재사용). 서브 페이지(글상세/공개프로필/설정/admin)에서 사용.
   *  true → 기본 fallback(피드=/). 문자열 → 그 경로를 fallback(직접 진입·새 탭일 때 이동 대상). */
  back?: boolean | string;
  /** '< 뒤로' 옆에 붙는 페이지 제목(토픽·리포트·원장 답변 헤더 등). 좌우 칼럼 시작 높이를 맞추는 용도. */
  backTitle?: ReactNode;
  /** 2뎁스(세부) 헤더 variant (R2-2, 2026-07-09 시안 원안) — 지정 시 모바일(<900px) 헤더 최상단
   *  좌측 로고 자리에 BackButton(화살표만, fallbackHref)을 렌더. 우측 검색·알림·아바타와 칩바·
   *  hide-on-scroll·탭바는 전부 현행 그대로. 데스크탑(≥900px)은 로고+GNB 유지(브랜드 부재 방지)
   *  — 대신 본문 첫 줄에 '< 뒤로' 행(.backRowDesktop, 구 back prop 과 동일 위치)을 노출.
   *  미지정 시 현행과 100% 동일. back prop(전 뷰포트 본문 뒤로 행)과는 화면당 하나만 사용.
   *  R5-31 확장: title/action 지정 시 모바일 헤더 = [← 타이틀 … 액션](검색·벨·아바타는 CSS 로
   *  숨김 — .headerInnerBack). 기존 소비처(fallbackHref 만 — /reports 상세)는 100% 현행 동일. */
  backHeader?: { fallbackHref?: string; title?: ReactNode; action?: ReactNode };
  /** 1뎁스 허브의 모바일 타이틀 헤더 (R5-20, 2026-07-09 — 마이페이지) — 지정 시 모바일(<900px)
   *  헤더 좌측 로고 자리에 페이지 타이틀(19px/800), 벨 뒤에 페이지 액션(설정 등)을 렌더.
   *  검색 아이콘 미렌더 + 아바타 CSS 숨김(.headerInnerTitle). 벨(미읽음 배지)은 현행 유지.
   *  데스크탑(≥900px)은 로고+GNB 현행(타이틀·액션은 CSS 숨김 — in-content 타이틀이 담당).
   *  backHeader·back 과는 화면당 하나만 사용. */
  titleHeader?: { title: string; actions?: ReactNode };
  /** admin 전용 전체 폭 모드 — 본문을 좁은 .layoutSingle(820px) 대신 운영 admin 과 같은 풀폭(1080px)으로.
   *  기본 false → 피드/공개프로필/글쓰기/내노트/마이/글상세 등 기존 화면은 영향 없음(현행 좁은 중앙 정렬 유지). */
  wide?: boolean;
  /** wide 레이아웃(탭바 숨김·풀폭)은 쓰되 admin 회색 배경(.rootWide) 대신 .root 캔버스
   *  그라데이션을 유지 — 로그인/회원가입 등 비-admin 인증 화면용(피드와 동일 배경). (2026-06-17) */
  keepCanvas?: boolean;
  /** 페이지별 캔버스 배경 variant (2026-07-08 UI 개편 Phase 0-4) — .root 에 variant 클래스 추가 부착.
   *  "report"=#F5FBFF · "my"=#DAF1FB · "profile"=#EAF2F8 (단색, --tt-canvas/--tt-canvas-top 재정의만).
   *  미지정 시 현행 그라데이션과 100% 동일(기존 화면 무영향). wide 와 동시 사용은 없음(비충돌 —
   *  .rootWide 는 background 직접 지정이라 함께 부착돼도 wide 배경이 이긴다). */
  canvas?: CanvasVariant;
  /** 헤더 검색 입력값(피드만 controlled — 그 자리서 필터). 없으면 셸 로컬 state. */
  searchValue?: string;
  onSearchChange?: (q: string) => void;
  /** 검색 제출(엔터/추천·태그 클릭) — 모든 페이지가 /?q= 로 라우팅(홈 승격 후 운영 정합).
   *  주입되면 onSearchChange 없이도 검색 UI 활성. 실제 드롭다운/자동완성은 SearchPanel 가 담당. */
  onSearchSubmit?: (q: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // 모바일 소프트 키보드 열림 추정 — 열리면 하단 탭바를 숨겨 입력 영역을 가리지 않게 한다.
  //   visualViewport 미지원이면 항상 false. 데스크탑(≥900px)은 소프트 키보드가 없어 항상 false → 영향 없음.
  const keyboardOpen = useSoftKeyboardOpen();
  // 우상단 아바타 — 운영 BottomNav 와 동일하게 active 명함 기준(useSession). 없으면 기본 아이콘.
  const session = useSession();
  const activeAvatar = session
    ? (session.identities.find((i) => i.id === session.activeIdentityId)?.avatarUrl ??
       session.avatarUrl)
    : null;
  // 항목 1) 스크롤 다운 → 헤더 숨김(위로 슬라이드), 스크롤 업 → 복귀.
  const [headerHidden, setHeaderHidden] = useState(false);
  // 작업 C) 로그인 여부 — useSession() 의 session 존재로 판정(쿠키 동기, 네트워크 없음).
  //   session != null → 로그인, session == null → 비로그인.
  //   라우팅마다 셸이 재마운트되어도 SessionProvider 는 상위에 유지되므로 깜빡임 없음.
  const isLoggedIn = session != null;
  // 첫 페인트 가림 — SSR/하이드레이션 직후 한 번은 session 이 쿠키 접근 전이라 null 일 수 있어,
  //   마이/로그인 분기를 첫 페인트만 숨겨 비로그인 플래시를 막는다(라우팅마다 재발 X, 1회성).
  const [mounted, setMounted] = useState(false);
  // 알림 벨 미읽음 카운트 — /api/notifications?countOnly=1 의 unread 필드를 사용
  //   (items RPC 생략, active profile 기준 get_my_unread_count RPC + RLS, 우회 없음).
  //   비로그인(!session)이면 0 으로 유지 → 배지 숨김(깜빡임 방지).
  const [unread, setUnread] = useState(0);

  /* eslint-disable-next-line react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true);
  }, []);

  // 작업 B) 미읽음 알림 카운트 폴링(운영 NotificationsBell 로직 재사용).
  //   - 로그인(session 존재) 시에만 fetch — 비로그인엔 호출 안 함.
  //   - 60초 폴링 + 탭 hidden 시 skip + 탭 복귀 시 즉시 refetch.
  //   - /notifications 페이지가 읽음 처리하면 emit 하는 이벤트로 배지 동기화.
  //   - AbortController 로 in-flight fetch 취소.
  useEffect(() => {
    if (!isLoggedIn) {
      setUnread(0);
      return;
    }
    const ac = new AbortController();
    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/notifications?countOnly=1", {
          cache: "no-store",
          signal: ac.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { unread: number };
        if (ac.signal.aborted) return;
        setUnread(Number(data.unread ?? 0));
      } catch (e) {
        // abort(탭 전환·네비게이션)는 정상 — 그 외만 무시.
        if (e instanceof Error && e.name === "AbortError") return;
      }
    };
    void fetchUnread();
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchUnread();
    }, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchUnread();
    };
    const onRead = () => void fetchUnread();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pibutenten:notifications-read", onRead);
    return () => {
      ac.abort();
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pibutenten:notifications-read", onRead);
    };
  }, [isLoggedIn]);
  // 피드백 1) 모바일 검색 — 헤더 "안"을 검색 input 으로 전환(헤더 아래 별도 바 X).
  const [searchOpen, setSearchOpen] = useState(false);
  // 피드백 2) 검색 추천 드롭다운 열림 상태(포커스 시 열림, 바깥 클릭 시 닫힘).
  const [suggestOpen, setSuggestOpen] = useState(false);
  // 드롭다운 바깥 클릭 감지용(데스크탑 pill·모바일 inline 공용 래퍼).
  const searchWrapRef = useRef<HTMLDivElement>(null);
  // 자동완성 키보드 네비(↑↓+Enter) — 각 SearchPanel 인스턴스의 handleKeyDown 을 입력이 위임.
  //   데스크탑 입력 → desktopSearchRef(discoveryDropdown 패널) / 모바일 입력 → mobileSearchRef(mobileSearchPanel 패널).
  const desktopSearchRef = useRef<SearchPanelHandle | null>(null);
  const mobileSearchRef = useRef<SearchPanelHandle | null>(null);
  // 피드백 4) 비-피드 페이지(검색 결과는 피드로 라우팅)는 입력값을 셸 로컬 state 로.
  const [localQuery, setLocalQuery] = useState("");
  // 모바일 검색창 "입력 초안" — 확정 검색어(value=URL q, 결과 피드·검색어 알약 구동)와 분리.
  //   결과 상태에서 검색바에 커서를 대면(=열면) 초안을 빈 칸으로 시작해 발견 메뉴(최근/인기/카테고리)를
  //   띄우고 새로 타이핑하게 한다. 확정 검색어(value)는 건드리지 않아 결과 피드가 흔들리지 않는다.
  //   데스크탑은 기존대로 value 를 그대로 쓰므로 영향 없음(모바일 열림 input 만 draft 사용).
  const [draft, setDraft] = useState("");
  // 피드(onSearchChange) 또는 라우팅(onSearchSubmit) 중 하나라도 있으면 검색 UI 활성.
  const isControlled = typeof onSearchChange === "function";
  const searchEnabled = isControlled || typeof onSearchSubmit === "function";
  const value = isControlled ? (searchValue ?? "") : localQuery;
  const setValue = (q: string) => {
    if (isControlled) onSearchChange?.(q);
    else setLocalQuery(q);
  };
  // 드롭다운(최근검색·인기검색·카테고리 인기태그·자동완성) 콘텐츠는 운영 SearchPanel 가 전부 담당.
  //   검색이 활성이면 포커스/타이핑 시 항상 드롭다운을 띄운다(셸이 자체 더미 목록을 만들지 않음).
  const hasDropdown = searchEnabled;
  // 모바일: 검색 결과 동안(활성 검색어 존재 + 검색창 닫힘) 헤더에 검색어 알약 노출.
  //   데스크탑은 상시 검색 pill(헤더 입력칸)이 검색어를 보여주지만, 모바일은 검색창이 아이콘 뒤로
  //   접혀 있어 검색어가 안 보였다(태그 클릭/검색 후 무엇을 검색했는지 미표시). 알약을 띄워
  //   "검색창 열고 그 태그 검색"과 동일한 화면을 만든다. ≥900px 은 CSS 로 숨김(상시 pill 이 담당).
  //   isControlled(=피드만 onSearchChange 주입) 가드 — 비-피드 페이지(글상세/프로필 등)는
  //   value=localQuery 라 라우팅 직전 한순간 값이 남을 수 있어, 검색어가 URL q 로 동기화되는
  //   피드(controlled)에서만 알약을 띄운다.
  const mobileQueryActive =
    searchEnabled && isControlled && !searchOpen && value.trim().length > 0;

  // 셸 mount 시 발견 데이터 선프리페치(운영 BottomNav 와 동일) — 검색창 첫 열기도 즉시 표시.
  useEffect(() => {
    if (searchEnabled) void prefetchDiscover();
  }, [searchEnabled]);

  // 피드백 2) 바깥 클릭 시 드롭다운 닫기.
  useEffect(() => {
    if (!suggestOpen) return;
    const onDown = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [suggestOpen]);

  // 검색 실행 — 피드(controlled)면 그 자리서 필터, 그 외엔 onSearchSubmit 로 /?q= 라우팅.
  //   SearchPanel 가 직접 라우팅(basePath="/")하므로, 셸 input 의 엔터 제출 경로에서만 사용.
  const runSearch = (term: string) => {
    const t = term.trim();
    setSuggestOpen(false);
    setSearchOpen(false);
    // draft 는 여기서 비우지 않음 — 다음 검색창 열기(돋보기 탭)에서 "" 로 초기화한다.
    //   제출 후 searchOpen=false 라 입력칸이 보이지 않으므로 잔류해도 노출되지 않는다.
    if (!t) return;
    // 최근검색 기록 — 비-피드 페이지(record/write/my/post/doctors/topics/admin 등)는 onSearchSubmit
    //   라우팅만 하고 addRecent 를 안 거치므로, 인-헤더 제출 경로에서 여기서 기록한다(구 /search 페이지의
    //   addRecent 역할 승계). 피드는 FeedView::submitSearch 와 이중 호출되나 recent-search 가 dedup → 무해.
    addRecent(t);
    // 소프트월 점수 v5(2026-07-03): 검색 제출 = 명확한 탐색 의도 +3(비로그인만).
    //   모든 화면의 헤더 검색 제출이 이 지점을 지나므로 단일 배선(테이블에만 있고 미배선이던 결함 수정).
    if (!isLoggedIn) addEngagement("search");
    if (typeof onSearchSubmit === "function") onSearchSubmit(t);
    else setValue(t);
  };

  // 검색어 ✕로 지우기 — 입력값·패널 닫기. 피드에서만 전체 피드(/)로 복귀.
  //   (비-피드 페이지(글쓰기/내노트/마이)에선 라우팅하지 않음 — 작성 중 폼 상태 소실 방지.)
  //   전역 규칙(2026-06-28): 인-헤더 검색 입력 모드의 ← (검색 닫기/나가기)가 이 함수를 쓴다.
  //   결과바의 ✕(검색어만 지움)은 clearSearch 가 아니라 setValue("")+재오픈을 직접 호출한다.
  const clearSearch = () => {
    setValue("");
    setDraft("");
    setSuggestOpen(false);
    setSearchOpen(false);
    if (active === "피드") router.push(ROUTES.feed);
  };

  // 쇼핑(준비 중) — GNB·탭바 클릭 시 안내 토스트. 라우팅 없음.
  const onShopClick = () =>
    showToast("쇼핑 준비 중이에요. 곧 만나보실 수 있어요.");

  // 데스크탑 검색 pill 드롭다운(SearchPanel, 최근검색만) — 사용자: "데스크탑은 지금 방식이 좋다".
  //   onPicked: 입력값 동기화 + 닫기. 실제 검색 라우팅은 SearchPanel 가 basePath="/" 로 수행.
  const discoveryDropdown =
    hasDropdown && suggestOpen ? (
      <div className={styles.searchSuggest} role="listbox" aria-label="검색 추천">
        <SearchPanel
          ref={desktopSearchRef}
          query={value}
          basePath="/"
          recentOnly
          onPicked={(t) => {
            setValue(t);
            setSuggestOpen(false);
            setSearchOpen(false);
          }}
        />
      </div>
    ) : null;

  // 항목 12) 모바일 검색 — 운영처럼 헤더 아래로 "큰 창"이 열린다(풀스크린 패널 + 전체 발견 화면).
  //   최근검색 + 인기검색어 + 카테고리별 인기태그까지 모두(recentOnly 아님). 검색 아이콘 탭 시 searchOpen.
  const mobileSearchPanel =
    searchEnabled && searchOpen ? (
      <div className={styles.mobileSearchPanel} role="listbox" aria-label="검색 발견">
        <SearchPanel
          ref={mobileSearchRef}
          query={draft}
          basePath="/"
          onPicked={(t) => {
            setValue(t);
            setDraft("");
            setSuggestOpen(false);
            setSearchOpen(false);
          }}
        />
      </div>
    ) : null;

  // 헤더 hide-on-scroll — 운영 BottomNav 의 스크롤 로직을 그대로 이식(스크롤 소스만 window→.root).
  //   - 데스크탑(≥900px): 항상 표시(접지 않음).
  //   - 모바일: 충분히 내림(y>88 & dy>0) → 숨김 / 올림(dy<0) 또는 최상단(y<20) → 복귀.
  //   - lock(320ms): 토글 직후 락아웃 → 헤더 사라짐 레이아웃 이동이 재트리거하는 진동 차단.
  //   - 미세 델타(<6px, 모멘텀) 무시. 검색 중엔 항상 표시.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let lastY = el.scrollTop;
    let ticking = false;
    let hidden = false;
    let locked = false;
    const setH = (v: boolean) => {
      hidden = v;
      setHeaderHidden(v);
    };
    const lock = () => {
      locked = true;
      setTimeout(() => {
        locked = false;
      }, 320);
    };
    const update = () => {
      ticking = false;
      // 데스크탑: 항상 표시.
      if (window.innerWidth >= 900) {
        if (hidden) setH(false);
        lastY = el.scrollTop;
        return;
      }
      const y = el.scrollTop;
      // 검색 중엔 헤더가 사라지면 안 됨(검색 input 도 사라짐).
      if (searchOpen || suggestOpen) {
        if (hidden) setH(false);
        lastY = y;
        return;
      }
      if (locked) {
        lastY = y;
        return;
      }
      const dy = y - lastY;
      if (Math.abs(dy) < 6) return; // 미세 스크롤(모멘텀) 무시
      lastY = y;
      if (!hidden && y > 88 && dy > 0) {
        setH(true); // 충분히 내림 → 숨김
        lock();
      } else if (hidden && (dy < 0 || y < 20)) {
        setH(false); // 올림/최상단 → 복귀
        lock();
      }
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [searchOpen, suggestOpen]);

  // 헤더 우측 액션(알림 벨 + 아바타/로그인) — 검색 모드·기본 모드가 '한 벌'을 공유한다.
  //   검색 통합(2026-06-28): 검색은 인-헤더 searchOpen 모드 하나로 단일화(별도 /search 페이지 폐기).
  //   검색 입력을 열어도 우측 알림·아바타는 그대로 두고, 검색창은 그 앞 공간(flex)에서만 열린다 →
  //   검색 입력 모드와 검색 결과 모드의 헤더 레이아웃이 [←][검색창][알림][아바타] 로 동일해진다
  //   (한 검색창을 여러 상황에서 재사용). 전역 규칙: ← = 검색창 닫기(나가기) / ✕ = 검색어만 지움.
  const headerActions = (
    <>
      {/* 작업 B) 알림 벨 → 운영 /notifications 로 이동 + 미읽음 카운트 배지.
          미읽음 조회는 운영 NotificationsBell 과 동일 경로(/api/notifications). */}
      <GuardedLink
        className={`${styles.iconBtn} ${styles.iconBtnBell} ${styles.bellWrap}`}
        aria-label={unread > 0 ? `알림 (미확인 ${unread}개)` : "알림"}
        href="/notifications"
      >
        <IconBell />
        {isLoggedIn && unread > 0 && (
          <span className={styles.bellBadge} aria-hidden>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </GuardedLink>

      {/* 작업 C) 로그인 상태 → 마이(아바타), 비로그인 → 로그인.
          session 존재로 판정(쿠키 동기). 첫 페인트(!mounted)만 둘 다 숨겨
          하이드레이션 직후 1회성 비로그인 플래시 방지(라우팅마다 재발 X). */}
      {mounted && isLoggedIn && (
        /* R5-20·31 — .avatarBtn 은 무스타일 마커: titleHeader/backHeader(title·action) 화면의
           모바일 헤더에서 아바타만 숨기기 위한 CSS 훅(.headerInnerTitle/.headerInnerBack 스코프). */
        <GuardedLink
          className={`${styles.iconBtn} ${styles.avatarBtn}`}
          aria-label="마이"
          href={ROUTES.my}
        >
          {/* 항목 3) 로그인 시 active 명함 아바타(동그라미). 사진 없으면 기본 아이콘. */}
          {activeAvatar ? (
            <span className={styles.headerAvatar}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activeAvatar} alt="" />
            </span>
          ) : (
            <IconUser />
          )}
        </GuardedLink>
      )}
      {mounted && !isLoggedIn && (
        <Link className={styles.btnLoginTop} href="/login">
          로그인
        </Link>
      )}
    </>
  );

  return (
    <div
      className={`${styles.root} ${wide && !keepCanvas ? styles.rootWide : ""} ${canvas ? CANVAS_CLASS[canvas] : ""}`}
      ref={scrollRef}
    >
      {/* ---------- 상단바: 헤더 + 칩바를 한 덩어리(topStack)로 묶어 통째로 슬라이드 ----------
          둘을 분리된 sticky 요소로 두면 스크롤 중 어긋나 '두 층이 접히는' 느낌이 나서,
          하나의 래퍼로 감싸 통째로 translateY → 구조상 절대 어긋나지 않음(원장 결정 2026-06-24). */}
      <div className={`${styles.topStack} ${headerHidden ? styles.topStackHidden : ""}`}>
      <header className={styles.header}>
        {/* 피드백 1) 모바일 검색 모드 — 헤더 "안"을 검색 input 으로 전환.
            (데스크탑은 iconBtnSearch 가 display:none → 이 모드 진입 불가, 항상 기본 레이아웃.) */}
        {searchEnabled && searchOpen ? (
          <div className={`${styles.headerInner} ${styles.headerInnerSearch}`}>
            {/* ← 검색 닫기(나가기) — 전역 규칙(2026-06-28): ←=검색창 닫기 / ✕=검색어만 지움.
                draft·value 는 건드리지 않고 입력 모드만 종료(결과 상태는 그대로 유지). */}
            <button
              type="button"
              className={styles.searchBack}
              aria-label="검색 닫기"
              onClick={() => {
                setSearchOpen(false);
                setSuggestOpen(false);
              }}
            >
              <svg
                width={22}
                height={22}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div
              className={`${styles.headerSearch} ${styles.headerSearchLive} ${styles.headerSearchInline}`}
              ref={searchWrapRef}
            >
              <IconSearch />
              {/* 모바일 검색창 입력 — 확정 검색어(value)가 아닌 입력 초안(draft)을 편집.
                  열 때 draft="" 라 발견 메뉴(최근/인기/카테고리)가 뜨고, 타이핑하면 자동완성. */}
              <input
                type="text"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (hasDropdown) setSuggestOpen(true);
                }}
                onFocus={() => hasDropdown && setSuggestOpen(true)}
                onKeyDown={(e) => {
                  // 자동완성 키보드 네비를 모바일 패널(mobileSearchPanel)에 위임 — ↑↓ 하이라이트 이동,
                  //   하이라이트 있을 때 Enter 는 패널이 선택(preventDefault) → 아래 runSearch 는 건너뜀.
                  mobileSearchRef.current?.handleKeyDown(e);
                  if (e.defaultPrevented) return;
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    runSearch(draft);
                  }
                }}
                placeholder="시술·고민 키워드 검색"
                aria-label="검색어 입력"
                autoFocus
              />
              {/* ✕ — 검색어(초안)만 지운다(검색창은 닫지 않음). draft 가 비면 숨김.
                  닫기는 좌측 ← 가 담당(전역 규칙 2026-06-28). */}
              {draft && (
                <button
                  type="button"
                  className={styles.searchClear}
                  aria-label="검색어 지우기"
                  onClick={() => setDraft("")}
                >
                  ✕
                </button>
              )}
              {/* 모바일 발견 화면은 헤더 아래 풀스크린 패널(mobileSearchPanel)이 담당 — 인라인 드롭다운 미사용. */}
            </div>
            {/* 검색 입력 모드에서도 우측 알림·아바타는 그대로 — 검색창(flex:1)은 그 앞 공간만 차지한다
                (풀폭·우측끝까지 X). 결과 모드와 동일한 [←][검색창][알림][아바타] 레이아웃(2026-06-28 통합). */}
            {headerActions}
          </div>
        ) : (
          <div
            className={`${styles.headerInner} ${mobileQueryActive ? styles.headerInnerHasQuery : ""} ${
              titleHeader ? styles.headerInnerTitle : ""
            } ${backHeader && (backHeader.title || backHeader.action) ? styles.headerInnerBack : ""}`}
          >
            {/* 로고 — 데스크탑은 피드(/), 모바일은 투데이(/today)로 진입. 하이드레이션 안전 위해
                JS 분기 없이 두 GuardedLink 를 SSR 렌더하고 CSS(@900px)로 토글한다. */}
            <GuardedLink
              className={`${styles.logoLink} ${styles.logoDesktop}`}
              href={ROUTES.feed}
              aria-label="피부텐텐"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.logoImg} src="/brand-logo.svg" alt="피부텐텐" />
            </GuardedLink>
            {backHeader ? (
              /* 2뎁스 헤더 variant — 모바일 로고 자리에 뒤로가기(BackButton: SPA 이력 있으면
                 router.back, 직접 진입이면 fallbackHref). 데스크탑 로고(.logoDesktop)는 위에서
                 그대로 렌더 — .backHeaderBtn 이 ≥900px 에서 display:none 이라 서로 배타.
                 R5-31: title 지정 시 화살표 옆에 페이지 타이틀(18px/800 — 모바일 전용). */
              <>
                <div className={styles.backHeaderBtn}>
                  <BackButton
                    fallbackHref={backHeader.fallbackHref ?? ROUTES.feed}
                    hideLabel
                  />
                </div>
                {backHeader.title && (
                  <div className={styles.backHeaderTitle}>{backHeader.title}</div>
                )}
              </>
            ) : titleHeader ? (
              /* R5-20 — 1뎁스 허브(마이페이지)의 모바일 타이틀 헤더: 로고 자리에 페이지 타이틀.
                 h1 은 본문(sr-only)이 담당 — 헤더 타이틀은 div(중복 헤딩 방지). */
              <div className={styles.titleHeaderText}>{titleHeader.title}</div>
            ) : (
              <GuardedLink
                className={`${styles.logoLink} ${styles.logoMobile}`}
                href={ROUTES.today}
                aria-label="피부텐텐"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.logoImg} src="/brand-logo.svg" alt="피부텐텐" />
              </GuardedLink>
            )}

            {/* 모바일 검색 결과 헤더 — 인-헤더 검색 입력 모드와 동일 모티프(← + 검색어 필드 + ✕).
                검색 결과 동안(value 존재 + 검색창 닫힘) 로고·검색아이콘 자리를 대체.
                전역 규칙(2026-06-28): ←=검색 닫기(나가기) / 필드 탭=인-헤더 편집 박스 재오픈 /
                ✕=검색어만 지우고 빈 편집 박스 재오픈. ≥900px 은 CSS 로 숨김(데스크탑 상시 pill 이 담당). */}
            {mobileQueryActive && (
              <div className={styles.mobileQuerySearchBar}>
                {/* ← 검색 닫기(나가기) = clearSearch — 검색어 비우고 피드면 전체 피드로 복귀.
                    입력 모드 ←(.searchBack)와 동일 클래스·SVG 로 통일(2026-06-28 알약 정합). */}
                <button
                  type="button"
                  className={styles.searchBack}
                  onClick={clearSearch}
                  aria-label="검색 닫기"
                >
                  <svg
                    width={22}
                    height={22}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </button>
                {/* 검색어 알약 — 입력 모드(.headerSearchInline)와 동일 구조·클래스로 통일.
                    결과바에선 리드온리(직접 편집 X). 검색어 탭하면 인-헤더 편집 박스를 빈
                    초안으로 재오픈(발견 메뉴 + 새 입력). 새 검색은 전부 편집 박스가 담당. */}
                <div
                  className={`${styles.headerSearch} ${styles.headerSearchLive} ${styles.headerSearchInline}`}
                >
                  <IconSearch />
                  <button
                    type="button"
                    className={styles.searchValueBtn}
                    onClick={() => {
                      setDraft("");
                      setSearchOpen(true);
                    }}
                    aria-label="검색어 편집"
                  >
                    {value}
                  </button>
                  {value.trim().length > 0 && (
                    <button
                      type="button"
                      className={styles.searchClear}
                      aria-label="검색어 지우기"
                      onClick={() => {
                        setValue("");
                        setDraft("");
                        setSearchOpen(true);
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}

            <nav className={styles.gnb}>
              {GNB.map((g) =>
                // 쇼핑(준비 중) → 클릭 시 안내 토스트(라우팅 없음) + 딤드(회색). 텍스트 배지 없음.
                g.comingSoon ? (
                  <button
                    key={g.label}
                    type="button"
                    className={`${styles.gnbItem} ${styles.gnbDisabled}`}
                    aria-disabled
                    aria-label={`${g.label} (준비 중)`}
                    onClick={onShopClick}
                  >
                    {g.label}
                  </button>
                ) : (
                  <GuardedLink
                    key={g.label}
                    href={g.href}
                    className={`${styles.gnbItem} ${active === g.label ? styles.gnbActive : ""}`}
                  >
                    {g.label}
                  </GuardedLink>
                ),
              )}
            </nav>

            <div className={styles.headerSpacer} />

            {/* 데스크탑 검색 pill — 항목 5) 실제 input + 피드백 2) 포커스 드롭다운.
                검색 비활성 페이지에선 정적 안내. */}
            {searchEnabled ? (
              <div
                className={`${styles.headerSearch} ${styles.headerSearchLive}`}
                ref={searchWrapRef}
              >
                <IconSearch />
                <input
                  type="text"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (hasDropdown) setSuggestOpen(true);
                  }}
                  onFocus={() => hasDropdown && setSuggestOpen(true)}
                  onKeyDown={(e) => {
                    // 자동완성 키보드 네비를 데스크탑 패널(discoveryDropdown)에 위임 — ↑↓ 하이라이트 이동,
                    //   하이라이트 있을 때 Enter 는 패널이 선택(preventDefault) → 아래 runSearch 는 건너뜀.
                    desktopSearchRef.current?.handleKeyDown(e);
                    if (e.defaultPrevented) return;
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      runSearch(value);
                    }
                  }}
                  placeholder="시술·고민 키워드 검색"
                  aria-label="검색어 입력"
                />
                {value && (
                  <button
                    type="button"
                    className={styles.searchClear}
                    aria-label="검색어 지우기"
                    onClick={clearSearch}
                  >
                    ✕
                  </button>
                )}
                {discoveryDropdown}
              </div>
            ) : (
              <div className={styles.headerSearch}>
                <IconSearch />
                시술·고민 키워드 검색
              </div>
            )}
            <GuardedLink className={styles.btnWriteTop} href={ROUTES.write}>
              <IconPlus />
              글쓰기
            </GuardedLink>

            {/* 모바일 검색 아이콘 — 탭 시 헤더 "안"을 검색 input 으로 전환(인-헤더 searchOpen 모드).
                draft 를 빈 초안으로 열어 발견 메뉴(최근/인기/카테고리)부터 띄운다(2026-06-28 통합).
                R5-20: titleHeader 화면(마이)에선 미렌더 — 타이틀+벨+액션만(아이콘 자체가 모바일
                전용이라 데스크탑 무영향). */}
            {searchEnabled && !titleHeader && (
              <button
                className={`${styles.iconBtn} ${styles.iconBtnSearch}`}
                aria-label="검색"
                aria-expanded={searchOpen}
                type="button"
                onClick={() => {
                  setSearchOpen(true);
                  setDraft("");
                }}
              >
                <IconSearch />
              </button>
            )}
            {/* 우측 액션(알림 벨 + 아바타/로그인) — 검색 모드와 공유하는 한 벌(headerActions). */}
            {headerActions}
            {/* R5-20·31 — 페이지 액션 슬롯(설정 아이콘·수정 링크·⋯ 메뉴 등): headerActions 바로 뒤,
                모바일 전용(≥900px 은 CSS 로 숨김 — 데스크탑은 in-content 행이 담당). */}
            {titleHeader?.actions && (
              <div className={styles.titleHeaderAction}>{titleHeader.actions}</div>
            )}
            {backHeader?.action && (
              <div className={styles.backHeaderAction}>{backHeader.action}</div>
            )}
          </div>
        )}
      </header>
      {/* 칩바 — topStack 안(헤더 바로 아래)에 정적 배치 → 헤더와 한 덩어리로 함께 슬라이드.
          검색 모드(searchOpen)에선 발견 패널이 덮으므로 미표시(검색창만 깔끔히). */}
      {chips && !searchOpen ? (
        <div className={styles.chipBar}>
          <div className={styles.chipRow}>{chips}</div>
        </div>
      ) : null}
      </div>

      {/* 항목 12) 모바일 검색 풀스크린 패널 — 헤더 아래로 큰 발견 화면(운영 BottomNav 모바일 검색 정합). */}
      {mobileSearchPanel}

      {/* ---------- 본문 ---------- */}
      {/* wide(admin) 모드 — .page 의 좁은 max-width(1080) 컨테이너는 유지하되,
          사이드바 없는 admin 이 .layoutSingle(820px)로 더 좁아지는 것을 막아 운영 admin 과 같은 풀폭으로. */}
      <main className={`${styles.page} ${wide ? styles.pageWide : ""}`}>
        {/* 칩바는 상단바(topStack)로 이동했다 — 헤더와 한 덩어리로 함께 움직이기 위함. */}

        {/* 본문 좌상단 '< 뒤로' — 운영 BackButton 재사용(같은 탭 SPA 이동이면 router.back, 직접 진입이면 fallback).
            서브 페이지(글상세/공개프로필/설정/admin)에서만 노출. 피드(홈)는 back 미지정 → 숨김. */}
        {back ? (
          <div className={styles.backRow}>
            <BackButton
              fallbackHref={typeof back === "string" ? back : ROUTES.feed}
              hideLabel={!!backTitle}
            />
            {backTitle ? <div className={styles.backTitle}>{backTitle}</div> : null}
          </div>
        ) : backHeader ? (
          /* backHeader 화면 — 모바일 뒤로는 헤더(로고 자리)가 담당하므로 본문 행은 데스크탑
             (로고+GNB 유지 뷰포트) 전용(.backRowDesktop). 모바일 2줄 중복 방지.
             title 지정 시 '< 뒤로' 옆에 페이지 제목을 한 줄로(.backTitle 18px/800·파란 b — 원장
             답변 헤더 등). 모바일은 헤더(로고 자리)의 backHeaderTitle 이 담당. */
          <div className={`${styles.backRow} ${styles.backRowDesktop}`}>
            <BackButton fallbackHref={backHeader.fallbackHref ?? ROUTES.feed} />
            {backHeader.title && (
              <div className={styles.backTitle}>{backHeader.title}</div>
            )}
          </div>
        ) : null}

        <div
          className={`${styles.layout} ${
            wide
              ? styles.layoutWide
              : sidebar
              ? ""
              : styles.layoutSingle
          }`}
        >
          <div className={styles.feedCol}>{children}</div>
          {sidebar ? (
            <aside
              className={`${styles.sidebar} ${sidebarMobileBelow ? styles.sidebarMobileShow : ""}`}
            >
              {sidebar}
            </aside>
          ) : null}
        </div>
      </main>

      {/* ---------- 하단 둥근 탭바 (모바일) ----------
          wide(admin) 모드에선 피드용 5탭(내노트/글쓰기/피드/쇼핑/마이)이 운영 관리자 화면에 부자연스러워 숨김.
          admin 내 이동은 본문의 운영 프로그램 그리드·탭으로 수행(상단 앱 헤더는 그대로 유지).
          키보드 열림(keyboardOpen): 모바일 소프트 키보드가 입력칸 위로 올라오면 탭바를 숨겨 가림 방지.
          상단 헤더는 유지. 데스크탑은 keyboardOpen 이 항상 false 라 영향 없음. */}
      {!wide && !keyboardOpen && (
        <nav className={styles.tabbar}>
          {TABS.map((t) =>
            // 쇼핑(준비 중) → 클릭 시 안내 토스트(라우팅 없음) + 딤드(회색). 텍스트 배지 없음.
            t.comingSoon ? (
              <button
                key={t.label}
                type="button"
                className={`${styles.tab} ${styles.tabDisabled}`}
                aria-disabled
                aria-label={`${t.label} (준비 중)`}
                onClick={onShopClick}
              >
                {t.icon}
                {t.label}
              </button>
            ) : (
              <GuardedLink
                key={t.label}
                href={t.href}
                className={`${styles.tab} ${
                  active === t.label ? styles.tabActive : ""
                }`}
              >
                {t.icon}
                {t.label}
              </GuardedLink>
            ),
          )}
        </nav>
      )}
    </div>
  );
}
