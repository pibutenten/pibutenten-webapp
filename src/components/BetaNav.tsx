"use client";

/**
 * BetaNav — /beta 미리보기 전용 내비게이션.
 * 레이아웃(1080 컨테이너·footer·카드·피드)은 기존 그대로, 내비만 새 5탭으로 교체.
 *  - 데스크탑: 상단 바(로고 + 시술기록·글쓰기·피드·쇼핑 + 검색·알림·마이)
 *  - 모바일: 상단(로고+검색) + 하단 5탭
 *  - 검색 아이콘: /search 로 이동하지 않고, 상단 바가 검색창으로 펼쳐짐(피그마 방식).
 *    입력 후 Enter → /beta?q=… 로 기존 검색 메커니즘 재사용.
 * TopNav 가 pathname.startsWith("/beta") 일 때 이 컴포넌트로 대체 렌더.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import NotificationsBell from "./NotificationsBell";
import { useSession } from "@/lib/session-context";

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

export default function BetaNav() {
  const pathname = usePathname();
  const session = useSession();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");

  const submit = () => {
    const v = q.trim();
    if (!v) return;
    router.push(`/beta?q=${encodeURIComponent(v)}`);
    setSearchOpen(false);
  };

  return (
    <>
      {/* 상단 바 — 기존 TopNav 와 동일한 틀(sticky·1080) */}
      <header className="sticky top-0 z-50 backdrop-blur" style={{ background: "rgba(255,255,255,0.92)" }}>
        <div className="mx-auto flex w-full max-w-[1080px] items-center gap-4 px-4 py-3 sm:px-6">
          {searchOpen ? (
            <>
              {/* 펼친 검색창 (피그마 방식) */}
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
              <button type="button" onClick={() => { setSearchOpen(false); setQ(""); }} aria-label="검색 닫기" className="flex min-h-[44px] items-center rounded-md p-3 text-[var(--text)] sm:min-h-0 sm:p-2">{ICON.x}</button>
            </>
          ) : (
            <>
              <Link href="/beta" aria-label="피부텐텐 베타 홈" className="flex shrink-0 items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand-logo.svg" alt="피부텐텐" className="h-7 w-auto sm:h-8" />
              </Link>

              {/* 데스크탑 메뉴 (모바일은 하단 탭) — 로고와 간격 확보(sm:ml-6) */}
              <nav className="hidden items-center gap-5 sm:ml-6 sm:flex">
                {TABS.filter((t) => t.href !== "/beta/my").map((t) => (
                  <Link key={t.href} href={t.href} className="text-[15px] font-semibold transition-colors" style={{ color: t.match(pathname) ? C : "var(--text)" }}>{t.label}</Link>
                ))}
              </nav>

              <div className="flex-1" />

              <button type="button" onClick={() => setSearchOpen(true)} aria-label="검색" title="검색" className="flex min-h-[44px] items-center rounded-md p-3 text-[var(--text)] sm:min-h-0 sm:p-2">{ICON.search}</button>
              {session && <NotificationsBell />}
              {session ? (
                <Link href="/beta/my" aria-label="마이페이지" title="마이페이지" className="flex min-h-[44px] items-center rounded-md p-3 sm:min-h-0 sm:p-2" style={{ color: pathname.startsWith("/beta/my") ? C : "var(--text)" }}>{ICON.user}</Link>
              ) : (
                <Link href="/login" title="로그인" className="flex min-h-[44px] items-center rounded-md p-3 text-[14px] font-medium text-[var(--text)] sm:min-h-0 sm:p-2">로그인</Link>
              )}
            </>
          )}
        </div>
      </header>

      {/* 모바일 하단 5탭 */}
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
