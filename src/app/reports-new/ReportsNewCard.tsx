"use client";

/**
 * ReportsNewCard — /reports-new 시술 리포트 인덱스 전용 에디토리얼 요약 카드.
 *
 * 목업(전달용/report-pibutenten-skin.html)의 카드 감성을 살린 3단 구조:
 *   ① 요약(접힘)  — 카테고리 틴트 헤더 + 시술명 + 큰 % 히어로("다시 받고 싶어요") +
 *                   통증·만족도 미니 + 회전 헤드라인 한 줄.
 *   ② 펼침(1차 집계) — 만족도(별점+점수+한 줄 평) · 통증(그라데이션 게이지+마커+자연어) ·
 *                     대표 효과 다색 막대 top3(0→값 부드러운 채움) · 효과 발현 시점.
 *                     효과·시점은 서버에서 prop 으로 미리 받아 **즉시 표시**(끊김 없음, fetch 없음).
 *   ③ 전체 리포트 보기 → 단독 URL `/reports/{시술}`(모든 후기 열람).
 *
 * flat — 음영/테두리 없음(우리 UI/UX). 공용 ProcedureReportCard 비의존(자체 구현).
 * 격리: app.module.css 미사용 — Tailwind + globals.css 토큰 + categoryTheme(인라인).
 * 접근성: 시술명 h2, 토글 aria-expanded, 막대/게이지 aria-hidden + 텍스트 병기, 흰글씨는 #1B87C9+ 에서만.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProcedureReport } from "@/lib/procedure-report";
import { categoryTheme } from "@/lib/procedure-theme";
import { CATEGORIES } from "@/lib/categories";
import { experienceCount } from "@/lib/report-copy";

const FOCUS_RING =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-active)]";

// 효과 막대 다색 팔레트 — 운영 ProcedureReportCard 와 동일(단조 단색 대신 항목별 색).
const EFFECT_BAR_COLORS = [
  "#7FD0F8", "#B0A0DE", "#9AA6DE", "#FFCB8C", "#8FD4C8",
  "#F59CB6", "#A6D9A9", "#F4B8A0", "#C3B0E8", "#CDC97A",
];

// 통증 — 없음→심함 그라데이션(목업/운영 동일). 라벨 위치 없음 6.25% … 심함 93.75%.
const PAIN_LABELS = ["없음", "조금", "보통", "꽤", "심함"];
const PAIN_SOFT = ["#7FD0F8", "#FDE68A", "#FDBA74", "#FCA5A5", "#F08A8A"];
function painPos(v: number): number {
  const x = Math.min(5, Math.max(1, v));
  return 6.25 + ((x - 1) / 4) * 87.5;
}

type TopEffect = { label: string; pct: number };

/** 만족도 한 줄 평(후기 voice, 4.x는 '낮다' 금지). */
function satPhrase(a: number): string {
  if (a >= 4.5) return "다들 결과에 크게 만족했어요";
  if (a >= 4.0) return "대체로 만족하는 분위기예요";
  if (a >= 3.5) return "만족과 아쉬움이 갈렸어요";
  return "호불호가 갈리는 편이에요";
}
/** 통증 한 줄 평(절대값·후기 voice). */
function painPhrase(a: number): string {
  if (a < 2.0) return "거의 안 아팠다는 분이 많아요";
  if (a < 3.0) return "살짝 따끔한 정도였대요";
  if (a < 3.6) return "참을 만했다는 평이 많아요";
  if (a < 4.4) return "센 편이었다는 분이 많아요";
  return "꽤 아팠다는 분이 많아요";
}

