"use client";

/**
 * 검색 발견/자동완성 — 모바일 오버레이·데스크탑 블록 공용.
 *  - query 비었을 때: ① 최근 검색어(localStorage·흰 알약) ② 카테고리 텍스트 탭(6종 가로 스크롤·선택만 브랜드색 밑줄) + 선택 카테고리 키워드 칩(선택색 옅은 틴트, 기본 리프팅/스킨부스터 랜덤)
 *  - query 있을 때: 카테고리 칩 키워드 부분일치 자동완성(초성 X — 기존 방식)
 *  - 항목 선택 → 최근검색 저장 + basePath?q= 로 이동(기본 "/". 앱 셸도 홈 승격 후 "/" 사용)
 * 데이터는 전부 기존 소스 재사용(/api/search/suggest).
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { PROCEDURE_CATEGORIES, pickDefaultCategory, type CategorySlug } from "@/lib/categories";
import { addRecent, clearRecent, getRecent, removeRecent } from "@/lib/recent-search";
import { useAutocompleteKeyboard } from "@/hooks/useAutocompleteKeyboard";

/** 입력(AppShell 헤더 검색)이 위임할 키다운 핸들러를 노출하는 ref 타입. */
export type SearchPanelHandle = { handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void };

type DiscoverData = { popular: string[]; cats: Record<string, string[]> };

// 발견 데이터 모듈 캐시 — 검색창을 열 때마다 재fetch 하던 깜빡임/딜레이 제거.
//   최초 1회만 네트워크, 이후 재열기는 캐시로 즉시 표시. prefetchDiscover() 로 페이지 진입 시 선로딩 가능.
let discoverCache: DiscoverData | null = null;
let discoverPromise: Promise<DiscoverData> | null = null;
export function prefetchDiscover(): Promise<DiscoverData> {
  if (discoverCache) return Promise.resolve(discoverCache);
  if (!discoverPromise) {
    discoverPromise = fetch("/api/search/suggest")
      // 비-2xx(레이트리밋·서버 오류)는 throw → 아래 catch 폴백(빈 데이터 + promise 초기화로 재시도 허용).
      .then((r) => { if (!r.ok) throw new Error(`suggest ${r.status}`); return r.json(); })
      .then((d: DiscoverData) => { discoverCache = d; return d; })
      .catch(() => { discoverPromise = null; return { popular: [], cats: {} }; });
  }
  return discoverPromise;
}

