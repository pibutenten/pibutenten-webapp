"use client";

/**
 * FeedList — 검색·피드 전용 피드. "300개를 받아두고 탭은 브라우저에서 즉시 거르기" 모델.
 *
 * 기존 공용 Feed 와의 차이는 단 하나: 탭 전환을 서버 왕복(네비게이션) 없이 클라 필터로 처리.
 *   - 카드/메이슨리/리포트 주입/좋아요 상태/무한스크롤 로직은 Feed 를 그대로 옮겨옴.
 *   - 활성 탭은 useFeedTab() (헤더 칩과 공유하는 모듈 상태). URL 안 바뀜 → 동그라미 없이 즉시.
 *   - 검색(searchQuery)은 URL(?q=) 로 유지되고, 그 검색 결과 풀을 같은 방식으로 탭 필터.
 *
 * 풀 확장(무한스크롤): /api/cards?offset= 로 다음 묶음을 받아 풀에 append → 탭은 늘어난 풀을 다시 필터.
 *   초기 풀: 전체=feed_cards_scored(jitter) / 검색=search_cards_scored. 확장분은 /api/cards(search_cards_scored).
 *   300 경계 이후 순서가 약간 이질적일 수 있으나 id dedup 으로 중복은 제거(300+ 스크롤은 드묾).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Masonry from "react-masonry-css";
import Card, { type CardDataList } from "../Card";
import { CARD_BUS_EVENTS } from "@/components/card/hooks/useCardBus";
import ProcedureReportCard from "@/components/report/ProcedureReportCard";
import type { ProcedureReport } from "@/lib/procedure-report";
import { setFeedTab, useFeedTab } from "@/lib/feed-tab";

const REPORT_EVERY = 20;

type ViewerState = { liked?: boolean; saved?: boolean };
type CardWithCat = CardDataList & { category?: string | null };

type Props = {
  /** 화면 초기 렌더분(앞 INITIAL 장). 나머지는 orderedIds 순서대로 스크롤 시 이어 받음. */
  initialPool: CardDataList[];
  /** 줄세우기(랭킹) 전체 순서의 카드 ID 목록(최대 ORDER). 무한스크롤이 이 순서대로 ID 로 이어 받음. */
  orderedIds?: number[];
  /** 페이지당 확장 크기(무한스크롤). */
  pageSize?: number;
  /** 검색 중이면 검색어 — 리포트 탭 시술명 필터에도 사용. */
  searchQuery?: string;
  /** 리포트 탭에서 보여줄 시술 리포트 카드 풀. */
  reportPool?: ProcedureReport[];
  /** 검색 시 시술명이 리포트와 매칭되면 '전체' 탭 첫 카드로 노출(후기 1건부터, getProcedureReport). */
  searchReport?: ProcedureReport | null;
  hotIds?: number[];
  viewerStates?: Record<number, ViewerState>;
  initialMobile?: boolean;
};

