"use client";

/**
 * ReportsNewDetailView — /reports-new/[시술] 전체 리포트.
 *
 * 구조:
 *   ① 리포트 카드(한 장으로 결합, 섹션 간 hairline) — 히어로(브랜드 로고+재시술의향) →
 *      만족도 → 통증·다운타임 → 효과(다색 막대) → 효과시점 → 작성자 통계.
 *   ② 직접 들어보기 — 제목은 카드 밖, 각 후기가 "독립 글상자". 정렬 칩은 이 구간에서만 sticky 고정
 *      (스크롤 도달 시 멈췄다가 Q&A 구간에서 풀림), 클릭 시 실제 정렬 + 살짝 떠오르는 전환.
 *      10개씩 더 보기 / 접기.
 *   ③ 전문의 Q&A(랭킹 한 상자) → ④ 비슷한 시술(각 카테고리 색 상자) → ⑤ 저장·공유(브랜드색).
 *
 * 진입 애니메이션: 히어로 % 카운트업 · 사람 그리드 stagger · 막대 0→값 채움.
 * 다채색 유지(효과/작성자/Q&A). 후기는 로컬 ReportsNewReviewCard(실 card_likes 공유).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ProcedureReport } from "@/lib/procedure-report";
import type { CardData } from "@/components/Card";
import type { ProcedureSlug } from "@/lib/categories";
import type { EngagementMe } from "@/components/card/hooks/useCardEngagement";
import { categoryTheme } from "@/lib/procedure-theme";
import { getQaUrl } from "@/lib/card-url";
import { experienceCount } from "@/lib/report-copy";
import { DOWNTIME_DAYS, EFFECT_ONSET_OPTIONS } from "@/lib/review-options";
import { useSession } from "@/lib/session-context";
import { showToast } from "@/lib/toast";
import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";
import DowntimeGauge from "@/components/report/DowntimeGauge";
import EffectOnsetTimeline from "@/components/report/EffectOnsetTimeline";
import ReportsNewReviewCard from "./ReportsNewReviewCard";
import ReportsIndexSidebar, { type SidebarTopProcedure } from "@/components/report/ReportsIndexSidebar";
import LoginPromptDialog from "@/components/LoginPromptDialog";
import { useRouter } from "next/navigation";

const EFFECT_BAR_COLORS = [
  "#7FD0F8", "#B0A0DE", "#9AA6DE", "#FFCB8C", "#8FD4C8",
  "#F59CB6", "#A6D9A9", "#F4B8A0", "#C3B0E8", "#CDC97A",
];
const AGE_COLORS = ["#A8C2E6", "#9AA6DE", "#C3B0E8", "#F2A9C0", "#FFCB8C"];
const DEMO_FEMALE = "#F59CB6";
const DEMO_MALE = "#7FD0F8";

// 전문의 Q&A 랭킹 색 — 1·2·3위 강조, 4위 이하 회색.
function rankColor(rank: number): string {
  if (rank === 1) return "#F76D9B";
  if (rank === 2) return "#378ADD";
  if (rank === 3) return "#F5A623";
  return "#A2A6AF";
}

const PAIN_LABELS = ["없음", "조금", "보통", "꽤", "심함"];
const PAIN_SOFT = ["#7FD0F8", "#FDE68A", "#FDBA74", "#FCA5A5", "#F08A8A"];
function painPos(v: number): number {
  const x = Math.min(5, Math.max(1, v));
  return 6.25 + ((x - 1) / 4) * 87.5;
}
function satPhrase(a: number): string {
  if (a >= 4.5) return "다들 결과에 크게 만족했어요";
  if (a >= 4.0) return "대체로 만족하는 분위기예요";
  if (a >= 3.5) return "만족과 아쉬움이 갈렸어요";
  return "호불호가 갈리는 편이에요";
}
function painPhrase(a: number): string {
  if (a < 2.0) return "거의 안 아팠다는 분이 많아요";
  if (a < 3.0) return "살짝 따끔한 정도였대요";
  if (a < 3.6) return "참을 만했다는 평이 많아요";
  if (a < 4.4) return "센 편이었다는 분이 많아요";
  return "꽤 아팠다는 분이 많아요";
}

// 후기 정렬 보조값.
function reviewOf(card: CardData) {
  const pr = card.procedure_review;
  return Array.isArray(pr) ? pr[0] : pr;
}
function satOf(card: CardData): number {
  return reviewOf(card)?.satisfaction ?? 0;
}
function reactionScore(card: CardData): number {
  return (card.like_count ?? 0) + (card.comment_count ?? 0) + (card.share_count ?? 0);
}
function bodyLen(card: CardData): number {
  return (card.body ?? "").length;
}

/** 진입 카운트업(0→target). run=true 일 때 1회 애니메이션. */
function useCountUp(target: number, run: boolean): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      setV(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return v;
}

