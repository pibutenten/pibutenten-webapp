/**
 * DistBars — 가로 분포 막대 목록 (시술 리포트 공용, 작업 C-2).
 *
 * 기존 ProcedureReportCard 만족도 섹션의 인라인 막대 markup 을 그대로 추출.
 * 만족도(점수 5~1, 골드)·효과시점(4시점 블루 + 관찰중 회색) 양쪽이 재사용.
 * 시각 회귀 방지: 행 높이·간격·색·라벨/카운트 폭 클래스를 호출부가 지정하면 기존과 동일하게 렌더.
 */

export type DistRow = {
  key: string;
  /** 좌측 라벨(점수 숫자 또는 시점 라벨). */
  label: string;
  count: number;
  /** 채움 색 (CSS color 또는 var(...)). */
  color: string;
};

export default function DistBars({
  rows,
  max,
  labelClass = "w-5",
  countClass = "w-4",
}: {
  rows: DistRow[];
  /** 막대 길이 정규화 분모(최댓값). 0 방지 위해 호출부에서 Math.max(1, ...). */
  max: number;
  /** 좌측 라벨 폭 클래스 (만족도="w-5", 효과시점="w-16" 등). */
  labelClass?: string;
  /** 우측 카운트 폭 클래스. */
  countClass?: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-[3px]">
      {rows.map((r) => (
        <div
          key={r.key}
          className="flex items-center gap-2 text-[10.5px] text-[var(--text-muted)]"
        >
          <span className={`${labelClass} text-right`}>{r.label}</span>
          <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-[#EEF1F4]">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(r.count / max) * 100}%`, backgroundColor: r.color }}
            />
          </span>
          <span className={`${countClass} text-right`}>{r.count}</span>
        </div>
      ))}
    </div>
  );
}
