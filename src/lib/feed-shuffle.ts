/**
 * 피드 다양화 헬퍼 — 같은 의사가 연속/과집중되어 나타나지 않도록 셔플.
 *
 * Phase 7-D (2026-05-16): page.tsx 와 search/page.tsx 가 거의 동일한 30줄 로직을
 * 별도로 보유하던 것을 단일 헬퍼로 통합.
 *
 * 알고리즘:
 *   1) headSize(기본 4) 안에서 같은 doctor.slug 가 maxPerDoctorInHead(기본 1) 이상 등장하지
 *      않도록 head/tail 분리. tail 은 원래 순서 유지.
 *   2) head + tail 합친 결과에서 같은 doctor.slug 가 3연속(직전 2개) 등장하지 않도록
 *      뒤쪽에서 다른 slug 카드를 끼워넣음 (가능할 때만).
 *
 * 둘 다 통과: 피드 상단이 다양하고, 같은 의사 3연속 노출 방지.
 *
 * 호출 측에서 doctor.slug 가 없는(`undefined`) 카드는 `_unknown` 으로 묶임.
 * (시술 리포트 앵커는 스코어 피드에서 제외됨(0217) — 노출은 Feed 의 결정적 주입이 담당.)
 */
import type { CardDataList } from "@/components/Card";

export type DiversifyOptions = {
  /** head 영역 안에서 의사 1명당 허용 등장 횟수 (기본 1) */
  maxPerDoctorInHead?: number;
  /** 다양화할 head 크기 (기본 4) */
  headSize?: number;
};

/**
 * cards 배열을 의사 다양성 기준으로 재정렬.
 * - 길이 ≤ headSize 면 원본 그대로 반환 (head 다양화 의미 없음).
 * - 길이 < 3 이면 3연속 방지 패스도 건너뜀.
 * - 입력 배열은 변경하지 않음. 새 배열 반환.
 */
export function diversifyByDoctor(
  cards: CardDataList[],
  opts: DiversifyOptions = {},
): CardDataList[] {
  const maxPerDoctorInHead = opts.maxPerDoctorInHead ?? 1;
  const headSize = opts.headSize ?? 4;

  let out = cards;

  // (1) 첫 N 카드 다양화
  if (out.length > headSize) {
    const counts = new Map<string, number>();
    const head: CardDataList[] = [];
    const tail: CardDataList[] = [];
    for (const it of out) {
      const slug = it.doctor?.slug ?? "_unknown";
      const c = counts.get(slug) ?? 0;
      if (head.length < headSize && c < maxPerDoctorInHead) {
        head.push(it);
        counts.set(slug, c + 1);
      } else {
        tail.push(it);
      }
    }
    out = [...head, ...tail];
  }

  // (2) 같은 의사 3연속 방지 — 2연속까지만 허용
  if (out.length >= 3) {
    const remaining = [...out];
    const reordered: CardDataList[] = [];
    while (remaining.length > 0) {
      const last = reordered[reordered.length - 1];
      const prev = reordered[reordered.length - 2];
      const lastTwoSameSlug =
        last !== undefined &&
        prev !== undefined &&
        last.doctor?.slug !== undefined &&
        last.doctor?.slug === prev.doctor?.slug;
      if (lastTwoSameSlug) {
        const idx = remaining.findIndex(
          (it) => it.doctor?.slug !== last.doctor?.slug,
        );
        if (idx >= 0) {
          reordered.push(remaining.splice(idx, 1)[0]);
          continue;
        }
      }
      reordered.push(remaining.shift() as CardDataList);
    }
    out = reordered;
  }

  return out;
}
