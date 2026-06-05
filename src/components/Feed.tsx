"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Masonry from "react-masonry-css";
import Card, { type CardDataList } from "./Card";
import { CARD_BUS_EVENTS } from "@/components/card/hooks/useCardBus";
import ProcedureReportCard from "@/components/report/ProcedureReportCard";
import type { ProcedureReport } from "@/lib/procedure-report";

/** 유기 카드 N장마다 시술 리포트 컴팩트 카드 1장 주입(점수 무관, 결정적 카덴스). */
const REPORT_EVERY = 20;

type ViewerState = { liked?: boolean; saved?: boolean };

type Props = {
  initial: CardDataList[];
  pageSize?: number;
  /** 검색어. 있으면 페이지네이션 시 ?q=...로 함께 호출 */
  searchQuery?: string;
  /** 특정 원장님으로 필터링. 페이지네이션 시 ?doctor_slug=... */
  doctorSlug?: string;
  /** 검색 점수 boost 대상 원장 slug (이 원장 글에 +150). 칩 클릭 시 카드에도 전달. */
  boostDoctorSlug?: string;
  /** HOT 카드의 ID 목록 (서버에서 계산) */
  hotIds?: number[];
  /** v4 — viewer의 좋아요/저장 상태 (card_id → state). server prefetch.
   * 카드별 client useEffect 호출 제거 → 첫 렌더부터 정확한 상태. */
  viewerStates?: Record<number, ViewerState>;
  /** 홈 전용 — 발행 직후 본인 글을 그리드 첫 칸에 1회 노출 (sessionStorage 시그널).
   *  공유 컴포넌트이므로 홈 Feed 인스턴스에서만 true. 검색·의사·프로필탭은 미전달(동작 불변). */
  enableJustPublished?: boolean;
  /** 홈 전용 — 시술 리포트 컴팩트 카드 풀. 유기 카드 REPORT_EVERY 장마다 1장 결정적 주입.
   *  비어있으면(앵커 draft/없음) 주입 안 함 → 피드 동작 기존과 동일. */
  reportPool?: ProcedureReport[];
};

/**
 * 카드 피드 — 전체 카테고리(Q&A·포스팅·새소식·피부일기·물어봐요) 통합 표시.
 * 의사 글 + 회원 글 모두 같은 컴포넌트로 렌더.
 *
 * - 데스크탑(≥900px): 좌·우 두 칼럼 masonry (react-masonry-css 가로 flow)
 * - 모바일: 단일 칼럼
 * - 무한 스크롤: 하단 sentinel을 IntersectionObserver로 감지 → /api/cards?offset=...
 */
