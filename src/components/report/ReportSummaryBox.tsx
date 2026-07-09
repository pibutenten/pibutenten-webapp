"use client";

/**
 * ReportSummaryBox — 시술 리포트 ①요약(접힘) 시각부 SSOT.
 *
 * 2026-07-08 UI 개편 Phase 1-1 (디자인 명세 PDF p.2-3 + 시안 1d-리포트-접힘):
 *   카테고리 tint 배경(초록 #E7F9F8) + 시술명(카테고리색 볼드)·카테고리 태그 칩(chip 배경·pill)
 *   + 재시술% 큰 숫자(카테고리색) + "재시술의향" 라벨·"N건의 경험" + 진행 막대(트랙 #fff,
 *   채움 연한→카테고리색 그라데이션, 라운드 6px, 값 연동) + 우측 통증(번개)·만족도(별)
 *   — 라벨 위 회색/값 아래 진하게 + 맨 아래 요약 문장(서버 헤드라인 엔진 prop 그대로, 재랜덤 금지).
 *
 * 소비처: (prop 계약 불변 — D1 ① SSOT 유지, /topics 도 신디자인 그대로 노출)
 *   - app/reports/ReportsIndexCard.tsx — 접힘부(토글·펼침·chevron 은 카드가 소유 — 윗줄 pr-9 로 자리만 확보).
 *   - app/topics/[tag]/TopicTagView.tsx — /reports/{ko} 로 가는 Link 로 감싼 닫힌 글상자.
 * 버튼/링크 래퍼는 포함하지 않음 — 소비처가 감싼다(카드=토글 헤더, 토픽=Link).
 *
 * flat — 음영/테두리 없음(우리 UI/UX). app.module.css 미사용 — Tailwind + globals.css 토큰 +
 * categoryTheme(인라인) + 공용 아이콘 모듈(Phase 0-5). 막대는 aria-hidden + 텍스트 병기.
 * 명세 고정색(globals 토큰 없음 → 리터럴 유지 — R4-1 2026-07-09 보정): 보조 회색 #7F838D ·
 * 값·재시술의향 라벨 #3A3C41 · 통증 번개 #F06258 · 별 #FCC623 · 막대 연한 스톱 #B4E4DF
 * (초록 앵커 — procedure-theme SPEC_ANCHORS 패턴).
 */

import type { ProcedureCategory } from "@/lib/procedure-report";
import { categoryTheme } from "@/lib/procedure-theme";
import { CATEGORIES } from "@/lib/categories";
import { experienceCount } from "@/lib/report-copy";
import { IconPain, IconStar } from "@/components/icons";

/**
 * 재시술 진행 막대의 연한 시작 스톱 — 명세는 초록(#029688→#B4E4DF)만 제시.
 * 타 카테고리는 "백색 70% 혼합" 결정론 파생(초록 파생값 #B3E0DB ≈ 명세 #B4E4DF).
 * 카테고리 미상(theme.color 가 CSS var)이면 파싱 불가 → fallback(테마 chip 톤).
 */
function barLightStop(color: string, fallback: string): string {
  if (color.toUpperCase() === "#029688") return "#B4E4DF"; // 명세 원본 hex 앵커
  const m = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (!m) return fallback;
  const ch = (i: number) =>
    Math.round(0.3 * parseInt(m[1].slice(i, i + 2), 16) + 0.7 * 255);
  return `rgb(${ch(0)},${ch(2)},${ch(4)})`;
}

