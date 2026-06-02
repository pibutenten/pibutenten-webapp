/**
 * ProcedureReportCard — 시술별 후기 집계 카드 (서버 컴포넌트, 표시 전용).
 *
 * 만족도(평균+분포) · 통증(평균+그라데이션 바) · 재시술 의향(막대) · 많이 본 효과(빈도 바).
 * 개별 후기 스트림은 이 카드 아래에 별도(ProcedureReviewStream)로 접어서 노출.
 */
import type { ProcedureReport } from "@/lib/procedure-report";

const PAIN_LABELS = ["없음", "조금", "보통", "꽤", "심함"];
const PAIN_SCALE_COLORS = ["#BAE6FD", "#FDE047", "#F97316", "#EF4444", "#991B1B"];
// 효과 막대 색 — 빈도순 인덱스에 순환 매칭(파스텔).
const EFFECT_BAR_COLORS = [
  "#7FD0F8", "#B0A0DE", "#9AA6DE", "#FFCB8C", "#8FD4C8",
  "#F59CB6", "#A6D9A9", "#F4B8A0", "#C3B0E8", "#CDC97A",
];

function painLabelFor(avg: number): string {
  const idx = Math.min(4, Math.max(0, Math.round(avg) - 1));
  return PAIN_LABELS[idx] ?? "보통";
}

export default function ProcedureReportCard({
  report,
  accent = "var(--primary)",
}: {
  report: ProcedureReport;
  /** 시술 카테고리 색 (제목/뱃지). */
  accent?: string;
}) {
  const {
    procedureKo,
    count,
    avgSatisfaction,
    satisfactionDist,
    avgPain,
    revisit,
    effects,
  } = report;

  const satRounded = Math.round(avgSatisfaction);
  const maxSat = Math.max(1, ...satisfactionDist);
  const painPct = Math.min(100, Math.max(0, (avgPain / 5) * 100));
  const revisitTotal = Math.max(1, revisit.yes + revisit.maybe + revisit.no);
  const yesPct = Math.round((revisit.yes / revisitTotal) * 100);
  const maybePct = Math.round((revisit.maybe / revisitTotal) * 100);
  const noPct = Math.max(0, 100 - yesPct - maybePct);
  const topEffects = effects.slice(0, 6);

  return (
    <article className="overflow-hidden rounded-[16px] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
      {/* 헤더 */}
      <header className="border-b border-[var(--border)] bg-gradient-to-br from-[#EAF7FE] to-[#F7FCFF] px-5 py-4">
        <span
          className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white"
          style={{ backgroundColor: accent }}
        >
          시술 리포트
        </span>
        <h1
          className="mt-2 text-[24px] font-extrabold leading-tight tracking-[-0.02em]"
          style={{ color: accent }}
        >
          {procedureKo}
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">
          회원 후기 <b className="text-[var(--text)]">{count}건</b> 집계
        </p>
      </header>

      {/* 만족도 */}
      <section className="border-b border-[var(--border)] px-5 py-4">
        <div className="mb-2.5 text-[12.5px] font-bold text-[var(--text-secondary)]">
          만족도
        </div>
        <div className="flex items-center gap-4">
          <div className="shrink-0 text-center">
            <div className="text-[40px] font-extrabold leading-none text-[var(--text)]">
              {avgSatisfaction.toFixed(1)}
            </div>
            <div className="mt-1 text-[16px] leading-none tracking-[1px]">
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  style={{ color: n <= satRounded ? "var(--accent-save)" : "#DDE2E7" }}
                >
                  ★
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-1">
            {[5, 4, 3, 2, 1].map((score) => {
              const c = satisfactionDist[score - 1] ?? 0;
              return (
                <div key={score} className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                  <span className="w-6 text-right text-[var(--text-muted)]">{score}점</span>
                  <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-[#EEF1F4]">
                    <span
                      className="block h-full rounded-full bg-[var(--accent-save)]"
                      style={{ width: `${(c / maxSat) * 100}%` }}
                    />
                  </span>
                  <span className="w-4 text-right text-[var(--text-muted)]">{c}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 통증 */}
      <section className="border-b border-[var(--border)] px-5 py-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[12.5px] font-bold text-[var(--text-secondary)]">통증</span>
          <span className="text-[13px] font-bold text-[var(--text)]">
            {painLabelFor(avgPain)} · {avgPain.toFixed(1)}/5
          </span>
        </div>
        <div
          className="relative h-3 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${PAIN_SCALE_COLORS.join(", ")})`,
          }}
        >
          <span
            className="absolute -top-1 h-5 w-1 rounded-[3px] bg-[#1f2937] shadow-[0_0_0_2px_#fff]"
            style={{ left: `calc(${painPct}% - 2px)` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-[var(--text-muted)]">
          {PAIN_LABELS.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </section>

      {/* 재시술 의향 */}
      <section className="border-b border-[var(--border)] px-5 py-4">
        <div className="mb-2.5 text-[12.5px] font-bold text-[var(--text-secondary)]">
          재시술 의향
        </div>
        <div className="flex h-[26px] overflow-hidden rounded-lg text-[11px] font-bold text-white">
          {yesPct > 0 && (
            <div className="flex items-center justify-center" style={{ width: `${yesPct}%`, backgroundColor: "#4CBFF2" }}>
              {yesPct >= 12 ? `있어요 ${yesPct}%` : ""}
            </div>
          )}
          {maybePct > 0 && (
            <div className="flex items-center justify-center" style={{ width: `${maybePct}%`, backgroundColor: "#9AA1AC" }}>
              {maybePct >= 12 ? `${maybePct}%` : ""}
            </div>
          )}
          {noPct > 0 && (
            <div className="flex items-center justify-center" style={{ width: `${noPct}%`, backgroundColor: "#EA7E7B" }}>
              {noPct >= 12 ? `${noPct}%` : ""}
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-[var(--text-secondary)]">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#4CBFF2" }} />있어요 {revisit.yes}명</span>
          {revisit.maybe > 0 && (
            <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#9AA1AC" }} />고민 중 {revisit.maybe}명</span>
          )}
          <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#EA7E7B" }} />없어요 {revisit.no}명</span>
        </div>
      </section>

      {/* 많이 본 효과 */}
      {topEffects.length > 0 && (
        <section className="px-5 py-4">
          <div className="mb-2.5 text-[12.5px] font-bold text-[var(--text-secondary)]">
            많이 본 효과
          </div>
          <div className="flex flex-col gap-2.5">
            {topEffects.map((e, i) => (
              <div key={e.label} className="flex items-center gap-2.5">
                <span className="w-[52px] text-[12px] font-semibold text-[var(--text)]">{e.label}</span>
                <span className="h-[9px] flex-1 overflow-hidden rounded-full bg-[#EEF1F4]">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${e.pct}%`,
                      backgroundColor: EFFECT_BAR_COLORS[i % EFFECT_BAR_COLORS.length],
                    }}
                  />
                </span>
                <span className="w-9 text-right text-[11px] text-[var(--text-secondary)]">{e.pct}%</span>
              </div>
            ))}
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