const FIGURE_PATH = (
  <>
    <circle cx="12" cy="7.5" r="4.6" fill="currentColor" />
    <path d="M3.4 27c0-4.8 3.8-8.4 8.6-8.4s8.6 3.6 8.6 8.4Z" fill="currentColor" />
  </>
);

const SEC = "px-5 py-6";
const SECB = "px-5 py-6";
const EYEBROW = "mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em]";
const QHEAD = "text-[19px] font-extrabold leading-[1.3] tracking-[-0.02em] text-[var(--text)]";
const ARROW = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

type SortKey = "rec" | "high" | "low" | "new";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "rec", label: "추천순" },
  { key: "high", label: "별점 높은 순" },
  { key: "low", label: "별점 낮은 순" },
  { key: "new", label: "최신순" },
];

export default function ReportsNewDetailView({
  ko,
  en,
  report,
  reviews,
  reviewLiked,
  reviewDemo,
  reviewTotal,
  topicsExists,
  doctorQAs,
  similar,
  topProcedures,
}: {
  ko: string;
  en: string;
  report: ProcedureReport;
  reviews: CardData[];
  reviewLiked: Record<number, boolean>;
  /** 후기 작성자 나이·성별(카드 표시용). */
  reviewDemo: Record<number, { gender: string | null; ageDecade: number | null }>;
  reviewTotal: number;
  topicsExists: boolean;
  /** 의사 Q&A 인기순 최대 10개 */
  doctorQAs: CardData[];
  /** 비슷한 시술 최대 5개(각 카테고리 색) */
  similar: { ko: string; en: string; count: number; effectPct: number; category: ProcedureSlug | null }[];
  /** 사이드바 '후기 많은 시술'(인덱스와 동일 2단 레이아웃). */
  topProcedures: SidebarTopProcedure[];
}) {
  const search = useSearchRouting();
  const session = useSession();
  const me: EngagementMe =
    session === null ? null : { id: session.activeIdentityId, role: session.role };
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);
  const [qaExpanded, setQaExpanded] = useState(false);
  const [reviewSort, setReviewSort] = useState<SortKey>("rec");
  const reviewsRef = useRef<HTMLElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // 정렬 변경 시 칩은 제자리(상단 고정)에 두고, 그 아래로 첫 후기가 보이게 칩바 위치로만 스크롤.
  function changeSort(k: SortKey) {
    setReviewSort(k);
    requestAnimationFrame(() => {
      chipRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // 진입 애니메이션 트리거(마운트 직후 1회).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const theme = categoryTheme(report.category);
  const {
    count, avgSatisfaction, satisfactionDist, avgPain, revisit, effects,
    noEffectCount, downtimeAnswered, downtimeDist, onsetAnswered, onsetDist,
    demographics,
  } = report;

  const rTotal = Math.max(1, revisit.yes + revisit.maybe + revisit.no);
  const yesPct = Math.round((revisit.yes / rTotal) * 100);
  const yesPctAnim = useCountUp(yesPct, mounted);

  // 만족도 히스토그램
  const maxSat = Math.max(1, ...satisfactionDist);
  const sat45 = (satisfactionDist[3] ?? 0) + (satisfactionDist[4] ?? 0);
  const sat45pct = Math.round((sat45 / Math.max(1, count)) * 100);

  // 효과시점 헤드라인
  const onsetTimeSum = onsetDist.slice(0, 4).reduce((a, b) => a + b, 0);
  let onsetTopIdx = 0;
  for (let i = 1; i < 4; i++) if ((onsetDist[i] ?? 0) > (onsetDist[onsetTopIdx] ?? 0)) onsetTopIdx = i;
  const onsetHead =
    onsetTimeSum === 0
      ? "아직 효과를 느꼈다는 후기가 적어요."
      : `효과는 대부분 ${EFFECT_ONSET_OPTIONS[onsetTopIdx]?.label ?? ""}부터 느끼기 시작했어요.`;

  // 작성자 통계
  const demoTotal = Math.max(1, demographics.male + demographics.female);
  const femalePct = Math.round((demographics.female / demoTotal) * 100);
  const malePct = Math.max(0, 100 - femalePct);
  const ageTotal = Math.max(1, demographics.ageBands.reduce((a, b) => a + b.count, 0));

  // 사람 그리드 — 최대 45개로 캡(비율 유지).
  const CAP = 45;
  const showTotal = Math.min(rTotal, CAP);
  const yShow = Math.round((revisit.yes / rTotal) * showTotal);
  const mShow = Math.round((revisit.maybe / rTotal) * showTotal);

  const painGradient = `linear-gradient(90deg, ${PAIN_SOFT[0]} 0%, ${PAIN_SOFT.map(
    (c, i) => `${c} ${painPos(i + 1)}%`,
  ).join(", ")}, ${PAIN_SOFT[PAIN_SOFT.length - 1]} 100%)`;

  const topEffects = effects.slice(0, 6);
  const noEffectPct = Math.round((noEffectCount / Math.max(1, count)) * 100);
  const topEffectLabel = effects[0]?.label ?? "";

  // 전문의 Q&A — 5개 기본, 더 있으면 토글로 전체.
  const qaVisible = qaExpanded ? doctorQAs : doctorQAs.slice(0, 5);

  // ── 후기: 클라 정렬 + 10개씩 더 보기/접기 ──
  const [items, setItems] = useState<CardData[]>(reviews);
  const [liked, setLiked] = useState<Record<number, boolean>>(reviewLiked);
  const [demo, setDemo] = useState(reviewDemo);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = items.length < reviewTotal;
  const expanded = items.length > reviews.length;
  const nextChunk = Math.min(10, reviewTotal - items.length);

  const sortedItems = useMemo(() => {
    const arr = [...items];
    switch (reviewSort) {
      case "high":
        arr.sort((a, b) => satOf(b) - satOf(a) || reactionScore(b) - reactionScore(a));
        break;
      case "low":
        arr.sort((a, b) => satOf(a) - satOf(b) || reactionScore(b) - reactionScore(a));
        break;
      case "new":
        arr.sort((a, b) => {
          const ca = a.created_at ?? "";
          const cb = b.created_at ?? "";
          return ca < cb ? 1 : ca > cb ? -1 : 0;
        });
        break;
      default: // 추천순 = 리액션(좋아요+댓글+공유)순, 동률은 글자수 많은순
        arr.sort((a, b) => reactionScore(b) - reactionScore(a) || bodyLen(b) - bodyLen(a));
    }
    return arr;
  }, [items, reviewSort]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/reports/${encodeURIComponent(en || ko)}/reviews?offset=${items.length}&limit=10`,
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        reviews: CardData[];
        reviewLiked: Record<number, boolean>;
        reviewDemo?: Record<number, { gender: string | null; ageDecade: number | null }>;
      };
      setItems((prev) => [...prev, ...data.reviews]);
      setLiked((prev) => ({ ...prev, ...data.reviewLiked }));
      setDemo((prev) => ({ ...prev, ...(data.reviewDemo ?? {}) }));
    } catch {
      /* 무시 — 재시도 가능 */
    } finally {
      setLoadingMore(false);
    }
  }
  function collapseReviews() {
    setItems(reviews);
    setLiked(reviewLiked);
  }

  async function share() {
    if (typeof navigator === "undefined") return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${ko} 피부텐텐 리포트`, url });
        return;
      } catch {
        /* 취소/미지원 — 클립보드 폴백 */
      }
    }
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
    showToast("링크가 복사됐어요.");
  }
  function saveReport() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
    showToast("링크를 복사했어요. 즐겨찾기에 저장해 두세요.");
  }

  const sidebar = (
    <ReportsIndexSidebar
      topProcedures={topProcedures}
      activeCategory={null}
      onCategory={() => router.push("/reports-new")}
    />
  );

  return (
    <AppShell active="리포트" back="/reports-new" sidebar={sidebar} sidebarMobileBelow {...search}>
      {/* ── ① 리포트 카드(한 장) ── */}
      <div className="overflow-hidden rounded-[var(--radius-lg)] bg-white">
        {/* 히어로 */}
        <section className="px-5 pb-7 pt-7 text-center" style={{ backgroundColor: theme.soft }}>
          {/* 브랜드 락업 — 실제 로고(tt: 피부텐텐) + "리포트"(같은 크기), 배경 위에 부드럽게 */}
          <span className="inline-flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand-logo.svg" alt="피부텐텐" className="h-[26px] w-auto" />
            <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-[#4CBFF2]">
              리포트
            </span>
          </span>
          <h2 className="mt-3.5 text-[34px] font-extrabold leading-[1.05] tracking-[-0.045em] text-[var(--text)]">
            {ko}
          </h2>
          <p className="mx-auto mt-3 max-w-[30ch] text-[14px] font-medium leading-[1.62] text-[var(--text-secondary)]">
            {topEffectLabel ? (
              <>
                <b style={{ color: theme.color }}>‘{topEffectLabel}’ 효과</b>가 좋았다는 후기가 많아요.
              </>
            ) : (
              <>후기 {count}명의 경험을 모았어요.</>
            )}
          </p>

          {/* 재시술의향 */}
          <div className="mt-7">
            <div className={EYEBROW} style={{ color: theme.color }}>재시술의향</div>
            <div
              className="text-[clamp(60px,18vw,84px)] font-extrabold leading-[0.86] tracking-[-0.05em] [font-feature-settings:'tnum']"
              style={{ color: theme.color }}
            >
              {yesPctAnim}
              <span className="text-[0.4em] align-[0.6em]">%</span>
            </div>
            <div
              className="mx-auto mt-5 grid max-w-[300px] grid-cols-9 gap-x-[6px] gap-y-[7px]"
              role="img"
              aria-label={`${count}명 중 ${revisit.yes}명이 재시술의향 있음`}
            >
              {Array.from({ length: showTotal }).map((_, i) => {
                const op = i < yShow ? 1 : i < yShow + mShow ? 0.45 : 0.18;
                return (
                  <span
                    key={i}
                    className="block leading-[0]"
                    style={{
                      color: theme.color,
                      opacity: mounted ? op : 0,
                      transition: `opacity .4s ease ${i * 12}ms`,
                    }}
                  >
                    <svg viewBox="0 0 24 28" className="h-auto w-full" aria-hidden>
                      {FIGURE_PATH}
                    </svg>
                  </span>
                );
              })}
            </div>
            <p className="mt-3.5 text-[12px] text-[var(--text-muted)]">
              있어요 {revisit.yes} · 고민 중 {revisit.maybe} · 없어요 {revisit.no}
            </p>
            <p className="mt-3 text-[14.5px] font-bold text-[var(--text)]">
              후기 {count}명 중 <b style={{ color: theme.color }}>{revisit.yes}명</b>이 다시 받고 싶어 해요
            </p>
          </div>
        </section>

        {/* 만족도 */}
        <section className={SEC}>
          <div className={EYEBROW} style={{ color: theme.color }}>Satisfaction</div>
          <div className={QHEAD}>받아본 분들의 만족도예요.</div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-[42px] font-extrabold leading-none text-[var(--text)] [font-feature-settings:'tnum']">
              {avgSatisfaction.toFixed(1)}
            </span>
            <span className="text-[14px] font-semibold text-[var(--text-secondary)]">/ 5.0</span>
          </div>
          <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
            {satPhrase(avgSatisfaction)} · {count}명 중 {sat45}명이 별 4개 이상을 줬어요(상위 {sat45pct}%).
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {[5, 4, 3, 2, 1].map((s) => {
              const c = satisfactionDist[s - 1] ?? 0;
              const w = Math.round((c / maxSat) * 100);
              return (
                <div key={s} className="flex items-center gap-2.5 text-[12px]">
                  <span className="w-7 shrink-0 text-[var(--text-secondary)]">
                    <span className="text-[var(--accent-save)]">★</span> {s}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                    <span
                      className="block h-full rounded-full bg-[var(--accent-save)] transition-[width] duration-700 ease-out"
                      style={{ width: mounted ? `${w}%` : "0%" }}
                      aria-hidden
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-[var(--text-muted)]">{c}명</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* 통증 · 다운타임 */}
        <section className={SECB}>
          <div className={EYEBROW} style={{ color: theme.color }}>Pain &amp; Recovery</div>
          <div className={QHEAD}>
            얼마나 <span style={{ color: theme.color }}>아프고</span>, 얼마나{" "}
            <span style={{ color: theme.color }}>쉬어야</span> 할까?
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <div className="mb-2 text-[12.5px] font-semibold text-[var(--text-secondary)]">
                통증 <span className="text-[var(--text)]">{avgPain.toFixed(1)}점</span> · {painPhrase(avgPain)}
              </div>
              <div className="relative h-2 rounded-full" style={{ background: painGradient }} aria-hidden>
                <span
                  className="absolute -top-[3px] h-[14px] w-[3px] rounded-[2px] bg-[#64748B] shadow-[0_0_0_2px_#fff]"
                  style={{ left: `calc(${painPos(avgPain)}% - 1.5px)` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[9.5px] text-[var(--text-muted)]" aria-hidden>
                {PAIN_LABELS.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[12.5px] font-semibold text-[var(--text-secondary)]">다운타임</div>
              {downtimeAnswered > 0 ? (
                <DowntimeGauge dist={downtimeDist} answered={downtimeAnswered} days={DOWNTIME_DAYS} />
              ) : (
                <p className="text-[12px] text-[var(--text-muted)]">아직 다운타임 응답이 적어요.</p>
              )}
            </div>
          </div>
        </section>

        {/* 효과 */}
        {topEffects.length > 0 && (
          <section className={SECB}>
            <div className={EYEBROW} style={{ color: theme.color }}>Results</div>
            <div className={QHEAD}>{ko} 받은 분들이 느낀 효과예요.</div>
            <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
              ‘{topEffects[0]?.label}’ 효과를 가장 많이 꼽았어요. %는 그 효과를 봤다는 분의 비율이에요.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {topEffects.map((e, i) => (
                <div key={e.label} className="flex items-center gap-3">
                  <span className="w-[58px] shrink-0 text-[14px] font-bold text-[var(--text)]">{e.label}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                    <span
                      className="block h-full rounded-full transition-[width] duration-700 ease-out"
                      style={{
                        width: mounted ? `${e.pct}%` : "0%",
                        backgroundColor: EFFECT_BAR_COLORS[i % EFFECT_BAR_COLORS.length],
                      }}
                      aria-hidden
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-[14px] font-extrabold text-[var(--text-secondary)] [font-feature-settings:'tnum']">
                    {e.pct}%
                  </span>
                </div>
              ))}
            </div>
            {noEffectCount > 0 && (
              <p className="mt-3 text-[12px] text-[var(--text-muted)]">
                효과를 느끼지 못했다고 답한 분도 {noEffectCount}명({noEffectPct}%) 있었어요.
              </p>
            )}
          </section>
        )}

        {/* 효과시점 */}
        {onsetAnswered > 0 && (
          <section className={SECB}>
            <div className={EYEBROW} style={{ color: theme.color }}>Timeline</div>
            <div className={QHEAD}>{onsetHead}</div>
            <div className="mt-5">
              <EffectOnsetTimeline dist={onsetDist} />
            </div>
          </section>
        )}

        {/* 작성자 통계 */}
        {demographics.total > 0 && (
          <section className={SECB}>
            <div className="mb-1 text-[13px] font-bold text-[var(--text-secondary)]">작성자 통계</div>
            <div className="mt-3 mb-1.5 text-[11px] font-bold text-[var(--text-muted)]">성별</div>
            <div className="flex h-[18px] overflow-hidden rounded-full" aria-hidden>
              {femalePct > 0 && <span style={{ width: `${femalePct}%`, backgroundColor: DEMO_FEMALE }} />}
              {malePct > 0 && <span style={{ width: `${malePct}%`, backgroundColor: DEMO_MALE }} />}
            </div>
            <div className="mt-2 flex gap-4 text-[12px] text-[var(--text-secondary)]">
              <span><i className="mr-1.5 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: DEMO_FEMALE }} />여성 {femalePct}%</span>
              <span><i className="mr-1.5 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: DEMO_MALE }} />남성 {malePct}%</span>
            </div>
            {demographics.ageBands.length > 0 && (
              <>
                <div className="mt-4 mb-1.5 text-[11px] font-bold text-[var(--text-muted)]">연령대</div>
                <div className="flex h-[18px] overflow-hidden rounded-full" aria-hidden>
                  {demographics.ageBands.map((b, i) => {
                    const w = Math.round((b.count / ageTotal) * 100);
                    return w > 0 ? (
                      <span key={b.label} style={{ width: `${w}%`, backgroundColor: AGE_COLORS[i % AGE_COLORS.length] }} />
                    ) : null;
                  })}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--text-secondary)]">
                  {demographics.ageBands.map((b, i) => (
                    <span key={b.label}>
                      <i className="mr-1.5 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: AGE_COLORS[i % AGE_COLORS.length] }} />
                      {b.label} {Math.round((b.count / ageTotal) * 100)}%
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {/* ── ② 직접 들어보기 — 제목은 상자 밖, 각 후기는 독립 글상자 ── */}
      <section ref={reviewsRef} className="mt-4 scroll-mt-2">
        <div className="px-1">
          <div className={EYEBROW} style={{ color: theme.color }}>In their words</div>
          <div className="flex items-baseline gap-2">
            <span className={QHEAD}>직접 들어보기</span>
            <span className="text-[12.5px] font-semibold text-[var(--text-secondary)]">
              경험자의 후기 {reviewTotal}개
            </span>
          </div>
        </div>

        {/* 정렬 칩 — 후기 구간에서만 sticky 고정. 배경은 앱 캔버스와 동일(회색 없음). 활성=브랜드색. */}
        <div
          ref={chipRef}
          className="sticky top-0 z-[41] mt-3 py-2.5"
          style={{ background: "var(--tt-canvas)", backgroundAttachment: "fixed" }}
        >
          <div className="flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SORTS.map((s) => {
              const on = reviewSort === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => changeSort(s.key)}
                  aria-pressed={on}
                  className="shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors"
                  style={on ? { backgroundColor: "#2A9FD6", color: "#fff" } : { backgroundColor: "#fff", color: "var(--text-secondary)" }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {sortedItems.length > 0 ? (
          <div key={reviewSort} className="flex flex-col gap-2.5 px-px" style={{ animation: "rvRise .28s ease both" }}>
            {sortedItems.map((card) => (
              <ReportsNewReviewCard
                key={card.id}
                card={card}
                liked={liked[card.id] ?? false}
                demo={demo[card.id]}
                me={me}
                onLoginRequired={(reason) => setAuthPrompt(reason)}
              />
            ))}
          </div>
        ) : (
          <p className="px-1 py-6 text-[13px] text-[var(--text-muted)]">아직 등록된 후기가 없어요.</p>
        )}

        {(hasMore || expanded) && (
          <div className="mt-2.5 flex gap-2">
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                className="flex flex-1 items-center justify-center gap-1 rounded-[var(--radius)] bg-white py-3.5 text-[13px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-soft)]"
              >
                {loadingMore ? "불러오는 중…" : `후기 ${nextChunk}개 더 보기`}
              </button>
            )}
            {expanded && (
              <button
                type="button"
                onClick={collapseReviews}
                className="flex flex-1 items-center justify-center gap-1 rounded-[var(--radius)] bg-white py-3.5 text-[13px] font-bold text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-soft)]"
              >
                접기
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── ③ 전문의 Q&A(랭킹 한 상자) ── */}
      {doctorQAs.length > 0 && (
        <section className="mt-4 overflow-hidden rounded-[var(--radius-lg)] bg-white px-5 py-6">
          <div className="flex items-baseline gap-2">
            <span className={QHEAD}>전문의 Q&amp;A</span>
            <span className="text-[12.5px] font-semibold text-[var(--text-secondary)]">{ko} 관련 {doctorQAs.length}개</span>
          </div>
          <div className="mt-3.5 flex flex-col">
            {qaVisible.map((card, i) => {
              const rank = i + 1;
              const doctorName = card.doctor?.name ?? "전문의";
              return (
                <Link
                  key={card.id}
                  href={getQaUrl(card)}
                  className="flex items-center gap-3 border-b border-[var(--border)] py-3.5 last:border-b-0"
                >
                  <span
                    className="w-[22px] shrink-0 text-center text-[16px] font-extrabold italic"
                    style={{ color: rankColor(rank) }}
                  >
                    {rank}
                  </span>
                  <span className="flex min-w-0 flex-col gap-[3px]">
                    <span className="truncate text-[14.5px] font-bold text-[var(--text)]">{card.title}</span>
                    <span className="text-[12px] font-semibold text-[var(--text-secondary)]">
                      {doctorName} 원장 · 답변
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
          {!qaExpanded && doctorQAs.length > 5 && (
            <button
              type="button"
              onClick={() => setQaExpanded(true)}
              className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-[var(--radius)] bg-[var(--bg-soft)] py-3.5 text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[#E2E7EC]"
            >
              6~{doctorQAs.length}위 보기
            </button>
          )}
          {topicsExists && (
            <Link
              href={`/?q=${encodeURIComponent(ko)}`}
              style={{ color: "var(--primary-active)" }}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[var(--radius)] bg-[var(--primary-soft)] py-3.5 text-[13.5px] font-bold text-[var(--primary-active)] transition-colors hover:bg-[#E6F2FA]"
            >
              전문의 Q&amp;A 보러가기{ARROW}
            </Link>
          )}
        </section>
      )}

      {/* ── ④ 비슷한 시술 — 각 카테고리 색 상자, 메타는 시술명 옆 ── */}
      {similar.length > 0 && (
        <section className="mt-8">
          <div className="px-1">
            <div className={QHEAD}>‘{topEffectLabel}’ 효과가 좋았던 다른 시술</div>
          </div>
          <div className="mt-3 flex flex-col gap-2.5">
            {similar.map((s, i) => {
              const st = categoryTheme(s.category ?? report.category);
              return (
                <Link
                  key={s.ko}
                  href={`/reports-new/${encodeURIComponent(s.en || s.ko)}`}
                  className="flex items-center gap-3 rounded-[var(--radius-lg)] px-4 py-4 transition-opacity hover:opacity-90"
                  style={{ backgroundColor: st.soft }}
                >
                  <span
                    className="w-[18px] shrink-0 text-center text-[15px] font-extrabold italic"
                    style={{ color: st.color }}
                  >
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[16px] font-bold tracking-[-0.02em] text-[var(--text)]">{s.ko}</span>
                    <span className="text-[13px] text-[var(--text-secondary)]">
                      {topEffectLabel} 효과 {s.effectPct}% · 후기 {s.count}
                    </span>
                  </span>
                  <span className="shrink-0" style={{ color: st.color }} aria-hidden>{ARROW}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── ⑤ 저장 · 공유(브랜드색 라운드 버튼, 너무 넓지 않게 가운데) ── */}
      <div className="mt-7 flex justify-center gap-2.5">
        <button
          type="button"
          onClick={saveReport}
          className="flex items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--primary)] px-7 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[var(--primary-dark)]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          리포트 저장
        </button>
        <button
          type="button"
          onClick={share}
          className="flex items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--primary)] px-7 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[var(--primary-dark)]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />
          </svg>
          공유
        </button>
      </div>

      <p className="mt-4 px-1 text-center text-[11.5px] leading-[1.65] text-[var(--text-muted)]">
        이 리포트는 {experienceCount(count)}을 집계한 결과예요. 개인차가 있으며 의학적 효과·안전성을
        보장하지 않습니다. 특정 병원·의료진의 효과 주장이 아니며, 시술 결정은 전문의 상담 후에 하세요.
      </p>

      <style>{`@keyframes rvRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      <LoginPromptDialog
        open={!!authPrompt}
        message={authPrompt ?? ""}
        onClose={() => setAuthPrompt(null)}
      />
    </AppShell>
  );
}
