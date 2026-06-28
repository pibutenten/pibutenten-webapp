"use client";

/**
 * ReportsNewDetailView — /reports-new/[시술] 전체 리포트 (목업 풀 에디토리얼 독립 구현).
 *
 * 목업(전달용/thermage-report.html) 섹션을 실데이터로 재현:
 *   히어로(큰 % + 사람 그리드) → 만족도(히스토그램) → 통증·다운타임 → 효과(다색 막대) →
 *   효과시점(타임라인) → 작성자(성별·연령) → 후기(전체 열람) → 탐색(전문의 Q&A) → 공유.
 *
 * 공용 ProcedureReportView/ProcedureReportCard 비의존(자체 구현). 데이터 함수만 재사용.
 * 안정 차트 컴포넌트(DowntimeGauge·EffectOnsetTimeline·ReportReviewItem)는 import 재사용.
 * flat — 음영·테두리 없음(흰 섹션 블록 + 회색 8px 갭으로 구분). 톤=globals 토큰 + categoryTheme.
 */

import { useState } from "react";
import Link from "next/link";
import type { ProcedureReport } from "@/lib/procedure-report";
import type { CardData } from "@/components/Card";
import type { EngagementMe } from "@/components/card/hooks/useCardEngagement";
import { categoryTheme } from "@/lib/procedure-theme";
import { experienceCount } from "@/lib/report-copy";
import { DOWNTIME_DAYS, EFFECT_ONSET_OPTIONS } from "@/lib/review-options";
import { useSession } from "@/lib/session-context";
import { showToast } from "@/lib/toast";
import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";
import DowntimeGauge from "@/components/report/DowntimeGauge";
import EffectOnsetTimeline from "@/components/report/EffectOnsetTimeline";
import ReportReviewItem from "@/components/report/ReportReviewItem";
import LoginPromptDialog from "@/components/LoginPromptDialog";

const EFFECT_BAR_COLORS = [
  "#7FD0F8", "#B0A0DE", "#9AA6DE", "#FFCB8C", "#8FD4C8",
  "#F59CB6", "#A6D9A9", "#F4B8A0", "#C3B0E8", "#CDC97A",
];
const AGE_COLORS = ["#A8C2E6", "#9AA6DE", "#C3B0E8", "#F2A9C0", "#FFCB8C"];
const DEMO_FEMALE = "#F59CB6";
const DEMO_MALE = "#7FD0F8";

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

const FIGURE_PATH = (
  <>
    <circle cx="12" cy="7.5" r="4.6" fill="currentColor" />
    <path d="M3.4 27c0-4.8 3.8-8.4 8.6-8.4s8.6 3.6 8.6 8.4Z" fill="currentColor" />
  </>
);

const SECTION = "bg-white px-5 py-6";
const EYEBROW = "mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em]";
const QHEAD = "text-[19px] font-extrabold leading-[1.3] tracking-[-0.02em] text-[var(--text)]";

