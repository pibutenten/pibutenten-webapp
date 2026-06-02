"use client";

/**
 * ProcedureReportCard — 시술별 후기 집계 + 개별 후기를 담은 **단일 카드**(접힘 내장).
 *
 * 태그 검색 최상단/피드에 한 장의 카드로 삽입되도록 전체가 하나의 <article>.
 *   - 접힘(기본): 헤더 + 재시술 의향 + 만족도 까지만.
 *   - 펼침: 통증 · 많이 본 효과 · 작성자 통계 · 면책 · 개별 후기(컴팩트) 까지.
 * 강조: 재시술 의향(상단, 만족도보다 살짝만) → 만족도. 후기는 좋아요/댓글/공유 없는 미니멀 목록.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProcedureReport } from "@/lib/procedure-report";
import type { CardData } from "@/components/Card";
import type { ReviewSummaryData } from "@/lib/types/card";
import { getQaUrl } from "@/lib/card-url";

const PAIN_LABELS = ["없음", "조금", "보통", "꽤", "심함"];
const PAIN_SOFT = ["#BAE6FD", "#FDE68A", "#FDBA74", "#FCA5A5", "#F08A8A"];
const EFFECT_BAR_COLORS = [
  "#7FD0F8", "#B0A0DE", "#9AA6DE", "#FFCB8C", "#8FD4C8",
  "#F59CB6", "#A6D9A9", "#F4B8A0", "#C3B0E8", "#CDC97A",
];

const SECTION = "border-b border-[var(--border)] px-5 py-4";
const TITLE = "mb-2.5 text-[14px] font-bold text-[var(--text)]";

// 통계 수치를 편안한 자연어로 — 값에 따라 멘트가 달라진다.
function revisitPhrase(pct: number): string {
  if (pct >= 70) return `경험하신 분들의 ${pct}%가 다시 받고 싶어 해요.`;
  if (pct >= 40) return `${pct}%가 다시 받을 의향이 있어요. 호불호가 갈리는 편이에요.`;
  return `다시 받겠다는 분은 ${pct}%예요. 신중히 고민해 보세요.`;
}
function satisfactionPhrase(avg: number): string {
  const x = avg.toFixed(1);
  if (avg >= 4.5) return `별점 ${x}점! 다들 결과에 크게 만족하셨어요.`;
  if (avg >= 4.0) return `별점 ${x}점, 대체로 만족하는 분위기예요.`;
  if (avg >= 3.0) return `별점 ${x}점, 기대와 결과가 갈리는 편이에요.`;
  return `별점 ${x}점으로 아쉬웠다는 의견이 많아요.`;
}
function painPhrase(avg: number): string {
  const x = avg.toFixed(1);
  if (avg <= 1.5) return `평균 ${x}점, 거의 안 아팠다는 후기가 많아요.`;
  if (avg <= 2.5) return `평균 ${x}점, 가볍게 느껴지는 정도예요.`;
  if (avg <= 3.5) return `평균 ${x}점, 참을 만하지만 살짝 뻐근해요.`;
  if (avg <= 4.5) return `평균 ${x}점의 통증, 참을 만하지만 꽤 뻐근해요.`;
  return `평균 ${x}점, 통증이 꽤 강한 편이에요.`;
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
function reviewOf(card: CardData): ReviewSummaryData | null {
  const pr = card.procedure_review;
  const r = Array.isArray(pr) ? pr[0] : pr;
  return r ?? null;
}

export default function ProcedureReportCard({
  report,
  reviews = [],
  accent = "var(--primary)",
}: {
  report: ProcedureReport;
  reviews?: CardData[];
  accent?: string;
}) {
  const {
    procedureKo, count, avgSatisfaction, satisfactionDist,
    avgPain, revisit, effects, demographics,
  } = report;

  // 펼침 상태 유지 — 후기 클릭→단독글→뒤로 돌아와도 펼친 상태 복원(sessionStorage).
  const storageKey = `report-expanded:${procedureKo}`;
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(storageKey) === "1") setExpanded(true);
    } catch {
      /* noop */
    }
  }, [storageKey]);
  function toggleExpanded() {
    setExpanded((v) => {
      const next = !v;
      try {
        sessionStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* noop */
      }
      return next;
    });
  }

  const satRounded = Math.round(avgSatisfaction);
  const maxSat = Math.max(1, ...satisfactionDist);
  const painPct = Math.min(100, Math.max(0, (avgPain / 5) * 100));
  const rTotal = Math.max(1, revisit.yes + revisit.maybe + revisit.no);
  const yesPct = Math.round((revisit.yes / rTotal) * 100);
  const maybePct = Math.round((revisit.maybe / rTotal) * 100);
  const noPct = Math.max(0, 100 - yesPct - maybePct);
  const topEffects = effects.slice(0, 6);
  const demoTotal = Math.max(1, demographics.male + demographics.female);
  const femalePct = Math.round((demographics.female / demoTotal) * 100);
  const malePct = Math.max(0, 100 - femalePct);
  const ageTotal = Math.max(1, demographics.ageBands.reduce((a, b) => a + b.count, 0));

  return (
    <article className="overflow-hidden rounded-[16px] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
      {/* 헤더 — 브랜드 워드마크+리포트(위), 시술명(좌)+후기 수(우) */}
      <header className="border-b border-[var(--border)] bg-gradient-to-br from-[#EAF7FE] to-[#F7FCFF] px-5 py-4">
        <div className="mb-2 flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-logo.svg" alt="피부텐텐" className="h-[18px] w-auto" />
          <span className="text-[15px] font-bold leading-none" style={{ color: "#2BA3DC" }}>
            리포트
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em]" style={{ color: accent }}>
            {procedureKo}
          </h1>
          <span className="shrink-0 text-[13px] text-[var(--text-secondary)]">
            회원 후기 <b className="text-[var(--text)]">{count}건</b>
          </span>
        </div>
      </header>

      {/* 재시술 의향 — 상단, 만족도보다 살짝만 강조 */}
      <section className={SECTION}>
        <p className="mb-2.5 text-[13px] font-medium leading-[1.5] text-[var(--text)]">
          {revisitPhrase(yesPct)}
        </p>
        <div className="flex h-[20px] overflow-hidden rounded-lg text-[11px] font-bold text-white">
          {yesPct > 0 && <div className="flex items-center justify-center" style={{ width: `${yesPct}%`, backgroundColor: "#4CBFF2" }}>{yesPct >= 14 ? "있어요" : ""}</div>}
          {maybePct > 0 && <div className="flex items-center justify-center" style={{ width: `${maybePct}%`, backgroundColor: "#9AA1AC" }}>{maybePct >= 14 ? "고민" : ""}</div>}
          {noPct > 0 && <div className="flex items-center justify-center" style={{ width: `${noPct}%`, backgroundColor: "#EA7E7B" }}>{noPct >= 14 ? "없어요" : ""}</div>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-[var(--text-secondary)]">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#4CBFF2" }} />있어요 {revisit.yes}명</span>
          {revisit.maybe > 0 && <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#9AA1AC" }} />고민 중 {revisit.maybe}명</span>}
          <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#EA7E7B" }} />없어요 {revisit.no}명</span>
        </div>
      </section>

      {/* 만족도 — 접힘 시 여기까지 노출 */}
      <section className={expanded ? SECTION : "px-5 py-4"}>
        <p className="mb-2.5 text-[13px] font-medium leading-[1.5] text-[var(--text)]">
          {satisfactionPhrase(avgSatisfaction)}
        </p>
        <div className="flex items-center gap-4">
          {/* 별 아래에 점수(크게) */}
          <div className="flex shrink-0 flex-col items-center gap-1">
            <span className="text-[16px] leading-none tracking-[1px]">
              {[1, 2, 3, 4, 5].map((nn) => (
                <span key={nn} style={{ color: nn <= satRounded ? "var(--accent-save)" : "#DDE2E7" }}>★</span>
              ))}
            </span>
            <span className="text-[22px] font-extrabold leading-none text-[var(--text)]">{avgSatisfaction.toFixed(1)}</span>
          </div>
          <div className="flex flex-1 flex-col gap-[3px]">
            {[5, 4, 3, 2, 1].map((score) => {
              const c = satisfactionDist[score - 1] ?? 0;
              return (
                <div key={score} className="flex items-center gap-2 text-[10.5px] text-[var(--text-muted)]">
                  <span className="w-5 text-right">{score}</span>
                  <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-[#EEF1F4]">
                    <span className="block h-full rounded-full bg-[var(--accent-save)]" style={{ width: `${(c / maxSat) * 100}%` }} />
                  </span>
                  <span className="w-4 text-right">{c}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 펼침 영역 ── */}
      {expanded && (
        <>
          {/* 통증 */}
          <section className={SECTION}>
            <p className="mb-2.5 text-[13px] font-medium leading-[1.5] text-[var(--text)]">
              {painPhrase(avgPain)}
            </p>
            <div className="relative h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${PAIN_SOFT.join(", ")})` }}>
              <span className="absolute -top-[3px] h-[14px] w-[3px] rounded-[2px] bg-[#64748B] shadow-[0_0_0_2px_#fff]" style={{ left: `calc(${painPct}% - 1.5px)` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[9.5px] text-[var(--text-muted)]">
              {PAIN_LABELS.map((l) => <span key={l}>{l}</span>)}
            </div>
          </section>

          {/* 많이 본 효과 */}
          {topEffects.length > 0 && (
            <section className={SECTION}>
              <div className={TITLE}>이런 효과를 받았어요!</div>
              <div className="flex flex-col gap-2.5">
                {topEffects.map((e, i) => (
                  <div key={e.label} className="flex items-center gap-2.5">
                    <span className="w-[52px] text-[12.5px] font-semibold text-[var(--text)]">{e.label}</span>
                    <span className="h-[10px] flex-1 overflow-hidden rounded-full bg-[#EEF1F4]">
                      <span className="block h-full rounded-full" style={{ width: `${e.pct}%`, backgroundColor: EFFECT_BAR_COLORS[i % EFFECT_BAR_COLORS.length] }} />
                    </span>
                    <span className="w-10 text-right text-[12.5px] font-bold text-[var(--text-secondary)]">{e.pct}%</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 작성자 통계 — 약간의 차트(성별 막대 + 연령대 미니 바) */}
          {demoTotal > 0 && (
            <section className={SECTION}>
              <div className="mb-2.5 text-[13px] font-semibold text-[var(--text-secondary)]">작성자 통계</div>

              {/* 성별 — 가로 막대 */}
              <div className="flex h-[14px] overflow-hidden rounded-full text-[9.5px] font-bold text-white">
                {femalePct > 0 && (
                  <div className="flex items-center justify-center" style={{ width: `${femalePct}%`, backgroundColor: "#F59CB6" }}>
                    {femalePct >= 22 ? `여성 ${femalePct}%` : ""}
                  </div>
                )}
                {malePct > 0 && (
                  <div className="flex items-center justify-center" style={{ width: `${malePct}%`, backgroundColor: "#7FD0F8" }}>
                    {malePct >= 22 ? `남성 ${malePct}%` : ""}
                  </div>
                )}
              </div>
              <div className="mt-1.5 flex gap-3.5 text-[11px] text-[var(--text-secondary)]">
                <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#F59CB6" }} />여성 {femalePct}%</span>
                <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#7FD0F8" }} />남성 {malePct}%</span>
              </div>

              {/* 연령대 — 미니 바 */}
              {demographics.ageBands.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {demographics.ageBands.map((b) => {
                    const pct = Math.round((b.count / ageTotal) * 100);
                    return (
                      <div key={b.label} className="flex items-center gap-2 text-[11px]">
                        <span className="w-9 text-[var(--text-secondary)]">{b.label}</span>
                        <span className="h-[8px] flex-1 overflow-hidden rounded-full bg-[#EEF1F4]">
                          <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "#9AA6DE" }} />
                        </span>
                        <span className="w-9 text-right font-semibold text-[var(--text-secondary)]">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* 면책 */}
          <div className="bg-[var(--bg-soft)] px-5 py-3 text-[10.5px] leading-[1.5] text-[var(--text-muted)]">
            이 리포트는 회원 후기 {count}건을 집계한 결과입니다. 개인차가 있으며 의학적
            효과·안전성을 보장하지 않습니다. 시술 결정은 전문의 상담 후 하시기 바랍니다.
          </div>

          {/* 개별 후기 — 미니멀 목록 (좋아요/댓글/공유 없음) */}
          {reviews.length > 0 && (
            <section className="px-5 py-4">
              <div className={TITLE}>후기 {reviews.length}개</div>
              <ul className="divide-y divide-[var(--border)]">
                {reviews.map((card) => {
                  const author = Array.isArray(card.author) ? card.author[0] : card.author;
                  const name = author?.display_name || author?.handle || "익명";
                  const review = reviewOf(card);
                  const body = (card.body ?? "").trim();
                  return (
                    <li key={card.id} className="py-3 first:pt-0">
                      <Link href={getQaUrl(card)} className="block">
                        <div className="mb-1 flex items-center justify-between text-[11.5px] text-[var(--text-muted)]">
                          {/* 닉네임 옆에 만족도 별표 (요약 줄 생략 — 한 줄 절약) */}
                          <span className="flex items-center gap-1.5">
                            <span className="font-semibold text-[var(--text-secondary)]">{name}</span>
                            {review && (
                              <span
                                className="text-[11px] leading-none tracking-[0.5px]"
                                aria-label={`만족도 ${review.satisfaction}점`}
                              >
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <span
                                    key={s}
                                    aria-hidden
                                    style={{ color: s <= (review.satisfaction || 0) ? "var(--accent-save)" : "#DDE2E7" }}
                                  >
                                    ★
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                          <span>{fmtDate(card.created_at)}</span>
                        </div>
                        {body && (
                          <p className="line-clamp-2 whitespace-pre-wrap text-[13px] leading-[1.55] text-[var(--text)]">
                            {body}
                          </p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {/* 펼치기/접기 토글 */}
      <button
        type="button"
        onClick={toggleExpanded}
        className="flex w-full cursor-pointer items-center justify-center gap-1 border-t border-[var(--border)] bg-white py-3 text-[13px] font-semibold text-[var(--primary-dark)] transition-colors hover:bg-[var(--bg-soft)]"
        aria-expanded={expanded}
      >
        {expanded ? "접기" : "리포트 자세히 보기"}
        <span aria-hidden style={{ transform: expanded ? "rotate(180deg)" : "none" }}>▾</span>
      </button>
    </article>
  );
}
