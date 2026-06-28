"use client";

/**
 * ReportsNewCard — /reports-new 시술 리포트 인덱스 전용 에디토리얼 요약 카드.
 *
 * 목업(전달용/report-pibutenten-skin.html)의 카드 디자인을 1:1로 옮긴 3단 구조:
 *   ① 요약(접힘)  — 카테고리 틴트 헤더 + 시술명 + 큰 % 히어로("다시 받고 싶어요") +
 *                   통증·만족도 미니 + 회전 헤드라인 한 줄.
 *   ② 펼침(1차 집계) — 만족도 별점/점수 + 효과 발현 시점(peak) + 대표 효과 막대 top3.
 *                     컴팩트 풀엔 효과/효과시점이 없어 펼칠 때 1회 lazy fetch(기존 API).
 *   ③ 전체 리포트 보기 → 단독 URL `/reports/{시술}`(거기서 모든 후기 열람).
 *
 * 공용 ProcedureReportCard 비의존(병렬 세션 소유) — 자체 독립 구현.
 * 격리: app.module.css 클래스 미사용 — Tailwind + globals.css 토큰 + categoryTheme(인라인).
 * 접근성: 시술명 h2(페이지 h1 중복 회피), 토글 aria-expanded, 막대 aria-hidden + 텍스트 병기,
 *   흰 글씨는 #1B87C9(--primary-active) 이상에서만. 회전 헤드라인은 서버 prop(SSR/CSR 일치).
 */

import { useState } from "react";
import Link from "next/link";
import type { ProcedureReport } from "@/lib/procedure-report";
import { categoryTheme } from "@/lib/procedure-theme";
import { CATEGORIES } from "@/lib/categories";
import { experienceCount } from "@/lib/report-copy";
import { EFFECT_ONSET_OPTIONS } from "@/lib/review-options";

const FOCUS_RING =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-active)]";

// 효과 막대 다색 팔레트 — 운영 ProcedureReportCard 와 동일(단조로운 단색 대신 항목별 색 구분).
const EFFECT_BAR_COLORS = [
  "#7FD0F8", "#B0A0DE", "#9AA6DE", "#FFCB8C", "#8FD4C8",
  "#F59CB6", "#A6D9A9", "#F4B8A0", "#C3B0E8", "#CDC97A",
];

type FetchResp = {
  report?: ProcedureReport | null;
};

/** onsetDist(0~3 = 시술직후/1~2주/한달쯤/두세달) 최다 시점 라벨. 합 0이면 null. */
function peakLabel(onsetDist: number[] | undefined): string | null {
  if (!onsetDist) return null;
  const seg = onsetDist.slice(0, 4);
  const sum = seg.reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  let idx = 0;
  for (let i = 1; i < 4; i++) if ((seg[i] ?? 0) > (seg[idx] ?? 0)) idx = i;
  return EFFECT_ONSET_OPTIONS[idx]?.label ?? null;
}

