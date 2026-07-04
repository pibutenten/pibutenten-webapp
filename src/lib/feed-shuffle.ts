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
 *
 * blendQaQuota (2026-07-04): 전체 피드 Q&A 슬롯 최소 보장.
 *   시술후기 대량 유입 시 점수 상위 풀이 후기로 도배돼 전문의 Q&A 가 소멸하는 문제 방지 —
 *   원장 확정 2026-07-04 "매 20장 중 Q&A 6장 이상". 인스타식 피드 섞기 = 슬롯 최소 보장 방식.
 *   DB 가중치 튜닝(0327 qa x3)은 데이터 나이·물량에 따라 무너질 수 있어 이 슬롯 보장과 부보완 관계.
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

export type QaBlendOptions = {
  /** windowSize 창 하나당 보장할 Q&A 최소 장수 (기본 6) */
  minPerWindow?: number;
  /** 슬롯 창 크기 (기본 20) */
  windowSize?: number;
};

/**
 * 전체 피드 풀에 "매 windowSize 장 중 Q&A 최소 minPerWindow 장" 슬롯을 보장하는 결정적 blend.
 * (랜덤 없음 — 같은 입력이면 항상 같은 출력. unstable_cache 풀·orderedIds 안정성 전제.)
 *
 * - organic = base 순서 그대로(Q&A 포함 — 걸러내지 않음), qaQueue = qaPool 순서 그대로.
 * - 슬롯을 0부터 걸으며 창 안 균등 페이싱: expected = ceil((posInWindow+1) * min / window).
 *   창 안에서 Q&A 가 뒤로 몰리지 않도록 슬롯마다 기대 누적치를 채운다.
 * - organic 이 자연 공급한 Q&A 도 창 카운트에 산입 — "최소 6장" 의미. 자연 점수로 이미
 *   충분하면 강제 삽입하지 않는다.
 * - 이미 출력된 id 는 양쪽 스트림에서 스킵(dedup). 한쪽 고갈 시 다른 쪽 폴백, 양쪽 고갈 시 종료.
 * - 출력 길이는 base.length 유지(초과 삽입 없음 — Q&A 삽입분만큼 base 꼬리가 밀려 잘림).
 * - 입력 배열은 변경하지 않음. 새 배열 반환.
 */
export function blendQaQuota(
  base: CardDataList[],
  qaPool: CardDataList[],
  opts: QaBlendOptions = {},
): CardDataList[] {
  const minPerWindow = opts.minPerWindow ?? 6;
  const windowSize = opts.windowSize ?? 20;
  const targetLen = base.length;
  if (targetLen === 0) return []; // 빈 풀(조회 실패 등) — blend 할 대상 없음(검수 반영 명시화)

  // FeedView matchesChip 과 동일 판정 규칙 (category 우선, 없으면 type).
  const isQa = (c: CardDataList) => (c.category ?? c.type) === "qa";

  const used = new Set<number>();
  const out: CardDataList[] = [];
  let organicIdx = 0;
  let qaIdx = 0;

  // 각 스트림의 "다음 미사용 카드" — 이미 출력된 id 는 인덱스만 전진시켜 스킵.
  //   (소비는 used.add 로 표시 — 다음 peek 에서 자동으로 건너뜀.)
  const peekOrganic = (): CardDataList | null => {
    while (organicIdx < base.length && used.has(base[organicIdx].id)) organicIdx++;
    return organicIdx < base.length ? base[organicIdx] : null;
  };
  const peekQa = (): CardDataList | null => {
    while (qaIdx < qaPool.length && used.has(qaPool[qaIdx].id)) qaIdx++;
    return qaIdx < qaPool.length ? qaPool[qaIdx] : null;
  };

  let qaInWindow = 0;
  for (let slot = 0; out.length < targetLen; slot++) {
    const posInWindow = slot % windowSize;
    if (posInWindow === 0) qaInWindow = 0; // 새 창 시작 — 카운트 리셋

    // 창 안 균등 페이싱 목표 누적치 (예: 6/20 이면 슬롯 0~2 에 1장, 3~5 에 2장 …).
    const expected = Math.ceil(((posInWindow + 1) * minPerWindow) / windowSize);

    const nextQa = peekQa();
    const nextOrganic = peekOrganic();
    const pick =
      qaInWindow < expected
        ? // 할당량 미달 — 단, organic 다음 카드가 이미 Q&A 면 자연 공급 우선(강제 삽입 안 함 —
          //   안 그러면 매 창 첫 슬롯(expected=1)마다 qaQueue 를 무조건 꽂아 Q&A 풍부한 피드도 재배열됨).
          //   organic 다음이 Q&A 가 아닐 때만 qaQueue 에서 꽂음(고갈 시 organic 폴백).
          nextOrganic && isQa(nextOrganic)
          ? nextOrganic
          : (nextQa ?? nextOrganic)
        : (nextOrganic ?? nextQa); // 할당량 충족 — organic 우선, 고갈 시 Q&A 폴백
    if (!pick) break; // 양쪽 모두 고갈

    used.add(pick.id);
    if (isQa(pick)) qaInWindow++; // organic 자연 공급 Q&A 도 산입
    out.push(pick);
  }

  return out;
}
