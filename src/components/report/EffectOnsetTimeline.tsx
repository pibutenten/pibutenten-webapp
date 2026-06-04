/**
 * EffectOnsetTimeline — 효과 발현 시기 시각화 (작업 3).
 *
 * 가로 시간축 좌→우 4구간(시술 직후 / 1~2주 후 / 한 달쯤 후 / 두세 달 후). 각 구간에 인원수만큼
 * "옆으로 넓은 라운드 직사각형 칩"(landscape pill)을 세로로 쌓는다. 구간 아래 시간 라벨 + "N명".
 * 축에 시간 흐름 화살표(→). 칩 = 사이트블루. 칩 스택은 CAP(8) 초과 시 "칩 ×N" 캡.
 * '효과 못 느낌'(still_watching)은 시간점이 아니므로 축에서 빼고 옆/아래 회색으로 작게(평균 제외).
 */
import { EFFECT_ONSET_OPTIONS } from "@/lib/review-options";

const CHIP = "#4CBFF2"; // 사이트블루
const CAP = 8; // 칩 스택 최대 표시 개수

export default function EffectOnsetTimeline({
  /** EFFECT_ONSET_OPTIONS 순서 구간별 인원수(0~4, index 4 = still_watching). */
  dist,
}: {
  dist: number[];
}) {
  // 4 시간 구간(0~3) + still_watching(4) 분리.
  const buckets = EFFECT_ONSET_OPTIONS.slice(0, 4).map((o, i) => ({
    key: o.value,
    label: o.label,
    count: dist[i] ?? 0,
  }));
  const stillCount = dist[4] ?? 0;

  return (
    <div>
      {/* 칩 스택 — 4구간, 하단 정렬(세로로 위로 쌓임) */}
      <div className="flex items-end justify-between gap-2">
        {buckets.map((b) => {
          const shown = Math.min(b.count, CAP);
          return (
            <div key={b.key} className="flex flex-1 flex-col items-center">
              {b.count > CAP && (
                <span className="mb-1 text-[10px] font-semibold" style={{ color: CHIP }}>
                  ×{b.count}
                </span>
              )}
              <div className="flex flex-col-reverse items-center gap-[3px]">
                {Array.from({ length: shown }).map((_, i) => (
                  <span
                    key={i}
                    className="h-[13px] w-full max-w-[48px] rounded-full"
                    style={{ backgroundColor: CHIP, minWidth: "32px" }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 시간 흐름 축 + 화살표 */}
      <div className="relative mt-2 mb-1 flex items-center">
        <span className="h-px flex-1 bg-[#CBD5E1]" />
        <span className="ml-0.5 text-[10px] text-[var(--text-muted)]" aria-hidden>
          →
        </span>
      </div>

      {/* 구간 라벨 + N명 */}
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

      {/* 효과 못 느낌 — 축 밖, 회색 작게 (평균 제외) */}
      {stillCount > 0 && (
        <p className="mt-2.5 text-[11px] text-[var(--text-muted)]">
          효과 못 느낌 · {stillCount}명
        </p>
      )}
    </div>
  );
}
