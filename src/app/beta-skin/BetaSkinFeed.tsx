"use client";

/**
 * BetaSkinFeed — /beta-skin 신규 스킨 프리뷰 (피드 본문, 클라이언트).
 *
 * 공용 셸(BetaSkinShell)을 사용 → 헤더·탭바·캔버스 오버레이는 셸이 담당.
 * 이 컴포넌트는 칩(필터)·피드 카드 리스트·데스크탑 사이드바 "내용"만 담당.
 *
 * 데이터: 서버(page.tsx)에서 feed_cards_scored 로 받은 풀(CardData[]) 을 prop 으로 받아
 *   카테고리 칩 + 키워드 칩으로 클라 필터(useState) + IntersectionObserver 무한스크롤로 점진 노출.
 *   서버 왕복 없음 — 받아온 풀을 14장씩 reveal, 풀 소진 시 중단.
 *
 * 키워드 필터: 사이드바 '인기 태그' 클릭 + 내 노트(/beta-skin/record) 관심 키워드 칩에서
 *   넘어온 ?kw= 쿼리로 시드. 카테고리 칩과 AND 결합(둘 다 만족하는 카드만 노출).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CardData } from "@/lib/types/card";
import BetaSkinShell from "./BetaSkinShell";
import styles from "./beta-skin.module.css";
import { PostCard, cardHref } from "./beta-ui";

/* 한 번에 노출할 카드 수 (초기 + 추가 배치 단위) */
const PAGE = 14;

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

/* 항목 5) 검색 일치 — 카드 title/body/keywords 에 부분일치(대소문자 무시).
 * 항목 4) 태그 클릭도 이 같은 메커니즘(검색어를 헤더 검색창에 채움)을 탄다. */
function matchesQuery(c: CardData, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    c.title ?? "",
    c.body ?? "",
    ...(c.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

/* ---------- 클라이언트 루트 ---------- */
export default function BetaSkinFeed({
  initialPool,
}: {
  initialPool: CardData[];
}) {
  const searchParams = useSearchParams();
  const [chip, setChip] = useState<ChipKey>("all");
  // 항목 5) 검색어 — 헤더 검색창 + 태그 클릭이 모두 이 값을 채운다.
  //   카드 title/body/keywords 부분일치(대소문자 무시)로 피드를 필터.
  const [query, setQuery] = useState("");
  // 무한스크롤: 현재 노출 개수. 칩/검색 전환 시 초기값(PAGE)으로 리셋.
  const [visible, setVisible] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 내 노트 등에서 ?kw= 로 넘어온 키워드를 검색어로 1회 시드.
  const kwParam = searchParams.get("kw");
  useEffect(() => {
    if (kwParam && kwParam.trim()) setQuery(kwParam.trim());
  }, [kwParam]);

  // 항목 4) 태그 클릭 → 그 키워드를 검색창에 채워 같은 필터를 태운다.
  //   같은 키워드 재클릭 시 해제(빈 검색어 → 전체 복귀).
  const applyTag = (k: string) =>
    setQuery((cur) => (cur.trim() === k ? "" : k));

  const filtered = useMemo(
    () =>
      initialPool.filter(
        (c) => matchesChip(c, chip) && matchesQuery(c, query),
      ),
    [initialPool, chip, query],
  );

  // 칩/검색어가 바뀌면 노출 개수 초기화 (필터된 목록 기준으로 다시 점진 노출).
  useEffect(() => {
    setVisible(PAGE);
  }, [chip, query]);

  const shown = useMemo(
    () => filtered.slice(0, visible),
    [filtered, visible],
  );
  const hasMore = visible < filtered.length;

  // 하단 sentinel 이 뷰포트(오버레이 = 풀뷰포트)에 들어오면 14장 추가 노출.
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + PAGE, filtered.length));
        }
      },
      { rootMargin: "320px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, filtered.length]);

  // 인기 태그: 전체 풀 keywords 빈도 상위 8개
  const popularTags = useMemo(() => {
    const freq = new Map<string, number>();
    for (const c of initialPool) {
      for (const k of c.keywords ?? []) {
        freq.set(k, (freq.get(k) ?? 0) + 1);
      }
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k);
  }, [initialPool]);

  // 이번 주 전문의 답변: doctor 글(Q&A) 제목 상위 5개
  const doctorAnswers = useMemo(
    () =>
      initialPool
        .filter((c) => !!c.doctor && (c.category ?? c.type) === "qa")
        .slice(0, 5),
    [initialPool],
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
          {/* 항목 4) 인기 태그에 # 표기 금지 — 키워드만. 클릭 시 검색창에 채워 필터. */}
          {popularTags.map((tag) => (
            <button
              type="button"
              className={`${styles.tagBtn} ${
                query.trim() === tag ? styles.tagBtnActive : ""
              }`}
              key={tag}
              onClick={() => applyTag(tag)}
              aria-pressed={query.trim() === tag}
            >
              {tag}
            </button>
          ))}
        </div>
        {query.trim() && (
          <button
            type="button"
            className={styles.tagClear}
            onClick={() => setQuery("")}
          >
            ‘{query.trim()}’ 검색 해제 ✕
          </button>
        )}
      </section>

      <section className={`${styles.card} ${styles.sideCard}`}>
        <h3>이번 주 전문의 답변</h3>
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
        <p>피부과 전문의가 직접 답변해 드려요.</p>
        <a className={styles.sideCtaBtn} href="/beta-skin/write">
          질문 올리기
        </a>
      </section>
    </>
  );

  return (
    <BetaSkinShell
      active="피드"
      chips={chips}
      sidebar={sidebar}
      searchValue={query}
      onSearchChange={setQuery}
    >
      <div className={styles.feedList}>
        {filtered.length === 0 ? (
          <p className={styles.empty}>
            {query.trim()
              ? `‘${query.trim()}’ 검색 결과가 없습니다.`
              : "이 카테고리에 표시할 글이 없습니다."}
          </p>
        ) : (
          shown.map((card) => (
            <PostCard key={card.id} card={card} onTagClick={applyTag} />
          ))
        )}
      </div>

      {/* 무한스크롤 sentinel — 보이면 다음 14장 노출. 풀 소진 시 렌더 안 함. */}
      {hasMore && (
        <div ref={sentinelRef} className={styles.feedSentinel} aria-hidden="true" />
      )}
    </BetaSkinShell>
  );
}