export default function FeedList({
  initialPool,
  orderedIds = [],
  pageSize = 20,
  searchQuery,
  reportPool = [],
  searchReport: searchReportProp = null,
  hotIds,
  viewerStates,
  initialMobile = false,
}: Props) {
  const hotSet = new Set(hotIds ?? []);
  const activeCat = useFeedTab(); // "" | qa | review | doodle | review_summary
  const [pool, setPool] = useState<CardDataList[]>(initialPool);
  const [hasMore, setHasMore] = useState(orderedIds.length > initialPool.length);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  // 순서목록에서 이미 "소비한"(받기 시도한) 개수 = 다음에 받을 시작 위치. 초기 렌더분만큼부터.
  //   pool.length 가 아니라 별도 커서로 둬서, 삭제된 ID(조회 누락)가 있어도 같은 자리 무한재시도 방지.
  const cursorRef = useRef(initialPool.length);
  const orderedIdsRef = useRef(orderedIds);
  orderedIdsRef.current = orderedIds;

  // 피드 마운트(첫 진입·검색 변경·다른 페이지 다녀온 뒤 등)마다 탭을 '전체'로 초기화.
  useEffect(() => { setFeedTab(""); }, []);

  // 서버 재실행(router.refresh / 소프트 내비)으로 새 순서·초기풀이 오면 반영 — 풀 리로드 없이 새 jitter.
  //   initialPool/orderedIds 는 서버가 다시 렌더할 때만 새 배열 참조 → 일반 클라 re-render 에선 동일 참조.
  useEffect(() => {
    setPool(initialPool);
    cursorRef.current = initialPool.length;
    setHasMore(orderedIds.length > initialPool.length);
  }, [initialPool, orderedIds]);

  // 탭 바뀌면 맨 위로 + 콘텐츠가 살짝 아래에서 올라오는 효과(즉시 전환이어도 의도적으로 느끼게).
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const el = contentRef.current;
    if (el && typeof el.animate === "function") {
      el.getAnimations().forEach((a) => a.cancel()); // 빠른 연속 전환 시 애니메이션 누적 방지
      el.animate(
        [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 220, easing: "ease-out" },
      );
    }
  }, [activeCat]);

  // 최신 값을 ref 로 — mount-once 스크롤 콜백이 항상 최신 풀/탭/hasMore 참조.
  const poolRef = useRef(pool);
  poolRef.current = pool;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const catRef = useRef(activeCat);
  catRef.current = activeCat;

  // 풀 확장 — 저장된 "순서(orderedIds)"대로 다음 묶음을 ID 로 받아 append (탭 무관, 전체 순서 기준).
  //   리포트 탭은 통계 목록이라 확장 안 함(자체 가드). 순서목록 끝(=ORDER)까지 받으면 종료.
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current || catRef.current === "review_summary") return;
    const ids = orderedIdsRef.current;
    const start = cursorRef.current;
    const nextIds = ids.slice(start, start + pageSize);
    if (nextIds.length === 0) { setHasMore(false); return; }
    loadingRef.current = true;
    setLoading(true);
    // 삭제된 ID 조회 누락이 있어도 같은 자리 재시도 안 하도록 커서를 먼저 전진.
    cursorRef.current = start + nextIds.length;
    try {
      const res = await fetch(`/api/cards?ids=${nextIds.join(",")}`, { cache: "no-store" });
      if (!res.ok) { setHasMore(false); return; }
      const data = (await res.json()) as { cards: CardDataList[] };
      const byId = new Map((data.cards ?? []).map((c) => [c.id, c]));
      // .in() 조회는 순서 보장 X → 저장된 순서(nextIds)대로 재정렬.
      const ordered = nextIds.map((id) => byId.get(id)).filter((c): c is CardDataList => Boolean(c));
      setPool((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...ordered.filter((c) => !seen.has(c.id))];
      });
      if (cursorRef.current >= ids.length) setHasMore(false);
    } catch {
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [pageSize]);

  // sentinel 관찰 — mount 시 1회만 설정(Feed 와 동일). loadMore 가 ref 로 활성탭/풀/검색어 최신값 참조.
  //   탭 전환마다 observer 를 재생성하지 않음 → 희소 카테고리에서 sentinel 재평가로 인한 연발 호출 방지([치명] 수정).
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const ob = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) loadMore(); }, { rootMargin: "300px 0px" });
    ob.observe(node);
    return () => ob.disconnect();
  }, [loadMore]);

  // 카드 삭제 시 풀에서 제거.
  useEffect(() => {
    function onDeleted(e: Event) {
      const id = (e as CustomEvent<{ id: number }>).detail?.id;
      if (typeof id !== "number") return;
      setPool((prev) => prev.filter((c) => c.id !== id));
    }
    window.addEventListener(CARD_BUS_EVENTS.CARD_DELETED, onDeleted);
    return () => window.removeEventListener(CARD_BUS_EVENTS.CARD_DELETED, onDeleted);
  }, []);

  // "방금 쓴 글" 1회 prepend (검색 아닐 때만) — 본인 화면에서만, 풀 맨 앞으로.
  useEffect(() => {
    if (searchQuery) return;
    let aborted = false;
    try {
      const raw = window.sessionStorage.getItem("pbtt:justPublished");
      if (!raw) return;
      const p = JSON.parse(raw) as { id?: unknown; ts?: unknown };
      const id = typeof p.id === "number" && Number.isFinite(p.id) ? p.id : null;
      const ts = typeof p.ts === "number" && Number.isFinite(p.ts) ? p.ts : null;
      if (id === null || ts === null) return;
      if (Date.now() - ts > 5 * 60 * 1000) { window.sessionStorage.removeItem("pbtt:justPublished"); return; }
      if (window.sessionStorage.getItem("pbtt:justPublished:shown") === String(id)) return;
      if (poolRef.current.some((c) => c.id === id)) {
        setPool((prev) => {
          const idx = prev.findIndex((c) => c.id === id);
          if (idx <= 0) return prev;
          const n = [...prev]; const [m] = n.splice(idx, 1); return [m, ...n];
        });
        window.sessionStorage.setItem("pbtt:justPublished:shown", String(id));
        return;
      }
      void fetch(`/api/cards?ids=${id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { cards?: CardDataList[] } | null) => {
          if (aborted) return;
          const c = j?.cards?.[0];
          if (!c) return;
          setPool((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev]));
          window.sessionStorage.setItem("pbtt:justPublished:shown", String(id));
        })
        .catch(() => {});
    } catch { /* sessionStorage 비활성 */ }
    return () => { aborted = true; };
  }, [searchQuery]);

  // ── 리포트 탭 데이터(별도) — 검색 중이면 시술명(한글/영문) 부분일치 필터. ──
  const isReport = activeCat === "review_summary";
  const ql = (searchQuery ?? "").toLowerCase();
  const reports = isReport
    ? (searchQuery
        ? reportPool.filter((r) => r.procedureKo.includes(searchQuery) || r.en.toLowerCase().includes(ql))
        : reportPool)
    : [];

  // ── 일반 탭(전체/Q&A/시술후기/끄적끄적) — 풀을 카테고리로 즉시 필터 ──
  const filtered = isReport
    ? []
    : activeCat
      ? pool.filter((c) => (c as CardWithCat).category === activeCat)
      : pool;
  // 리포트 카드 주입은 '전체'(검색 아님)에서만 — 카테고리 탭은 집중 목록.
  const injectReports = activeCat === "" && !searchQuery && reportPool.length > 0;
  // 검색('전체' 탭)일 때 시술명이 리포트와 매칭되면, 결과 맨 위에 리포트 카드 1장(구 /search 동작).
  //   매칭은 서버(getProcedureReport, 후기 1건부터)가 판정 → prop 으로 받음.
  const searchReport = activeCat === "" ? searchReportProp : null;
  const emptyMsg = searchQuery ? `‘${searchQuery}’ 검색 결과가 없습니다.` : isReport ? "집계된 리포트가 없습니다." : "표시할 글이 없습니다.";

  return (
    <div>
      <div ref={contentRef}>
      {isReport ? (
        reports.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">{emptyMsg}</div>
        ) : (
          <div className="sm:columns-2 sm:gap-4">
            {reports.map((r) => (
              <div key={r.anchor?.id ?? r.en} className="mb-4 break-inside-avoid">
                <ProcedureReportCard report={r} feedHref={`/reports/${encodeURIComponent(r.procedureKo)}`} />
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 && !searchReport ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">{emptyMsg}</div>
      ) : (
        <Masonry breakpointCols={{ default: initialMobile ? 1 : 2, 899: 1 }} className="feed-masonry" columnClassName="feed-masonry__col">
          {/* 검색 시 매칭 리포트 — 피드 카드와 동일하게 마손리 첫 카드로(전체 탭). */}
          {searchReport && (
            <ProcedureReportCard
              key={`search-report-${searchReport.anchor?.id ?? searchReport.en}`}
              report={searchReport}
              feedHref={`/reports/${encodeURIComponent(searchReport.procedureKo)}`}
            />
          )}
          {filtered.flatMap((card, i) => {
            const node = (
              <Card
                key={card.id}
                card={card}
                activeQuery={searchQuery}
                isHot={hotSet.has(card.id)}
                viewerLiked={viewerStates?.[card.id]?.liked}
                viewerSaved={viewerStates?.[card.id]?.saved}
              />
            );
            if (injectReports) {
              const windowIdx = Math.floor(i / REPORT_EVERY);
              const posInWindow = (windowIdx * 7 + 5) % REPORT_EVERY;
              if (i % REPORT_EVERY === posInWindow) {
                const report = reportPool[windowIdx % reportPool.length];
                return [
                  node,
                  <ProcedureReportCard key={`rsfeed-${report.anchor?.id ?? report.en}-${windowIdx}`} report={report} feedHref={`/reports/${encodeURIComponent(report.procedureKo)}`} />,
                ];
              }
            }
            return [node];
          })}
        </Masonry>
      )}
      </div>

      <div ref={sentinelRef} className="h-10" />
      {loading && <div className="py-4 text-center text-sm text-[var(--text-muted)]">불러오는 중…</div>}
    </div>
  );
}
