/**
 * 시술노트 경과 단계 로직 (SSOT) — 내 노트 히어로 문구 + 타임라인 배지 공용.
 *
 * 마지막 시술명+방문일로 5단계 자동 판정(Figma 시안 상태머신).
 * 시술 5종(보톡스·스킨부스터·리프팅·써마지·스컬트라) + fallback.
 * 의학 파라미터는 보수적 기본값 — 추후 원장 검수 표로 교체 가능.
 */

export type ProcParams = { downtimeDays: number; onsetDays: number; cycleDays: number | null };

const PROC_PARAMS: { key: string; p: ProcParams }[] = [
  { key: "보톡스", p: { downtimeDays: 3, onsetDays: 7, cycleDays: 105 } },
  { key: "스킨부스터", p: { downtimeDays: 3, onsetDays: 28, cycleDays: 84 } },
  { key: "리프팅", p: { downtimeDays: 7, onsetDays: 56, cycleDays: 365 } },
  { key: "써마지", p: { downtimeDays: 7, onsetDays: 42, cycleDays: 365 } },
  { key: "스컬트라", p: { downtimeDays: 7, onsetDays: 42, cycleDays: 365 } },
];
const FALLBACK_PARAMS: ProcParams = { downtimeDays: 7, onsetDays: 28, cycleDays: null };

export function paramsFor(name: string): ProcParams {
  const hit = PROC_PARAMS.find((x) => name.includes(x.key));
  return hit ? hit.p : FALLBACK_PARAMS;
}

/** 방문일("YYYY-MM-DD") 로부터 경과 일수(0 이상). */
export function elapsedDays(visitedOn: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(`${visitedOn}T00:00:00`).getTime()) / 86_400_000),
  );
}

/** 14일 미만이면 'N일차', 이상이면 'N주차'. */
export function periodLabel(days: number): string {
  return days < 14 ? `${days}일차` : `${Math.floor(days / 7)}주차`;
}

export type DiaryLatest = { name: string; visitedOn: string; count: number };

export type DiaryStatus = {
  state: 1 | 2 | 3 | 4 | 5;
  /** 히어로 큰 제목. */
  headline: string;
  /** 히어로 보조 문구. */
  sub: string;
  /** true 면 '오늘 기록' 유도(CTA 강조). */
  tappable: boolean;
};

/** 내 노트 히어로 — 마지막 시술 기준 5단계 인사/상태 문구. */
export function computeStatus(latest: DiaryLatest | null): DiaryStatus {
  if (!latest) {
    return {
      state: 4,
      headline: "나만의 피부 기록,\n오늘부터 쌓아볼까요?",
      sub: "시술·회복·변화를 기록하면 다음 선택이 쉬워져요",
      tappable: true,
    };
  }
  const p = paramsFor(latest.name);
  const e = elapsedDays(latest.visitedOn);
  const nth = latest.count > 1 ? `${latest.count}회차` : "";
  const head = nth ? `${latest.name} ${nth}` : latest.name;

  if (e <= p.downtimeDays)
    return {
      state: 1,
      headline: `${head},\n회복은 잘 되고 있나요?`,
      sub: `마지막 기록 후 ${periodLabel(e)} — 오늘 경과를 남겨보세요`,
      tappable: true,
    };
  if (e <= p.onsetDays)
    return {
      state: 2,
      headline: `${head},\n꾸준히 잘 쌓이고 있어요`,
      sub: `마지막 기록 후 ${periodLabel(e)} — 슬슬 효과가 나타날 시기예요`,
      tappable: false,
    };
  if (p.cycleDays === null || e <= p.cycleDays)
    return {
      state: 3,
      headline: `${head},\n효과가 잘 유지되고 있어요`,
      sub: `마지막 기록 후 ${periodLabel(e)} — 효과가 잘 유지되는 시기예요`,
      tappable: false,
    };
  return {
    state: 5,
    headline: "오랜만이에요!\n피부는 요즘 어떠세요?",
    sub: "자외선이 강해지는 계절이에요 ☀️ 가볍게 한 줄 남겨볼까요?",
    tappable: false,
  };
}

export type RecordBadge = { label: string; tone: "mint" | "heal" };

/** 타임라인 카드 배지 — 그 시술의 경과로 '회복 완료/효과 관찰 중/회복 중' 판정. */
export function recordBadge(name: string, visitedOn: string): RecordBadge {
  const p = paramsFor(name);
  const e = elapsedDays(visitedOn);
  if (e <= p.downtimeDays) return { label: "회복 중", tone: "heal" };
  if (e <= p.onsetDays) return { label: "효과 관찰 중", tone: "heal" };
  return { label: "회복 완료", tone: "mint" };
}
