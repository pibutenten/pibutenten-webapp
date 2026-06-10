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

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import NotificationsBell from "./NotificationsBell";
import BetaDiscovery from "./beta/BetaDiscovery";
import { useSession } from "@/lib/session-context";
import { addRecent } from "@/lib/beta-recent";

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
  { href: "/beta/record", label: "시술기록", icon: ICON.book, match: (p) => p.startsWith("/beta/record") },
  { href: "/beta/write", label: "글쓰기", icon: ICON.pen, match: (p) => p.startsWith("/beta/write") },
  { href: "/beta", label: "피드", icon: ICON.grid, match: (p) => p === "/beta" },
  { href: "/beta/shop", label: "쇼핑", icon: ICON.bag, match: (p) => p.startsWith("/beta/shop") },
  { href: "/beta/my", label: "마이페이지", icon: ICON.user, match: (p) => p.startsWith("/beta/my") },
];

// 피드 상단 카테고리 칩 (페이지 데이터 fetch 는 ?cat= 로 동일).
const CATS: { label: string; cat: string }[] = [
  { label: "전체", cat: "" },
  { label: "Q&A", cat: "qa" },
  { label: "시술후기", cat: "review" },
  { label: "끄적끄적", cat: "doodle" },
  { label: "리포트", cat: "review_summary" },
];

// 칩줄 — 활성 표시에 useSearchParams 사용 → Suspense 로 감싸 격리(상위 BetaNav 하이드레이션 보호).
function ChipRow({ active }: { active: string }) {
  return (
    <div className="border-b border-[#eef1f4]">
      <div className="flex gap-2 overflow-x-auto pt-[6px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATS.map((c) => {
          const on = active === c.cat;
          return (
            <Link
              key={c.cat || "all"}
              href={c.cat ? `/beta?cat=${c.cat}` : "/beta"}
              scroll={false}
              className="relative shrink-0 whitespace-nowrap px-[6px] pb-[9px] pt-[4px] text-sm"
              style={{ color: on ? "#1a1f27" : "#8a93a0", fontWeight: on ? 800 : 600 }}
            >
              {c.label}
              {on && <span className="absolute bottom-[-1px] left-[6px] right-[6px] h-[3px] rounded-t-[3px]" style={{ background: C }} />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
function BetaChips() {
  const sp = useSearchParams();
  return <ChipRow active={sp.get("cat") ?? ""} />;
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

  const isFeed = pathname === "/beta";

  // 데스크탑 검색 드롭다운 — 바깥 클릭 시 닫기.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setFocused(false);
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

  const submit = () => {
    const v = q.trim();
    if (!v) return;
    addRecent(v);
    router.push(`/beta?q=${encodeURIComponent(v)}`);
    setSearchOpen(false);
    setQ("");
  };

  const folded = collapsed && !searchOpen;

  return (
    <>
      <header className="sticky top-0 z-50 bg-white">
        <div className="mx-auto w-full max-w-[1080px] px-4 sm:px-6">
          {/* (A) 로고줄 — 스크롤 시 접힘 */}
          <div
            className="flex h-12 items-center gap-4 overflow-hidden transition-[height,opacity] duration-[260ms] ease-out sm:h-14 sm:overflow-visible"
            style={folded ? { height: 0, opacity: 0 } : undefined}
          >
            {searchOpen ? (
              <>
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
                  className="flex-1 bg-transparent text-[15px] text-[var(--text)] outline-none placeholder-[var(--text-muted)]"
                />
                <button type="button" onClick={() => { setSearchOpen(false); setQ(""); }} aria-label="검색 닫기" className="flex items-center rounded-md p-2 text-[var(--text)]">{ICON.x}</button>
              </>
            ) : (
              <>
                <Link href="/beta" aria-label="피부텐텐 베타 홈" className="flex shrink-0 items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand-logo.svg" alt="피부텐텐" className="h-7 w-auto sm:h-8" />
                </Link>

                {/* 데스크탑 메뉴 (모바일은 하단 탭) */}
                <nav className="hidden items-center gap-5 sm:ml-6 sm:flex">
                  {TABS.filter((t) => t.href !== "/beta/my").map((t) => (
                    <Link key={t.href} href={t.href} className="text-[15px] font-semibold transition-colors" style={{ color: t.match(pathname) ? C : "var(--text)" }}>{t.label}</Link>
                  ))}
                </nav>

                <div className="flex-1" />

                {/* 모바일: 검색 아이콘 → 발견 오버레이 */}
                <button type="button" onClick={() => setSearchOpen(true)} aria-label="검색" title="검색" className="flex items-center rounded-md p-2 text-[var(--text)] sm:hidden">{ICON.search}</button>

                {/* 데스크탑: 상시 검색 입력 + 포커스 시 발견/자동완성 드롭다운(네이버·유튜브 패턴) */}
                <div ref={searchRef} className="relative hidden sm:block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa3b0]">{ICON.search}</span>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onKeyDown={(e) => { if (e.key !== "Enter") return; if (e.nativeEvent.isComposing || e.keyCode === 229) return; e.preventDefault(); submit(); setFocused(false); }}
                    placeholder="검색"
                    aria-label="검색"
                    className="w-52 rounded-full bg-[#f1f3f5] py-2 pl-9 pr-3 text-sm text-[var(--text)] outline-none placeholder-[#9aa3b0]"
                  />
                  {focused && (
                    <div className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-[360px] overflow-y-auto rounded-xl bg-white p-3 shadow-[0_8px_30px_rgba(20,40,70,0.18)]">
                      <BetaDiscovery query={q} onPicked={() => { setQ(""); setFocused(false); }} />
                    </div>
                  )}
                </div>

                {session && <NotificationsBell />}
                <div className="hidden items-center sm:flex">
                  {session ? (
                    <Link href="/beta/my" aria-label="마이페이지" title="마이페이지" className="flex items-center rounded-md p-2" style={{ color: pathname.startsWith("/beta/my") ? C : "var(--text)" }}>{ICON.user}</Link>
                  ) : (
                    <Link href="/login" title="로그인" className="flex items-center rounded-md p-2 text-[14px] font-medium text-[var(--text)]">로그인</Link>
                  )}
                </div>
              </>
            )}
          </div>

          {/* (B) 칩줄 — 피드에서만(검색 중엔 숨김). 탭 언더라인. useSearchParams 격리. */}
          {isFeed && !searchOpen && (
            <Suspense fallback={<ChipRow active="" />}>
              <BetaChips />
            </Suspense>
          )}
        </div>
      </header>

      {/* 모바일 검색 오버레이 — 풀블리드(스크림/그림자 없음). 입력 비면 발견, 입력 중이면 자동완성. */}
      {searchOpen && (
        <div className="fixed inset-x-0 bottom-0 top-12 z-40 overflow-y-auto bg-white px-4 pb-28 pt-4 sm:hidden">
          <BetaDiscovery query={q} onPicked={() => { setSearchOpen(false); setQ(""); }} />
        </div>
      )}

      {/* 모바일 하단 5탭 (fixed) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-[var(--border)] bg-white sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="flex flex-1 flex-col items-center gap-0.5 py-2" style={{ color: t.match(pathname) ? C : "#9ca3af" }}>
            {t.icon}
            <span className="text-[10px] font-medium">{t.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