export default function ReportsNewCard({
  report,
  headline,
  effects,
  onsetLabel,
}: {
  report: ProcedureReport;
  /** 서버 확정 회전 헤드라인 1줄(SSR/CSR 일치). */
  headline: string;
  /** 서버 선집계 대표 효과 top3(즉시 표시). */
  effects: TopEffect[];
  /** 효과 발현 최다 시점 라벨. */
  onsetLabel: string | null;
}) {
  const { procedureKo, category, count, avgSatisfaction, revisit, avgPain } =
    report;

  const theme = categoryTheme(category);
  const catLabel = CATEGORIES.find((c) => c.slug === category)?.label ?? null;

  const rTotal = Math.max(1, revisit.yes + revisit.maybe + revisit.no);
  const yesPct = Math.round((revisit.yes / rTotal) * 100);
  const satRounded = Math.round(avgSatisfaction);
  const painOn = Math.round(avgPain);
  const hasPain = avgPain > 0;
  const painGradient = `linear-gradient(90deg, ${PAIN_SOFT[0]} 0%, ${PAIN_SOFT.map(
    (c, i) => `${c} ${painPos(i + 1)}%`,
  ).join(", ")}, ${PAIN_SOFT[PAIN_SOFT.length - 1]} 100%)`;

  const top3 = effects.slice(0, 3);
  // staging 전체 보고서(목업 풀 에디토리얼)로 연결 — 승격 시 /reports/{시술}로 교체.
  const reportHref = `/reports-new/${encodeURIComponent(procedureKo)}`;

  // 펼침 + 막대 0→값 부드러운 채움(펼친 직후 한 박자 뒤 revealed=true).
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!open) {
      setRevealed(false);
      return;
    }
    const id = setTimeout(() => setRevealed(true), 60);
    return () => clearTimeout(id);
  }, [open]);

  return (
    <article
      className="overflow-hidden rounded-[var(--radius-lg)] bg-white"
      aria-label={`${procedureKo} 시술 리포트`}
    >
      {/* ── ① 요약(접힘) ── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={"relative block w-full text-left " + FOCUS_RING}
      >
        <div className="px-5 pt-4 pb-3.5" style={{ backgroundColor: theme.soft }}>
          <div className="mb-2 flex items-center gap-2 pr-6">
            <h2
              className="text-[17px] font-extrabold tracking-[-0.02em]"
              style={{ color: theme.color }}
            >
              {procedureKo}
            </h2>
            {catLabel && (
              <span
                className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold"
                style={{ color: theme.color, backgroundColor: "rgba(255,255,255,0.7)" }}
              >
                {catLabel}
              </span>
            )}
            <span className="ml-auto shrink-0 text-[11.5px] text-[var(--text-secondary)]">
              {experienceCount(count)}
            </span>
          </div>

          <div className="flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-0.5" style={{ color: theme.color }}>
                <span className="text-[44px] font-extrabold leading-[0.82] tracking-[-0.03em] [font-feature-settings:'tnum']">
                  {yesPct}
                </span>
                <span className="text-[20px] font-bold">%</span>
              </div>
              <div className="mt-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">
                다시 받고 싶어요
              </div>
              <div className="mt-2 h-[5px] max-w-[180px] overflow-hidden rounded-full bg-white/70">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${yesPct}%`, backgroundColor: theme.color }}
                  aria-hidden
                />
              </div>
            </div>
            <div className="flex shrink-0 gap-5 pb-0.5">
              <div className="text-center">
                <span className="mb-1.5 block text-[10.5px] font-semibold text-[var(--text-muted)]">
                  통증
                </span>
                <span className="flex justify-center gap-[3px]" aria-hidden>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <i
                      key={i}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: i < painOn ? theme.color : "#E2E7EC" }}
                    />
                  ))}
                </span>
              </div>
              <div className="text-center">
                <span className="mb-1.5 block text-[10.5px] font-semibold text-[var(--text-muted)]">
                  만족도
                </span>
                <span className="inline-flex items-baseline gap-0.5">
                  <span className="text-[12px] leading-none text-[var(--accent-save)]" aria-hidden>
                    ★
                  </span>
                  <span className="text-[20px] font-extrabold leading-none text-[var(--text)] [font-feature-settings:'tnum']">
                    {avgSatisfaction.toFixed(1)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {headline && (
            <p className="mt-3.5 truncate text-[13px] text-[var(--text-secondary)]">
              {headline}
            </p>
          )}
        </div>

        <span
          aria-hidden
          className="absolute right-4 top-4 text-[12px] text-[var(--text-muted)] transition-transform duration-300"
          style={{ transform: open ? "rotate(180deg)" : undefined, color: open ? theme.color : undefined }}
        >
          ▾
        </span>
      </button>

      {/* ── ② 펼침(1차 집계) — grid-rows 0fr↔1fr ── */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-5 pb-5 pt-1.5">
            {/* 만족도 — 별점 + 큰 점수 + 한 줄 평 */}
            <div className="flex items-center gap-3">
              <span className="text-[15px] leading-none tracking-[1px]" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    style={{ color: n <= satRounded ? "var(--accent-save)" : "#E2E7EC" }}
                  >
                    ★
                  </span>
                ))}
              </span>
              <span className="text-[22px] font-extrabold leading-none text-[var(--text)] [font-feature-settings:'tnum']">
                {avgSatisfaction.toFixed(1)}
              </span>
              <span className="text-[12.5px] text-[var(--text-secondary)]">
                {satPhrase(avgSatisfaction)}
              </span>
            </div>

            {/* 통증 — 그라데이션 게이지 + 마커 + 라벨 + 자연어 */}
            {hasPain && (
              <div className="mt-5">
                <div className="mb-2 text-[12.5px] text-[var(--text-secondary)]">
                  <b className="font-semibold text-[var(--text)]">
                    통증 평균 {avgPain.toFixed(1)}점
                  </b>{" "}
                  · {painPhrase(avgPain)}
                </div>
                <div
                  className="relative h-2 rounded-full"
                  style={{ background: painGradient }}
                  aria-hidden
                >
                  <span
                    className="absolute -top-[3px] h-[14px] w-[3px] rounded-[2px] bg-[#64748B] shadow-[0_0_0_2px_#fff]"
                    style={{ left: `calc(${painPos(avgPain)}% - 1.5px)` }}
                  />
                </div>
                <div
                  className="relative mt-1.5 h-[12px] text-[9.5px] text-[var(--text-muted)]"
                  aria-hidden
                >
                  {PAIN_LABELS.map((l, i) => (
                    <span
                      key={l}
                      className="absolute -translate-x-1/2"
                      style={{ left: `${painPos(i + 1)}%` }}
                    >
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 효과 — 다색 막대 top3(0→값 부드러운 채움) */}
            {top3.length > 0 && (
              <div className="mt-5">
                <div className="mb-2.5 text-[12.5px] font-semibold text-[var(--text)]">
                  무엇이 좋아졌나요
                </div>
                <div className="flex flex-col gap-2.5">
                  {top3.map((e, i) => (
                    <div key={e.label} className="flex items-center gap-2.5">
                      <span className="w-[54px] shrink-0 text-[12.5px] font-semibold text-[var(--text)]">
                        {e.label}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                        <span
                          className="block h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{
                            width: revealed ? `${e.pct}%` : "0%",
                            backgroundColor: EFFECT_BAR_COLORS[i % EFFECT_BAR_COLORS.length],
                          }}
                          aria-hidden
                        />
                      </span>
                      <span className="w-9 shrink-0 text-right text-[12.5px] font-bold text-[var(--text-secondary)]">
                        {e.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 효과 발현 시점 */}
            {onsetLabel && (
              <p className="mt-4 text-[12.5px] leading-[1.5] text-[var(--text-secondary)]">
                효과는 <b style={{ color: theme.color }}>{onsetLabel}</b>부터 가장 많이
                느꼈다고 해요.
              </p>
            )}

            {/* ③ 전체 리포트 보기 → 단독 URL (흰글씨 채움 버튼, flat) */}
            <Link
              href={reportHref}
              className={
                "mt-5 flex w-full items-center justify-center gap-1.5 rounded-[var(--radius)] bg-[var(--secondary)] px-4 py-3 text-[13.5px] font-bold text-white transition-colors hover:bg-[#163a52] " +
                FOCUS_RING
              }
              aria-label={`${procedureKo} 전체 리포트 보기 (모든 후기)`}
            >
              {procedureKo} 전체 리포트 보기
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
