/**
 * EffectOnsetTimeline — 효과 발현 시기 시각화.
 *
 * 가로 시간축 좌→우 4구간(시술 직후 / 1~2주 후 / 한 달쯤 후 / 두세 달 후). 각 구간 인원수를 동그라미로.
 *   - 개수가 적을 땐 한 줄에 옆으로 배열, PER_ROW 초과 시 위로 한 줄씩 쌓임(맨 아래 줄이 축 라인에 붙음).
 *   - n 이 매우 커지면(최대 구간 > MAX_CIRCLES) 동그라미 수를 절대값이 아니라 **상대값**(비례 축소)으로 표시.
 * 동그라미 색은 좌→우 하늘색 농도 차등. 정확한 인원수는 구간 아래 "N명" 라벨이 담당.
 * '효과 못 느낌'(still_watching)은 맨 우측 5번째 칸(회색·점선 구분·축 밖), 평균·헤드라인 제외.
 */
import { EFFECT_ONSET_OPTIONS } from "@/lib/review-options";

const BLUE_SHADES = ["#BFE6FA", "#8FD2F5", "#5FBCEE", "#2FA3E0"]; // 좌(연)→우(진)
const GRAY = "#C2C7CE"; // 효과 못 느낌
const PER_ROW = 3; // 한 줄 최대 동그라미 (넘으면 위로)
const MAX_CIRCLES = 9; // 한 칸 최대 동그라미(3줄). 초과 데이터는 상대값으로 축소.

/** count → 표시할 동그라미 수. unit>1 이면 상대값(비례). 있으면 최소 1개. */
function circlesFor(count: number, unit: number): number {
  if (count <= 0) return 0;
  return Math.max(1, Math.round(count / unit));
}

/** 동그라미를 가로 우선(한 줄 PER_ROW) + 위로 쌓기. 맨 아래 줄부터 채움. */
function CircleStack({ n, color }: { n: number; color: string }) {
  // 줄 단위로 분할(아래 줄부터 가득). flex-col-reverse 로 아래→위 쌓기.
  const rows: number[] = [];
  for (let i = 0; i < n; i += PER_ROW) rows.push(Math.min(PER_ROW, n - i));
  return (
    <div className="flex flex-col-reverse items-center gap-[4px]">
      {rows.map((cnt, r) => (
        <div key={r} className="flex gap-[4px]">
          {Array.from({ length: cnt }).map((_, i) => (
            <span
              key={i}
              className="h-[12px] w-[12px] rounded-full"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function EffectOnsetTimeline({
  /** EFFECT_ONSET_OPTIONS 순서 구간별 인원수(0~4, index 4 = still_watching). */
  dist,
}: {
  dist: number[];
}) {
  const buckets = EFFECT_ONSET_OPTIONS.slice(0, 4).map((o, i) => ({
    key: o.value,
    label: o.label,
    count: dist[i] ?? 0,
    color: BLUE_SHADES[i],
  }));
  const stillCount = dist[4] ?? 0;

  // 상대 스케일 단위 — 전 구간(+못느낌) 최대 count 가 MAX_CIRCLES 초과면 비례 축소(공유 단위).
  const maxCount = Math.max(stillCount, ...buckets.map((b) => b.count), 1);
  const unit = maxCount > MAX_CIRCLES ? maxCount / MAX_CIRCLES : 1;

  return (
    <div className="flex items-stretch gap-3">
      {/* 시간 구간 4 + 화살표 + 라벨 */}
      <div className="min-w-0 flex-1">
        {/* 동그라미 스택 — 하단 정렬(맨 아래 줄이 축 라인에 붙음) */}
        <div className="flex items-end justify-between gap-2">
          {buckets.map((b) => (
            <div key={b.key} className="flex flex-1 flex-col items-center">
              <CircleStack n={circlesFor(b.count, unit)} color={b.color} />
            </div>
          ))}
        </div>
        {/* 시간 흐름 축 + 화살표 (4구간만) — 스택 바로 아래(동그라미가 라인에 닿음) */}
        <div className="relative mt-1 flex items-center">
          <span className="h-px flex-1 bg-[#CBD5E1]" />
          <span className="ml-0.5 text-[10px] text-[var(--text-muted)]" aria-hidden>
            →
          </span>
        </div>
        <div className="mt-1 flex justify-between gap-2">
          {buckets.map((b) => (
            <div key={b.key} className="flex-1 text-center">
              <div className="text-[10.5px] leading-tight text-[var(--text-secondary)]">
                {b.label}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">{b.count}명</div>
            </div>
          ))}
        </div>
      </div>

      {/* 효과 못 느낌 — 축 밖, 점선 구분, 회색(5번째 칸). 평균·헤드라인 제외. */}
      {stillCount > 0 && (
        <div className="flex w-[64px] shrink-0 flex-col border-l border-dashed border-[var(--border)] pl-3">
          <div className="flex flex-1 items-end justify-center">
            <CircleStack n={circlesFor(stillCount, unit)} color={GRAY} />
          </div>
          {/* 축 라인 행 높이 맞춤용 빈 공간 */}
          <div className="mt-1 h-px" />
          <div className="mt-1 text-center">
            <div className="text-[10.5px] leading-tight text-[var(--text-muted)]">
              효과 못 느낌
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">{stillCount}명</div>
          </div>
        </div>
      )}
    </div>
  );
}