function SearchPanel({ query = "", onPicked, basePath = "/", recentOnly = false }: { query?: string; onPicked?: (term: string) => void; basePath?: string; recentOnly?: boolean }, ref: React.Ref<SearchPanelHandle>) {
  const router = useRouter();
  const [data, setData] = useState<DiscoverData | null>(discoverCache);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState<CategorySlug>("lifting");

  useEffect(() => {
    setRecent(getRecent());
    setActiveCat(pickDefaultCategory());
    if (discoverCache) { setData(discoverCache); return; } // 캐시 즉시 표시(깜빡임 없음)
    let alive = true;
    prefetchDiscover().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);

  const pick = useCallback((term: string) => {
    const t = term.trim();
    if (!t) return;
    addRecent(t);
    setRecent(getRecent());
    onPicked?.(t);
    // 검색 실행 라우팅 — 운영(기본 "/")은 /?q=. basePath 가 지정되면 그 경로로 검색(`{basePath}?q=`).
    //   onPicked 는 표시 상태 동기화용(운영 BottomNav)이며 라우팅은 항상 여기서 일관 처리.
    //   basePath 끝의 "/" 는 제거해 "//?q=" 더블슬래시를 방지하되, 전부 제거돼 빈 문자열이 되면
    //   (루트 "/" 입력) 절대경로 "/" 로 복원 → 현재 경로에 쿼리만 붙는 상대 라우팅("?q=") 방지.
    //   "/today"(트레일링 슬래시 없음)은 정규화 전후 동일이라 기존 동작 불변.
    const path = basePath.replace(/\/+$/, "") || "/";
    const sep = path.includes("?") ? "&" : "?";
    router.push(`${path}${sep}q=${encodeURIComponent(t)}`);
  }, [router, onPicked, basePath]);

  const allKeywords = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    // cats 누락(비정상 응답) 방어 — undefined 면 빈 객체로 처리.
    Object.values(data.cats ?? {}).forEach((arr) => arr.forEach((k) => set.add(k)));
    return [...set];
  }, [data]);

  const q = query.trim();

  // ── 자동완성 후보(접두 우선 → 부분일치) — early-return 위에서 계산해 공유 훅(아래)에 넘긴다 ──
  //   훅(useAutocompleteKeyboard)은 조건부 return 위(컴포넌트 최상위)에서 호출해야 하므로,
  //   q·matches 를 여기서 먼저 계산하고 그 아래에서 훅을 호출한다. q 없거나 매칭 0이면 enabled=false.
  let matches: string[] = [];
  if (q) {
    const low = q.toLowerCase();
    const starts = allKeywords.filter((k) => k.toLowerCase().startsWith(low));
    const incl = allKeywords.filter((k) => !k.toLowerCase().startsWith(low) && k.toLowerCase().includes(low));
    matches = [...starts, ...incl].slice(0, 20);
  }

  // 키보드 네비(↑↓ 하이라이트 이동 + Enter 선택). 입력은 AppShell 가 ref 로 위임(handleKeyDown).
  //   onSelect 는 기존 선택 함수 pick(=addRecent + onPicked + 라우팅) 그대로 사용.
  const kb = useAutocompleteKeyboard({
    count: matches.length,
    onSelect: (i) => pick(matches[i]),
    enabled: !!q && matches.length > 0,
  });
  useImperativeHandle(ref, () => ({ handleKeyDown: kb.onKeyDown }), [kb.onKeyDown]);

  // ── 입력 중: 자동완성 목록 표시 ──
  //   매칭이 있을 때만 자동완성 목록 표시. 없으면 안내문 없이 아래 발견 화면(카테고리 등)으로 폴백.
  if (q && matches.length > 0) {
    return (
      <div>
        {matches.map((m, i) => (
          <button
            key={m}
            type="button"
            onClick={() => pick(m)}
            onMouseEnter={() => kb.setActiveIndex(i)}
            className={`flex w-full items-center gap-2.5 rounded-md px-1 py-2.5 text-left ${i === kb.activeIndex ? "bg-[var(--primary-soft)]" : "hover:bg-[#f7f9fb]"}`}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9aa3b0" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
            <span className="text-[15px] text-[var(--text)]">{m}</span>
          </button>
        ))}
      </div>
    );
  }
  // 매칭 없음 → 폴백(아래 발견 화면 공통 렌더로 진행).

  // ── 발견 화면 ──
  const cats = data?.cats ?? null;
  const activeColor = PROCEDURE_CATEGORIES.find((c) => c.slug === activeCat)?.color ?? "#78909C";
  return (
    <div className="space-y-5">
      {/* ① 최근 검색어 */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[var(--text)]">최근 검색어</h3>
          {recent.length > 0 && (
            <button type="button" onClick={() => { clearRecent(); setRecent([]); }} className="text-xs text-[#9aa3b0]">전체 삭제</button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-[#9aa3b0]">{recentOnly ? "최근 검색어가 없어요." : "검색 기록이 없습니다."}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <span key={r} className="flex items-center gap-1 rounded-full bg-white border-[0.5px] border-[#e3e6ea] py-1.5 pl-3 pr-2.5 text-[13px] text-[#46505d]">
                <button type="button" onClick={() => pick(r)} className="flex items-center">
                  {r}
                </button>
                <button type="button" onClick={() => { removeRecent(r); setRecent(getRecent()); }} aria-label={`${r} 삭제`} className="text-[#b6bcc6]">✕</button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ② 카테고리 (텍스트 탭 6종 가로 스크롤 — 선택 1색만, 색점 없음) — recentOnly 면 숨김. */}
      {!recentOnly && (
      <section>
        <div className="no-scrollbar mb-5 flex gap-[22px] overflow-x-auto border-b border-[#e4ebe9]">
          {PROCEDURE_CATEGORIES.map((c) => {
            const on = activeCat === c.slug;
            return (
              <button key={c.slug} type="button" onClick={() => setActiveCat(c.slug)}
                className="shrink-0 whitespace-nowrap pb-[9px] text-[15.5px] transition-colors"
                style={on
                  ? { color: "#1f2a33", fontWeight: 700, borderBottom: `2.5px solid ${c.color}`, marginBottom: "-1px" }
                  : { color: "#aab2bc", fontWeight: 500 }}>
                {c.label}
              </button>
            );
          })}
        </div>
        {!cats ? (
          <p className="text-sm text-[#9aa3b0]">불러오는 중…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(cats[activeCat] ?? []).slice(0, 60).map((k) => (
              <button key={k} type="button" onClick={() => pick(k)}
                className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-[#3c4856]"
                style={{ background: `${activeColor}17` }}>
                {k}
              </button>
            ))}
            {(cats[activeCat] ?? []).length === 0 && <p className="text-sm text-[#9aa3b0]">표시할 검색어가 없습니다.</p>}
          </div>
        )}
      </section>
      )}
    </div>
  );
}

export default forwardRef(SearchPanel);
