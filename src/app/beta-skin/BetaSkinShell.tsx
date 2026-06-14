"use client";

/**
 * BetaSkinShell — /beta-skin/* 신규 스킨 프리뷰의 공용 셸 (클라이언트).
 *
 * 5개 프리뷰 페이지(피드/내 노트/글 상세/글쓰기/마이)가 공유하는 글로벌 크롬:
 *   - 풀뷰포트 오버레이(styles.root: position:fixed; inset:0; z-index:100; overflow-y:auto)
 *     → 루트 layout.tsx 의 TopNav/SiteFooter/main 을 시각적으로 가린다.
 *   - 헤더(로고 + 데스크탑 GNB·검색·글쓰기 / 모바일 아이콘) — 실제 프리뷰 경로 연결.
 *   - 하단 둥근 탭바(모바일) — 실제 프리뷰 경로 연결.
 *   - 캔버스 배경/토큰은 모두 beta-skin.module.css 의 .root 스코프에 격리.
 *
 * 페이지별 내용은 children 으로 주입. (옵션) chips 는 본문 상단 칩줄,
 * sidebar 는 데스크탑 2단 우측 칼럼. 둘 다 없으면 단일 칼럼.
 *
 * 모든 nav/tab/GNB 는 next/link 로 5개 프리뷰 라우트를 실제로 오간다.
 * active prop 으로 현재 페이지를 강조.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./beta-skin.module.css";
import { useSession } from "@/lib/session-context";
import BetaDiscovery, { prefetchDiscover } from "@/components/beta/BetaDiscovery";
import { showToast } from "@/lib/toast";

/* ---------- 공유 라우트 맵 ---------- */
export const BETA_ROUTES = {
  record: "/beta-skin/record",
  feed: "/beta-skin",
  write: "/beta-skin/write",
  shop: "#",
  my: "/beta-skin/my",
} as const;

export type BetaActive = "내 노트" | "피드" | "글쓰기" | "쇼핑" | "마이";

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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 4h7a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H2zM22 4h-7a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H22z" />
    </svg>
  );
}
function IconWrite() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function IconFeed() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1.6" fill="currentColor" />
    </svg>
  );
}
function IconShop() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M6 7h12l1 13H5L6 7Z" />
      <path d="M9 10V6a3 3 0 0 1 6 0v4" />
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

/* 탭바 항목 정의 */
const TABS: { label: BetaActive; href: string; icon: ReactNode }[] = [
  { label: "내 노트", href: BETA_ROUTES.record, icon: <IconNote /> },
  { label: "글쓰기", href: BETA_ROUTES.write, icon: <IconWrite /> },
  { label: "피드", href: BETA_ROUTES.feed, icon: <IconFeed /> },
  { label: "쇼핑", href: BETA_ROUTES.shop, icon: <IconShop /> },
  { label: "마이", href: BETA_ROUTES.my, icon: <IconUser /> },
];

/* GNB(데스크탑) 항목 — 내 노트 / 피드 / 쇼핑 */
const GNB: { label: BetaActive; href: string }[] = [
  { label: "내 노트", href: BETA_ROUTES.record },
  { label: "피드", href: BETA_ROUTES.feed },
  { label: "쇼핑", href: BETA_ROUTES.shop },
];

