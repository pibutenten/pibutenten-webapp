/**
 * EffectOnsetTimeline — 효과 발현 시기 시각화.
 *
 * 가로 시간축 좌→우 4구간(시술 직후 / 1~2주 후 / 한 달쯤 후 / 두세 달 후). 각 구간에 인원수만큼
 * landscape pill 칩을 세로로 쌓는다. 칩 색은 좌→우로 하늘색 농도 차등(연하게→진하게).
 * 구간 아래 시간 라벨 + "N명", 축에 시간 흐름 화살표(→). CAP(8) 초과 시 "칩 ×N".
 * '효과 못 느낌'(still_watching)은 시간점이 아니므로 타임라인 맨 뒤 5번째 칸으로(회색, 점선 구분·축 밖),
 * 평균·헤드라인에선 제외.
 */
import { EFFECT_ONSET_OPTIONS } from "@/lib/review-options";

// 시간 구간 칩 색 — 좌(시술 직후, 연하게) → 우(두세 달 후, 진하게).
const BLUE_SHADES = ["#BFE6FA", "#8FD2F5", "#5FBCEE", "#2FA3E0"];
const GRAY = "#C2C7CE"; // 효과 못 느낌
const CAP = 8; // 칩 스택 최대 표시 개수

/** 인원수만큼 landscape pill 을 세로 스택(하단부터). CAP 초과 시 "×N" 표기. */
function ChipStack({ count, color }: { count: number; color: string }) {
  const shown = Math.min(count, CAP);
  return (
    <>
      {count > CAP && (
        <span className="mb-1 text-[10px] font-semibold" style={{ color }}>
          ×{count}
        </span>
      )}
      <div className="flex flex-col-reverse items-center gap-[4px]">
        {Array.from({ length: shown }).map((_, i) => (
          <span
            key={i}
            className="h-[12px] w-full max-w-[40px] rounded-full"
            style={{ backgroundColor: color, minWidth: "26px" }}
          />
        ))}
      </div>
    </>
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

  return (
    <div className="flex items-stretch gap-3 pt-1.5">
      {/* 시간 구간 4 + 화살표 + 라벨 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-end justify-between gap-2">
          {buckets.map((b) => (
            <div key={b.key} className="flex flex-1 flex-col items-center">
              <ChipStack count={b.count} color={b.color} />
            </div>
          ))}
        </div>
        {/* 시간 흐름 축 + 화살표 (4구간만) */}
        <div className="relative mt-2 mb-1 flex items-center">
          <span className="h-px flex-1 bg-[#CBD5E1]" />
          <span className="ml-0.5 text-[10px] text-[var(--text-muted)]" aria-hidden>
            →
          </span>
        </div>
        <div className="flex justify-between gap-2">
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
        <div className="flex w-[60px] shrink-0 flex-col border-l border-dashed border-[var(--border)] pl-3">
          <div className="flex flex-1 items-end justify-center">
            <ChipStack count={stillCount} color={GRAY} />
          </div>
          {/* 화살표 행 높이 맞춤용 빈 공간 */}
          <div className="mt-2 mb-1 h-px" />
          <div className="text-center">
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
