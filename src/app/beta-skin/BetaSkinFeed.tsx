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
import BetaSkinShell from "./BetaSkinShell";
import styles from "./beta-skin.module.css";
import {
  PostCard,
  BetaReportCard,
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

/* ---------- 클라이언트 루트 ---------- */
export default function BetaSkinFeed({
  initialPool,
  orderedIds = [],
  reportPool = [],
  searchReport = null,
  searchQuery,
  viewerStates,
  popularQueries = [],
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
  /** 서버 prefetch 한 좋아요/저장 상태(card.id → 상태). */
  viewerStates?: Record<number, BetaViewerState>;
  /** 헤더 검색 드롭다운에 노출할 실제 인기검색어(get_top_search_queries). */
  popularQueries?: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [chip, setChip] = useState<ChipKey>("all");
  // 헤더 검색 입력값 — 초기값은 현재 서버 검색어. 변경은 로컬, 제출 시 서버 라우팅.
  const [searchValue, setSearchValue] = useState(searchQuery ?? "");

  // 풀 + 무한스크롤 커서(운영 BetaFeed 패턴).
  const [pool, setPool] = useState<CardData[]>(initialPool);
  const [hasMore, setHasMore] = useState(orderedIds.length > initialPool.length);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
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

  // 서버 검색어가 바뀌면 입력값 동기화(라우팅으로 새 검색 진입 시).
  useEffect(() => {
    setSearchValue(searchQuery ?? "");
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

  // 검색 제출(엔터/추천 클릭) → 서버 재검색 라우팅.
  const submitSearch = (q: string) => {
    const t = q.trim();
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

  // 전체 풀 keywords 빈도 순위(사이드 인기 태그용).
  const popularTags = useMemo(() => {
    const freq = new Map<string, number>();
    for (const c of pool) {
      for (const k of c.keywords ?? []) {
        freq.set(k, (freq.get(k) ?? 0) + 1);
      }
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k)
      .slice(0, 8);
  }, [pool]);

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
        <div className={styles.sideTags}>
          {/* 인기 태그에 # 표기 금지 — 키워드만. 클릭 시 서버 검색. */}
          {popularTags.map((tag) => (
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
          ))}
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
        <h3>궁금한 시술이 있나요?</h3>
        <p>Q&A로 남기면 회원·전문의의 이야기를 들어볼 수 있어요.</p>
        <a className={styles.sideCtaBtn} href="/beta-skin/write">
          Q&A 작성하기
        </a>
      </section>
    </>
  );

  // 드롭다운 카테고리 바로가기 — 클릭 시 해당 칩 필터(전체 제외).
  const searchCategories = CHIPS.filter((c) => c.key !== "all").map((c) => ({
    key: c.key,
    label: c.label,
  }));

  return (
    <BetaSkinShell
      active="피드"
      chips={chips}
      sidebar={sidebar}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onSearchSubmit={submitSearch}
      searchSuggestions={popularQueries}
      searchCategories={searchCategories}
      onPickCategory={(key) => setChip(key as ChipKey)}
    >
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
              <BetaReportCard key={r.procedureKo} report={r} />
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
            {/* 검색 매칭 리포트 — 결과 맨 위 1장. */}
            {topReport && <BetaReportCard report={topReport} />}
            {filtered.map((card) => (
              <PostCard
                key={card.id}
                card={card}
                onTagClick={applyTag}
                viewer={viewerStates?.[card.id]}
              />
            ))}
          </>
        )}
      </div>

      {/* 무한스크롤 sentinel — 일반·검색 탭에서만(리포트 제외). 풀 소진 시 렌더 안 함. */}
      {!isReportTab && hasMore && (
        <div ref={sentinelRef} className={styles.feedSentinel} aria-hidden="true" />
      )}
      {loading && <p className={styles.empty}>불러오는 중…</p>}
    </BetaSkinShell>
  );
}
