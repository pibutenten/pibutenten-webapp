"use client";

/**
 * FeedView — 신규 스킨 홈 피드 본문(클라이언트). 운영 홈(/)으로 승격(구 app skin 프리뷰).
 *
 * 공용 셸(AppShell)을 사용 → 헤더·탭바·캔버스 오버레이는 셸이 담당.
 * 이 컴포넌트는 칩(필터)·피드 카드 리스트·데스크탑 사이드바 "내용"만 담당.
 *
 * 데이터(운영 정합):
 *   - 서버(page.tsx)에서 전체=feed_cards_scored / 검색(?q=)=fetchCardList 로 받은
 *     초기 풀(initialPool, 앞 24장)과 전체 순서(orderedIds)를 prop 으로 받는다.
 *   - 무한스크롤은 운영 FeedList 와 동일하게 orderedIds 순서대로 /api/cards?ids= 로 다음 묶음을
 *     이어 받아 풀에 append (서버 검색·일반 탭 공통, 리포트 탭 제외).
 *   - 검색은 서버 라우팅: 엔터/추천/태그 클릭 → /?q= 로 이동(서버 재검색). (홈 승격 2026-06-14)
 *   - 칩(카테고리)은 클라 필터(받아온 풀을 즉시 거름).
 *   - 좋아요/저장 viewer 상태(viewerStates)는 PostCard 로 내려 첫 렌더부터 정확히 표시.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/session-context";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import type { CardData } from "@/lib/types/card";
import type { CommentPreview } from "@/lib/types/comment";
import type { ProcedureReport } from "@/lib/procedure-report";
// 카드 삭제 broadcast 이벤트 — 다른 작업자가 카드 ⋮메뉴 삭제 시 emit, 본 피드는 수신만.
import { CARD_BUS_EVENTS } from "@/components/card/hooks/useCardBus";
// 검색 실행 시 최근 검색어 저장(운영 BottomNav.submit 과 동일 진입점).
import { addRecent } from "@/lib/recent-search";
import AppShell from "./AppShell";
import FeedSidebar from "./FeedSidebar";
import ProcedureReportCard from "@/components/report/ProcedureReportCard";
import styles from "./app.module.css";
import { PostCard, type ViewerState } from "./ui";

/* 무한스크롤 한 번에 확장할 카드 수 */
const PAGE = 20;

/* ---------- 칩 정의 (전체 + 4종) ---------- */
type ChipKey = "all" | "qa" | "review" | "doodle" | "review_summary";
const CHIPS: { key: ChipKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "qa", label: "Q&A" },
  { key: "review", label: "시술후기" },
  { key: "doodle", label: "끄적끄적" },
  { key: "review_summary", label: "리포트" },
];

function matchesChip(c: CardData, chip: ChipKey): boolean {
  if (chip === "all") return true;
  const key = c.category ?? c.type ?? "";
  return key === chip;
}

/** 피드를 감싼 실제 스크롤 컨테이너(셸 .root: overflow:auto)를 찾아 맨 위로.
 *  앱 셸은 window 가 아니라 .root 가 스크롤되므로 window.scrollTo 로는 안 올라간다.
 *  from(피드 내부 노드)에서 부모로 올라가며 스크롤 가능한 첫 조상을 찾아 top:0, 못 찾으면 window 폴백. */
function scrollFeedTop(from: HTMLElement | null) {
  let el: HTMLElement | null = from;
  while (el) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) {
      el.scrollTo({ top: 0 });
      return;
    }
    el = el.parentElement;
  }
  window.scrollTo({ top: 0 });
}

/* ---------- 스켈레톤 로딩 ---------- */
function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-gray-200" />
            <div className="flex-1">
              <div className="h-3.5 w-24 bg-gray-200 rounded" />
              <div className="h-3 w-16 bg-gray-100 rounded mt-1" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3.5 w-full bg-gray-200 rounded" />
            <div className="h-3.5 w-4/5 bg-gray-200 rounded" />
            <div className="h-3.5 w-3/5 bg-gray-100 rounded" />
          </div>
          <div className="flex gap-4 mt-4">
            <div className="h-3 w-10 bg-gray-100 rounded" />
            <div className="h-3 w-10 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- 클라이언트 루트 ---------- */
