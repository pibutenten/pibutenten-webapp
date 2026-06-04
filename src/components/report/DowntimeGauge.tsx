/**
 * DowntimeGauge — 다운타임 평균 게이지.
 *
 * 통증 바처럼 깔끔하게 — 0→평균 일수까지 채운 얇은 바만 표시(마커·눈금·라벨 없음).
 * 표본 n>15 일 때만 ±표준편차 페이드 밴드. 값 전달은 헤드라인·캡션이 담당.
 * 캡션 "평균 약 N일 · N명". answered===0 이면 null(섹션 숨김).
 */

const GAUGE_MAX = 16; // daycode 상한(2주 이상=16).
// 트랙 표현 범위 -1일 ~ 15일 → pos(v)=(v+1)/16.
//   당일(0)=6.25%, 1주(7)=50%, 2주(14)=93.75% (양끝에 더 가깝게, 단 안 붙음).
const GAUGE_LEFT = -1;
const GAUGE_RIGHT = 15;

/** 일수 → 트랙상 위치(%). 0 도 안쪽(빈 막대 방지), 끝값은 클램프. */
function pct(v: number): number {
  const clamped = Math.min(GAUGE_MAX, Math.max(0, v));
  const p = ((clamped - GAUGE_LEFT) / (GAUGE_RIGHT - GAUGE_LEFT)) * 100;
  return Math.min(100, Math.max(0, p));
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
        {showFade && fadeWidth > 0 && (
          <span
            className="absolute top-0 h-full rounded-full bg-[#7FD0F8]/30"
            style={{ left: `${fadeLeft}%`, width: `${fadeWidth}%` }}
          />
        )}
        {/* 0→평균 채움 */}
        <span
          className="absolute left-0 top-0 h-full rounded-full bg-[#7FD0F8]"
          style={{ width: `${avgPct}%` }}
        />
      </div>
      {/* 스케일 참조 라벨 — pos 매핑 위치(당일 6.25% / 1주 50% / 2주 93.75%)에 정렬. */}
      <div className="relative mt-1.5 h-[12px] text-[9.5px] text-[var(--text-muted)]">
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(0)}%` }}>당일</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(7)}%` }}>1주</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(14)}%` }}>2주</span>
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
        {Math.round(avg) === 0
          ? `당일 일상 복귀 · ${answered}명`
          : `평균 약 ${formatDays(avg)}일 · ${answered}명`}
      </p>
    </div>
  );
}
