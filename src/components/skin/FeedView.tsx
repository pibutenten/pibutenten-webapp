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
 *     이어 받아 풀에 append (서버 검색·일반 탭 공통).
 *   - 검색은 서버 라우팅: 엔터/추천/태그 클릭 → /?q= 로 이동(서버 재검색). (홈 승격 2026-06-14)
 *   - 칩(카테고리)은 URL 라우팅: 칩 클릭 → /?cat= 으로 이동, 서버가 그 카테고리 전용 풀을 제공.
 *     URL 이 SSOT(뒤로가기·외부 진입·검색 해제 모두 URL→chip 싱크로 수렴). 클라 필터(matchesChip)는
 *     전환 중 임시 표시용 안전망으로만 유지. (2026-07-03 — 종전 "풀 1개 클라 필터" 모델은 한 카테고리
 *     대량 유입 시 다른 탭이 비는 한계로 폐기.)
 *   - 좋아요/저장 viewer 상태(viewerStates)는 PostCard 로 내려 첫 렌더부터 정확히 표시.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
// R5-3: 뒤로가기 복귀 시 피드 풀+스크롤 복원 — 트리거 판정·스냅샷 저장/로드(sessionStorage, safe-storage 경유).
import {
  consumeFeedRestoreTrigger,
  loadFeedSnapshot,
  saveFeedSnapshot,
} from "@/lib/feed-scroll-restore";
import AppShell from "./AppShell";
import FeedSidebar from "./FeedSidebar";
import ProcedureReportCard from "@/components/report/ProcedureReportCard";
import styles from "./app.module.css";
import { PostCard, type ViewerState } from "./ui";
import {
  FEED_CATS,
  FEED_CAT_LABELS,
  parseFeedCat,
  type FeedCat,
} from "@/lib/feed-categories";

/* 무한스크롤 한 번에 확장할 카드 수 */
const PAGE = 20;

/* ---------- 칩 정의 (전체 + 3종) — 슬러그·라벨은 서버(page.tsx)와 공유 SSOT(@/lib/feed-categories) ---------- */
type ChipKey = "all" | FeedCat;
const CHIPS: { key: ChipKey; label: string }[] = [
  { key: "all", label: "전체" },
  ...FEED_CATS.map((k) => ({ key: k as ChipKey, label: FEED_CAT_LABELS[k] })),
];

function matchesChip(c: CardData, chip: ChipKey): boolean {
  if (chip === "all") return true;
  const key = c.category ?? c.type ?? "";
  return key === chip;
}

/** R5-3: 피드의 실제 스크롤 컨테이너(셸 .root) 탐색 — scrollFeedTop 과 달리 scrollHeight>clientHeight
 *  조건 없이 overflow 만 본다(스냅샷 저장·복원 시점엔 콘텐츠가 짧아도 컨테이너 자체는 특정해야 함).
 *  usePullToRefresh::findScrollAncestor 와 동일 술어 — PTR 이 같은 체인으로 .root 를 찾는 선례. */