export default function FeedView({
  initialPool,
  orderedIds = [],
  reportPool = [],
  searchReport = null,
  searchQuery,
  popularTags: serverPopularTags = [],
  hotIds,
  viewerStates,
}: {
  initialPool: CardData[];
  /** 줄세우기(랭킹) 전체 순서의 카드 ID 목록. 무한스크롤이 이 순서대로 ID 로 이어 받음. */
  orderedIds?: number[];
  /** '리포트' 탭에서 노출할 시술 리포트 풀. 0건이면 빈 안내. */
  reportPool?: ProcedureReport[];
  /** 검색 시 시술명이 리포트와 매칭되면 '전체' 탭 맨 위에 노출할 리포트 1장. */
  searchReport?: ProcedureReport | null;
  /** 서버 검색 중이면 검색어 — 비어 있으면 일반 피드. */
  searchQuery?: string;
  /** 사이드 '인기 태그' '전체' 탭 — 서버(page.tsx)가 비검색 피드 풀 기준으로 계산한 16개.
   *   검색·태그클릭으로 재마운트돼도 이 값을 그대로 써 순서·구성이 변하지 않음(클라 재계산 안 함). */
  popularTags?: string[];
  /** 운영 홈과 동일 — HOT 카드 id 목록. PostCard 의 isHot 판정에 사용. */
  hotIds?: number[];
  /** 서버 prefetch 한 좋아요/저장 상태(card.id → 상태). */
  viewerStates?: Record<number, ViewerState>;
}) {
  const router = useRouter();
  const { containerRef: ptrRef, indicatorRef: ptrIndicatorRef, refreshing: ptrRefreshing } = usePullToRefresh(
    async () => {
      router.refresh();
      await new Promise((r) => setTimeout(r, 800));
    }
  );
  // 운영 FeedList 와 동일 — hotIds 배열을 Set 으로 만들어 카드별 isHot O(1) 판정.
  const hotSet = useMemo(() => new Set(hotIds ?? []), [hotIds]);
  const searchParams = useSearchParams();
  const [chip, setChip] = useState<ChipKey>("all");
  // 헤더 검색 입력값 — 초기값은 현재 서버 검색어. 변경은 로컬, 제출 시 서버 라우팅.
  const [searchValue, setSearchValue] = useState(searchQuery ?? "");

  // 풀 + 무한스크롤 커서(운영 FeedList 패턴).
  const [pool, setPool] = useState<CardData[]>(initialPool);
  const [hasMore, setHasMore] = useState(orderedIds.length > initialPool.length);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // 댓글 미리보기 배치(N+1 제거, 2026-06-27): 풀에 새로 들어온 카드들의 미리보기(top3 + 총수)를
  //   페이지당 1회 배치 fetch. 옛 카드별 /api/comments?cardId=(스크롤 시 카드 수만큼)을 대체.
  const [commentPreviews, setCommentPreviews] = useState<Record<number, CommentPreview>>({});
  const previewFetchedRef = useRef<Set<number>>(new Set());
  const session = useSession();
  const myViewerId = session?.activeIdentityId ?? null;
  // 좋아요/저장 viewer 배치(N+1 없음 — 페이지당 1회). 서버 prefetch(viewerStates prop)를 seed 로,
  //   이후 클라가 새 카드만 배치 조회. 비로그인은 좋아요/저장이 없어 fetch 자체를 건너뜀.
  const [viewerStatesClient, setViewerStatesClient] = useState<Record<number, ViewerState>>(viewerStates ?? {});
  const viewerFetchedRef = useRef<Set<number>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // 탭 전환 애니메이션 대상(운영 FeedList contentRef). 리스트 컨테이너의 key remount 와 무관한
  //   안정 래퍼라야 animate 타이밍이 어긋나지 않음 → feedList(키 remount) 바깥에 부착.
  const contentRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const cursorRef = useRef(initialPool.length);
  const orderedIdsRef = useRef(orderedIds);
  orderedIdsRef.current = orderedIds;

  // 서버가 새 순서·초기풀을 내려주면(검색 라우팅 등) 풀·커서 리셋.
  useEffect(() => {
    setPool(initialPool);
    cursorRef.current = initialPool.length;
    setHasMore(orderedIds.length > initialPool.length);
  }, [initialPool, orderedIds]);

  // 댓글 미리보기 배치 fetch — 풀에 새로 들어온 카드만 골라 60개씩 한 번에. 이미 받은 건 ref 로 스킵.
  //   카드별 fetch(N+1) 제거. 실패는 무시(배지 0, 💬 클릭 시 전체 로드로 폴백).
  useEffect(() => {
    const missing = pool
      .map((c) => c.id)
      .filter((id) => !previewFetchedRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => previewFetchedRef.current.add(id));
    let aborted = false;
    (async () => {
      for (let i = 0; i < missing.length; i += 60) {
        const chunk = missing.slice(i, i + 60);
        try {
          const r = await fetch(`/api/comments/preview?cardIds=${chunk.join(",")}`, {
            cache: "no-store",
          });
          if (!r.ok) continue;
          const j = (await r.json()) as { previews?: Record<number, CommentPreview> };
          if (aborted || !j.previews) continue;
          setCommentPreviews((prev) => ({ ...prev, ...j.previews }));
        } catch {
          /* 미리보기 실패는 무시 — 배지 0, 💬 클릭 시 전체 로드로 폴백 */
        }
      }
    })();
    return () => {
      aborted = true;
    };
  }, [pool]);

  // 좋아요/저장 viewer 배치 fetch — 댓글 미리보기 배치와 동일 구조(N+1 없음, 페이지당 1회).
  //   풀에 새로 들어온 카드만 60개씩 한 번에 /api/viewer-states 로. 도착하면 viewerStatesClient 에 머지
  //   → 카드의 useCardActions effect 가 liked/saved 동기화. 비로그인은 좋아요/저장이 없어 fetch 생략.
  useEffect(() => {
    if (!myViewerId) return; // 비로그인 — 좋아요/저장 없음, fetch 불필요(카드 기본 false 가 정답)
    const missing = pool.map((c) => c.id).filter((id) => !viewerFetchedRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => viewerFetchedRef.current.add(id));
    let aborted = false;
    (async () => {
      for (let i = 0; i < missing.length; i += 60) {
        const chunk = missing.slice(i, i + 60);
        try {
          const r = await fetch(`/api/viewer-states?cardIds=${chunk.join(",")}`, { cache: "no-store" });
          if (!r.ok) continue;
          const j = (await r.json()) as { viewerStates?: Record<number, ViewerState> };
          if (aborted || !j.viewerStates) continue;
          setViewerStatesClient((prev) => ({ ...prev, ...j.viewerStates }));
        } catch { /* viewer 상태 실패는 무시 — 카드 기본 false */ }
      }
    })();
    return () => { aborted = true; };
  }, [pool, myViewerId]);

  // 서버 검색어가 바뀌면 입력값 동기화 + 피드 스크롤 최상단 복귀(라우팅으로 새 검색 진입 시).
  //   스크롤 컨테이너가 window 가 아니라 셸의 .root(overflow:auto)라, window.scrollTo 로는 안 올라가던
  //   문제를 scrollFeedTop(실제 스크롤 조상 탐색)으로 해결. 어느 위치에서 검색해도 결과는 맨 위부터.
  useEffect(() => {
    setSearchValue(searchQuery ?? "");
    scrollFeedTop(contentRef.current);
  }, [searchQuery]);

  // 검색 해제 시 전체 피드 복귀 — 검색어가 "있다가 사라지는 순간"에만 chip 을 'all' 로 리셋.
  //   리포트 탭(chip='review_summary')에서 검색하면 isSearching 동안 effectiveChip='all'(전체)로 보이지만,
  //   ✕로 검색을 해제하면 isSearching=false 가 되며 effectiveChip 이 보존된 chip(리포트)로 복귀해 리포트 화면으로
  //   튀던 문제(셸 clearSearch 는 / 라우팅만, 피드 chip 은 못 건드림)를 여기서 해소.
  //   prevSearchRef 로 직전 검색 유무를 추적 → truthy→falsy 전이일 때만 리셋.
  //   단 "카테고리 칩을 직접 눌러 검색을 해제하는" 동선(아래 chips onClick)은 그 칩으로 가야 하므로
  //   chipExplicitRef 플래그로 한 번 건너뛴다(검색+카테고리 동시 미지원이라 칩 클릭이 검색을 해제함).
  const prevSearchingRef = useRef(!!(searchQuery ?? "").trim());
  const chipExplicitRef = useRef(false);
  useEffect(() => {
    const nowSearching = !!(searchQuery ?? "").trim();
    if (prevSearchingRef.current && !nowSearching) {
      // 검색이 막 해제됨.
      if (chipExplicitRef.current) {
        // 칩 클릭에 의한 해제 → 그 칩 유지(setChip 은 이미 onClick 에서 처리). 강제 'all' 건너뜀.
        chipExplicitRef.current = false;
      } else {
        // ✕·라우팅 등으로 해제 → 항상 전체 피드로(이전 카테고리로 복귀 금지).
        setChip("all");
      }
    }
    prevSearchingRef.current = nowSearching;
  }, [searchQuery]);

  // A2: 새로고침 시 선택한 카테고리 탭 유지 — sessionStorage 복원.
  //   /?cat= URL 파라미터가 있으면 아래 catParam effect 가 덮어쓰므로 URL 이 우선.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("feedChip");
      const valid: ChipKey[] = ["all", "qa", "review", "doodle", "review_summary"];
      if (saved && (valid as string[]).includes(saved)) {
        setChip(saved as ChipKey);
      }
    } catch { /* sessionStorage 비활성 */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem("feedChip", chip); } catch { /* ignore */ }
  }, [chip]);

  // 비-피드 드롭다운 '카테고리 바로가기' → /?cat= 로 넘어온 칩 시드.
  const catParam = searchParams.get("cat");
  useEffect(() => {
    const valid: ChipKey[] = ["all", "qa", "review", "doodle", "review_summary"];
    if (catParam && (valid as string[]).includes(catParam)) {
      setChip(catParam as ChipKey);
    }
  }, [catParam]);

  // 최신값 ref — mount-once 스크롤 콜백이 항상 최신 hasMore/chip 참조.
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const chipRef = useRef(chip);
  chipRef.current = chip;
  // "방금 쓴 글" prepend 가드용 — 현재 풀에 이미 그 카드가 있는지 최신값으로 검사(운영 FeedList poolRef).
  const poolRef = useRef(pool);
  poolRef.current = pool;

  // 풀 확장 — 저장된 순서(orderedIds)대로 다음 묶음을 ID 로 받아 append (운영 FeedList loadMore).
  //   리포트 탭은 통계 목록이라 확장 안 함. 순서목록 끝까지 받으면 종료.
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current || chipRef.current === "review_summary")
      return;
    setLoadError(false);
    const ids = orderedIdsRef.current;
    const start = cursorRef.current;
    const nextIds = ids.slice(start, start + PAGE);
    if (nextIds.length === 0) {
      setHasMore(false);
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    // 삭제된 ID 조회 누락이 있어도 같은 자리 재시도 안 하도록 커서를 먼저 전진.
    cursorRef.current = start + nextIds.length;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`/api/cards?ids=${nextIds.join(",")}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        setHasMore(false);
        return;
      }
      const data = (await res.json()) as { cards: CardData[] };
      const byId = new Map((data.cards ?? []).map((c) => [c.id, c]));
      // .in() 조회는 순서 보장 X → 저장된 순서(nextIds)대로 재정렬.
      const ordered = nextIds
        .map((id) => byId.get(id))
        .filter((c): c is CardData => Boolean(c));
      setPool((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...ordered.filter((c) => !seen.has(c.id))];
      });
      if (cursorRef.current >= ids.length) setHasMore(false);
    } catch {
      setLoadError(true);
    } finally {
      if (timer) clearTimeout(timer);
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // sentinel 관찰 — mount 시 1회만 설정(운영 FeedList 와 동일). loadMore 가 ref 로 최신값 참조.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const ob = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "320px 0px" },
    );
    ob.observe(node);
    return () => ob.disconnect();
  }, [loadMore]);

  // ① 칩(탭) 전환 시 맨 위로 + 콘텐츠가 살짝 아래에서 올라오는 효과(운영 FeedList 동일).
  //   translateY(10px)→0 + opacity 0→1, 220ms ease-out. 리스트 key remount 의 fadeInUp 과 별개로
  //   안정 래퍼(contentRef)를 직접 animate → 즉시 전환이어도 의도적으로 전환을 느끼게.
  useEffect(() => {
    scrollFeedTop(contentRef.current);
    const el = contentRef.current;
    if (el && typeof el.animate === "function") {
      el.getAnimations().forEach((a) => a.cancel()); // 빠른 연속 전환 시 애니메이션 누적 방지
      el.animate(
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 220, easing: "ease-out" },
      );
    }
  }, [chip]);

  // ② 카드 삭제 broadcast 수신 → 풀에서 제거(운영 FeedList 동일). 발사는 카드 ⋮메뉴 쪽(다른 작업자).
  useEffect(() => {
    function onDeleted(e: Event) {
      const id = (e as CustomEvent<{ id: number }>).detail?.id;
      if (typeof id !== "number") return;
      setPool((prev) => prev.filter((c) => c.id !== id));
    }
    window.addEventListener(CARD_BUS_EVENTS.CARD_DELETED, onDeleted);
    return () =>
      window.removeEventListener(CARD_BUS_EVENTS.CARD_DELETED, onDeleted);
  }, []);

  // ③ "방금 쓴 글" 1회 prepend (검색 아닐 때만) — 본인 화면에서만, 풀 맨 앞으로(운영 FeedList 동일).
  //   sessionStorage['pbtt:justPublished'](id+ts) → 5분 만료·:shown 중복 가드.
  //   이미 풀에 있으면 맨 앞으로 이동, 없으면 /api/cards?ids= 로 fetch 후 prepend.
  useEffect(() => {
    if (searchQuery) return;
    let aborted = false;
    try {
      const raw = window.sessionStorage.getItem("pbtt:justPublished");
      if (!raw) return;
      const p = JSON.parse(raw) as { id?: unknown; ts?: unknown };
      const id =
        typeof p.id === "number" && Number.isFinite(p.id) ? p.id : null;
      const ts =
        typeof p.ts === "number" && Number.isFinite(p.ts) ? p.ts : null;
      if (id === null || ts === null) return;
      if (Date.now() - ts > 5 * 60 * 1000) {
        window.sessionStorage.removeItem("pbtt:justPublished");
        return;
      }
      if (window.sessionStorage.getItem("pbtt:justPublished:shown") === String(id))
        return;
      if (poolRef.current.some((c) => c.id === id)) {
        setPool((prev) => {
          const idx = prev.findIndex((c) => c.id === id);
          if (idx <= 0) return prev;
          const n = [...prev];
          const [m] = n.splice(idx, 1);
          return [m, ...n];
        });
        window.sessionStorage.setItem("pbtt:justPublished:shown", String(id));
        return;
      }
      void fetch(`/api/cards?ids=${id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { cards?: CardData[] } | null) => {
          if (aborted) return;
          const c = j?.cards?.[0];
          if (!c) return;
          setPool((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev]));
          window.sessionStorage.setItem("pbtt:justPublished:shown", String(id));
        })
        .catch(() => {});
    } catch {
      /* sessionStorage 비활성 */
    }
    return () => {
      aborted = true;
    };
  }, [searchQuery]);

  // 검색 제출(엔터/추천 클릭) → 서버 재검색 라우팅 + 최근 검색어 저장(localStorage).
  const submitSearch = (q: string) => {
    const t = q.trim();
    if (t) addRecent(t); // 운영 BottomNav 와 동일 — 검색 실행 시 최근 검색어에 기록.
    // 라우팅만(서버 재검색). chip 은 바꾸지 않는다 — setChip 을 여기서 하면 라우팅 "전"에 현재 풀이
    //   전체로 한 번 렌더(전체 피드 깜빡) 후 검색 결과로 바뀌는 2단계가 생긴다. 대신 아래 effectiveChip
    //   으로 "검색 중엔 카테고리를 전체로 간주" → 리포트 탭에서도 깜빡 없이 바로 전체 검색 결과.
    router.push(t ? `/?q=${encodeURIComponent(t)}` : "/");
  };
  // 태그 클릭 → 그 키워드로 서버 검색 라우팅(운영 동일).
  const applyTag = (k: string) => submitSearch(k);

  // 검색 중 여부.
  const isSearching = !!(searchQuery ?? "").trim();
  // 필터링 전용: 검색 중이면 카테고리를 "전체"로 간주(태그/검색은 전체 피드 기준). chip 자체는 보존 →
  //   검색 해제 시 원래 카테고리로 자연 복귀. 필터·리포트 판정에 이 값 사용.
  //   칩 활성 표시는 chip(실제 선택값)을 직접 사용 — 검색 중에도 칩이 "전체"로 리셋돼 보이는 버그 해소.
  const effectiveChip: ChipKey = isSearching ? "all" : chip;

  // ── 일반 탭 — 풀을 카테고리 칩으로 즉시 필터 ──
  const isReportTab = effectiveChip === "review_summary";
  const filtered = useMemo(
    () => (isReportTab ? [] : pool.filter((c) => matchesChip(c, effectiveChip))),
    [pool, effectiveChip, isReportTab],
  );

  // ①-b 카테고리 칩 필터 결과 0건이지만 미로드 카드가 남아있으면 자동 추가 로드.
  //   "끄적끄적" 같은 소수 카테고리가 점수순에서 후순위로 밀려 초기 풀에 없는 경우 대응.
  //   orderedIds 소진(hasMore=false) 또는 매칭 카드 발견(filtered.length>0) 시 자동 정지.
  useEffect(() => {
    if (
      effectiveChip !== "all" &&
      !isReportTab &&
      filtered.length === 0 &&
      hasMore &&
      !loading
    ) {
      loadMore();
    }
  }, [filtered.length, effectiveChip, hasMore, isReportTab, loading, loadMore]);

  // ── 리포트 탭 — 검색 중이면 시술명(한글/영문) 부분일치 필터 ──
  const filteredReports = useMemo(() => {
    const needle = (searchQuery ?? "").trim().toLowerCase();
    if (!needle) return reportPool;
    return reportPool.filter((r) =>
      [r.procedureKo, r.en].join(" ").toLowerCase().includes(needle),
    );
  }, [reportPool, searchQuery]);

  // 검색('전체' 탭)일 때 시술명이 리포트와 매칭되면 결과 맨 위에 리포트 카드 1장.
  // chip(실제 선택값) 기준: 검색 중에도 카테고리 칩이 "전체"일 때만 노출.
  const topReport = searchQuery && chip === "all" ? searchReport : null;

  // 사이드 '인기 태그' '전체' 탭 — 서버(page.tsx)가 '비검색 피드 풀' 기준으로 계산해 내려준 16개.
  //   과거엔 클라에서 pool(검색 시 검색결과로 바뀜) 빈도로 재계산 → 태그 클릭(=검색)이 그 태그를 1위로
  //   올리던 버그가 있었고, frozenTagsRef 로 클라 고정했으나 검색 라우팅 시 FeedView 가 재마운트되며
  //   ref 가 초기화돼 무력화됐다. 이제 서버 prop 으로 고정 → 재마운트·검색·태그클릭에도 순서·구성 불변.
  const popularTags = serverPopularTags;

  // 인기 Q&A 후보 풀 — doctor 글(Q&A) 상위 20개. FeedSidebar 가 이 안에서 5개를 회전 노출.
  //   사이드바의 회전·카테고리 탭·글쓰기 CTA 로직은 FeedSidebar 로 추출(홈/토픽/리포트 공유).
  const doctorAnswerPool = useMemo(
    () =>
      pool
        .filter((c) => !!c.doctor && (c.category ?? c.type) === "qa")
        .slice(0, 20),
    [pool],
  );

  const chips = CHIPS.map((c) => (
    <button
      key={c.key}
      type="button"
      className={`${styles.chip} ${chip === c.key ? styles.chipActive : ""}`}
      onClick={() => {
        setChip(c.key);
        // 검색 중 카테고리 칩을 누르면 검색을 해제하고 그 카테고리로(검색+카테고리 동시 필터는 미지원).
        //   chipExplicitRef 로 "칩에 의한 해제"임을 표시 → 검색 해제 effect 가 'all' 로 덮어쓰지 않도록.
        if (isSearching) {
          chipExplicitRef.current = true;
          router.push("/");
        }
      }}
      aria-pressed={chip === c.key}
    >
      {c.label}
    </button>
  ));

  // 사이드바 — 홈/토픽/리포트 공유 FeedSidebar(인기태그·인기 Q&A·글쓰기 CTA).
  //   인기 Q&A 풀은 현재 피드 풀에서 파생(doctorAnswerPool), 태그 클릭은 검색 라우팅(applyTag) 위임.
  const sidebar = (
    <FeedSidebar
      popularTags={popularTags}
      hotQa={doctorAnswerPool}
      currentTag={searchQuery ?? ""}
      onTagClick={applyTag}
    />
  );

  return (
    <AppShell
      active="피드"
      chips={chips}
      sidebar={sidebar}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onSearchSubmit={submitSearch}
    >
      <div ref={ptrRef} className="relative" style={{ willChange: "transform" }}>
      {/* PTR 인디케이터 — 바깥 div: 훅이 transform으로 갭 중앙 배치, 안쪽 div: 새로고침 중 spin */}
      <div ref={ptrIndicatorRef}
        className="absolute top-0 left-1/2 pointer-events-none z-10"
        style={{ opacity: 0 }}>
        <div className={`w-6 h-6 border-2 border-gray-300 border-t-[var(--primary)] rounded-full ${ptrRefreshing ? "animate-spin" : ""}`} />
      </div>

      {/* 탭 전환 애니메이션 대상(운영 FeedList contentRef) — remount 되지 않는 안정 래퍼.
          이 래퍼를 직접 animate(translateY+fade) 하여 칩 전환 효과를 준다. */}
      <div ref={contentRef}>
      {/* 칩/검색 전환 시 리스트 컨테이너 remount(key=칩+검색어) → fadeInUp 재발화.
          무한스크롤(pool append)은 같은 key 라 추가분만 append(스크롤 유지). */}
      <div className={styles.feedList} key={`${chip}|${searchQuery ?? ""}`}>
        {isReportTab ? (
          // 리포트 탭 — 시술 리포트 카드. 데이터 0건이면 빈 안내.
          filteredReports.length === 0 ? (
            <p className={styles.empty}>
              {searchQuery
                ? `’${searchQuery}’ 시술 리포트가 없습니다.`
                : "아직 집계된 시술 리포트가 없습니다."}
            </p>
          ) : (
            filteredReports.map((r) => (
              // 운영 ProcedureReportCard 는 무수정 — 앱 wrapper(.reportCardWrap)로 감싸
              //   내부 <article> 의 R값(--radius)·여백을 앱 .card 와 동일(--r-card 24px)하게 맞춤.
              <div key={r.procedureKo} className={styles.reportCardWrap}>
                <ProcedureReportCard
                  report={r}
                  feedHref={`/reports/${encodeURIComponent(r.procedureKo)}`}
                />
              </div>
            ))
          )
        ) : filtered.length === 0 && !topReport ? (
          loading || pool.length === 0 || (hasMore && effectiveChip !== "all") ? (
            <FeedSkeleton />
          ) : (
            <div className={styles.empty}>
              <p>
                {searchQuery
                  ? `’${searchQuery}’ 검색 결과가 없습니다.`
                  : "이 카테고리에 표시할 글이 없습니다."}
              </p>
              {searchQuery && popularTags.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 10 }}>
                    이런 키워드는 어떠세요?
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                    {popularTags.slice(0, 8).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => applyTag(tag)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "var(--r-chip)",
                          border: "none",
                          background: "var(--tt-blue-tint)",
                          color: "var(--tt-blue-deep)",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          <>
            {/* 검색 매칭 리포트 — 결과 맨 위 1장(운영 ProcedureReportCard 재사용).
                앱 wrapper(.reportCardWrap)로 R값·여백을 앱 카드와 통일. */}
            {topReport && (
              <div className={styles.reportCardWrap}>
                <ProcedureReportCard
                  report={topReport}
                  feedHref={`/reports/${encodeURIComponent(topReport.procedureKo)}`}
                />
              </div>
            )}
            {filtered.map((card) => (
              <PostCard
                key={card.id}
                card={card}
                onTagClick={applyTag}
                isHot={hotSet.has(card.id)}
                viewer={viewerStatesClient[card.id]}
                searchQuery={searchQuery}
                commentPreview={commentPreviews[card.id]}
                batchedPreview
              />
            ))}
          </>
        )}
      </div>
      </div>

      {/* 무한스크롤 sentinel — 일반·검색 탭에서만(리포트 제외). 풀 소진 시 렌더 안 함. */}
      {!isReportTab && hasMore && !loadError && (
        <div ref={sentinelRef} className={styles.feedSentinel} aria-hidden="true" />
      )}
      {loading && pool.length > 0 && <FeedSkeleton count={1} />}
      {loadError && (
        <div className="flex flex-col items-center gap-2 py-6">
          <p className="text-sm text-[var(--text-muted)]">연결이 불안정합니다</p>
          <button onClick={() => { setLoadError(false); loadMore(); }}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm">
            다시 시도
          </button>
        </div>
      )}
      </div>
    </AppShell>
  );
}
