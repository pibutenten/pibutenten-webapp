"use client";

/**
 * BetaSkinFeed — /beta-skin 신규 스킨 (피드 본문, 클라이언트).
 *
 * 공용 셸(BetaSkinShell)을 사용 → 헤더·탭바·캔버스 오버레이는 셸이 담당.
 * 이 컴포넌트는 칩(필터)·피드 카드 리스트·데스크탑 사이드바 "내용"만 담당.
 *
 * 데이터(운영 정합):
 *   - 서버(page.tsx)에서 전체=feed_cards_scored / 검색(?q=)=fetchCardList 로 받은
 *     초기 풀(initialPool, 앞 24장)과 전체 순서(orderedIds)를 prop 으로 받는다.
 *   - 무한스크롤은 운영 BetaFeed 와 동일하게 orderedIds 순서대로 /api/cards?ids= 로 다음 묶음을
 *     이어 받아 풀에 append (서버 검색·일반 탭 공통, 리포트 탭 제외).
 *   - 검색은 서버 라우팅: 엔터/추천/태그 클릭 → /beta-skin?q= 로 이동(서버 재검색).
 *   - 칩(카테고리)은 클라 필터(받아온 풀을 즉시 거름).
 *   - 좋아요/저장 viewer 상태(viewerStates)는 PostCard 로 내려 첫 렌더부터 정확히 표시.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CardData } from "@/lib/types/card";
import type { ProcedureReport } from "@/lib/procedure-report";
// 카드 삭제 broadcast 이벤트 — 다른 작업자가 카드 ⋮메뉴 삭제 시 emit, 본 피드는 수신만.
import { CARD_BUS_EVENTS } from "@/components/card/hooks/useCardBus";
// 검색 실행 시 최근 검색어 저장(운영 BetaNav.submit 과 동일 진입점).
import { addRecent } from "@/lib/beta-recent";
// 사이드 '인기 태그' 카드의 카테고리별 인기태그 — 검색 드롭다운(BetaDiscovery)과 동일 소스 재사용.
//   prefetchDiscover() 가 /api/beta-discover 를 모듈 캐시로 1회 fetch → cats(카테고리별 태그) 재활용.
import { prefetchDiscover } from "@/components/beta/BetaDiscovery";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import BetaSkinShell from "./BetaSkinShell";
import ProcedureReportCard from "@/components/report/ProcedureReportCard";
import styles from "./beta-skin.module.css";
import {
  PostCard,
  cardHref,
  catTagClass,
  type BetaViewerState,
} from "./beta-ui";

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
 *  베타 셸은 window 가 아니라 .root 가 스크롤되므로 window.scrollTo 로는 안 올라간다.
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

/* 사이드 글쓰기 유도 박스 문구 — Q&A 한정에서 일반 "피부 글쓰기" 유도로.
 *   랜덤 셔플로 매 진입마다 다른 톤(꿀팁/고민/후기/일기/질문) 노출. CTA 는 글쓰기. */
const SIDE_PROMPTS: { h3: string; p: string }[] = [
  { h3: "공유하고 싶은 피부 꿀팁이 있으세요?", p: "나만 아는 노하우를 글로 남겨보세요." },
  { h3: "요즘 피부 고민, 어떠세요?", p: "고민을 남기면 회원·전문의와 이야기 나눌 수 있어요." },
  { h3: "최근 받은 시술, 어땠나요?", p: "솔직한 경험을 글로 들려주세요." },
  { h3: "오늘의 피부, 한 줄 남겨볼까요?", p: "작은 변화도 기록하면 큰 도움이 돼요." },
  { h3: "궁금한 점이 있으세요?", p: "글로 남기면 회원·전문의의 이야기를 들어볼 수 있어요." },
];

