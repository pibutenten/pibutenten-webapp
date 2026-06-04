/**
 * DowntimeGauge — 다운타임 평균 게이지 (작업 C-1).
 *
 * 0 → 평균 일수까지 채움 + 7일·14일 가이드선. 표본 n>15 일 때만 편차(±표준편차) 페이드 밴드,
 * n≤15 면 평균 채움 + 마커만(표본 적을 때 가짜 정밀도 회피). 캡션 "평균 약 N일 · N명".
 *
 * answered===0 이면 null(섹션 숨김 — NaN/빈 게이지 방지). day 코딩은 DOWNTIME_DAYS SSOT.
 */

const GAUGE_MAX = 16; // 상한 — "2주 이상(16)" 까지.
// 좌우 대칭 여백 — 1주(7일)가 트랙 정중앙(50%)에 오도록. pos(v)=(v+PAD)/(MAX+PAD), PAD=MAX-14.
//   PAD=2 → pos(0)=11.1%, pos(7)=50%, pos(14)=88.9%, pos(16)=100%.
const GAUGE_PAD = GAUGE_MAX - 14;
/** 일수 → 트랙상 위치(%) — 0일이 좌측 끝에 붙지 않도록 PAD 적용. */
function pos(v: number): number {
  const clamped = Math.min(GAUGE_MAX, Math.max(0, v));
  return ((clamped + GAUGE_PAD) / (GAUGE_MAX + GAUGE_PAD)) * 100;
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
  const avgPct = pos(avg);

  // 편차 밴드 — 표본 충분(n>15)할 때만.
  const showFade = answered > 15;
  let fadeLeft = 0;
  let fadeWidth = 0;
  if (showFade) {
    const variance =
      dist.reduce((s, c, i) => s + c * Math.pow((days[i] ?? 0) - avg, 2), 0) / answered;
    const sd = Math.sqrt(Math.max(0, variance));
    const lo = pos(Math.max(0, avg - sd));
    const hi = pos(Math.min(GAUGE_MAX, avg + sd));
    fadeLeft = lo;
    fadeWidth = Math.max(0, hi - lo);
  }

  const guide7 = pos(7);
  const guide14 = pos(14);

  return (
    <div>
      <div className="relative h-3 rounded-full bg-[#EEF1F4]">
        {/* 편차 밴드(n>15) */}
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
        {/* 7·14일 가이드선 */}
        <span className="absolute top-[-2px] h-[16px] w-px bg-[#A6B0BC]" style={{ left: `${guide7}%` }} />
        <span className="absolute top-[-2px] h-[16px] w-px bg-[#A6B0BC]" style={{ left: `${guide14}%` }} />
        {/* 평균 마커 */}
        <span
          className="absolute -top-[3px] h-[18px] w-[3px] rounded-[2px] bg-[#3593C9] shadow-[0_0_0_2px_#fff]"
          style={{ left: `calc(${avgPct}% - 1.5px)` }}
        />
      </div>
      {/* 가이드 눈금 라벨 */}
      <div className="relative mt-1 h-[12px] text-[9.5px] text-[var(--text-muted)]">
        <span className="absolute -translate-x-1/2" style={{ left: `${guide7}%` }}>1주</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${guide14}%` }}>2주</span>
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
        평균 약 {formatDays(avg)}일 · {answered}명
      </p>
    </div>
  );
}
