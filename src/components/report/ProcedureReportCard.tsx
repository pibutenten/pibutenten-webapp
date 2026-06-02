/**
 * ProcedureReportCard — 시술별 후기 집계 카드 (서버 컴포넌트, 표시 전용).
 *
 * 강조 순서: 재시술 의향(최상단·최강조) → 만족도(2차) → 통증(약하게) → 많이 본 효과 → 작성자 통계.
 * 개별 후기는 이 카드 아래(ProcedureReviewStream)에 컴팩트하게 나열.
 */
import type { ProcedureReport } from "@/lib/procedure-report";

const PAIN_LABELS = ["없음", "조금", "보통", "꽤", "심함"];
// 통증 그라데이션 — 너무 강하지 않게 파스텔 톤으로 완화.
const PAIN_SOFT = ["#BAE6FD", "#FDE68A", "#FDBA74", "#FCA5A5", "#F08A8A"];
const EFFECT_BAR_COLORS = [
  "#7FD0F8", "#B0A0DE", "#9AA6DE", "#FFCB8C", "#8FD4C8",
  "#F59CB6", "#A6D9A9", "#F4B8A0", "#C3B0E8", "#CDC97A",
];

function painLabelFor(avg: number): string {
  return PAIN_LABELS[Math.min(4, Math.max(0, Math.round(avg) - 1))] ?? "보통";
}

const SECTION = "border-b border-[var(--border)] px-5 py-4";
const TITLE = "mb-2.5 text-[14px] font-bold text-[var(--text)]";

export default function ProcedureReportCard({
  report,
  accent = "var(--primary)",
}: {
  report: ProcedureReport;
  accent?: string;
}) {
  const {
    procedureKo, count, avgSatisfaction, satisfactionDist,
    avgPain, revisit, effects, demographics,
  } = report;

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
  const ageTotal = Math.max(
    1,
    demographics.ageBands.reduce((a, b) => a + b.count, 0),
  );

  return (
    <article className="overflow-hidden rounded-[16px] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
      {/* 헤더 — 시술명(좌) + 후기 수(우) 한 줄 */}
      <header className="border-b border-[var(--border)] bg-gradient-to-br from-[#EAF7FE] to-[#F7FCFF] px-5 py-4">
        <span
          className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white"
          style={{ backgroundColor: accent }}
        >
          피부텐텐 리포트
        </span>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h1
            className="text-[24px] font-extrabold leading-tight tracking-[-0.02em]"
            style={{ color: accent }}
          >
            {procedureKo}
          </h1>
          <span className="shrink-0 text-[13px] text-[var(--text-secondary)]">
            회원 후기 <b className="text-[var(--text)]">{count}건</b>
          </span>
        </div>
      </header>

      {/* 1) 재시술 의향 — 최상단·최강조 */}
      <section className={SECTION}>
        <div className={TITLE}>재시술 의향</div>
        <div className="mb-2 flex items-end gap-2">
          <span className="text-[34px] font-extrabold leading-none" style={{ color: "#4CBFF2" }}>
            {yesPct}%
          </span>
          <span className="pb-1 text-[15px] font-bold text-[var(--text)]">다시 받을래요</span>
        </div>
        <div className="flex h-[22px] overflow-hidden rounded-lg text-[11px] font-bold text-white">
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

      {/* 2) 만족도 — 2차 강조 */}
      <section className={SECTION}>
        <div className={TITLE}>만족도</div>
        <div className="flex items-center gap-4">
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[15px] leading-none tracking-[1px]">
              {[1, 2, 3, 4, 5].map((nn) => (
                <span key={nn} style={{ color: nn <= satRounded ? "var(--accent-save)" : "#DDE2E7" }}>★</span>
              ))}
            </span>
            <span className="text-[20px] font-bold text-[var(--text)]">{avgSatisfaction.toFixed(1)}</span>
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

      {/* 3) 통증 — 약하게(작고 부드럽게) */}
      <section className={SECTION}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[var(--text-secondary)]">통증</span>
          <span className="text-[12px] text-[var(--text-secondary)]">{painLabelFor(avgPain)} · {avgPain.toFixed(1)}/5</span>
        </div>
        <div className="relative h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${PAIN_SOFT.join(", ")})` }}>
          <span className="absolute -top-[3px] h-[14px] w-[3px] rounded-[2px] bg-[#64748B] shadow-[0_0_0_2px_#fff]" style={{ left: `calc(${painPct}% - 1.5px)` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[9.5px] text-[var(--text-muted)]">
          {PAIN_LABELS.map((l) => <span key={l}>{l}</span>)}
        </div>
      </section>

      {/* 4) 많이 본 효과 — 제목 크게 + % 강조 */}
      {topEffects.length > 0 && (
        <section className={SECTION}>
          <div className={TITLE}>많이 본 효과</div>
          <div className="flex flex-col gap-2.5">
            {topEffects.map((e, i) => (
              <div key={e.label} className="flex items-center gap-2.5">
                <span className="w-[52px] text-[12.5px] font-semibold text-[var(--text)]">{e.label}</span>
                <span className="h-[10px] flex-1 overflow-hidden rounded-full bg-[#EEF1F4]">
                  <span className="block h-full rounded-full" style={{ width: `${e.pct}%`, backgroundColor: EFFECT_BAR_COLORS[i % EFFECT_BAR_COLORS.length] }} />
                </span>
                <span className="w-10 text-right text-[13px] font-extrabold" style={{ color: EFFECT_BAR_COLORS[i % EFFECT_BAR_COLORS.length] }}>{e.pct}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5) 작성자 통계 — 남녀·연령 (컴팩트) */}
      {demoTotal > 0 && (
        <section className={SECTION}>
          <div className="mb-2 text-[13px] font-semibold text-[var(--text-secondary)]">작성자</div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[var(--text-secondary)]">
            <span>
              여성 <b className="text-[var(--text)]">{femalePct}%</b> · 남성 <b className="text-[var(--text)]">{malePct}%</b>
            </span>
            {demographics.ageBands.length > 0 && (
              <span>
                {demographics.ageBands.map((b, i) => (
                  <span key={b.label}>
                    {i > 0 && " · "}
                    {b.label} <b className="text-[var(--text)]">{Math.round((b.count / ageTotal) * 100)}%</b>
                  </span>
                ))}
              </span>
            )}
          </div>
        </section>
      )}

      {/* 면책 */}
      <footer className="bg-[var(--bg-soft)] px-5 py-3 text-[10.5px] leading-[1.5] text-[var(--text-muted)]">
        이 리포트는 피부텐텐 회원이 남긴 후기 {count}건을 집계한 결과입니다. 개인차가
        있으며 의학적 효과·안전성을 보장하지 않습니다. 시술 결정은 전문의 상담 후 하시기 바랍니다.
      </footer>
    </article>
  );
}
