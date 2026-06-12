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
import type { ProcedureReport } from "@/lib/procedure-report";
import BetaSkinShell from "./BetaSkinShell";
import styles from "./beta-skin.module.css";
import { PostCard, BetaReportCard, cardHref, catTagClass } from "./beta-ui";

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
  reportPool = [],
}: {
  initialPool: CardData[];
  /** 피드백 4) 시술 리포트 풀 — '리포트' 탭에서 노출. 0건이면 빈 안내. */
  reportPool?: ProcedureReport[];
}) {
  const searchParams = useSearchParams();
  const [chip, setChip] = useState<ChipKey>("all");
  // 항목 5) 검색어 — 헤더 검색창 + 태그 클릭이 모두 이 값을 채운다.
  //   카드 title/body/keywords 부분일치(대소문자 무시)로 피드를 필터.
  const [query, setQuery] = useState("");
  // 무한스크롤: 현재 노출 개수. 칩/검색 전환 시 초기값(PAGE)으로 리셋.
  const [visible, setVisible] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 내 노트 키워드 칩(?kw=) + 피드백 4) 비-피드 페이지 헤더 검색(?q=) 둘 다 검색어로 시드.
  //   ?q= 우선(명시적 검색 라우팅), 없으면 ?kw=.
  const qParam = searchParams.get("q");
  const kwParam = searchParams.get("kw");
  useEffect(() => {
    const seed = (qParam ?? kwParam ?? "").trim();
    if (seed) setQuery(seed);
  }, [qParam, kwParam]);

  // 피드백 1/4) 비-피드 드롭다운 '카테고리 바로가기' → /beta-skin?cat= 로 넘어온 칩 시드.
  const catParam = searchParams.get("cat");
  useEffect(() => {
    const valid: ChipKey[] = ["all", "qa", "review", "doodle", "review_summary"];
    if (catParam && (valid as string[]).includes(catParam)) {
      setChip(catParam as ChipKey);
    }
  }, [catParam]);

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

  // 피드백 4) '리포트' 탭 — 리포트 풀을 노출(검색어 있으면 시술명 부분일치 필터).
  const isReportTab = chip === "review_summary";
  const filteredReports = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return reportPool;
    return reportPool.filter((r) =>
      [r.procedureKo, r.en].join(" ").toLowerCase().includes(needle),
    );
  }, [reportPool, query]);

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

  // 전체 풀 keywords 빈도 순위(중복 회피용 단일 출처).
  const rankedTags = useMemo(() => {
    const freq = new Map<string, number>();
    for (const c of initialPool) {
      for (const k of c.keywords ?? []) {
        freq.set(k, (freq.get(k) ?? 0) + 1);
      }
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
  }, [initialPool]);

  // 사이드바 인기 태그: 상위 8.
  const popularTags = useMemo(() => rankedTags.slice(0, 8), [rankedTags]);
  // 피드백 1) 드롭다운 추천 키워드: 사이드(0~8)와 겹치지 않는 다음 셋(8~16).
  //   풀이 작아 8개 미만이면, 앞쪽에서 부족분을 채우되 사이드와의 중복은 시각상 허용 최소화.
  const dropdownSuggest = useMemo(() => {
    const next = rankedTags.slice(8, 16);
    if (next.length >= 4) return next;
    // 풀이 작은 경우 폴백: 사이드 셋의 후반부라도 노출(빈 드롭다운 방지).
    return rankedTags.slice(0, 8).slice(-Math.max(0, 8 - next.length)).concat(next);
  }, [rankedTags]);

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
              className={`${styles.tagBtn} ${catTagClass(tag)} ${
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
        {/* 피드백 3) 별도 '검색 해제 ✕' 칩 제거 — 해제는 검색창 자체의 ✕ 로만. */}
      </section>

      <section className={`${styles.card} ${styles.sideCard}`}>
        {/* 피드백 6) '이번 주 전문의 답변' → 답변 약속·freshness 톤다운. */}
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
        {/* 피드백 6) 전문의 직접 답변을 약속하지 않는 중립 문구. */}
        <h3>궁금한 시술이 있나요?</h3>
        <p>Q&A로 남기면 회원·전문의의 이야기를 들어볼 수 있어요.</p>
        <a className={styles.sideCtaBtn} href="/beta-skin/write">
          Q&A 작성하기
        </a>
      </section>
    </>
  );

  // 피드백 1) 드롭다운 카테고리 바로가기 — 클릭 시 해당 칩 필터(전체 제외).
  const searchCategories = CHIPS.filter((c) => c.key !== "all").map((c) => ({
    key: c.key,
    label: c.label,
  }));

  return (
    <BetaSkinShell
      active="피드"
      chips={chips}
      sidebar={sidebar}
      searchValue={query}
      onSearchChange={setQuery}
      searchSuggestions={dropdownSuggest}
      searchCategories={searchCategories}
      onPickCategory={(key) => {
        setChip(key as ChipKey);
        setQuery("");
      }}
      recentSearches={["리프팅", "스킨부스터"]}
    >
      {/* 피드백 5) 칩/검색 전환 시 리스트 컨테이너 remount(key=칩+검색어) →
          각 카드의 fadeInUp 이 재발화되어 매 전환마다 살짝 올라오며 등장.
          무한스크롤(visible 변경)은 같은 key 라 추가분만 append(스크롤 유지). */}
      <div className={styles.feedList} key={`${chip}|${query.trim()}`}>
        {isReportTab ? (
          // 피드백 4) 리포트 탭 — 시술 리포트 카드. 데이터 0건이면 빈 안내.
          filteredReports.length === 0 ? (
            <p className={styles.empty}>
              {query.trim()
                ? `‘${query.trim()}’ 시술 리포트가 없습니다.`
                : "아직 집계된 시술 리포트가 없습니다."}
            </p>
          ) : (
            filteredReports.map((r) => (
              <BetaReportCard key={r.procedureKo} report={r} />
            ))
          )
        ) : filtered.length === 0 ? (
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

      {/* 무한스크롤 sentinel — 일반 탭에서만(리포트는 전부 노출). 풀 소진 시 렌더 안 함. */}
      {!isReportTab && hasMore && (
        <div ref={sentinelRef} className={styles.feedSentinel} aria-hidden="true" />
      )}
    </BetaSkinShell>
  );
}
