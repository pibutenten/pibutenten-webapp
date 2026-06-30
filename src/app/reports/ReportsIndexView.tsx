"use client";

/**
 * ReportsIndexView — /reports(시술 리포트 인덱스 개선판) 본문 (클라이언트).
 *
 * 원칙: 글로벌 크롬(AppShell)·우측 사이드바·헤더 검색은 공유 layout(ReportsShell)이 담당한다.
 *   이 컴포넌트는 **본문 콘텐츠만** 반환한다(정렬 칩 + 목록 + 면책).
 *
 * 본문:
 *   - 정렬 칩 레일(컴팩트 풀로 계산 가능한 것만): 후기 많은 순(기본)/다시 받고 싶은 순/
 *     만족도 높은 순/통증 적은 순. 본문 상단에 인라인 sticky 바로 고정(상세 후기 정렬칩과 동일 패턴).
 *   - 카테고리 필터: 사이드바 칩 선택을 useReportsCategory()로 구독해 목록을 거른다(필터 해제·이동은
 *     상위 shell 의 사이드바 재클릭이 담당. 본문은 읽어서 필터만).
 *   - 각 시술 = ReportsIndexCard(자체 구현, 컴팩트 풀 값만 쓰는 요약 카드) + 서버 확정 headline.
 *     (공용 ProcedureReportCard 는 병렬 세션 소유라 import·의존하지 않는다.)
 *
 * 헤드라인은 서버 prop 그대로 표시(클라 재랜덤 금지 → SSR/CSR 일치, 하이드레이션 안전).
 *
 * 격리: app.module.css 클래스 의존 금지 — Tailwind 유틸 + globals.css 토큰만.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProcedureReport } from "@/lib/procedure-report";
import ReportsIndexCard from "./ReportsIndexCard";
import { useReportsCategory } from "./category-context";

type ReportItem = {
  report: ProcedureReport;
  headline: string;
  /** 서버 선집계 대표 효과 top3(즉시 표시·끊김 없음). */
  effects: { label: string; pct: number }[];
  /** 효과 발현 최다 시점 라벨(없으면 null). */
  onsetLabel: string | null;
  /** family 롤업 후 가장 최근 후기 시각(ISO). 후기 0건이면 null. '최신순' 정렬용. */
  latestReviewAt: string | null;
};

type SortKey = "recent" | "count" | "revisit" | "satisfaction" | "pain";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "최신순" },
  { key: "count", label: "후기 많은 순" },
  { key: "revisit", label: "재시술의향 높은 순" },
  { key: "satisfaction", label: "만족도 높은 순" },
  { key: "pain", label: "통증 적은 순" },
];

/** 한 페이지(피드형 무한스크롤) 노출 개수. */
const PAGE_SIZE = 8;

/** 재시술 의향 yes 비율(%) — 정렬용. 분모 0이면 0. */
function revisitYesPct(r: ProcedureReport): number {
  const total = r.revisit.yes + r.revisit.maybe + r.revisit.no;
  return total > 0 ? r.revisit.yes / total : 0;
}

/**
 * 결정론적 [0,1) 의사난수 — 시술명 + 일(日) 시드 해시(FNV-1a 변형).
 * 같은 (시술, 시드)면 항상 같은 값 → SSR/CSR 하이드레이션 일치 + Math.random 미사용.
 */
