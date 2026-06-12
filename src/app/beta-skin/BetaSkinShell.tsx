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
import styles from "./beta-skin.module.css";

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
  searchValue,
  onSearchChange,
}: {
  active: BetaActive;
  children: ReactNode;
  chips?: ReactNode;
  sidebar?: ReactNode;
  /** 항목 5) 헤더 검색창을 실제 동작시킴 — 피드에서만 주입. 없으면 검색 비활성. */
  searchValue?: string;
  onSearchChange?: (q: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 항목 1) 스크롤 다운 → 헤더 숨김(위로 슬라이드), 스크롤 업 → 복귀.
  const [headerHidden, setHeaderHidden] = useState(false);
  // 모바일 검색 입력 바 펼침 토글.
  const [searchOpen, setSearchOpen] = useState(false);
  // 검색 핸들러가 있을 때만 검색 UI 동작.
  const searchEnabled = typeof onSearchChange === "function";
  const value = searchValue ?? "";

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let lastY = el.scrollTop;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = el.scrollTop;
        const delta = y - lastY;
        // 상단 근처에선 항상 표시. 일정 이상 내려가면 숨김, 올리면 복귀.
        if (y < 24) {
          setHeaderHidden(false);
        } else if (delta > 6) {
          setHeaderHidden(true);
        } else if (delta < -6) {
          setHeaderHidden(false);
        }
        lastY = y;
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={styles.root} ref={scrollRef}>
      {/* ---------- 헤더 (스크롤 다운 시 위로 슬라이드되어 사라짐) ---------- */}
      <header
        className={`${styles.header} ${headerHidden ? styles.headerHidden : ""}`}
      >
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
            {GNB.map((g) => (
              <Link
                key={g.label}
                href={g.href}
                className={active === g.label ? styles.gnbActive : ""}
              >
                {g.label}
              </Link>
            ))}
          </nav>

          <div className={styles.headerSpacer} />

          {/* 데스크탑 검색 pill — 항목 5) 실제 input. 검색 비활성 페이지에선 정적 안내. */}
          {searchEnabled ? (
            <div className={`${styles.headerSearch} ${styles.headerSearchLive}`}>
              <IconSearch />
              <input
                type="text"
                value={value}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder="시술·고민 키워드 검색"
                aria-label="검색어 입력"
              />
              {value && (
                <button
                  type="button"
                  className={styles.searchClear}
                  aria-label="검색어 지우기"
                  onClick={() => onSearchChange?.("")}
                >
                  ✕
                </button>
              )}
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

          <button
            className={`${styles.iconBtn} ${styles.iconBtnSearch}`}
            aria-label="검색"
            aria-expanded={searchOpen}
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <IconSearch />
          </button>
          <button
            className={`${styles.iconBtn} ${styles.iconBtnBell}`}
            aria-label="알림"
            type="button"
          >
            <IconBell />
          </button>
        </div>

        {/* 모바일 검색 입력 바 — 검색 아이콘 탭 시 펼침. 항목 5) 실제 동작.
            검색어가 있으면(태그 클릭 등) 자동으로 펼쳐 활성 검색어를 보여준다. */}
        {(searchOpen || (searchEnabled && !!value)) && (
          <div className={styles.searchBar}>
            <IconSearch />
            <input
              type="text"
              value={searchEnabled ? value : undefined}
              onChange={
                searchEnabled
                  ? (e) => onSearchChange?.(e.target.value)
                  : undefined
              }
              placeholder="시술·고민 키워드 검색"
              aria-label="검색어 입력"
              readOnly={!searchEnabled}
              autoFocus
            />
            {searchEnabled && value && (
              <button
                type="button"
                className={styles.searchClear}
                aria-label="검색어 지우기"
                onClick={() => onSearchChange?.("")}
              >
                ✕
              </button>
            )}
          </div>
        )}
      </header>

      {/* ---------- 본문 ---------- */}
      <main className={styles.page}>
        {chips ? (
          // 항목 1) 칩바는 sticky top:0 — 헤더가 스크롤로 사라지면 화면 최상단 고정.
          <div className={styles.chipBar}>
            <div className={styles.chipRow}>{chips}</div>
          </div>
        ) : null}

        <div
          className={`${styles.layout} ${sidebar ? "" : styles.layoutSingle}`}
        >
          <div className={styles.feedCol}>{children}</div>
          {sidebar ? <aside className={styles.sidebar}>{sidebar}</aside> : null}
        </div>
      </main>

      {/* ---------- 하단 둥근 탭바 (모바일) ---------- */}
      <nav className={styles.tabbar}>
        {TABS.map((t) => (
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
        ))}
      </nav>
    </div>
  );
}
