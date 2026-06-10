"use client";

/**
 * /beta 검색 발견/자동완성 — 모바일 오버레이·데스크탑 블록 공용.
 *  - query 비었을 때: ① 최근 검색어(localStorage) ② 인기검색어 10(7일) ③ 카테고리 칩(탭, 기본 리프팅/스킨부스터 랜덤)
 *  - query 있을 때: 카테고리 칩 키워드 부분일치 자동완성(초성 X — 기존 방식)
 *  - 항목 선택 → 최근검색 저장 + /beta?q= 로 이동(기존 검색 실행)
 * 데이터는 전부 기존 소스 재사용(/api/beta-discover).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { addRecent, clearRecent, getRecent, removeRecent } from "@/lib/beta-recent";

const C = "#4cbff2";
type DiscoverData = { popular: string[]; cats: Record<string, string[]> };
const chip = "shrink-0 rounded-full bg-[#f1f3f5] px-2.5 py-1 text-[13px] text-[#46505d]";

export default function BetaDiscovery({ query = "", onPicked }: { query?: string; onPicked?: (term: string) => void }) {
  const router = useRouter();
  const [data, setData] = useState<DiscoverData | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState<CategorySlug>("lifting");

  useEffect(() => {
    setRecent(getRecent());
    setActiveCat(Math.random() < 0.5 ? "lifting" : "injectables");
    let alive = true;
    fetch("/api/beta-discover")
      .then((r) => r.json())
      .then((d: DiscoverData) => { if (alive) setData(d); })
      .catch(() => { /* 실패해도 최근검색은 표시 */ });
    return () => { alive = false; };
  }, []);

  const pick = useCallback((term: string) => {
    const t = term.trim();
    if (!t) return;
    addRecent(t);
    setRecent(getRecent());
    onPicked?.(t);
    router.push(`/beta?q=${encodeURIComponent(t)}`);
  }, [router, onPicked]);

  const allKeywords = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    Object.values(data.cats).forEach((arr) => arr.forEach((k) => set.add(k)));
    return [...set];
  }, [data]);

  const q = query.trim();

  // ── 입력 중: 자동완성(접두 우선 → 부분일치) ──
  if (q) {
    const low = q.toLowerCase();
    const starts = allKeywords.filter((k) => k.toLowerCase().startsWith(low));
    const incl = allKeywords.filter((k) => !k.toLowerCase().startsWith(low) && k.toLowerCase().includes(low));
    const matches = [...starts, ...incl].slice(0, 20);
    return (
      <div>
        {matches.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-[var(--text-secondary)]">‘{q}’(으)로 시작하는 검색어가 없어요. 카테고리에서 골라보세요.</p>
        ) : (
          matches.map((m) => (
            <button key={m} type="button" onClick={() => pick(m)} className="flex w-full items-center gap-2.5 rounded-md px-1 py-2.5 text-left hover:bg-[#f7f9fb]">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9aa3b0" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
              <span className="text-[15px] text-[var(--text)]">{m}</span>
            </button>
          ))
        )}
      </div>
    );
  }

  // ── 발견 화면 ──
  const cats = data?.cats ?? null;
  return (
    <div className="space-y-7">
      {/* ① 최근 검색어 */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[var(--text)]">최근 검색어</h3>
          {recent.length > 0 && (
            <button type="button" onClick={() => { clearRecent(); setRecent([]); }} className="text-xs text-[#9aa3b0]">전체 삭제</button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-[#9aa3b0]">검색 기록이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <span key={r} className="flex items-center gap-1 rounded-full bg-[#f1f3f5] py-1 pl-2.5 pr-1.5 text-[13px] text-[#46505d]">
                <button type="button" onClick={() => pick(r)} className="flex items-center gap-1.5">
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#9aa3b0" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                  {r}
                </button>
                <button type="button" onClick={() => { removeRecent(r); setRecent(getRecent()); }} aria-label={`${r} 삭제`} className="text-[#b6bcc6]">✕</button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ② 인기 검색어 10 (7일) */}
      <section>
        <h3 className="mb-2.5 text-[15px] font-bold text-[var(--text)]">인기 검색어</h3>
        {!data ? (
          <p className="text-sm text-[#9aa3b0]">불러오는 중…</p>
        ) : data.popular.length === 0 ? (
          <p className="text-sm text-[#9aa3b0]">집계된 인기 검색어가 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.popular.map((p, i) => (
              <button key={p} type="button" onClick={() => pick(p)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#f1f3f5] px-2.5 py-1 text-[13px] text-[#46505d]">
                <b style={{ color: i < 3 ? C : "#aab2bd" }}>{i + 1}</b>
                {p}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ③ 카테고리 (탭 + 칩 전부 펼침) */}
      <section>
        <div className="mb-3 flex gap-5 overflow-x-auto border-b border-[#eef1f4] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map((c) => {
            const on = activeCat === c.slug;
            return (
              <button key={c.slug} type="button" onClick={() => setActiveCat(c.slug)} className="relative shrink-0 whitespace-nowrap pb-2.5 pt-0.5 text-[15px]" style={{ color: on ? c.color : "#9aa3b0", fontWeight: on ? 800 : 600 }}>
                {c.label}
                {on && <span className="absolute bottom-[-1px] left-0 right-0 h-[3px] rounded-t-[3px]" style={{ background: c.color }} />}
              </button>
            );
          })}
        </div>
        {!cats ? (
          <p className="text-sm text-[#9aa3b0]">불러오는 중…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(cats[activeCat] ?? []).slice(0, 60).map((k) => (
              <button key={k} type="button" onClick={() => pick(k)} className={chip}>{k}</button>
            ))}
            {(cats[activeCat] ?? []).length === 0 && <p className="text-sm text-[#9aa3b0]">표시할 검색어가 없습니다.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
