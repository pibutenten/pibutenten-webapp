"use client";

/**
 * ReportsIndexCard — /reports 시술 리포트 인덱스 전용 요약 카드.
 *
 * 2026-07-08 UI 개편 Phase 1-2 (디자인 명세 PDF p.2-3 + 시안 1d-리포트-접힘/펼침) — 3단 구조:
 *   ① 요약(접힘)  — 공용 ReportSummaryBox(SSOT — /topics 닫힌 글상자와 공유)로 추출.
 *                   토글 버튼(chevron #9FB3AC)·aria-expanded·펼침 동작은 이 카드가 소유.
 *   ② 펼침(흰 배경 이어짐, 블록 간 24px) — 통증 평균(볼드)+보조문구(회색) · 통증 척도 바
 *                   (그라데이션 --pain-grad-1→3, 마커=원 안 번개 값 위치 연동, 라벨 5종
 *                   PAIN_LABELS 현행 유지) · "무엇이 좋아졌나요?" 효과 막대 top3(항목 순서별
 *                   색 #6EC1F0/#A99BE0/#8AA0E0, % #0E8A6E) · 효과시점 문구(강조어만 카테고리색).
 *                   효과·시점은 서버 prop 으로 즉시 표시(fetch 없음).
 *   ③ CTA 2버튼(라운드 14px) — 내 후기 남기기(tint 배경) / 리포트 더보기(카테고리색 채움)
 *                   → 단독 URL `/reports/{시술}`.
 *
 * flat — 음영/테두리 없음(우리 UI/UX). 카드 라운드 18px·패딩 24px(명세).
 * 격리: app.module.css 미사용 — Tailwind + globals.css 토큰 + categoryTheme(인라인) + 공용 아이콘.
 * 접근성: 시술명 h2(SummaryBox), 토글 aria-expanded, 막대/게이지 aria-hidden + 텍스트 병기.
 * 명세 고정색(globals 토큰 없음 → 리터럴): 텍스트 #3A3C41 · 보조 #8A939B · chevron #9FB3AC ·
 * 마커 #F06258 · 효과 막대 3색 · 효과 % #0E8A6E.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProcedureReport } from "@/lib/procedure-report";
import { categoryTheme } from "@/lib/procedure-theme";
import ReportSummaryBox from "@/components/report/ReportSummaryBox";
import { IconPain } from "@/components/icons";

const FOCUS_RING =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-active)]";

// 효과 막대 — 빈도 순위별 색(1위 파랑 · 2위 보라 · 3위 남보라). 시안의 잔주름/턱선/피부결
// 대응은 보톡스 예시일 뿐, 실제 top3 항목은 시술마다 달라지므로 "순위→색" 고정이다.
const EFFECT_BAR_COLORS = ["#6EC1F0", "#A99BE0", "#8AA0E0"];

// 통증 척도 바 — 명세 그라데이션(globals.css Phase 0-1 토큰). 라벨 위치 없음 6.25% … 심함 93.75%.
const PAIN_GRADIENT =
  "linear-gradient(90deg, var(--pain-grad-1), var(--pain-grad-2), var(--pain-grad-3))";
// 라벨 SSOT — 현행 5종 유지(시안 '많이'는 미채택 — 계획서 Phase 1 각주: PAIN_LABELS 재정의 금지).
const PAIN_LABELS = ["없음", "조금", "보통", "꽤", "심함"];
function painPos(v: number): number {
  const x = Math.min(5, Math.max(1, v));
  return 6.25 + ((x - 1) / 4) * 87.5;
}

type TopEffect = { label: string; pct: number };

/** 통증 한 줄 평(절대값·후기 voice) — 기존 문구 엔진 재사용(의료광고 카피 가드). */
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
  const hasPain = avgPain > 0;

  const top3 = effects.slice(0, 3);
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
      className="overflow-hidden rounded-[18px] bg-white scroll-mt-[calc(var(--sat,0px)_+_60px)]"
      aria-label={`${procedureKo} 시술 리포트`}
    >
      {/* ── ① 요약(접힘) — 마우스 클릭은 헤더 전체, 접근성 토글은 우상단 chevron 버튼 1개 ── */}
      <div className="relative cursor-pointer" onClick={toggle}>
        {/* chevron 토글(명세 #9FB3AC, 접힘 ˅ ↔ 펼침 ˄) — 40×40 터치 영역, 20px SVG */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          aria-expanded={open}
          aria-label={`${procedureKo} 리포트 ${open ? "접기" : "펼치기"}`}
          className={"absolute right-3 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-[10px] border-0 bg-transparent " + FOCUS_RING}
        >
          <svg
            viewBox="0 0 24 24"
            width={20}
            height={20}
            stroke="#9FB3AC"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
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

      {/* ── ② 펼침 — 흰 배경 이어짐, grid-rows 0fr↔1fr(기존 패턴 유지), 블록 간 24px(명세) ── */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-6 p-6">
            {/* 통증 — 평균(볼드)+보조문구(회색) + 그라데이션 척도 바 + 원형 마커(원 안 번개, 값 연동) */}
            {hasPain && (
              <div>
                <div className="pr-1 text-[15px] leading-[1.45]">
                  <b className="font-bold text-[#3A3C41]">
                    통증 평균 {avgPain.toFixed(1)}점
                  </b>{" "}
                  <span className="text-[13px] text-[#8A939B]">
                    {painPhrase(avgPain)}
                  </span>
                </div>
                <div
                  className="relative mt-4 h-[10px] rounded-[6px]"
                  style={{ background: PAIN_GRADIENT }}
                  aria-hidden
                >
                  <span
                    className="absolute top-1/2 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-[#F06258] bg-white text-[#F06258]"
                    style={{
                      left: `${painPos(avgPain)}%`,
                      transform: "translate(-50%,-50%)",
                    }}
                  >
                    <IconPain size={11} />
                  </span>
                </div>
                <div
                  className="mt-2 flex justify-between text-[11px] text-[#8A939B]"
                  aria-hidden
                >
                  {PAIN_LABELS.map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 효과 — "무엇이 좋아졌나요?" + 막대 top3(항목 순서별 색, 0→값 부드러운 채움, % 초록) */}
            {top3.length > 0 && (
              <div>
                <div className="mb-3 text-[15px] font-bold text-[#3A3C41]">
                  무엇이 좋아졌나요?
                </div>
                <div className="flex flex-col gap-3">
                  {top3.map((e, i) => (
                    <div key={e.label} className="flex items-center gap-3">
                      <span className="w-[56px] shrink-0 truncate text-[13px] font-semibold text-[#3A3C41]">
                        {e.label}
                      </span>
                      <span className="h-[9px] flex-1 overflow-hidden rounded-[6px] bg-[var(--gauge-track)]">
                        <span
                          className="block h-full rounded-[6px] transition-[width] duration-700 ease-out"
                          style={{
                            width: revealed ? `${e.pct}%` : "0%",
                            backgroundColor:
                              EFFECT_BAR_COLORS[i % EFFECT_BAR_COLORS.length],
                          }}
                          aria-hidden
                        />
                      </span>
                      <span className="w-10 shrink-0 text-right text-[13px] font-bold text-[#0E8A6E]">
                        {e.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 효과 발현 시점 — 기존 문구 엔진 유지, 강조어만 카테고리색 볼드(명세) */}
            {onsetLabel && (
              <p className="text-[13.5px] leading-[1.5] text-[#3A3C41]">
                효과는{" "}
                <b className="font-bold" style={{ color: theme.color }}>
                  {onsetLabel}
                </b>
                부터 가장 많이 느꼈다고 해요.
              </p>
            )}

            {/* ③ CTA 두 버튼(라운드 14px) — 좌: 내 후기 남기기(tint) / 우: 리포트 더보기(카테고리색 채움) */}
            <div className="flex gap-2.5">
              <Link
                href={`/write?tab=review&proc=${encodeURIComponent(procedureKo)}`}
                className={
                  "flex flex-1 items-center justify-center rounded-[14px] px-4 py-3.5 text-[14.5px] font-bold text-[#3A3C41] " +
                  FOCUS_RING
                }
                style={{ backgroundColor: theme.tint }}
              >
                내 후기 남기기
              </Link>
              <Link
                href={reportHref}
                onClick={onNavigateDetail}
                className={
                  "flex flex-1 items-center justify-center rounded-[14px] px-4 py-3.5 text-[14.5px] font-bold text-white " +
                  FOCUS_RING
                }
                style={{ backgroundColor: theme.color }}
                aria-label={`${procedureKo} 리포트 더보기`}
              >
                리포트 더보기
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