export default function ReportSummaryBox({
  procedureKo,
  category,
  count,
  avgSatisfaction,
  avgPain,
  revisit,
  headline,
}: {
  procedureKo: string;
  category: ProcedureCategory | null;
  /** 발행 후기 수(경험 N건 라벨). */
  count: number;
  avgSatisfaction: number;
  /** 0 이면 '응답 적음' 표시(하단 미니). */
  avgPain: number;
  revisit: { yes: number; maybe: number; no: number };
  /** 서버 확정 회전 헤드라인 1줄(SSR/CSR 일치). 빈 문자열이면 미표시. */
  headline: string;
}) {
  const theme = categoryTheme(category);
  const catLabel = CATEGORIES.find((c) => c.slug === category)?.label ?? null;

  const rTotal = Math.max(1, revisit.yes + revisit.maybe + revisit.no);
  const yesPct = Math.round((revisit.yes / rTotal) * 100);
  const hasPain = avgPain > 0;
  const barFill = `linear-gradient(90deg, ${barLightStop(theme.color, theme.chip)}, ${theme.color})`;

  return (
    <div className="p-6" style={{ backgroundColor: theme.tint }}>
      {/* 윗줄 — 시술명(카테고리색 볼드) + 카테고리 태그 칩(pill). 우측 chevron 자리(pr-9)는 소비처 오버레이용. */}
      <div className="flex items-center gap-2 pr-9">
        <h2
          className="truncate text-[21px] font-bold tracking-[-0.02em]"
          style={{ color: theme.color }}
        >
          {procedureKo}
        </h2>
        {catLabel && (
          <span
            className="shrink-0 rounded-full px-2.5 py-[4px] text-[13px] font-medium"
            style={{ color: theme.color, backgroundColor: theme.chip }}
          >
            {catLabel}
          </span>
        )}
      </div>

      {/* 큰 숫자 재시술% — 명세: 시술명 줄과 8px 간격, 카테고리색 아주 크게 */}
      <div className="mt-2 flex items-baseline" style={{ color: theme.color }}>
        <span className="text-[50px] font-bold leading-[0.9] tracking-[-0.03em] [font-feature-settings:'tnum']">
          {yesPct}
        </span>
        <span className="text-[24px] font-bold">%</span>
      </div>

      {/* 재시술의향 라벨 + N건의 경험 + 진행 막대 ‖ 우측 통증·만족도 — 명세: 위 12px 간격 */}
      <div className="mt-3 flex items-end gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-semibold text-[#3A3C41]">재시술의향</span>
            <span className="truncate text-[14px] font-normal text-[#7F838D]">
              {experienceCount(count)}
            </span>
          </div>
          {/* 진행 막대 — 트랙 #fff · 채움 연한→카테고리색 그라데이션 · 라운드 6px · 값 연동 */}
          <div className="mt-2 h-[8px] overflow-hidden rounded-[6px] bg-white">
            <span
              className="block h-full rounded-[6px]"
              style={{ width: `${yesPct}%`, background: barFill }}
              aria-hidden
            />
          </div>
        </div>
        <div className="flex shrink-0 gap-4">
          <div className="text-center">
            <span className="mb-1.5 block text-[13px] font-normal text-[#7F838D]">
              통증
            </span>
            {hasPain ? (
              <span className="inline-flex items-center gap-1">
                <IconPain size={16} className="shrink-0 text-[#F06258]" />
                <span className="text-[22px] font-semibold leading-none text-[#3A3C41] [font-feature-settings:'tnum']">
                  {avgPain.toFixed(1)}
                </span>
              </span>
            ) : (
              <span className="block text-[10px] text-[#7F838D]">응답 적음</span>
            )}
          </div>
          <div className="text-center">
            <span className="mb-1.5 block text-[13px] font-normal text-[#7F838D]">
              만족도
            </span>
            <span className="inline-flex items-center gap-1">
              <IconStar size={16} className="shrink-0 text-[#FCC623]" />
              <span className="text-[22px] font-semibold leading-none text-[#3A3C41] [font-feature-settings:'tnum']">
                {avgSatisfaction.toFixed(1)}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* 요약 문장 — 기존 헤드라인 엔진 prop 그대로(재랜덤 금지). 명세: 막대 줄과 16px 간격 */}
      {headline && (
        <p className="mt-4 truncate text-[14px] text-[#7F838D]">{headline}</p>
      )}
    </div>
  );
}