export default function ReportsNewDetailView({
  ko,
  en,
  report,
  reviews,
  reviewLiked,
  reviewTotal,
  topicsExists,
}: {
  ko: string;
  en: string;
  report: ProcedureReport;
  reviews: CardData[];
  reviewLiked: Record<number, boolean>;
  reviewTotal: number;
  topicsExists: boolean;
}) {
  const search = useSearchRouting();
  const session = useSession();
  const me: EngagementMe =
    session === null ? null : { id: session.activeIdentityId, role: session.role };
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);

  const theme = categoryTheme(report.category);
  const {
    count, avgSatisfaction, satisfactionDist, avgPain, revisit, effects,
    noEffectCount, downtimeAnswered, downtimeDist, onsetAnswered, onsetDist,
    demographics,
  } = report;

  const rTotal = Math.max(1, revisit.yes + revisit.maybe + revisit.no);
  const yesPct = Math.round((revisit.yes / rTotal) * 100);

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

  // ── 후기 더 보기(클라 페이징) ──
  const [items, setItems] = useState<CardData[]>(reviews);
  const [liked, setLiked] = useState<Record<number, boolean>>(reviewLiked);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = items.length < reviewTotal;
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
      };
      setItems((prev) => [...prev, ...data.reviews]);
      setLiked((prev) => ({ ...prev, ...data.reviewLiked }));
    } catch {
      /* 무시 — 재시도 가능 */
    } finally {
      setLoadingMore(false);
    }
  }

  function share() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
    showToast("링크가 복사됐어요.");
  }

  return (
    <AppShell
      active="리포트"
      back="/reports-new"
      backTitle={
        <h1>
          {ko} 후기 리포트 <b>{count}</b>건
        </h1>
      }
      {...search}
    >
      <div className="flex flex-col gap-2 overflow-hidden rounded-[var(--radius-lg)]">
        {/* ── 히어로 ── */}
        <section className="px-5 pb-7 pt-6 text-center" style={{ backgroundColor: theme.soft }}>
          <div className={EYEBROW} style={{ color: theme.color }}>
            다시 받고 싶은 마음
          </div>
          <div
            className="text-[clamp(64px,18vw,84px)] font-extrabold leading-[0.86] tracking-[-0.04em] [font-feature-settings:'tnum']"
            style={{ color: theme.color }}
          >
            {yesPct}
            <span className="text-[0.45em] align-[0.2em]">%</span>
          </div>
          <div
            className="mx-auto mt-5 grid max-w-[300px] grid-cols-9 gap-x-[6px] gap-y-[7px]"
            role="img"
            aria-label={`${count}명 중 ${revisit.yes}명이 재시술 의향 있음`}
          >
            {Array.from({ length: showTotal }).map((_, i) => {
              const op = i < yShow ? 1 : i < yShow + mShow ? 0.45 : 0.18;
              return (
                <span key={i} className="block leading-[0]" style={{ color: theme.color, opacity: op }}>
                  <svg viewBox="0 0 24 28" className="h-auto w-full" aria-hidden>
                    {FIGURE_PATH}
                  </svg>
                </span>
              );
            })}
          </div>
          <p className="mt-3 text-[11.5px] text-[var(--text-secondary)]">
            ● 다시 받을래요 {revisit.yes}명 · ◐ 고민 중 {revisit.maybe}명 · 아니요 {revisit.no}명
          </p>
          <p className="mt-3.5 text-[15.5px] font-bold text-[var(--text)]">
            {count}명 중 <b style={{ color: theme.color }}>{revisit.yes}명</b>이 “다시 받겠다”고 답했어요.
          </p>
        </section>

        {/* ── 만족도 ── */}
        <section className={SECTION}>
          <div className={EYEBROW} style={{ color: theme.color }}>Satisfaction</div>
          <div className={QHEAD}>
            그래서, <span style={{ color: theme.color }}>할 만했을까?</span>
          </div>
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
                      className="block h-full rounded-full bg-[var(--accent-save)]"
                      style={{ width: `${w}%` }}
                      aria-hidden
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-[var(--text-muted)]">{c}명</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 통증 · 다운타임 ── */}
        <section className={SECTION}>
          <div className={EYEBROW} style={{ color: theme.color }}>Pain &amp; Recovery</div>
          <div className={QHEAD}>
            얼마나 <span style={{ color: theme.color }}>아프고</span>, 얼마나{" "}
            <span style={{ color: theme.color }}>쉬어야</span> 할까?
          </div>
          <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* 통증 */}
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
              <div className="relative mt-1.5 h-[12px] text-[9.5px] text-[var(--text-muted)]" aria-hidden>
                {PAIN_LABELS.map((l, i) => (
                  <span key={l} className="absolute -translate-x-1/2" style={{ left: `${painPos(i + 1)}%` }}>
                    {l}
                  </span>
                ))}
              </div>
            </div>
            {/* 다운타임 — 안정 컴포넌트 재사용 */}
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

        {/* ── 효과 ── */}
        {topEffects.length > 0 && (
          <section className={SECTION}>
            <div className={EYEBROW} style={{ color: theme.color }}>Results</div>
            <div className={QHEAD}>
              무엇이 <span style={{ color: theme.color }}>달라졌을까?</span>
            </div>
            <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
              ‘{topEffects[0]?.label}’ 효과를 가장 많이 꼽았어요. %는 그 효과를 봤다는 분의 비율이에요.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {topEffects.map((e, i) => (
                <div key={e.label} className="flex items-center gap-3">
                  <span className="w-[58px] shrink-0 text-[14px] font-bold text-[var(--text)]">{e.label}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${e.pct}%`, backgroundColor: EFFECT_BAR_COLORS[i % EFFECT_BAR_COLORS.length] }}
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
                효과를 느끼지 못했다고 답한 분도 {noEffectCount}명 있었어요.
              </p>
            )}
          </section>
        )}

        {/* ── 효과시점 ── */}
        {onsetAnswered > 0 && (
          <section className={SECTION}>
            <div className={EYEBROW} style={{ color: theme.color }}>Timeline</div>
            <div className={QHEAD}>
              효과는 <span style={{ color: theme.color }}>언제부터?</span>
            </div>
            <p className="mt-2 text-[13px] text-[var(--text-secondary)]">{onsetHead}</p>
            <div className="mt-5">
              <EffectOnsetTimeline dist={onsetDist} />
            </div>
          </section>
        )}

        {/* ── 작성자 ── */}
        {demographics.total > 0 && (
          <section className={SECTION}>
            <div className={EYEBROW} style={{ color: theme.color }}>Who tried it</div>
            <div className={QHEAD}>
              누가 <span style={{ color: theme.color }}>받았을까?</span>
            </div>
            <p className="mt-2 text-[13.5px] text-[var(--text)]">
              작성자는 대부분 <b style={{ color: theme.color }}>여성({femalePct}%)</b>이었어요.
            </p>
            {/* 성별 */}
            <div className="mt-4 flex h-[18px] overflow-hidden rounded-full" aria-hidden>
              {femalePct > 0 && <span style={{ width: `${femalePct}%`, backgroundColor: DEMO_FEMALE }} />}
              {malePct > 0 && <span style={{ width: `${malePct}%`, backgroundColor: DEMO_MALE }} />}
            </div>
            <div className="mt-2 flex gap-4 text-[12px] text-[var(--text-secondary)]">
              <span><i className="mr-1.5 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: DEMO_FEMALE }} />여성 {femalePct}%</span>
              <span><i className="mr-1.5 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: DEMO_MALE }} />남성 {malePct}%</span>
            </div>
            {/* 연령 */}
            {demographics.ageBands.length > 0 && (
              <>
                <div className="mt-4 flex h-[18px] overflow-hidden rounded-full" aria-hidden>
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

        {/* ── 후기(전체 열람) ── */}
        <section className={SECTION}>
          <div className={EYEBROW} style={{ color: theme.color }}>In their words</div>
          <div className={QHEAD}>
            직접 <span style={{ color: theme.color }}>들어보기</span>
          </div>
          <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
            집계 숫자보다 솔직한, 직접 쓴 후기 {reviewTotal}개예요.
          </p>
          {items.length > 0 ? (
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {items.map((card) => (
                <ReportReviewItem
                  key={card.id}
                  card={card}
                  liked={liked[card.id] ?? false}
                  me={me}
                  onLoginRequired={(reason) => setAuthPrompt(reason)}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[13px] text-[var(--text-muted)]">아직 등록된 후기가 없어요.</p>
          )}
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              className="mt-4 flex w-full items-center justify-center gap-1 rounded-[var(--radius)] bg-[var(--bg-soft)] py-3 text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[#E2E7EC]"
            >
              {loadingMore ? "불러오는 중…" : `후기 더 보기 (${items.length}/${reviewTotal})`}
            </button>
          )}
        </section>

        {/* ── 탐색 ── */}
        <section className={SECTION}>
          <div className={EYEBROW} style={{ color: theme.color }}>Keep exploring</div>
          <div className={QHEAD}>이어서 보기</div>
          <div className="mt-4 flex flex-col gap-2">
            {topicsExists && (
              <Link
                href={`/topics/${encodeURIComponent(ko)}`}
                className="flex items-center justify-between gap-3 rounded-[var(--radius)] bg-[var(--bg)] px-4 py-3.5 transition-colors hover:bg-[var(--bg-soft)]"
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold text-[var(--text)]">전문의에게 직접 묻기</span>
                  <span className="block text-[12.5px] text-[var(--text-secondary)]">{ko} 관련 전문의 Q&amp;A 보기</span>
                </span>
                <span aria-hidden className="shrink-0 text-[var(--text-muted)]">→</span>
              </Link>
            )}
            <Link
              href="/reports-new"
              className="flex items-center justify-between gap-3 rounded-[var(--radius)] bg-[var(--bg)] px-4 py-3.5 transition-colors hover:bg-[var(--bg-soft)]"
            >
              <span className="min-w-0">
                <span className="block text-[14px] font-bold text-[var(--text)]">다른 시술 리포트 보기</span>
                <span className="block text-[12.5px] text-[var(--text-secondary)]">시술별 실사용 후기 모아보기</span>
              </span>
              <span aria-hidden className="shrink-0 text-[var(--text-muted)]">→</span>
            </Link>
          </div>
        </section>
      </div>

      {/* ── 공유 ── */}
      <div className="mt-2.5 flex gap-2.5">
        <button
          type="button"
          onClick={share}
          className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--primary-active)] py-3.5 text-[14px] font-bold text-white transition-colors hover:bg-[var(--primary-dark)]"
        >
          이 리포트 공유하기
        </button>
      </div>

      <p className="mt-4 px-1 text-center text-[11.5px] leading-[1.65] text-[var(--text-muted)]">
        이 리포트는 {experienceCount(count)}을 집계한 결과예요. 개인차가 있으며 의학적 효과·안전성을
        보장하지 않습니다. 특정 병원·의료진의 효과 주장이 아니며, 시술 결정은 전문의 상담 후에 하세요.
      </p>

      <LoginPromptDialog
        open={!!authPrompt}
        message={authPrompt ?? ""}
        onClose={() => setAuthPrompt(null)}
      />
    </AppShell>
  );
}
