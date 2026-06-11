"use client";

/**
 * BetaNav — /beta 미리보기 전용 내비게이션. (레퍼런스: pibutenten-nav-mockup After)
 * 레이아웃(1080 컨테이너·footer·카드·피드)은 기존 그대로, 내비만 새 5탭으로 교체.
 *
 * 헤더 = 두 줄:
 *   (A) 로고줄: 로고 + (데스크탑 메뉴) + 검색·알림 (모바일은 마이 아이콘 없음 — 하단탭과 중복)
 *   (B) 칩줄  : 피드(=/beta)에서만. 탭 언더라인 스타일(가벼운 위계).
 * 스크롤 내리면 (A) 로고줄만 접히고 (B) 칩줄이 최상단 sticky로 남음 (모바일 전용).
 * 하단 5탭은 fixed.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import NotificationsBell from "./NotificationsBell";
import BetaDiscovery, { prefetchDiscover } from "./beta/BetaDiscovery";
import { useSession } from "@/lib/session-context";
import { addRecent } from "@/lib/beta-recent";
import { setBetaTab, useBetaTab, type BetaTab } from "@/lib/beta-feed-tab";

const C = "#4cbff2";

function I({ d, size = 22 }: { d: React.ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
}
const ICON = {
  book: <I d={<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>} />,
  pen: <I d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>} />,
  grid: <I d={<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>} />,
  bag: <I d={<><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></>} />,
  user: <I d={<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>} />,
  search: <I size={20} d={<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>} />,
  x: <I size={20} d={<path d="M18 6 6 18M6 6l12 12" />} />,
};

type Tab = { href: string; label: string; icon: React.ReactNode; match: (p: string) => boolean };
const TABS: Tab[] = [
  { href: "/record", label: "내 일기", icon: ICON.book, match: (p) => p.startsWith("/record") },
  { href: "/write", label: "글쓰기", icon: ICON.pen, match: (p) => p === "/write" },
  { href: "/", label: "피드", icon: ICON.grid, match: (p) => p === "/" },
  { href: "/shop", label: "쇼핑", icon: ICON.bag, match: (p) => p.startsWith("/shop") },
  { href: "/my", label: "마이페이지", icon: ICON.user, match: (p) => p.startsWith("/my") },
];

// 피드 상단 카테고리 칩 (페이지 데이터 fetch 는 ?cat= 로 동일).
const CATS: { label: string; cat: string }[] = [
  { label: "전체", cat: "" },
  { label: "Q&A", cat: "qa" },
  { label: "시술후기", cat: "review" },
  { label: "끄적끄적", cat: "doodle" },
  { label: "리포트", cat: "review_summary" },
];

// 칩 클릭 즉시 피드백 — 네비게이션(서버 RSC fetch) 진행 중 스피너. Link 자식에서만 동작(useLinkStatus).
//   로딩 경계가 없어 "먹통"처럼 보이던 탭 전환에 클릭 즉시 반응을 줌.
function ChipPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <svg className="animate-spin" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={C} strokeWidth={2.5} strokeLinecap="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-6.2-8.5" />
    </svg>
  );
}

// 칩줄 — 탭 전환을 "URL 이동"이 아니라 "공유 메모(store) 변경"으로 처리 → 서버 왕복 0, 즉시(동그라미 없음).
//   활성 탭은 useBetaTab() (BetaFeed 와 공유). 검색(?q=)은 URL 로 유지되고, 검색 결과 풀을 같은 방식으로 필터.
function ChipRow() {
  const active = useBetaTab();
  return (
    <div className="border-b border-[#eef1f4]">
      <div className="flex gap-2 overflow-x-auto pt-[6px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATS.map((c) => {
          const on = active === c.cat;
          return (
            <button
              key={c.cat || "all"}
              type="button"
              onClick={() => setBetaTab(c.cat as BetaTab)}
              className="relative flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap px-[6px] pb-[6px] pt-[4px] text-sm"
              style={{ color: on ? "#1a1f27" : "#8a93a0", fontWeight: on ? 800 : 600 }}
            >
              {c.label}
              {on && <span className="absolute bottom-[-1px] left-0 right-0 h-[2px]" style={{ background: C }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 글쓰기 서브탭 — 피드 칩줄과 동일(좌측 정렬 탭 언더라인).
const WRITE_TABS: { label: string; tab: string }[] = [
  { label: "시술일기 쓰기", tab: "record" },
  { label: "시술후기 남기기", tab: "review" },
  { label: "끄적끄적", tab: "doodle" },
];
function WriteTabBar({ active, tabs = WRITE_TABS }: { active: string; tabs?: { label: string; tab: string }[] }) {
  return (
    <div className="border-b border-[#eef1f4]">
      <div className="flex gap-2 overflow-x-auto pt-[6px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const on = active === t.tab;
          return (
            <Link
              key={t.tab}
              href={`/write?tab=${t.tab}`}
              className="relative flex shrink-0 items-center gap-1 whitespace-nowrap px-[6px] pb-[6px] pt-[4px] text-sm"
              style={{ color: on ? "#1a1f27" : "#8a93a0", fontWeight: on ? 800 : 600 }}
            >
              {t.label}
              <ChipPending />
              {on && <span className="absolute bottom-[-1px] left-0 right-0 h-[2px]" style={{ background: C }} />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
function WriteTabsBar() {
  const sp = useSearchParams();
  const session = useSession();
  // Q&A 작성 탭은 원장·관리자에게만 노출(맨 앞). 기존 admin 동선(원장 명의 Q&A 카드 작성) 복원.
  const isStaff = session?.role === "admin" || session?.role === "doctor";
  const tabs = isStaff ? [{ label: "Q&A 작성", tab: "qa" }, ...WRITE_TABS] : WRITE_TABS;
  const tab = sp.get("tab") || "record";
  return <WriteTabBar active={tabs.some((t) => t.tab === tab) ? tab : "record"} tabs={tabs} />;
}

// URL 의 q(검색어)를 검색창에 동기화 — Suspense 격리(BetaNav 하이드레이션 보호).
function SearchQuerySync({ onSync }: { onSync: (q: string) => void }) {
  const sp = useSearchParams();
  const urlQ = sp.get("q") ?? "";
  useEffect(() => { onSync(urlQ); }, [urlQ, onSync]);
  return null;
}

export default function BetaNav() {
  const pathname = usePathname();
  const session = useSession();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);
  const lastY = useRef(0);
  const lockRef = useRef(false);
  const tickRef = useRef(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [urlQ, setUrlQ] = useState("");

  const isFeed = pathname === "/";
  const isWrite = pathname === "/write";

  // URL q → 검색창에 반영(검색 결과 동안 검색어 노출 유지). 결과 페이지면 모바일 검색바도 표시.
  const onSync = useCallback((v: string) => { setUrlQ(v); setQ(v); }, []);

  // 발견 데이터 선프리페치 — 검색창 첫 열기도 즉시 표시(끊김 없이 깔끔하게).
  useEffect(() => { void prefetchDiscover(); }, []);

  // (2026-06-11 제거) 앱 탭 강제 router.prefetch 는 force-dynamic 페이지를 매 로드/이동마다
  //   서버 렌더(엣지 호출)시켜 edge request 가 급증(Vercel Usage Anomaly) → 제거.
  //   탭 셸은 Next 의 기본 Link 프리페치(hover/뷰포트, 동적은 셸만)로 충분. 워밍이 필요하면
  //   훗날 hover 기반(onMouseEnter router.prefetch)으로 좁혀 비용 없이 처리.

  // 검색창 표시값 복원용 ref — 바깥 클릭 핸들러(빈 deps)가 최신 urlQ(확정 검색어)를 참조(stale 방지).
  const urlQRef = useRef(urlQ);
  urlQRef.current = urlQ;

  // 데스크탑 검색 드롭다운 — 바깥 클릭 시 닫고, 입력 초안은 확정 검색어로 복원
  //   (검색 안 하고 나가면 입력칸은 기존 검색어로 되돌아가고 결과는 그대로 유지).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) { setFocused(false); setQ(urlQRef.current); }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // (변경1) 스크롤 내리면 로고줄 접힘 — 모바일 전용(<640px).
  //   떨림 방지: rAF 스로틀 + 미세 델타 무시(<6px) + 헤더 아래(>88px) 안정구간에서만 접기
  //   + 토글 후 320ms 락아웃(접힘 애니메이션 중 레이아웃 이동이 재트리거하는 진동 차단).
  useEffect(() => {
    const setCol = (v: boolean) => { collapsedRef.current = v; setCollapsed(v); };
    const lock = () => { lockRef.current = true; setTimeout(() => { lockRef.current = false; }, 320); };
    const update = () => {
      tickRef.current = false;
      if (window.innerWidth >= 640) { if (collapsedRef.current) setCol(false); return; }
      const y = window.scrollY;
      if (lockRef.current) { lastY.current = y; return; }
      const dy = y - lastY.current;
      if (Math.abs(dy) < 6) return;                                      // 미세 스크롤(모멘텀) 무시
      lastY.current = y;
      if (!collapsedRef.current && y > 88 && dy > 0) { setCol(true); lock(); }        // 충분히 내림 → 접기
      else if (collapsedRef.current && (dy < 0 || y < 20)) { setCol(false); lock(); } // 올림/최상단 → 펴기
    };
    const onScroll = () => { if (!tickRef.current) { tickRef.current = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 로고/피드탭 클릭 — 피드 전체 홈 + 최상단.
  //   이미 "/"(검색 결과 ?q= 포함)면 풀 리로드 → 새 jitter 로 피드를 새로 뿌림 + 최상단(구 홈 로고 동작과 동일).
  //     (same-URL 소프트 내비는 서버 재실행이 없어 jitter 가 안 바뀌고, 탭 store 도 그대로라 "반응 없음"처럼 느껴짐.)
  //   다른 페이지(/write 등)에서는 소프트 내비 → BetaFeed 가 마운트되며 전체+최상단+새 풀 처리.
  const goHome = () => {
    setSearchOpen(false);
    setBetaTab("");
    window.scrollTo({ top: 0 });
    if (pathname === "/" && !urlQ) {
      // 이미 깨끗한 홈 — 풀 리로드(스켈레톤·전체 다운로드) 대신 소프트 새로고침.
      //   router.refresh() 가 서버만 재실행(force-dynamic+no-store) → 새 jitter 피드를 받아
      //   BetaFeed 가 풀만 교체(스켈레톤/문서 리로드 없음). SNS 표준(가볍게 위로+새 콘텐츠).
      router.refresh();
      return;
    }
    // 검색 결과(?q=) 또는 다른 페이지 → 깨끗한 홈으로 소프트 내비(BetaFeed 마운트/풀 동기화가 새 피드 처리).
    setUrlQ(""); setQ("");
    router.push("/");
  };

  // 의도 기반 탭 프리페치(SNS 표준) — hover/터치 시 "그 탭만 1회" 워밍. 로드당 비용 0(누를 듯할 때만).
  //   dedup(warmedRef) 으로 같은 탭 반복 prefetch 차단. 피드("/")는 현재 페이지/리로드라 제외.
  const warmedRef = useRef<Set<string>>(new Set());
  const warm = (href: string) => {
    if (href === "/" || warmedRef.current.has(href)) return;
    warmedRef.current.add(href);
    router.prefetch(href);
  };

  const submit = () => {
    const v = q.trim();
    if (!v) return;
    addRecent(v);
    setUrlQ(v);                                  // 낙관적 — 검색바 즉시 노출(홈 깜빡임 방지). SearchQuerySync 가 이후 URL q 로 재확정.
    router.push(`/?q=${encodeURIComponent(v)}`);
    setSearchOpen(false);
    // q 는 비우지 않음 — 결과 페이지에서 검색어 노출 유지(SearchQuerySync 가 URL q 로 맞춤).
  };

  const folded = collapsed && !searchOpen;

  return (
    <>
      <header className="sticky top-0 z-50 bg-white">
        <div className="mx-auto w-full max-w-[1080px] px-4 pt-1.5 sm:px-6">
          {/* (A) 로고줄 — 스크롤 시 접힘 */}
          <div
            className="flex h-12 items-center gap-4 overflow-hidden transition-[height,opacity] duration-[260ms] ease-out sm:h-14 sm:overflow-visible"
            style={folded ? { height: 0, opacity: 0 } : undefined}
          >
            {searchOpen ? (
              // 결과 화면과 동일 — 회색 알약 + (벨). 열림/결과 간 너비·모양 변화 없이 고정.
              <>
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-[#f1f3f5] px-3 py-1.5">
                <span className="shrink-0 text-[#9aa3b0]">{ICON.search}</span>
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    e.preventDefault();
                    submit();
                  }}
                  placeholder="시술명, 키워드 검색"
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder-[#9aa3b0]"
                />
                <button type="button" onClick={() => { setSearchOpen(false); setQ(urlQ); }} aria-label="검색 닫기" className="shrink-0 text-[#9aa3b0]">{ICON.x}</button>
                </div>
                {session && <NotificationsBell />}
              </>
            ) : (
              <>
                {/* 모바일 좌측: 검색 결과 페이지면 '검색어+X' 바, 아니면 로고 */}
                {urlQ ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-[#f1f3f5] px-3 py-1.5 sm:hidden">
                    <span className="shrink-0 text-[#9aa3b0]">{ICON.search}</span>
                    <button type="button" onClick={() => { setSearchOpen(true); setQ(""); }} className="min-w-0 flex-1 truncate text-left text-sm text-[var(--text)]">{urlQ}</button>
                    <button type="button" aria-label="검색 해제" onClick={() => { setUrlQ(""); setQ(""); router.push("/"); }} className="shrink-0 text-[#9aa3b0]">{ICON.x}</button>
                  </div>
                ) : (
                  <button type="button" onClick={goHome} aria-label="피부텐텐 홈" className="flex shrink-0 cursor-pointer items-center sm:hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand-logo.svg" alt="피부텐텐" className="h-7 w-auto" />
                  </button>
                )}

                {/* 데스크탑 로고 */}
                <button type="button" onClick={goHome} aria-label="피부텐텐 홈" className="hidden shrink-0 cursor-pointer items-center sm:flex">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand-logo.svg" alt="피부텐텐" className="h-8 w-auto" />
                </button>

                {/* 데스크탑 메뉴 (모바일은 하단 탭) */}
                <nav className="hidden items-center gap-5 sm:ml-6 sm:flex">
                  {TABS.filter((t) => t.href !== "/my").map((t) => (
                    <Link key={t.href} href={t.href} onPointerEnter={() => warm(t.href)} onClick={t.href === "/" ? (e) => { e.preventDefault(); goHome(); } : undefined} className="cursor-pointer text-[15px] font-semibold transition-colors" style={{ color: t.match(pathname) ? C : "var(--text)" }}>{t.label}</Link>
                  ))}
                </nav>

                {/* 데스크탑은 항상 spacer / 모바일은 검색바 없을 때만(검색바가 flex-1 로 채움) */}
                <div className={urlQ ? "hidden flex-1 sm:block" : "flex-1"} />

                {/* 모바일: 검색 아이콘 → 발견 오버레이 (검색바 없을 때만) */}
                {!urlQ && <button type="button" onClick={() => setSearchOpen(true)} aria-label="검색" title="검색" className="flex items-center rounded-md p-2 text-[var(--text)] sm:hidden">{ICON.search}</button>}

                {/* 데스크탑: 상시 검색 입력 + 포커스 시 발견/자동완성 드롭다운(네이버·유튜브 패턴) */}
                <div ref={searchRef} className="relative hidden sm:block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa3b0]">{ICON.search}</span>
                  <input
                    value={q}
                    onChange={(e) => { setQ(e.target.value); setFocused(true); }}
                    onFocus={() => { setFocused(true); setQ(""); }}
                    onClick={() => setFocused(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { setFocused(false); return; }
                      if (e.key !== "Enter") return;
                      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                      e.preventDefault();
                      submit();
                      setFocused(false);
                    }}
                    placeholder="검색"
                    aria-label="검색"
                    className="w-52 rounded-full bg-[#f1f3f5] py-2 pl-9 pr-3 text-sm text-[var(--text)] outline-none placeholder-[#9aa3b0]"
                  />
                  {focused && (
                    <div className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-[360px] overflow-y-auto rounded-xl bg-white p-3 shadow-[0_8px_30px_rgba(20,40,70,0.18)]">
                      <BetaDiscovery query={q} onPicked={(t) => { setUrlQ(t); setQ(t); setFocused(false); }} />
                    </div>
                  )}
                </div>

                {session && <NotificationsBell />}
                <div className="hidden items-center sm:flex">
                  {session ? (
                    <Link href="/my" aria-label="마이페이지" title="마이페이지" className="flex items-center rounded-md p-2" style={{ color: pathname.startsWith("/my") ? C : "var(--text)" }}>{ICON.user}</Link>
                  ) : (
                    <Link href="/login" title="로그인" className="flex items-center rounded-md p-2 text-[14px] font-medium text-[var(--text)]">로그인</Link>
                  )}
                </div>
              </>
            )}
          </div>

          {/* (B) 칩줄 — 피드에서만. 검색 입력 오버레이(searchOpen) 중에만 숨김(검색 결과 화면에선 표시 — 탭으로 결과 좁힘).
              탭 전환은 store(useBetaTab) 기반 클라 상태라 useSearchParams 불필요 → Suspense 없이 즉시. */}
          {isFeed && !searchOpen && <ChipRow />}

          {/* (B) 글쓰기 서브탭 — 피드 2차 바와 동일 높이, 풀폭 3등분. 스크롤 시 (A) 접히고 이 바만 sticky. */}
          {isWrite && !searchOpen && (
            <Suspense fallback={<WriteTabBar active="record" />}>
              <WriteTabsBar />
            </Suspense>
          )}
        </div>
      </header>

      {/* URL q(검색어) → 검색창 동기화 (검색 결과 동안 검색어 노출 유지). Suspense 격리. */}
      <Suspense fallback={null}>
        <SearchQuerySync onSync={onSync} />
      </Suspense>

      {/* 모바일 검색 오버레이 — 풀블리드(스크림/그림자 없음). 입력 비면 발견, 입력 중이면 자동완성. */}
      {searchOpen && (
        <div className="fixed inset-x-0 bottom-0 top-12 z-40 overflow-y-auto bg-white px-4 pb-28 pt-4 sm:hidden">
          <BetaDiscovery query={q} onPicked={(t) => { setUrlQ(t); setQ(t); setSearchOpen(false); }} />
        </div>
      )}

      {/* 모바일 하단 5탭 (fixed) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-[var(--border)] bg-white px-3 sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} onPointerEnter={() => warm(t.href)} onClick={t.href === "/" ? (e) => { e.preventDefault(); goHome(); } : undefined} className="flex flex-1 cursor-pointer flex-col items-center gap-0.5 py-2" style={{ color: t.match(pathname) ? C : "#9ca3af" }}>
            {t.icon}
            <span className="text-[10px] font-medium">{t.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
