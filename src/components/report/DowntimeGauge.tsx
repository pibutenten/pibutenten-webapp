/**
 * DowntimeGauge — 다운타임 평균 게이지.
 *
 * 통증 바처럼 깔끔하게 — 0→평균 일수까지 채운 얇은 바만 표시(마커·눈금·라벨 없음).
 * 표본 n>15 일 때만 ±표준편차 페이드 밴드. 값 전달은 헤드라인·캡션이 담당.
 * 캡션 "평균 약 N일 · N명". answered===0 이면 null(섹션 숨김).
 */

const GAUGE_MAX = 16; // 상한 — "2주 이상(16)" 까지. 마커 없으므로 단순 선형 매핑.

/** 일수 → 트랙상 위치(%) — 선형(0=0%, MAX=100%). */
function pct(v: number): number {
  return Math.min(100, Math.max(0, (v / GAUGE_MAX) * 100));
}

function formatDays(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export default function DowntimeGauge({
  dist,
  answered,
  days,
}: {
  /** DOWNTIME_OPTIONS 순서 구간별 응답 수. */
  dist: number[];
  /** 비-NULL 응답 수(표본 n). */
  answered: number;
  /** 구간별 대표 일수(DOWNTIME_DAYS). */
  days: number[];
}) {
  if (answered <= 0) return null; // 폴백 — 섹션 숨김

  const avg = dist.reduce((s, c, i) => s + c * (days[i] ?? 0), 0) / answered;
  const avgPct = pct(avg);

  // 편차 밴드 — 표본 충분(n>15)할 때만.
  const showFade = answered > 15;
  let fadeLeft = 0;
  let fadeWidth = 0;
  if (showFade) {
    const variance =
      dist.reduce((s, c, i) => s + c * Math.pow((days[i] ?? 0) - avg, 2), 0) / answered;
    const sd = Math.sqrt(Math.max(0, variance));
    const lo = pct(Math.max(0, avg - sd));
    const hi = pct(Math.min(GAUGE_MAX, avg + sd));
    fadeLeft = lo;
    fadeWidth = Math.max(0, hi - lo);
  }

  return (
    <div>
      {/* 통증 막대와 동일 두께(h-2) — 마커·눈금 없이 채움 바만. */}
      <div className="relative h-2 rounded-full bg-[#EEF1F4]">
        {/* 다운타임은 부정 지표 → 통증 바 우측 끝 빨강(#F08A8A)으로 채움. */}
        {showFade && fadeWidth > 0 && (
          <span
            className="absolute top-0 h-full rounded-full bg-[#F08A8A]/30"
            style={{ left: `${fadeLeft}%`, width: `${fadeWidth}%` }}
          />
        )}
        {/* 0→평균 채움 */}
        <span
          className="absolute left-0 top-0 h-full rounded-full bg-[#F08A8A]"
          style={{ width: `${avgPct}%` }}
        />
      </div>
      {/* 스케일 참조 라벨 — 통증의 없음/조금/… 라벨처럼 균등 배치(값 인디케이터 없음). */}
      <div className="mt-1.5 flex justify-between text-[9.5px] text-[var(--text-muted)]">
        <span>당일</span>
        <span>1주</span>
        <span>2주</span>
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
        {Math.round(avg) === 0
          ? `당일 일상 복귀 · ${answered}명`
          : `평균 약 ${formatDays(avg)}일 · ${answered}명`}
      </p>
    </div>
  );
}
