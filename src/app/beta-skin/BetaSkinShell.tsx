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

/* 드롭다운 카테고리 바로가기 1개 */
export type SearchCategory = { key: string; label: string };

export default function BetaSkinShell({
  active,
  children,
  chips,
  sidebar,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  searchSuggestions,
  searchCategories,
  onPickCategory,
  recentSearches,
}: {
  active: BetaActive;
  children: ReactNode;
  chips?: ReactNode;
  sidebar?: ReactNode;
  /** 항목 5) 헤더 검색창을 실제 동작시킴 — 피드에서만 주입. 없으면 검색 비활성. */
  searchValue?: string;
  onSearchChange?: (q: string) => void;
  /** 피드백 4) 검색 제출(엔터/추천 클릭) — 비-피드 페이지는 /beta-skin?q= 로 라우팅.
   *  주입되면 onSearchChange 없이도 검색 UI 활성(입력값은 셸 로컬 state 로 관리). */
  onSearchSubmit?: (q: string) => void;
  /** 피드백 1) 추천 키워드(사이드 인기태그와 다른 셋). */
  searchSuggestions?: string[];
  /** 피드백 1) 카테고리 바로가기(클릭 시 onPickCategory). */
  searchCategories?: SearchCategory[];
  onPickCategory?: (key: string) => void;
  /** 피드백 1) 최근 검색(샘플). 비면 섹션 생략. */
  recentSearches?: string[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 항목 1) 스크롤 다운 → 헤더 숨김(위로 슬라이드), 스크롤 업 → 복귀.
  const [headerHidden, setHeaderHidden] = useState(false);
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
  const suggestions = (searchSuggestions ?? []).filter(Boolean);
  const categories = searchCategories ?? [];
  const recents = (recentSearches ?? []).filter(Boolean);
  // 드롭다운에 띄울 섹션이 하나라도 있으면 활성.
  const hasDropdown =
    searchEnabled &&
    (recents.length > 0 || categories.length > 0 || suggestions.length > 0);

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

  // 검색 실행 — 피드(controlled)면 그 자리서 필터, 비-피드면 onSearchSubmit 로 라우팅.
  const runSearch = (term: string) => {
    const t = term.trim();
    setSuggestOpen(false);
    setSearchOpen(false);
    if (!t) return;
    if (typeof onSearchSubmit === "function") onSearchSubmit(t);
    else setValue(t);
  };

  // 추천/최근 키워드 선택 → 검색 실행.
  const pickSuggestion = (kw: string) => runSearch(kw);

  // 피드백 1) 드롭다운 — BetaDiscovery 구조 차용: 최근검색 / 카테고리 바로가기 / 추천 키워드.
  //   사이드 인기태그와 동일 목록만 보이지 않도록 추천 셋은 호출부에서 다른 셋을 주입.
  const suggestDropdown =
    hasDropdown && suggestOpen ? (
      <div className={styles.searchSuggest} role="listbox" aria-label="검색 추천">
        {recents.length > 0 && (
          <div className={styles.searchSuggestGroup}>
            <div className={styles.searchSuggestHead}>최근 검색</div>
            <div className={styles.searchSuggestChips}>
              {recents.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={styles.searchRecentChip}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickSuggestion(r);
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {categories.length > 0 && (
          <div className={styles.searchSuggestGroup}>
            <div className={styles.searchSuggestHead}>카테고리 바로가기</div>
            <div className={styles.searchSuggestChips}>
              {categories.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={styles.searchCatChip}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSuggestOpen(false);
                    setSearchOpen(false);
                    onPickCategory?.(c.key);
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className={styles.searchSuggestGroup}>
            <div className={styles.searchSuggestHead}>추천 키워드</div>
            {suggestions.map((kw) => (
              <button
                key={kw}
                type="button"
                role="option"
                aria-selected={value.trim() === kw}
                className={styles.searchSuggestItem}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickSuggestion(kw);
                }}
              >
                <IconSearch />
                <span>{kw}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    ) : null;

  // 피드백 8) 스크롤 다운 → 헤더 숨김, 스크롤 "업" → 즉시 복귀.
  //   모든 프리뷰 페이지가 이 셸을 쓰므로 5개 페이지 + 데스크탑 전부 동일 동작.
  //   - 검색 모드/드롭다운 중에는 절대 숨기지 않음(헤더가 사라지면 검색 input 도 사라짐).
  //   - 방향 전환을 놓치지 않도록 매 scroll 이벤트마다 즉시 판정(rAF 디바운스 없음).
  //     위로 가는 즉시(1px) 헤더 복귀 → "살짝 올려도 바로 메뉴 노출".
  //   - 무한스크롤로 콘텐츠 높이가 늘며 scrollTop 이 튀는 경우에도, 직전값 대비
  //     "방향"만 보므로 위로 휠 한 번이면 바로 복귀.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let lastY = el.scrollTop;
    const onScroll = () => {
      const y = el.scrollTop;
      const delta = y - lastY;
      lastY = y;
      if (searchOpen || suggestOpen || y < 24) {
        // 검색 중·상단 근처: 항상 표시.
        setHeaderHidden(false);
      } else if (delta < 0) {
        // 위로 조금이라도 움직이면 즉시 복귀.
        setHeaderHidden(false);
      } else if (delta > 4) {
        // 아래로 일정 이상 내려가면 숨김.
        setHeaderHidden(true);
      }
    };
    // wheel/touch 의 "위로" 의도를 직접 감지 → 무한스크롤 콘텐츠 점프로
    // scrollTop 이 일시적으로 튀어도, 사용자가 위로 올리면 즉시 헤더 복귀.
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0 && !(searchOpen || suggestOpen)) setHeaderHidden(false);
    };
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const cur = e.touches[0]?.clientY ?? 0;
      // 손가락이 아래로 내려가면(콘텐츠는 위로) = scroll up 의도.
      if (cur - touchStartY > 4 && !(searchOpen || suggestOpen)) {
        setHeaderHidden(false);
      }
      touchStartY = cur;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
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
                  onClick={() => setValue("")}
                >
                  ✕
                </button>
              )}
              {suggestDropdown}
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
                    onClick={() => setValue("")}
                  >
                    ✕
                  </button>
                )}
                {suggestDropdown}
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
            <button
              className={`${styles.iconBtn} ${styles.iconBtnBell}`}
              aria-label="알림"
              type="button"
            >
              <IconBell />
            </button>
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
