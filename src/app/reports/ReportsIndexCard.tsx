"use client";

/**
 * ReportsIndexCard — /reports 시술 리포트 인덱스 전용 에디토리얼 요약 카드.
 *
 * 목업(전달용/report-pibutenten-skin.html)의 카드 감성을 살린 3단 구조:
 *   ① 요약(접힘)  — 카테고리 틴트 헤더 + 시술명 + 큰 % 히어로("다시 받고 싶어요") +
 *                   통증·만족도 미니 + 회전 헤드라인 한 줄.
 *                   시각부는 공용 ReportSummaryBox(SSOT — /topics 닫힌 글상자와 공유)로 추출,
 *                   토글 버튼·aria-expanded·펼침 동작은 이 카드가 그대로 소유.
 *   ② 펼침(1차 집계) — 만족도(별점+점수+한 줄 평) · 통증(그라데이션 게이지+마커+자연어) ·
 *                     대표 효과 다색 막대 top3(0→값 부드러운 채움) · 효과 발현 시점.
 *                     효과·시점은 서버에서 prop 으로 미리 받아 **즉시 표시**(끊김 없음, fetch 없음).
 *   ③ 전체 리포트 보기 → 단독 URL `/reports/{시술}`(모든 후기 열람).
 *
 * flat — 음영/테두리 없음(우리 UI/UX). 공용 ProcedureReportCard 비의존(자체 구현).
 * 격리: app.module.css 미사용 — Tailwind + globals.css 토큰 + categoryTheme(인라인).
 * 접근성: 시술명 h2, 토글 aria-expanded, 막대/게이지 aria-hidden + 텍스트 병기, 흰글씨는 #1B87C9+ 에서만.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProcedureReport } from "@/lib/procedure-report";
import { categoryTheme } from "@/lib/procedure-theme";
import ReportSummaryBox from "@/components/report/ReportSummaryBox";

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

export default function ReportsIndexCard({
  report,
  headline,
  effects,
  onsetLabel,
  open,
  onToggle,
  onNavigateDetail,
}: {
  report: ProcedureReport;
  /** 서버 확정 회전 헤드라인 1줄(SSR/CSR 일치). */
  headline: string;
  /** 서버 선집계 대표 효과 top3(즉시 표시). */
  effects: TopEffect[];
  /** 효과 발현 최다 시점 라벨. */
  onsetLabel: string | null;
  /** 펼침 상태(부모 ReportsIndexView 가 소유 — 뒤로가기 복원용 lift-up). */
  open: boolean;
  /** 펼침 토글 요청(부모가 openSet 갱신). */
  onToggle: () => void;
  /** 상세(/reports/{시술})로 떠나기 직전 — 부모가 스냅샷 저장. */
  onNavigateDetail: () => void;
}) {
  const { procedureKo, category, count, avgSatisfaction, revisit, avgPain } =
    report;

  const theme = categoryTheme(category);
  const satRounded = Math.round(avgSatisfaction);
  const hasPain = avgPain > 0;
  const painGradient = `linear-gradient(90deg, ${PAIN_SOFT[0]} 0%, ${PAIN_SOFT.map(
    (c, i) => `${c} ${painPos(i + 1)}%`,
  ).join(", ")}, ${PAIN_SOFT[PAIN_SOFT.length - 1]} 100%)`;

  const top3 = effects.slice(0, 3);
  // staging 전체 보고서(목업 풀 에디토리얼)로 연결 — 승격 시 /reports/{시술}로 교체.
  const reportHref = `/reports/${encodeURIComponent(procedureKo)}`;

  // 펼침은 부모(ReportsIndexView)가 소유(props open/onToggle) — 뒤로가기 복원용 lift-up.
  //   막대 0→값 부드러운 채움(펼친 직후 한 박자 뒤 revealed=true)은 그대로 로컬 유지.
  const [revealed, setRevealed] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const toggle = () => {
    const willOpen = !open; // 부모 상태 기준 — 펼치는 방향일 때만 스크롤.
    onToggle();
    if (willOpen)
      requestAnimationFrame(() =>
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
  };
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
      ref={cardRef}
      className="overflow-hidden rounded-[var(--radius-lg)] bg-white scroll-mt-[calc(var(--sat,0px)_+_60px)]"
      aria-label={`${procedureKo} 시술 리포트`}
    >
      {/* ── ① 요약(접힘) — 마우스 클릭은 헤더 전체, 접근성 토글은 우상단 chevron 버튼 1개 ── */}
      <div className="relative cursor-pointer" onClick={toggle}>
        {/* 앱 표준 회색 chevron 토글 — 40×40 터치 영역, 18px SVG */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          aria-expanded={open}
          aria-label={`${procedureKo} 리포트 ${open ? "접기" : "펼치기"}`}
          className={"absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-[10px] border-0 bg-transparent " + FOCUS_RING}
        >
          <svg
            viewBox="0 0 24 24"
            width={18}
            height={18}
            stroke="#8A9099"
            strokeWidth={2.4}
            fill="none"
            aria-hidden
            style={{ transition: "transform 0.3s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <ReportSummaryBox
          procedureKo={procedureKo}
          category={category}
          count={count}
          avgSatisfaction={avgSatisfaction}
          avgPain={avgPain}
          revisit={revisit}
          headline={headline}
        />
      </div>

      {/* ── ② 펼침(1차 집계) — grid-rows 0fr↔1fr ── */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-5 pb-5 pt-5">
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
                  className="mt-1.5 flex justify-between text-[9.5px] text-[var(--text-muted)]"
                  aria-hidden
                >
                  {PAIN_LABELS.map((l) => (
                    <span key={l}>{l}</span>
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

            {/* ③ CTA 두 버튼 한 행 — 좌: 후기 남기기(soft, flat) / 우: 전체 리포트 보기(카테고리색 채움) */}
            <div className="mt-5 flex gap-2">
              <Link
                href={`/write?tab=review&proc=${encodeURIComponent(procedureKo)}`}
                className={
                  "flex flex-1 items-center justify-center rounded-[var(--radius)] px-4 py-3.5 text-[14px] font-bold " +
                  FOCUS_RING
                }
                style={{
                  backgroundColor: theme.soft === "transparent" ? "var(--bg-soft)" : theme.soft,
                  color: "var(--text)",
                }}
              >
                내 후기 남기기
              </Link>
              <Link
                href={reportHref}
                onClick={onNavigateDetail}
                className={
                  "flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] px-4 py-3.5 text-[14px] font-bold text-white " +
                  FOCUS_RING
                }
                style={{ backgroundColor: theme.color, color: "#fff" }}
                aria-label={`${procedureKo} 피부텐텐 리포트 보러가기`}
              >
                피부텐텐 리포트
                <svg
                  viewBox="0 0 24 24"
                  width={15}
                  height={15}
                  stroke="currentColor"
                  strokeWidth={2.4}
                  fill="none"
                  aria-hidden
                >
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