function findScrollContainer(from: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = from;
  while (el) {
    const oy = getComputedStyle(el).overflowY;
    if (oy === "auto" || oy === "scroll") return el;
    el = el.parentElement;
  }
  return null;
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
  searchReport = null,
  searchQuery,
  popularTags: serverPopularTags = [],
  hotIds,
  viewerStates,
  topSlot,
}: {
  initialPool: CardData[];
  /** 줄세우기(랭킹) 전체 순서의 카드 ID 목록. 무한스크롤이 이 순서대로 ID 로 이어 받음. */
  orderedIds?: number[];
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
  /** 피드 최상단(AppShell 콘텐츠 맨 위)에 렌더할 슬롯 — 홈 브랜드 소개 띠 등. */
  topSlot?: ReactNode;
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
  // R5-3: chip 을 URL(/?cat=)로 초기 시드 — 종전 "all" 시작 후 URL→chip 싱크 effect 가 바꾸는 방식은
  //   카테고리 피드의 뒤로가기 복원 마운트에서 chip 전환(all→cat)이 칩 전환 스크롤 초기화를 발화시켜
  //   복원 위치를 되감았다. SSR(force-dynamic)도 같은 searchParams 를 보므로 하이드레이션 안전.
  //   검색 중(q)엔 cat 이 URL 에 실리지 않는 운영 경로라 종전과 동일하게 "all" 시작(chip 보존 정책 불변).
  const [chip, setChip] = useState<ChipKey>(() =>
    searchQuery ? "all" : parseFeedCat(searchParams.get("cat")) ?? "all",
  );
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
  // 탭 전환 애니메이션 대상(운영 FeedList contentRef). 리스트 컨테이너의 key remount 와 무관한
  //   안정 래퍼라야 animate 타이밍이 어긋나지 않음 → feedList(키 remount) 바깥에 부착.
  const contentRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const cursorRef = useRef(initialPool.length);
  const orderedIdsRef = useRef(orderedIds);
  orderedIdsRef.current = orderedIds;
  // 풀 세대(epoch) — 서버가 새 풀을 내려 리셋될 때마다 +1. 진행 중이던 loadMore(옛 풀 기준 fetch)가
  //   교체 "후" 완료되면 옛 카테고리 카드를 새 풀에 섞거나 stale hasMore/loadError 를 쓰는 경합을
  //   차단(검수 반영 2026-07-03): loadMore 는 시작 시 epoch 을 캡처하고, 다르면 결과를 버린다.
  const poolEpochRef = useRef(0);

  // ── R5-3 뒤로가기 복원용 ref 3종 ──
  // 복원을 적용한 orderedIds(prop identity) — 아래 리셋 effect 의 "마운트 런"이 복원 풀을
  //   setPool(initialPool) 로 지우는 것을 identity 비교로 스킵(StrictMode 이중 실행에도 안전).
  const restoredForRef = useRef<number[] | null>(null);
  // 복원 풀 커밋 후 적용할 scrollTop — forPool(복원 풀 identity)이 pool state 가 된 커밋에서만 소진.
  const pendingScrollRef = useRef<{ y: number; forPool: CardData[] } | null>(null);
  // 앱 셸 스크롤러(.root) 캐시 — 마운트 시 1회 탐색, 스냅샷 저장(pagehide/언마운트)·복원 적용이 공용.
  const scrollerElRef = useRef<HTMLElement | null>(null);

  // 서버가 새 순서·초기풀을 내려주면(검색 라우팅 등) 풀·커서 리셋.
  useEffect(() => {
    // R5-3: 방금 이 orderedIds(같은 payload)에 대해 뒤로가기 복원을 적용했다면 초기 리셋을 건너뜀.
    //   PTR(router.refresh)·검색·카테고리 전환 등 "새 payload"는 identity 가 달라 정상 리셋되고,
    //   그때 복원 가드도 해제된다(복원은 마운트 1회 트리거라 재발화 없음).
    if (restoredForRef.current === orderedIds) return;
    restoredForRef.current = null;
    poolEpochRef.current += 1;
    setPool(initialPool);
    cursorRef.current = initialPool.length;
    setHasMore(orderedIds.length > initialPool.length);
    setLoadError(false); // 옛 풀에서 난 로드 에러 UI 가 새 풀에 남지 않도록 (R2-1)
    // PTR(router.refresh)·검색·카테고리 전환 등 서버가 새 풀을 내려줄 때마다 댓글 미리보기·좋아요/저장
    //   상태를 재조회 — 한 번 받은 카드를 영구 스킵하던 ref 캐시가 새로고침 후에도 낡은 댓글 수를
    //   고착시키던 버그(2026-07-03 제보) 해소.
    previewFetchedRef.current = new Set();
    viewerFetchedRef.current = new Set();
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
  //   R5-3: 스크롤 초기화는 "값이 실제 바뀐" 실행에서만 — 마운트 런은 새 마운트 스크롤러가 어차피
  //   0 이라 무동작이었고(검색어 변경은 key 재마운트라 이 effect 가 변경을 보는 일도 없음),
  //   뒤로가기 복원 마운트에선 복원 위치를 되감는 부작용만 있었다.
  const prevSearchQueryRef = useRef<string | null>(null);
  useEffect(() => {
    setSearchValue(searchQuery ?? "");
    const prev = prevSearchQueryRef.current;
    prevSearchQueryRef.current = searchQuery ?? "";
    if (prev !== null && prev !== (searchQuery ?? "")) {
      scrollFeedTop(contentRef.current);
    }
  }, [searchQuery]);

  // 카테고리 URL 파라미터(/?cat=) — URL→chip 싱크(isSearching 계산 뒤 배치)가 소비.
  const catParam = searchParams.get("cat");
  // R5-3: 스냅샷 저장 시점(언마운트 cleanup·pagehide)의 카테고리 키 — SPA 이탈 cleanup 시점엔
  //   location 이 이미 도착지로 바뀌어 있어 URL 직접 읽기가 오염됨 → 마지막 렌더 값을 ref 로 캡처.
  const catKeyRef = useRef<string>("");
  catKeyRef.current = parseFeedCat(catParam) ?? "";
  // A2 복원(sessionStorage) 1회 소진 플래그 — 아래 URL→chip 싱크 effect 안에서 첫 실행에만 복원 시도.
  //   (복원 setChip 과 싱크 setChip("all") 이 별도 effect 로 같은 flush 에서 경합해 칩이
  //    all→저장값→all 로 깜빡이던 race 를 단일 effect 통합으로 제거. 2026-07-03)
  const chipRestoredRef = useRef(false);

  useEffect(() => {
    try { sessionStorage.setItem("feedChip", chip); } catch { /* ignore */ }
  }, [chip]);

  // 최신값 ref — mount-once 스크롤 콜백이 항상 최신 hasMore 참조.
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  // "방금 쓴 글" prepend 가드용 — 현재 풀에 이미 그 카드가 있는지 최신값으로 검사(운영 FeedList poolRef).
  const poolRef = useRef(pool);
  poolRef.current = pool;

  // ── R5-3 ①: 뒤로가기 복귀 마운트에서 스냅샷 복원(풀 주입 + scrollTop 예약) ──
  //   트리거는 consumeFeedRestoreTrigger 가 판정(소진형): (a) 문서 back_forward 로드(카드 제목
  //   플레인 <a> 진입 후 브라우저 뒤로 — no-store 라 Chrome bfcache 불가) (b) SPA popstate
  //   (ScrollManager 가 도착 URL 마크). 새 진입·새로고침·PTR·검색/카테고리 push 는 트리거가 아님.
  //   useLayoutEffect 인 이유: setPool 이 paint 전에 동기 재커밋되어 아래 ②(scrollTop 적용)까지
  //   첫 paint 전에 끝난다(SPA 복귀 경로에서 상단 플래시 없음. 문서 로드 경로는 하이드레이션 전
  //   SSR 화면이 이미 보이므로 하이드레이션 시점 1회 점프는 구조적 한계 — 보고서 참조).
  useLayoutEffect(() => {
    if (!consumeFeedRestoreTrigger()) return;
    // 마운트 시점 URL 로 키 구성 — 서버 해석(q trim, cat 화이트리스트)과 동일 규칙.
    const sp = new URLSearchParams(window.location.search);
    const snap = loadFeedSnapshot(
      (sp.get("q") ?? "").trim(),
      parseFeedCat(sp.get("cat")) ?? "",
    );
    if (!snap) return;
    // 이어받기 커서 재계산 — 서버가 새 순서(orderedIds)를 내려줬어도(90s 풀 캐시 경과 등) 복원 풀에
    //   이미 있는 "선두 prefix" 만큼만 전진: 같은 payload 면 이탈 시점 커서와 정확히 일치하고,
    //   다른 payload 면 겹치는 앞부분만 건너뛰어 loadMore 의 seen-set dedupe 와 함께 self-healing.
    const inPool = new Set(snap.pool.map((c) => c.id));
    const ids = orderedIdsRef.current;
    let cur = 0;
    while (cur < ids.length && inPool.has(ids[cur])) cur += 1;
    cursorRef.current = cur;
    restoredForRef.current = ids; // 리셋 effect 마운트 런 스킵(identity 키)
    // paint 전 동기 재커밋이 목적인 의도적 layout-effect setState(위 주석 참조) — AppShell 관례와 동일 suppress.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setPool(snap.pool);
    setHasMore(cur < ids.length);
    pendingScrollRef.current = { y: snap.scrollTop, forPool: snap.pool };
    // (댓글 미리보기·좋아요/저장 viewer 는 previewFetchedRef/viewerFetchedRef 가 빈 상태라
    //  복원 풀 전체를 배치 재조회 — 인터랙션 데이터는 항상 신선, 본문·순서만 스냅샷 수용.)
  }, []);

  // ── R5-3 ②: 복원 풀이 DOM 에 커밋된 직후(paint 전) scrollTop 적용 ──
  //   forPool identity 게이트: 마운트 커밋(아직 initialPool 20장)에서 소진되면 높이 부족으로
  //   클램프되므로, pool state 가 정확히 복원 풀이 된 커밋에서만 적용한다. 1회 소진 —
  //   무한스크롤 append 등 일반 pool 변경에는 no-op.
  useLayoutEffect(() => {
    const pending = pendingScrollRef.current;
    if (!pending || pending.forPool !== pool) return;
    pendingScrollRef.current = null;
    const scroller = scrollerElRef.current ?? findScrollContainer(contentRef.current);
    if (scroller) scroller.scrollTop = pending.y;
  }, [pool]);

  // ── R5-3 ③: 이탈 시 스냅샷 저장 — 두 경로 모두 커버 ──
  //   ⓐ pagehide: 카드 제목(플레인 <a>) 클릭 = 문서 전체 이탈(React 언마운트 없음) + 탭 닫기 → 즉시 저장.
  //   ⓑ layout cleanup: SPA 이탈(탭 이동·검색 key 재마운트). passive cleanup 은 DOM 분리 후라
  //      scrollTop 이 0 으로 읽히므로 반드시 layout cleanup(분리 전)에서 캡처한다.
  //   ⓑ 는 "캡처 즉시 저장"이 아니라 **캡처 → 지연 저장(setTimeout 0) → setup 재실행 시 취소**:
  //      App Router POP/push 마운트 직후 effects 가 teardown→재실행되는 사이클(브라우저 실측)에서
  //      cleanup 이 즉시 저장하면 "새 인스턴스의 빈 초기 상태(예: 검색 진입 직후 q=검색어·20장·y0)"가
  //      직전 피드 스냅샷을 덮어쓴다. 진짜 언마운트면 setup 이 다시 오지 않아 타이머가 저장하고,
  //      사이클이면 곧바로 setup 이 취소한다. 타이머는 인스턴스별 ref 라 key 재마운트로 생긴
  //      "다른 인스턴스"의 예약을 취소하지 못한다(의도 — 구 인스턴스 저장은 보존돼야 함).
  //   저장 내용: (q, cat) 키 + 누적 풀 전체 + scrollTop. 커서는 저장하지 않고 복원 시 재계산(①).
  const deferredSaveTimerRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    // 전제: searchQuery 는 상위 key 재마운트 트리거 — 이 effect 가 "prop 변경"으로 재실행되는
    //   경우는 실현되지 않고, 마운트당 1회 탐색이다 (검수 기록 2026-07-04).
    scrollerElRef.current = findScrollContainer(contentRef.current);
    const buildSnapshot = () => ({
      q: searchQuery ?? "",
      cat: catKeyRef.current,
      pool: poolRef.current,
      scrollTop: scrollerElRef.current?.scrollTop ?? 0,
    });
    const saveNow = () => {
      if (pendingScrollRef.current != null) return; // 복원 적용 전 중간 상태 저장 방지
      if (poolRef.current.length === 0) return;
      saveFeedSnapshot(buildSnapshot());
    };
    // setup — 직전 cleanup 이 예약한 지연 저장이 있으면 취소(= teardown→재실행 사이클, 언마운트 아님).
    if (deferredSaveTimerRef.current != null) {
      window.clearTimeout(deferredSaveTimerRef.current);
      deferredSaveTimerRef.current = null;
    }
    window.addEventListener("pagehide", saveNow);
    return () => {
      window.removeEventListener("pagehide", saveNow);
      if (pendingScrollRef.current != null) return; // 복원 적용 전 중간 상태 — 저장 안 함
      if (poolRef.current.length === 0) return;
      const snap = buildSnapshot(); // scrollTop 은 지금(DOM 분리 전) 캡처
      deferredSaveTimerRef.current = window.setTimeout(() => {
        deferredSaveTimerRef.current = null;
        saveFeedSnapshot(snap);
      }, 0);
    };
  }, [searchQuery]);

  // 풀 확장 — 저장된 순서(orderedIds)대로 다음 묶음을 ID 로 받아 append (운영 FeedList loadMore).
  //   순서목록 끝까지 받으면 종료.
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    setLoadError(false);
    // 시작 시점의 풀 세대 캡처 — fetch 완료 시 세대가 바뀌어 있으면(그 사이 서버가 새 풀로 리셋)
    //   결과·상태 갱신을 전부 버린다(커서·풀은 리셋 effect 가 이미 재설정).
    const epoch = poolEpochRef.current;
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
    //   (실패 경로 — !res.ok·catch — 는 같은 epoch 일 때 start 로 롤백해 페이지 소실을 막는다. R2-1)
    cursorRef.current = start + nextIds.length;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`/api/cards?ids=${nextIds.join(",")}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      // 풀 교체됨 — stale 응답 폐기. 이 가드는 반드시 res.ok 판정·커서 롤백보다 먼저(순서 고정):
      //   stale 에러 응답이 새 풀의 loadError·커서를 오염시키면 안 된다.
      //   커서는 리셋 effect(await 중 이미 실행됨)가 initialPool.length 로 재설정한 상태라 복구 불필요.
      if (epoch !== poolEpochRef.current) return;
      if (!res.ok) {
        // HTTP 오류(5xx 등) — 네트워크 예외(catch)와 동일 처리: 선전진한 커서를 start 로 롤백해
        //   재시도 시 같은 페이지부터 이어 받고, 재시도 UI(loadError)를 띄운다. (R2-1)
        //   (종전 setHasMore(false)는 일시 오류 1회에 무한스크롤 영구 정지 + 해당 페이지 영구 소실.)
        cursorRef.current = start;
        setLoadError(true);
        return;
      }
      const data = (await res.json()) as { cards: CardData[] };
      if (epoch !== poolEpochRef.current) return; // json 파싱 사이 교체 대비
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
      // stale 에러로 새 풀의 커서·에러 UI 를 오염시키지 않음 — epoch 일치 시에만 처리.
      if (epoch === poolEpochRef.current) {
        cursorRef.current = start; // 선전진분 롤백 — 재시도 시 실패한 페이지부터 다시 (R2-1)
        setLoadError(true);
      }
    } finally {
      if (timer) clearTimeout(timer);
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // sentinel 관찰 — ref 콜백으로 DOM 연결/해제 시점에 observer 재설정.
  //   조건부 렌더(filtered.length>=PAGE 등)로 sentinel 이 뒤늦게 DOM 에 붙어도 그 순간 observe 가 걸린다.
  //   (mount-once useEffect 는 늦게 나타난 sentinel 을 못 잡아 글 많은 카테고리에서 무한스크롤이 죽던 회귀 해소.)
  const sentinelObserverRef = useRef<IntersectionObserver | null>(null);
  // R5-3: 현재 sentinel DOM 노드 기억 — 아래 수명 effect 의 setup 재관찰용.
  const sentinelNodeRef = useRef<HTMLDivElement | null>(null);
  const attachSentinel = useCallback((node: HTMLDivElement | null) => {
    sentinelNodeRef.current = node;
    sentinelObserverRef.current?.disconnect();
    sentinelObserverRef.current = null;
    if (node) {
      const ob = new IntersectionObserver(
        (e) => { if (e[0]?.isIntersecting) loadMore(); },
        { rootMargin: "320px 0px" },
      );
      ob.observe(node);
      sentinelObserverRef.current = ob;
    }
  }, [loadMore]);
  // observer 수명 관리 — cleanup 은 종전과 동일한 disconnect. R5-3: setup 에서 sentinel 재관찰 추가 —
  //   App Router POP 복귀(StrictMode 유사)처럼 effects 만 teardown→재실행되고 ref 콜백은 다시 불리지
  //   않는 사이클에서, cleanup 이 끊은 observer 가 영영 복구되지 않아 무한스크롤이 죽던 결함
  //   (뒤로가기 복원 브라우저 실측 중 발견 — 복원 여부와 무관하게 POP 복귀 공통) 방어. 같은 노드
  //   재관찰은 attachSentinel 이 기존 observer 를 먼저 disconnect 하므로 중복 관찰 없음.
  useEffect(() => {
    if (sentinelNodeRef.current) attachSentinel(sentinelNodeRef.current);
    return () => sentinelObserverRef.current?.disconnect();
  }, [attachSentinel]);

  // ① 칩(탭) 전환 시 맨 위로 + 콘텐츠가 살짝 아래에서 올라오는 효과(운영 FeedList 동일).
  //   translateY(10px)→0 + opacity 0→1, 220ms ease-out. 리스트 key remount 의 fadeInUp 과 별개로
  //   안정 래퍼(contentRef)를 직접 animate → 즉시 전환이어도 의도적으로 전환을 느끼게.
  //   R5-3: 스크롤 초기화는 chip 값이 "실제 전환된" 실행에서만 — 마운트 런은 스크롤러가 어차피 0 이라
  //   무동작이었고(chip 은 URL 시드로 마운트 직후 재설정도 없어짐), 뒤로가기 복원 마운트에서는
  //   복원 위치를 되감는 부작용만 있었다. 등장 애니메이션은 기존대로 마운트 포함 유지.
  const prevChipRef = useRef<ChipKey | null>(null);
  useEffect(() => {
    const prevChip = prevChipRef.current;
    prevChipRef.current = chip;
    if (prevChip !== null && prevChip !== chip) {
      scrollFeedTop(contentRef.current);
    }
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

  // URL(/?cat=)이 카테고리의 SSOT — 뒤로가기·외부 진입·검색 해제(✕→/)·바텀내비(/) 모두 이 싱크로 수렴.
  //   (isSearching 계산이 필요해 이 위치에 배치 — 훅 순서는 조건 없이 항상 동일.)
  //   A2(새로고침 시 탭 유지) 복원도 여기 통합: "첫 실행 + 검색 아님 + URL 에 cat 없음"일 때만
  //   sessionStorage 저장값으로 chip 낙관 반영 + router.replace(/?cat=)로 서버 카테고리 풀까지 전환.
  //   (종전엔 chip 만 바꿔 전체 풀의 클라 필터 — 예: qa 4장 — 에 갇혔음. 2026-07-03)
  //   첫 실행 소진(chipRestoredRef)은 분기와 무관하게 기록 — 검색으로 진입(/?q=)했다 ✕로 해제한
  //   경우도 "해제 = 항상 전체" 기존 정책을 지키도록 검색 진입 시점에 복원 기회를 소모시킨다.
  useEffect(() => {
    const isFirstRun = !chipRestoredRef.current;
    chipRestoredRef.current = true;
    if (isSearching) return; // 검색 중엔 chip 보존(칩 활성 표시용) — 필터는 effectiveChip 이 'all' 처리
    const urlCat = parseFeedCat(catParam);
    if (urlCat) {
      setChip(urlCat);
      return;
    }
    if (isFirstRun) {
      try {
        const saved = parseFeedCat(sessionStorage.getItem("feedChip"));
        if (saved) {
          setChip(saved);
          router.replace(`/?cat=${saved}`);
          return;
        }
      } catch { /* sessionStorage 비활성 */ }
    }
    setChip("all");
  }, [catParam, isSearching, router]);

  // 필터링 전용: 검색 중이면 카테고리를 "전체"로 간주(태그/검색은 전체 피드 기준). chip 자체는 보존 →
  //   검색 해제(✕→/) 시엔 위 URL 싱크가 'all' 로 확정. 필터·리포트 판정에 이 값 사용.
  //   칩 활성 표시는 chip(실제 선택값)을 직접 사용 — 검색 중에도 칩이 "전체"로 리셋돼 보이는 버그 해소.
  const effectiveChip: ChipKey = isSearching ? "all" : chip;

  // 카테고리 전환 진행 중 — 낙관 chip 이 URL(catParam)보다 앞서 있는 구간(서버 카테고리 풀 미도착.
  //   A2 복원의 router.replace 대기 포함). 스켈레톤 판정과 sentinel 게이트에 사용:
  //   전환 중엔 옛 풀을 계속 당기는 낭비 fetch 를 막고, 빈 필터 결과는 스켈레톤으로 표시.
  //   비교는 parseFeedCat(검증값) 기준 — ?cat=쓰레기값이면 서버가 전체 풀을 주므로 null 과 동치.
  const catPending =
    !isSearching &&
    (chip === "all" ? parseFeedCat(catParam) !== null : parseFeedCat(catParam) !== chip);

  // ── 일반 탭 — 풀을 카테고리 칩으로 즉시 필터 ──
  const filtered = useMemo(
    () => pool.filter((c) => matchesChip(c, effectiveChip)),
    [pool, effectiveChip],
  );

  // (구 ①-b "카테고리 필터 결과 부족 시 자동 추가 로드"는 삭제 — 서버가 카테고리 전체 풀을 내려주므로
  //   불필요. 남겨두면 전환 중 전체 풀을 낭비 fetch 하는 부작용만 있었음. 2026-07-03)

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
        // 칩 = URL 내비게이션(/?cat=). 검색 중 칩 클릭은 검색을 해제하고 그 카테고리로.
        //   setChip 은 낙관 반영(라우팅 완료 전에도 칩 활성·클라 필터 즉시) — 서버 풀 도착까지의
        //   임시 표시. 최종 상태는 URL→chip 싱크가 확정(URL 이 SSOT).
        setChip(c.key);
        const target = c.key === "all" ? null : c.key;
        if (isSearching || (catParam ?? null) !== target) {
          router.push(target ? `/?cat=${target}` : "/");
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
      {topSlot}
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
        {filtered.length === 0 && !topReport ? (
          /* 스켈레톤 vs 확정 빈 상태 — "더 올 수 있음"(로딩 중·전환 중·잔여 풀 있음)이면 스켈레톤,
             전부 소진·전환 없음이면 빈 문구. (구 ①-b 자동로드 전제였던 `pool.length===0 ||
             (hasMore && effectiveChip!=='all')` 잔재를 검수 반영으로 교체 2026-07-03 — 종전 조건은
             빈 카테고리·빈 검색결과에서 스켈레톤이 무한 표시될 수 있었음.) */
          loading || catPending || hasMore ? (
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

      {/* 무한스크롤 sentinel — 풀 소진(hasMore=false)·로드 에러·카테고리 전환 중(catPending —
          곧 버려질 옛 풀을 당기는 낭비 fetch 방지) 렌더 안 함.
          서버가 카테고리 전체 풀을 내려주므로(2026-07-03) 칩별 개수 분기는 불필요. */}
      {hasMore && !loadError && !catPending && (
        <div ref={attachSentinel} className={styles.feedSentinel} aria-hidden="true" />
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