function rotationNoise(key: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** ISO 문자열 → ms. null/파싱불가면 0(가장 오래됨). */
function isoToMs(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/** 최신순 합성 점수 가중치 — 최신 후기 / 후기 수 / 재시술의향 / 약한 일일 회전. */
const W_RECENCY = 0.4;
const W_COUNT = 0.35;
const W_REVISIT = 0.25;
const W_ROTATION = 0.12;

export default function ReportsIndexView({
  items,
  rotationSeed,
}: {
  /** 서버 정렬(count desc) + 헤드라인 확정 목록. */
  items: ReportItem[];
  /** 서버 계산 일(日) 시드 — '최신순' 약한 회전용(하루 고정 → 하이드레이션 일치). */
  rotationSeed: number;
}) {
  const [sort, setSort] = useState<SortKey>("recent");
  // 피드형 무한스크롤 — 현재 노출 페이지 수. 정렬·카테고리 변경 시 1로 리셋.
  const [pageCount, setPageCount] = useState(1);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // 카테고리 필터는 공유 layout(ReportsShell)의 사이드바 칩 상태를 구독(null=전체).
  const category = useReportsCategory();

  // 필터 + 정렬 — 서버 목록을 클라에서 재배열(헤드라인은 item 에 고정 동행).
  const visible = useMemo(() => {
    const filtered = category
      ? items.filter((it) => it.report.category === category)
      : items;

    // '최신순' 합성 점수용 정규화 분모 — 필터된 집합 기준 최신/최오래 후기 시각 + 최대 후기수.
    //   recency 는 [minRecency, maxRecency] 구간으로 정규화(후기 0건 시 0). count 는 maxCount 분모.
    let minRecency = Infinity;
    let maxRecency = 0;
    let maxCount = 0;
    if (sort === "recent") {
      for (const it of filtered) {
        const ms = isoToMs(it.latestReviewAt);
        if (ms > 0) {
          if (ms < minRecency) minRecency = ms;
          if (ms > maxRecency) maxRecency = ms;
        }
        if (it.report.count > maxCount) maxCount = it.report.count;
      }
    }
    const recencySpan = maxRecency > minRecency ? maxRecency - minRecency : 0;
    // 합성 점수: 최신 후기(0.4) + 후기 수(0.35) + 재시술의향(0.25) + 약한 일일 회전(±0.06).
    //   회전은 rotationNoise([0,1)) - 0.5 → [-0.5,0.5], W_ROTATION 0.12 가중 → 동점·근접만 뒤섞음.
    const recentScore = (it: ReportItem): number => {
      const ms = isoToMs(it.latestReviewAt);
      const recN = recencySpan > 0 && ms > 0 ? (ms - minRecency) / recencySpan : 0;
      const countN = maxCount > 0 ? it.report.count / maxCount : 0;
      const revisit = revisitYesPct(it.report);
      const rot = rotationNoise(it.report.procedureKo, rotationSeed) - 0.5;
      return (
        W_RECENCY * recN +
        W_COUNT * countN +
        W_REVISIT * revisit +
        W_ROTATION * rot
      );
    };

    const sorted = [...filtered].sort((a, b) => {
      const ra = a.report;
      const rb = b.report;
      switch (sort) {
        case "recent": {
          const d = recentScore(b) - recentScore(a);
          return d !== 0 ? d : rb.count - ra.count;
        }
        case "revisit": {
          const d = revisitYesPct(rb) - revisitYesPct(ra);
          return d !== 0 ? d : rb.count - ra.count;
        }
        case "satisfaction": {
          const d = rb.avgSatisfaction - ra.avgSatisfaction;
          return d !== 0 ? d : rb.count - ra.count;
        }
        case "pain": {
          // 통증 적은 순 — avgPain 오름차순. 평균이 0(미응답)인 시술은 뒤로.
          const pa = ra.avgPain || Infinity;
          const pb = rb.avgPain || Infinity;
          const d = pa - pb;
          return d !== 0 ? d : rb.count - ra.count;
        }
        case "count":
        default:
          return (
            rb.count - ra.count ||
            ra.procedureKo.localeCompare(rb.procedureKo, "ko")
          );
      }
    });
    return sorted;
  }, [items, sort, category, rotationSeed]);

  // 피드형 무한스크롤 — 현재 페이지까지 잘라 노출. 정렬·카테고리 변경 시 1페이지로 리셋.
  const shown = useMemo(
    () => visible.slice(0, pageCount * PAGE_SIZE),
    [visible, pageCount],
  );
  const hasMore = shown.length < visible.length;

  useEffect(() => {
    setPageCount(1);
  }, [sort, category]);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPageCount((p) => p + 1);
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore]);

  return (
    <>
      <style>{`@keyframes rvRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      {/* 정렬 칩 — 본문 상단에 인라인 sticky 고정. 배경은 앱 캔버스와 동일(회색 없음). 활성=브랜드색. */}
      <div
        className="sticky z-[41] mb-3 py-2.5"
        style={{ top: "var(--sat)", background: "var(--tt-canvas)", backgroundAttachment: "fixed" }}
      >
        <div
          role="group"
          aria-label="정렬"
          className="flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SORTS.map((s) => {
            const on = sort === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                aria-pressed={on}
                className="shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors"
                style={
                  on
                    ? { backgroundColor: "#2A9FD6", color: "#fff" }
                    : { backgroundColor: "#fff", color: "var(--text-secondary)" }
                }
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-1 py-8 text-center text-[14px] leading-[1.6] text-[var(--text-muted)]">
          {items.length === 0
            ? "아직 집계된 시술 리포트가 없어요."
            : "이 카테고리에는 아직 리포트가 없어요."}
        </p>
      ) : (
        <div
          key={`${sort}-${category ?? "all"}`}
          className="flex flex-col gap-3"
          style={{ animation: "rvRise .28s ease both" }}
        >
          {shown.map((it) => (
            <ReportsIndexCard
              key={it.report.procedureKo}
              report={it.report}
              headline={it.headline}
              effects={it.effects}
              onsetLabel={it.onsetLabel}
            />
          ))}
          {hasMore && <div ref={sentinelRef} aria-hidden className="h-8" />}
        </div>
      )}
      <p className="mt-4 px-1 text-center text-[11.5px] leading-[1.6] text-[var(--text-muted)]">
        회원들의 실사용 후기를 집계한 결과예요. 개인차가 있으며 의학적 효과·안전성을 보장하지 않아요. 시술 결정은 전문의 상담 후에 하세요.
      </p>
    </>
  );
}