export default function Feed({
  initial,
  pageSize = 20,
  searchQuery,
  doctorSlug,
  boostDoctorSlug,
  hotIds,
  viewerStates,
  enableJustPublished,
  reportPool = [],
}: Props) {
  const hotSet = new Set(hotIds ?? []);
  const [items, setItems] = useState<CardDataList[]>(initial);
  const [hasMore, setHasMore] = useState(initial.length >= pageSize);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const stateRef = useRef({
    items,
    hasMore,
    pageSize,
    searchQuery,
    doctorSlug,
    boostDoctorSlug,
  });
  stateRef.current = {
    items,
    hasMore,
    pageSize,
    searchQuery,
    doctorSlug,
    boostDoctorSlug,
  };

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    const {
      items: cur,
      hasMore: hm,
      pageSize: ps,
      searchQuery: sq,
      doctorSlug: ds,
      boostDoctorSlug: bd,
    } = stateRef.current;
    if (!hm) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        offset: String(cur.length),
        limit: String(ps),
      });
      if (sq) params.set("q", sq);
      if (ds) params.set("doctor_slug", ds);
      if (bd) params.set("boost", bd);
      const res = await fetch(`/api/cards?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setHasMore(false);
        return;
      }
      const data = (await res.json()) as { cards: CardDataList[] };
      const next = data.cards ?? [];
      // offset 페이지네이션은 그 사이 상단 삽입(예: 방금 쓴 글 prepend·신규 발행)으로
      // 창이 밀려 이미 본 카드가 다시 올 수 있음 → id 기준 중복 제거 후 append.
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...next.filter((c) => !seen.has(c.id))];
      });
      if (next.length < ps) setHasMore(false);
    } catch {
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // sentinel 관찰 — mount 시 한 번만 설정 (loadMore 안에서 ref로 최신 state 참조)
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  // 카드에서 글 삭제 시 — 즉시 client state에서 제거
  useEffect(() => {
    function onDeleted(e: Event) {
      const id = (e as CustomEvent<{ id: number }>).detail?.id;
      if (typeof id !== "number") return;
      setItems((prev) => prev.filter((q) => q.id !== id));
    }
    window.addEventListener(CARD_BUS_EVENTS.CARD_DELETED, onDeleted);
    return () =>
      window.removeEventListener(CARD_BUS_EVENTS.CARD_DELETED, onDeleted);
  }, []);

  // 홈 전용 — "방금 쓴 글" 1회 prepend (구 JustPublishedPrepend 흡수).
  //   WriteClient publish 성공 → sessionStorage 'pbtt:justPublished' {id, ts}.
  //   5분 이내 + 미노출(shown) + 피드에 없을 때만 fetch 해서 items 맨 앞에 unshift →
  //   Masonry 첫 칸으로 그리드 안에서 렌더(2단 정상) + id 중복 자동 제거.
  //   타인·SEO 영향 0 (클라이언트 전용). 검색·의사 등 다른 Feed 인스턴스는 prop 미전달이라 미동작.
  useEffect(() => {
    if (!enableJustPublished) return;
    let aborted = false;
    try {
      const raw = window.sessionStorage.getItem("pbtt:justPublished");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: unknown; ts?: unknown };
      const id =
        typeof parsed.id === "number" && Number.isFinite(parsed.id)
          ? parsed.id
          : null;
      const ts =
        typeof parsed.ts === "number" && Number.isFinite(parsed.ts)
          ? parsed.ts
          : null;
      if (id === null || ts === null) return;
      // 5분 윈도우 — 초과면 미노출 + 시그널 정리.
      if (Date.now() - ts > 5 * 60 * 1000) {
        window.sessionStorage.removeItem("pbtt:justPublished");
        return;
      }
      // 이미 본 같은 id 면 미노출.
      if (window.sessionStorage.getItem("pbtt:justPublished:shown") === String(id))
        return;
      // 이미 피드에 있으면 — fetch 없이 그 카드를 맨 앞으로 이동(첫 칸 고정 + 중복 방지).
      //   feed_cards_scored 는 점수순(의사 글 x2·jitter)이라 새 회원 글이 중간에 끼므로,
      //   "방금 쓴 글" 의도대로 본인 화면에서만 1회 최상단으로 끌어올린다.
      if (stateRef.current.items.some((c) => c.id === id)) {
        setItems((prev) => {
          const idx = prev.findIndex((c) => c.id === id);
          if (idx <= 0) return prev; // 없음 or 이미 첫 칸 → 그대로
          const next = [...prev];
          const [moved] = next.splice(idx, 1);
          return [moved, ...next];
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
          setItems((prev) =>
            prev.some((p) => p.id === c.id) ? prev : [c, ...prev],
          );
          window.sessionStorage.setItem("pbtt:justPublished:shown", String(id));
        })
        .catch(() => {
          /* 네트워크 실패 — 미노출, 마킹 변경 없음 */
        });
    } catch {
      /* sessionStorage 비활성 — 미노출 */
    }
    return () => {
      aborted = true;
    };
  }, [enableJustPublished]);

  return (
    <>
      {/* 카드 피드 — react-masonry-css 가로 flow.
          데스크탑(≥900px) 2-column, 모바일 1-column 자동. DOM 한 벌. */}
      <Masonry
        breakpointCols={{ default: 2, 899: 1 }}
        className="feed-masonry"
        columnClassName="feed-masonry__col"
      >
        {items.flatMap((card, i) => {
          const node = (
            <Card
              key={card.id}
              card={card}
              activeQuery={searchQuery}
              boostDoctorSlug={doctorSlug}
              isHot={hotSet.has(card.id)}
              viewerLiked={viewerStates?.[card.id]?.liked}
              viewerSaved={viewerStates?.[card.id]?.saved}
            />
          );
          // 유기 카드 REPORT_EVERY(20)장당 1장 결정적 주입 — 단, 매 20장 "경계(끝)"가 아니라
          //   각 20장 윈도 "안의 변동 위치"에 섞어 넣는다(자연스럽게). 위치는 윈도 인덱스로
          //   결정적 산출(하이드레이션 안정 — Math.random 금지). 풀은 윈도 순번대로 순회.
          if (reportPool.length > 0) {
            const windowIdx = Math.floor(i / REPORT_EVERY);
            const posInWindow = (windowIdx * 7 + 5) % REPORT_EVERY; // 0..19, 윈도마다 변동
            if (i % REPORT_EVERY === posInWindow) {
              const report = reportPool[windowIdx % reportPool.length];
              return [
                node,
                <ProcedureReportCard
                  key={`rsfeed-${report.anchor?.id ?? report.en}-${windowIdx}`}
                  report={report}
                  feedHref={`/reports/${encodeURIComponent(report.procedureKo)}`}
                />,
              ];
            }
          }
          return [node];
        })}
      </Masonry>

      {/* 더 불러오기 sentinel + 로딩/끝 표시 */}
      <div ref={sentinelRef} className="h-10" />
      {loading && (
        <div className="py-4 text-center text-sm text-[var(--text-muted)]">
          불러오는 중…
        </div>
      )}
      {!hasMore && items.length > 0 && (
        <div className="py-4 text-center text-xs text-[var(--text-muted)]">
          마지막 글입니다 · 총 {items.length}개
        </div>
      )}
    </>
  );
}