/* ---------- 클라이언트 루트 ---------- */
export default function BetaSkinFeed({
  initialPool,
  orderedIds = [],
  reportPool = [],
  searchReport = null,
  searchQuery,
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
  /** 운영 홈과 동일 — HOT 카드 id 목록. PostCard 의 isHot 판정에 사용. */
  hotIds?: number[];
  /** 서버 prefetch 한 좋아요/저장 상태(card.id → 상태). */
  viewerStates?: Record<number, BetaViewerState>;
}) {
  const router = useRouter();
  // 운영 BetaFeed 와 동일 — hotIds 배열을 Set 으로 만들어 카드별 isHot O(1) 판정.
  const hotSet = useMemo(() => new Set(hotIds ?? []), [hotIds]);
  const searchParams = useSearchParams();
  const [chip, setChip] = useState<ChipKey>("all");
  // 헤더 검색 입력값 — 초기값은 현재 서버 검색어. 변경은 로컬, 제출 시 서버 라우팅.
  const [searchValue, setSearchValue] = useState(searchQuery ?? "");

  // 풀 + 무한스크롤 커서(운영 BetaFeed 패턴).
  const [pool, setPool] = useState<CardData[]>(initialPool);
  const [hasMore, setHasMore] = useState(orderedIds.length > initialPool.length);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // 탭 전환 애니메이션 대상(운영 BetaFeed contentRef). 리스트 컨테이너의 key remount 와 무관한
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

  // 서버 검색어가 바뀌면 입력값 동기화 + 피드 스크롤 최상단 복귀(라우팅으로 새 검색 진입 시).
  //   스크롤 컨테이너가 window 가 아니라 셸의 .root(overflow:auto)라, window.scrollTo 로는 안 올라가던
  //   문제를 scrollFeedTop(실제 스크롤 조상 탐색)으로 해결. 어느 위치에서 검색해도 결과는 맨 위부터.
  useEffect(() => {
    setSearchValue(searchQuery ?? "");
    scrollFeedTop(contentRef.current);
  }, [searchQuery]);

  // 비-피드 드롭다운 '카테고리 바로가기' → /beta-skin?cat= 로 넘어온 칩 시드.
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
  // "방금 쓴 글" prepend 가드용 — 현재 풀에 이미 그 카드가 있는지 최신값으로 검사(운영 BetaFeed poolRef).
  const poolRef = useRef(pool);
  poolRef.current = pool;

  // 풀 확장 — 저장된 순서(orderedIds)대로 다음 묶음을 ID 로 받아 append (운영 BetaFeed loadMore).
  //   리포트 탭은 통계 목록이라 확장 안 함. 순서목록 끝까지 받으면 종료.
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current || chipRef.current === "review_summary")
      return;
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
    try {
      const res = await fetch(`/api/cards?ids=${nextIds.join(",")}`, {
        cache: "no-store",
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
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // sentinel 관찰 — mount 시 1회만 설정(운영 BetaFeed 와 동일). loadMore 가 ref 로 최신값 참조.
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

  // ① 칩(탭) 전환 시 맨 위로 + 콘텐츠가 살짝 아래에서 올라오는 효과(운영 BetaFeed 동일).
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

  // ② 카드 삭제 broadcast 수신 → 풀에서 제거(운영 BetaFeed 동일). 발사는 카드 ⋮메뉴 쪽(다른 작업자).
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

  // ③ "방금 쓴 글" 1회 prepend (검색 아닐 때만) — 본인 화면에서만, 풀 맨 앞으로(운영 BetaFeed 동일).
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
    if (t) addRecent(t); // 운영 BetaNav 와 동일 — 검색 실행 시 최근 검색어에 기록.
    router.push(t ? `/beta-skin?q=${encodeURIComponent(t)}` : "/beta-skin");
  };
  // 태그 클릭 → 그 키워드로 서버 검색 라우팅(운영 동일).
  const applyTag = (k: string) => submitSearch(k);

  // ── 일반 탭 — 풀을 카테고리 칩으로 즉시 필터 ──
  const isReportTab = chip === "review_summary";
  const filtered = useMemo(
    () => (isReportTab ? [] : pool.filter((c) => matchesChip(c, chip))),
    [pool, chip, isReportTab],
  );

  // ── 리포트 탭 — 검색 중이면 시술명(한글/영문) 부분일치 필터 ──
  const filteredReports = useMemo(() => {
    const needle = (searchQuery ?? "").trim().toLowerCase();
    if (!needle) return reportPool;
    return reportPool.filter((r) =>
      [r.procedureKo, r.en].join(" ").toLowerCase().includes(needle),
    );
  }, [reportPool, searchQuery]);

  // 검색('전체' 탭)일 때 시술명이 리포트와 매칭되면 결과 맨 위에 리포트 카드 1장.
  const topReport = searchQuery && chip === "all" ? searchReport : null;

  // 전체 풀 keywords 빈도 순위(사이드 인기 태그용) — 항목3) 16개.
  //   태그 클릭 = 검색이라 pool 이 검색결과로 바뀌면 빈도가 달라져 클릭한 태그가 맨 위로 올라오던 버그.
  //   → "검색 중이 아닐 때 처음" 계산한 목록을 frozen 으로 고정 → 태그를 눌러 검색이 돼도 순서·구성 불변.
  //   - hasFrozenRef 플래그로 "비검색 상태 최초 1회만" 고정. (length===0 판단은 키워드 없는 일시적 빈 풀에서
  //     반복 재계산되거나 직접 ?q= 진입→검색해제 시점 풀로 잘못 고정될 여지가 있어 플래그로 명확히 함.)
  //   - 의도된 trade-off: 고정 후 무한스크롤로 새로 들어온 카드 키워드는 인기 태그에 반영하지 않음
  //     (요구가 "목록 위치·구성 불변" 이라 안정성 우선).
  const frozenTagsRef = useRef<string[]>([]);
  const hasFrozenRef = useRef(false);
  const popularTags = useMemo(() => {
    const compute = () => {
      const freq = new Map<string, number>();
      for (const c of pool) {
        for (const k of c.keywords ?? []) {
          freq.set(k, (freq.get(k) ?? 0) + 1);
        }
      }
      return [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => k)
        .slice(0, 16);
    };
    if (!searchQuery) {
      if (!hasFrozenRef.current) {
        frozenTagsRef.current = compute();
        hasFrozenRef.current = true;
      }
      return frozenTagsRef.current;
    }
    // 검색 중: 비검색 고정본이 있으면 그대로(순서 불변), 없으면(직접 ?q= 진입) 현재 풀 기준 best-effort.
    return hasFrozenRef.current ? frozenTagsRef.current : compute();
  }, [pool, searchQuery]);

  // 사이드 '인기 태그' 카드 — 카테고리 탭. "전체"는 위 빈도순 popularTags(16개),
  //   카테고리 탭은 /api/beta-discover 의 cats(검색 드롭다운과 동일 소스)에서 해당 slug 목록.
  type TagTab = "all" | CategorySlug;
  const [tagTab, setTagTab] = useState<TagTab>("all");
  const [cats, setCats] = useState<Record<string, string[]> | null>(null);
  useEffect(() => {
    let alive = true;
    prefetchDiscover().then((d) => {
      if (alive) setCats(d.cats ?? {});
    });
    return () => {
      alive = false;
    };
  }, []);

  // 현재 선택 탭의 태그 목록 — "전체"면 빈도순 16개, 카테고리면 cats[slug] 상위 16개.
  const sideTags = useMemo<string[]>(() => {
    if (tagTab === "all") return popularTags;
    return (cats?.[tagTab] ?? []).slice(0, 16);
  }, [tagTab, cats, popularTags]);

  // 사이드 글쓰기 유도 박스 — 매 진입 랜덤 문구(SSR 은 0번, 마운트 후 셔플 → 하이드레이션 안전).
  const [promptIdx, setPromptIdx] = useState(0);
  useEffect(() => {
    setPromptIdx(Math.floor(Math.random() * SIDE_PROMPTS.length));
  }, []);
  const sidePrompt = SIDE_PROMPTS[promptIdx];

  // 인기 Q&A: doctor 글(Q&A) 상위 5개.
  const doctorAnswers = useMemo(
    () =>
      pool
        .filter((c) => !!c.doctor && (c.category ?? c.type) === "qa")
        .slice(0, 5),
    [pool],
  );

  const chips = CHIPS.map((c) => (
    <button
      key={c.key}
      type="button"
      className={`${styles.chip} ${chip === c.key ? styles.chipActive : ""}`}
      onClick={() => setChip(c.key)}
      aria-pressed={chip === c.key}
    >
      {c.label}
    </button>
  ));

  const sidebar = (
    <>
      <section className={`${styles.card} ${styles.sideCard}`}>
        <h3>인기 태그</h3>
        {/* 카테고리 탭 — "전체"(빈도순 16개) + 운영 5개 카테고리.
            탭 칩 색 클래스(styles.tagCatTab)는 CSS 작업자가 정의. 여기선 className 만 부여. */}
        <div className={styles.tagCatTabs}>
          <button
            type="button"
            className={`${styles.tagCatTab} ${tagTab === "all" ? styles.tagCatTabActive : ""}`}
            onClick={() => setTagTab("all")}
            aria-pressed={tagTab === "all"}
          >
            전체
          </button>
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.slug}
              className={`${styles.tagCatTab} ${tagTab === c.slug ? styles.tagCatTabActive : ""}`}
              onClick={() => setTagTab(c.slug)}
              aria-pressed={tagTab === c.slug}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className={styles.sideTags}>
          {/* 인기 태그에 # 표기 금지 — 키워드만. 클릭 시 서버 검색. */}
          {sideTags.length === 0 ? (
            <p className={styles.empty}>
              {cats === null ? "불러오는 중…" : "표시할 태그가 없습니다."}
            </p>
          ) : (
            sideTags.map((tag) => (
              <button
                type="button"
                className={`${styles.tagBtn} ${catTagClass(tag)} ${
                  (searchQuery ?? "").trim() === tag ? styles.tagBtnActive : ""
                }`}
                key={tag}
                onClick={() => applyTag(tag)}
                aria-pressed={(searchQuery ?? "").trim() === tag}
              >
                {tag}
              </button>
            ))
          )}
        </div>
      </section>

      <section className={`${styles.card} ${styles.sideCard}`}>
        <h3>인기 Q&A</h3>
        <div className={styles.sideList}>
          {doctorAnswers.map((c) => (
            <a key={c.id} href={cardHref(c)}>
              <span className={styles.n}>Q</span>
              <span>{c.title}</span>
            </a>
          ))}
        </div>
      </section>

      <section className={`${styles.card} ${styles.sideCta}`}>
        <h3>{sidePrompt.h3}</h3>
        <p>{sidePrompt.p}</p>
        <a className={styles.sideCtaBtn} href="/beta-skin/write">
          글쓰기
        </a>
      </section>
    </>
  );

  return (
    <BetaSkinShell
      active="피드"
      chips={chips}
      sidebar={sidebar}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onSearchSubmit={submitSearch}
    >
      {/* 탭 전환 애니메이션 대상(운영 BetaFeed contentRef) — remount 되지 않는 안정 래퍼.
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
                ? `‘${searchQuery}’ 시술 리포트가 없습니다.`
                : "아직 집계된 시술 리포트가 없습니다."}
            </p>
          ) : (
            filteredReports.map((r) => (
              <ProcedureReportCard
                key={r.procedureKo}
                report={r}
                feedHref={`/reports/${encodeURIComponent(r.procedureKo)}`}
              />
            ))
          )
        ) : filtered.length === 0 && !topReport ? (
          <p className={styles.empty}>
            {searchQuery
              ? `‘${searchQuery}’ 검색 결과가 없습니다.`
              : "이 카테고리에 표시할 글이 없습니다."}
          </p>
        ) : (
          <>
            {/* 검색 매칭 리포트 — 결과 맨 위 1장(운영 ProcedureReportCard 재사용). */}
            {topReport && (
              <ProcedureReportCard
                report={topReport}
                feedHref={`/reports/${encodeURIComponent(topReport.procedureKo)}`}
              />
            )}
            {filtered.map((card) => (
              <PostCard
                key={card.id}
                card={card}
                onTagClick={applyTag}
                isHot={hotSet.has(card.id)}
                viewer={viewerStates?.[card.id]}
              />
            ))}
          </>
        )}
      </div>
      </div>

      {/* 무한스크롤 sentinel — 일반·검색 탭에서만(리포트 제외). 풀 소진 시 렌더 안 함. */}
      {!isReportTab && hasMore && (
        <div ref={sentinelRef} className={styles.feedSentinel} aria-hidden="true" />
      )}
      {loading && <p className={styles.empty}>불러오는 중…</p>}
    </BetaSkinShell>
  );
}
