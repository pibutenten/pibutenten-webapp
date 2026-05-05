"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CATEGORIES,
  pickDefaultCategory,
  type CategorySlug,
} from "@/lib/categories";
import { categorize } from "@/lib/category-sets";
import type { PopularByCategory } from "@/lib/popular-keywords";

type Props = {
  popularByCategory: PopularByCategory;
};

/**
 * 카테고리 탭 + 인기 키워드 칩.
 * - 진입 시: 디폴트 카테고리(condition/lifting/injection 중 랜덤)
 * - 검색어가 있으면: 그 키워드의 카테고리로 자동 전환
 * - 검색어 = 칩 텍스트면 그 칩만 카테고리 색으로 강조
 * - 모바일: 3줄 / 데스크탑: 4줄까지만 보이고, 더보기 토글
 * - 칩 클릭: 같은 칩 재클릭 시 검색 해제, 다른 칩이면 /?q=...
 */
export default function CategoryWithChips({ popularByCategory }: Props) {
  const sp = useSearchParams();
  const activeQuery = (sp.get("q") ?? "").trim();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // 클릭 직후 즉시 selected 표시용 (서버 round-trip 기다리지 않음)
  const [pendingChip, setPendingChip] = useState<string | null>(null);
  // URL이 실제로 바뀌면 pending 상태 해제
  useEffect(() => {
    setPendingChip(null);
  }, [activeQuery]);

  // 검색어가 등록된 키워드면 그 카테고리로
  const queryCategory = useMemo<CategorySlug | null>(() => {
    if (!activeQuery) return null;
    for (const c of Object.keys(popularByCategory) as CategorySlug[]) {
      if (popularByCategory[c].includes(activeQuery)) return c;
    }
    return categorize(activeQuery);
  }, [activeQuery, popularByCategory]);

  const [active, setActive] = useState<CategorySlug | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  // 첫 진입 시 디폴트 카테고리 (한 번만 실행)
  useEffect(() => {
    if (active === null && !queryCategory) {
      setActive(pickDefaultCategory());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // queryCategory(URL ?q에서 파생)가 바뀔 때만 활성 카테고리 동기화
  // → 사용자가 탭을 클릭한 뒤엔 active를 덮어쓰지 않음
  useEffect(() => {
    if (queryCategory) setActive(queryCategory);
  }, [queryCategory]);

  // 오버플로 측정 — 카테고리 변경/리사이즈 시 재계산
  useLayoutEffect(() => {
    if (!innerRef.current || !outerRef.current) return;
    const measure = () => {
      const inner = innerRef.current;
      const outer = outerRef.current;
      if (!inner || !outer) return;
      // collapsed 상태에서 측정
      const cs = window.getComputedStyle(outer);
      const collapsedH = parseFloat(cs.getPropertyValue("--chips-h") || "108");
      setHasOverflow(inner.scrollHeight > collapsedH + 1);
    };
    measure();
    const obs = new ResizeObserver(measure);
    if (innerRef.current) obs.observe(innerRef.current);
    return () => obs.disconnect();
  }, [active, expanded]);

  if (active === null) {
    return <div className="mb-3 border-b border-[var(--border)]" />;
  }

  const cat = CATEGORIES.find((c) => c.slug === active)!;
  const allChips = popularByCategory[active] ?? [];

  function selectChip(kw: string) {
    // 즉각 시각 피드백 — selected 상태 미리 반영
    setPendingChip(kw === activeQuery ? "" : kw);
    startTransition(() => {
      if (kw === activeQuery) {
        router.push("/");
      } else {
        router.push(`/?q=${encodeURIComponent(kw)}`);
      }
    });
  }

  // 표시용 active 검색어 — 실제 URL 또는 클릭 직후 pending
  const visibleQuery = pendingChip !== null ? pendingChip : activeQuery;

  // 모바일 3줄 (~108px) / 데스크탑 4줄 (~144px)
  const collapsedHeightCss = "var(--chips-h, 108px)";

  return (
    <div className="chips-host">
      {/* 탭 */}
      <div
        role="tablist"
        aria-label="카테고리"
        className="-mx-4 mb-3 flex justify-center gap-x-[14px] overflow-x-auto border-b border-[var(--border)] px-4 sm:mx-0 sm:mb-[14px] sm:flex-wrap sm:gap-x-7 sm:gap-y-2 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" } as CSSProperties}
      >
        {CATEGORIES.map((c) => {
          const isActive = active === c.slug;
          return (
            <button
              key={c.slug}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setActive(c.slug);
                setExpanded(false);
              }}
              className="-mb-px shrink-0 border-b-2 px-1 py-[6px] text-[13px] font-semibold transition-[color,border-color,transform] active:scale-[0.96] sm:py-[7px] sm:text-[14px]"
              style={{
                color: isActive ? c.color : "var(--text-secondary)",
                borderBottomColor: isActive ? c.color : "transparent",
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* 칩 */}
      {allChips.length === 0 ? (
        <div className="text-center text-xs text-[var(--text-muted)]">
          이 카테고리의 인기 키워드가 아직 없습니다.
        </div>
      ) : (
        <>
          <div
            ref={outerRef}
            className="overflow-hidden transition-[max-height] duration-300"
            style={{ maxHeight: expanded ? "1200px" : collapsedHeightCss }}
          >
            <div ref={innerRef} className="flex flex-wrap justify-center gap-1.5">
              {allChips.map((kw) => {
                const selected = kw === visibleQuery;
                const isLoadingThis = isPending && pendingChip === kw;
                return (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => selectChip(kw)}
                    disabled={isPending}
                    className="rounded-full border px-3 py-1 text-[13px] transition-colors active:scale-[0.97] disabled:cursor-wait"
                    style={
                      selected
                        ? {
                            backgroundColor: cat.color + "1A",
                            borderColor: cat.color,
                            color: cat.color,
                            fontWeight: 700,
                            opacity: isLoadingThis ? 0.7 : 1,
                          }
                        : {
                            backgroundColor: "white",
                            borderColor: "var(--border)",
                            color: "var(--text-secondary)",
                            fontWeight: 500,
                          }
                    }
                  >
                    {kw}
                  </button>
                );
              })}
            </div>
          </div>

          {(hasOverflow || expanded) && (
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="rounded-full px-3 py-1 text-[12px] font-semibold transition-colors"
                style={{ color: cat.color }}
              >
                {expanded ? "접기 ▴" : "더보기 ▾"}
              </button>
            </div>
          )}
        </>
      )}

      {/* 모바일 3줄 / 데스크탑 4줄 */}
      <style jsx>{`
        .chips-host {
          --chips-h: 108px;
        }
        @media (min-width: 600px) {
          .chips-host {
            --chips-h: 144px;
          }
        }
      `}</style>
    </div>
  );
}