export default function ReportsNewCard({
  report,
  headline,
}: {
  report: ProcedureReport;
  /** 서버 확정 회전 헤드라인 1줄(report-headline 엔진). SSR/CSR 일치 위해 그대로 표시. */
  headline: string;
}) {
  const { procedureKo, en, category, count, avgSatisfaction, revisit, avgPain } =
    report;

  const theme = categoryTheme(category);
  const catLabel = CATEGORIES.find((c) => c.slug === category)?.label ?? null;

  const rTotal = Math.max(1, revisit.yes + revisit.maybe + revisit.no);
  const yesPct = Math.round((revisit.yes / rTotal) * 100);
  const satRounded = Math.round(avgSatisfaction);
  const painOn = Math.round(avgPain); // 통증 미니 점(0~5)

  const reportHref = `/reports/${encodeURIComponent(procedureKo)}`;

  // ── 펼침 + lazy fetch(효과/효과시점) ──
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ProcedureReport | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadDetail() {
    if (detail || loading) return;
    const slug = en || procedureKo;
    if (!slug) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reports/${encodeURIComponent(slug)}/reviews?include_report=1&limit=1`,
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as FetchResp;
      if (data.report) setDetail(data.report);
    } catch {
      /* 실패해도 접힘 집계(만족도)는 보임 — 조용히 무시 */
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void loadDetail();
  }

  const effects = (detail?.effects ?? []).slice(0, 3);
  const peak = peakLabel(detail?.onsetDist);

  return (
    <article
      className="overflow-hidden rounded-[var(--radius-lg)] bg-white"
      aria-label={`${procedureKo} 시술 리포트`}
    >
      {/* ── ① 요약(접힘) — 클릭 시 펼침 토글 ── */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={"relative block w-full text-left " + FOCUS_RING}
      >
        {/* 헤더 — 카테고리 틴트 */}
        <div className="px-5 pt-4 pb-3.5" style={{ backgroundColor: theme.soft }}>
          <div className="mb-2 flex items-center gap-2 pr-6">
            <h2
              className="text-[17px] font-extrabold tracking-[-0.02em] text-[var(--text)]"
              style={{ color: theme.color }}
            >
              {procedureKo}
            </h2>
            {catLabel && (
              <span
                className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold"
                style={{ color: theme.color, backgroundColor: "rgba(255,255,255,0.65)" }}
              >
                {catLabel}
              </span>
            )}
            <span className="ml-auto shrink-0 text-[11.5px] text-[var(--text-secondary)]">
              {experienceCount(count)}
            </span>
          </div>

          {/* 큰 % 히어로 + 통증·만족도 미니 */}
          <div className="flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <div
                className="flex items-baseline gap-0.5"
                style={{ color: theme.color }}
              >
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
                      style={{
                        backgroundColor: i < painOn ? theme.color : "#E2E7EC",
                      }}
                    />
                  ))}
                </span>
              </div>
              <div className="text-center">
                <span className="mb-1.5 block text-[10.5px] font-semibold text-[var(--text-muted)]">
                  만족도
                </span>
                <span className="text-[22px] font-extrabold leading-none text-[var(--text)] [font-feature-settings:'tnum']">
                  {avgSatisfaction.toFixed(1)}
                </span>
              </div>
            </div>
          </div>

          {/* 회전 헤드라인 한 줄 */}
          {headline && (
            <p className="mt-3.5 truncate text-[13px] text-[var(--text-secondary)]">
              {headline}
            </p>
          )}
        </div>

        {/* 펼침 표시 chevron */}
        <span
          aria-hidden
          className="absolute right-4 top-4 text-[12px] text-[var(--text-muted)] transition-transform duration-300"
          style={{ transform: open ? "rotate(180deg)" : undefined, color: open ? theme.color : undefined }}
        >
          ▾
        </span>
      </button>

      {/* ── ② 펼침(1차 집계) — grid-rows 0fr↔1fr 애니메이션 ── */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-5 pb-4 pt-3.5">
            {/* 만족도 별점 + 효과 시점(peak) */}
            <div className="flex items-center gap-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[13px] tracking-[1px]" aria-hidden>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      style={{ color: n <= satRounded ? "var(--accent-save)" : "#DDE2E7" }}
                    >
                      ★
                    </span>
                  ))}
                </span>
                <span className="text-[16px] font-extrabold text-[var(--text)]">
                  {avgSatisfaction.toFixed(1)}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">만족도</span>
              </div>
              {peak && (
                <p className="ml-auto text-right text-[12px] leading-[1.4] text-[var(--text-secondary)]">
                  효과는 <b style={{ color: theme.color }}>{peak}</b>부터
                  <br />
                  가장 많이 느꼈어요
                </p>
              )}
            </div>

            {/* 대표 효과 막대 top3 */}
            {loading && !detail && (
              <p className="mt-3 text-[12px] text-[var(--text-muted)]">불러오는 중…</p>
            )}
            {effects.length > 0 && (
              <div className="mt-3 flex flex-col gap-2.5">
                {effects.map((e, i) => (
                  <div key={e.label} className="flex items-center gap-2.5">
                    <span className="w-[54px] shrink-0 text-[12.5px] font-semibold text-[var(--text)]">
                      {e.label}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${e.pct}%`,
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
            )}

            {/* ③ 전체 리포트 보기 → 단독 URL */}
            <Link
              href={reportHref}
              className={
                "mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-[var(--radius)] bg-[var(--secondary)] px-4 py-3 text-[13.5px] font-bold text-white transition-colors hover:bg-[#163a52] " +
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