export default function BetaSkinShell({
  active,
  children,
  chips,
  sidebar,
  sidebarMobileBelow = false,
  wide = false,
  searchValue,
  onSearchChange,
  onSearchSubmit,
}: {
  active: BetaActive;
  children: ReactNode;
  chips?: ReactNode;
  sidebar?: ReactNode;
  /** 모바일에서 사이드바를 숨기지 않고 본문 아래로 표시(글상세의 작성자 프로필·연관 Q&A 용). */
  sidebarMobileBelow?: boolean;
  /** admin 전용 전체 폭 모드 — 본문을 좁은 .layoutSingle(820px) 대신 운영 admin 과 같은 풀폭(1080px)으로.
   *  기본 false → 피드/공개프로필/글쓰기/내노트/마이/글상세 등 기존 화면은 영향 없음(현행 좁은 중앙 정렬 유지). */
  wide?: boolean;
  /** 헤더 검색 입력값(피드만 controlled — 그 자리서 필터). 없으면 셸 로컬 state. */
  searchValue?: string;
  onSearchChange?: (q: string) => void;
  /** 검색 제출(엔터/추천·태그 클릭) — 모든 페이지가 /beta-skin?q= 로 라우팅(운영 정합).
   *  주입되면 onSearchChange 없이도 검색 UI 활성. 실제 드롭다운/자동완성은 BetaDiscovery 가 담당. */
  onSearchSubmit?: (q: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // 우상단 아바타 — 운영 BetaNav 와 동일하게 active 명함 기준(useSession). 없으면 기본 아이콘.
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
  // 알림 벨 미읽음 카운트 — 운영 NotificationsBell 과 동일하게 /api/notifications?limit=1
  //   의 unread 필드를 사용(active profile 기준 get_my_unread_count RPC + RLS, 우회 없음).
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
        const res = await fetch("/api/notifications?limit=1", {
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
  // 피드백 4) 비-피드 페이지(검색 결과는 피드로 라우팅)는 입력값을 셸 로컬 state 로.
  const [localQuery, setLocalQuery] = useState("");
  // 피드(onSearchChange) 또는 라우팅(onSearchSubmit) 중 하나라도 있으면 검색 UI 활성.
  const isControlled = typeof onSearchChange === "function";
  const searchEnabled = isControlled || typeof onSearchSubmit === "function";
  const value = isControlled ? (searchValue ?? "") : localQuery;
  const setValue = (q: string) => {
    if (isControlled) onSearchChange?.(q);
    else setLocalQuery(q);
  };
  // 드롭다운(최근검색·인기검색·카테고리 인기태그·자동완성) 콘텐츠는 운영 BetaDiscovery 가 전부 담당.
  //   검색이 활성이면 포커스/타이핑 시 항상 드롭다운을 띄운다(셸이 자체 더미 목록을 만들지 않음).
  const hasDropdown = searchEnabled;

  // 셸 mount 시 발견 데이터 선프리페치(운영 BetaNav 와 동일) — 검색창 첫 열기도 즉시 표시.
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

  // 검색 실행 — 피드(controlled)면 그 자리서 필터, 그 외엔 onSearchSubmit 로 /beta-skin?q= 라우팅.
  //   BetaDiscovery 가 직접 라우팅(basePath="/beta-skin")하므로, 셸 input 의 엔터 제출 경로에서만 사용.
  const runSearch = (term: string) => {
    const t = term.trim();
    setSuggestOpen(false);
    setSearchOpen(false);
    if (!t) return;
    if (typeof onSearchSubmit === "function") onSearchSubmit(t);
    else setValue(t);
  };

  // 검색어 ✕로 지우기 — 입력값·패널 닫기. 피드에서만 전체 피드(/beta-skin)로 복귀.
  //   (비-피드 페이지(글쓰기/내노트/마이)에선 라우팅하지 않음 — 작성 중 폼 상태 소실 방지.)
  const clearSearch = () => {
    setValue("");
    setSuggestOpen(false);
    setSearchOpen(false);
    if (active === "피드") router.push(BETA_ROUTES.feed);
  };

  // 쇼핑(준비 중) — GNB·탭바 클릭 시 안내 토스트. 라우팅 없음.
  const onShopClick = () =>
    showToast("쇼핑 준비 중이에요. 곧 만나보실 수 있어요.");

  // 데스크탑 검색 pill 드롭다운(BetaDiscovery, 최근검색만) — 사용자: "데스크탑은 지금 방식이 좋다".
  //   onPicked: 입력값 동기화 + 닫기. 실제 검색 라우팅은 BetaDiscovery 가 basePath="/beta-skin" 로 수행.
  const discoveryDropdown =
    hasDropdown && suggestOpen ? (
      <div className={styles.searchSuggest} role="listbox" aria-label="검색 추천">
        <BetaDiscovery
          query={value}
          basePath="/beta-skin"
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
        <BetaDiscovery
          query={value}
          basePath="/beta-skin"
          onPicked={(t) => {
            setValue(t);
            setSuggestOpen(false);
            setSearchOpen(false);
          }}
        />
      </div>
    ) : null;

  // 헤더 hide-on-scroll — 운영 BetaNav 의 스크롤 로직을 그대로 이식(스크롤 소스만 window→.root).
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

  return (
    <div className={styles.root} ref={scrollRef}>
      {/* ---------- 헤더 (스크롤 다운 시 위로 슬라이드되어 사라짐) ---------- */}
      <header
        className={`${styles.header} ${headerHidden ? styles.headerHidden : ""}`}
      >
        {/* 피드백 1) 모바일 검색 모드 — 헤더 "안"을 검색 input 으로 전환.
            (데스크탑은 iconBtnSearch 가 display:none → 이 모드 진입 불가, 항상 기본 레이아웃.) */}
        {searchEnabled && searchOpen ? (
          <div className={`${styles.headerInner} ${styles.headerInnerSearch}`}>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.iconBtnSearch}`}
              aria-label="검색 닫기"
              onClick={() => {
                setSearchOpen(false);
                setSuggestOpen(false);
              }}
            >
              {/* 뒤로(←) */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
            </button>
            <div
              className={`${styles.headerSearch} ${styles.headerSearchLive} ${styles.headerSearchInline}`}
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
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    runSearch(value);
                  }
                }}
                placeholder="시술·고민 키워드 검색"
                aria-label="검색어 입력"
                autoFocus
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
              {/* 모바일 발견 화면은 헤더 아래 풀스크린 패널(mobileSearchPanel)이 담당 — 인라인 드롭다운 미사용. */}
            </div>
          </div>
        ) : (
          <div className={styles.headerInner}>
            <Link
              className={styles.logoLink}
              href={BETA_ROUTES.feed}
              aria-label="피부텐텐"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.logoImg}
                src="/brand-logo.svg"
                alt="피부텐텐"
              />
            </Link>

            <nav className={styles.gnb}>
              {GNB.map((g) =>
                // 쇼핑(준비 중, href "#") → 클릭 시 안내 토스트(라우팅 없음).
                //   다른 GNB(내 노트/피드)와 동일한 간격·폰트·색으로(준비중 배지 없음).
                g.href === "#" ? (
                  <button
                    key={g.label}
                    type="button"
                    className={styles.gnbItem}
                    onClick={onShopClick}
                  >
                    {g.label}
                  </button>
                ) : (
                  <Link
                    key={g.label}
                    href={g.href}
                    className={`${styles.gnbItem} ${active === g.label ? styles.gnbActive : ""}`}
                  >
                    {g.label}
                  </Link>
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
            <Link className={styles.btnWriteTop} href={BETA_ROUTES.write}>
              <IconPlus />
              글쓰기
            </Link>

            {/* 모바일 검색 아이콘 — 탭 시 헤더 "안"을 검색 input 으로 전환(위 분기). */}
            {searchEnabled && (
              <button
                className={`${styles.iconBtn} ${styles.iconBtnSearch}`}
                aria-label="검색"
                aria-expanded={searchOpen}
                type="button"
                onClick={() => setSearchOpen(true)}
              >
                <IconSearch />
              </button>
            )}
            {/* 작업 B) 알림 벨 → 운영 /notifications 로 이동 + 미읽음 카운트 배지.
                미읽음 조회는 운영 NotificationsBell 과 동일 경로(/api/notifications). */}
            <Link
              className={`${styles.iconBtn} ${styles.iconBtnBell} ${styles.bellWrap}`}
              aria-label={unread > 0 ? `알림 (미확인 ${unread}개)` : "알림"}
              href="/notifications"
            >
              <IconBell />
              {isLoggedIn && unread > 0 && (
                <span
                  className={styles.bellBadge}
                  aria-hidden
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>

            {/* 작업 C) 로그인 상태 → 마이(아바타), 비로그인 → 로그인.
                session 존재로 판정(쿠키 동기). 첫 페인트(!mounted)만 둘 다 숨겨
                하이드레이션 직후 1회성 비로그인 플래시 방지(라우팅마다 재발 X). */}
            {mounted && isLoggedIn && (
              <Link
                className={styles.iconBtn}
                aria-label="마이"
                href={BETA_ROUTES.my}
              >
                {/* 항목 3) 로그인 시 active 명함 아바타(동그라미). 사진 없으면 기본 아이콘.
                    운영 BetaNav 와 동일한 표시(objectPosition·scale). */}
                {activeAvatar ? (
                  <span className={styles.headerAvatar}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={activeAvatar} alt="" />
                  </span>
                ) : (
                  <IconUser />
                )}
              </Link>
            )}
            {mounted && !isLoggedIn && (
              <Link className={styles.btnLoginTop} href="/login">
                로그인
              </Link>
            )}
          </div>
        )}
      </header>

      {/* 항목 12) 모바일 검색 풀스크린 패널 — 헤더 아래로 큰 발견 화면(운영 BetaNav 모바일 검색 정합). */}
      {mobileSearchPanel}

      {/* ---------- 본문 ---------- */}
      {/* wide(admin) 모드 — .page 의 좁은 max-width(1080) 컨테이너는 유지하되,
          사이드바 없는 admin 이 .layoutSingle(820px)로 더 좁아지는 것을 막아 운영 admin 과 같은 풀폭으로. */}
      <main className={`${styles.page} ${wide ? styles.pageWide : ""}`}>
        {chips ? (
          // 칩바 — 헤더 아래 sticky. 헤더 숨김(모바일) 시 chipBarUp 으로 top:0 끌어올림.
          <div
            className={`${styles.chipBar} ${headerHidden ? styles.chipBarUp : ""}`}
          >
            <div className={styles.chipRow}>{chips}</div>
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
          admin 내 이동은 본문의 운영 프로그램 그리드·탭으로 수행(상단 베타 헤더는 그대로 유지). */}
      {!wide && (
      <nav className={styles.tabbar}>
        {TABS.map((t) =>
          // 쇼핑(준비 중, href "#") → 클릭 시 안내 토스트(라우팅 없음).
          t.href === "#" ? (
            <button
              key={t.label}
              type="button"
              className={styles.tab}
              onClick={onShopClick}
            >
              {t.icon}
              {t.label}
            </button>
          ) : (
            <Link
              key={t.label}
              href={t.href}
              className={`${styles.tab} ${
                active === t.label ? styles.tabActive : ""
              }`}
            >
              {t.icon}
              {t.label}
            </Link>
          ),
        )}
      </nav>
      )}
    </div>
  );
}
