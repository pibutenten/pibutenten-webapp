/**
 * 시술 리포트 회전 헤드라인 풀 엔진 (순수함수, 서버·클라 공용).
 *
 * 계획서(전달용/시술리포트_리디자인_헤드라인엔진_계획서.md) §5.3~§5.6 의 결정적(코드) 엔진을
 * TypeScript 로 이식한 것. LLM 생성이 아니라 집계값 → 규칙 분기로 "그 시술 데이터로 참인 문장"
 * 들의 배열(풀)을 만들고, 렌더 시 1개를 골라(매 방문 랜덤) 카드 한 줄에 표시한다.
 *
 * ── 가드(불변 원칙, §5.2) — 절대 준수 ──
 *  1. 출처 = 경험자 후기 집계로 읽히게(주어=경험자/받아본 분/해보신 분). "후기" 단어 최소화.
 *  2. 시술·병원의 효과 단정/의료인 주장 금지 — 효과는 "~효과를 봤다는 분이 많아요" 후기 진술로만.
 *  3. 만족도 4.x 를 "낮다/아쉽다"로 표현 금지(베타 데이터는 전부 긍정 범위). 등급만 부드럽게.
 *  4. n<4 저표본은 단정 금지 → "아직 적다/경험이 더 모여야 안다" 유형만(인덱스 게이트 N≥4 정합).
 *  5. 통증·다운타임·효과시점은 절대값(시술 고유 속성). 만족도만 임계값 보정.
 *
 * 문구는 계획서 §5.5 문자열을 글자 그대로 사용한다(드리프트 금지).
 */
import type { ProcedureReport } from "@/lib/procedure-report";
import { DOWNTIME_DAYS } from "@/lib/review-options";

/** 집계 → 시그널(§5.3). dtAvg 는 다운타임 응답 없으면 null. */
export type HeadlineSignals = {
  /** 발행 후기 수 */
  n: number;
  /** 만족도 평균(1~5) */
  sat: number;
  /** 통증 평균(1~5) */
  pain: number;
  /** 재시술 의향 yes 비율(%) */
  yesPct: number;
  /** 다운타임 평균(일). 응답 0이면 null → 다운타임 문장 생략 */
  dtAvg: number | null;
  /** 다운타임 응답수 */
  dtAns: number;
  /** 효과시점 0~3 구간 최다 인덱스(still_watching 제외) */
  oi: number;
  /** 효과시점 0~3 구간 합. 0이면 효과시점 문장 생략 */
  onSum: number;
  /** 최다 효과 라벨. 없으면 null */
  e1: string | null;
  /** 최다 효과 점유율(%) */
  e1s: number;
  /** 2위 효과 라벨. 없으면 null */
  e2: string | null;
  /** 2위 효과 점유율(%) */
  e2s: number;
};

/* ── 한글 조사 헬퍼(§5.4) — 계획서 그대로 ── */
function jong(w: string): boolean {
  const c = w.charCodeAt(w.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false;
}
const ineun = (w: string): string => w + (jong(w) ? "이에요" : "예요"); // 명사 서술
const NATIVE: Record<number, string> = { 6: "여섯", 7: "일곱", 8: "여덟", 9: "아홉" };

/**
 * 풀 생성 규칙(§5.5) — 계획서 코드를 그대로 이식.
 *   d = §5.3 시그널. 반환 = 그 시술 데이터로 참인 고유 문장 배열.
 */
export function buildHeadlinePool(s: HeadlineSignals): string[] {
  const P: string[] = [];
  const add = (str: string | null | undefined): void => {
    if (str && !P.includes(str)) P.push(str);
  };
  const d = s;
  const e = d.e1;
  const x = d.sat.toFixed(1);
  // dtAvg 가 null 이면(응답 0) 절대 다운타임 문장 분기로 안 들어가지만, 산술 NaN 방지로 0 사용.
  const dtAvg = d.dtAvg ?? 0;

  // ── n<4: 표본 적음 안내(여러 유형, 단정·비율% 제외) ──
  //   인덱스 게이트(FEED_MIN_REVIEWS=4)와 임계 일치 → n=4 는 본문 차트와 같은 톤(저표본 분기 제외).
  //   report-copy SSOT 정합 — 모집단은 '후기'가 아니라 '경험'/건수로 서술(experienceCount 규약).
  //   계획서 §5.5 의 "후기가 N건뿐이에요" 문구는 본 작업 지시로 '경험' 표현으로 교체.
  if (d.n < 4) {
    add(`아직 ${d.n}건의 경험만 모였어요. 조금 더 쌓이면 보여드릴게요.`);
    add(`${d.n}건으로는 아직 판단하기 일러요.`);
    add(`이제 막 경험이 쌓이기 시작한 시술이에요. (${d.n}건)`);
    add(`경험이 더 모여야 또렷해질 것 같아요. (${d.n}건)`);
    if (e) add(`지금까지는 ${e} 효과 이야기가 있었어요. (${d.n}건)`);
    return P;
  }

  // 1) 효과
  if (e) {
    add(`경험자들이 가장 많이 꼽은 효과는 ${ineun(e)}.`);
    add(`${e} 효과를 봤다는 분이 가장 많아요.`);
    if (d.e1s >= 60) {
      const k = Math.round(d.e1s / 10);
      add(
        k >= 10
          ? `해보신 분 거의 모두가 ${e} 효과를 이야기해요.`
          : `열에 ${NATIVE[k] || k}은 ${e} 효과를 이야기해요.`,
      );
    }
    if (d.e2 && d.e2s >= 30) add(`${e}·${d.e2} 효과를 함께 본 분도 많아요.`);
  }
  // 2) 만족도 (4.x '낮다' 금지)
  if (d.sat >= 4.7) add(`만족도는 ${x}점으로 아주 높아요.`);
  else if (d.sat >= 4.3) add(`만족도 ${x}점으로 좋은 편이에요.`);
  else if (d.sat >= 4.0) add(`만족도 ${x}점, 대체로 만족했어요.`);
  else if (d.sat >= 3.5) add(`만족도 ${x}점, 만족과 아쉬움이 갈렸어요.`);
  else add(`만족도 ${x}점, 호불호가 갈렸어요.`);
  // 3) 재시술
  if (d.yesPct >= 90) add(`받아본 분 ${d.yesPct}%가 다시 받고 싶어 해요.`);
  else if (d.yesPct >= 70) add(`${d.yesPct}%가 다시 받고 싶다고 답했어요.`);
  else if (d.yesPct >= 50) add(`다시 받겠다는 분은 ${d.yesPct}%로 갈렸어요.`);
  else add(`다시 받겠다는 분은 ${d.yesPct}%였어요.`);
  // 4) 통증 (절대값)
  if (d.pain < 2.0) add(`통증은 거의 없었다는 분이 많아요.`);
  else if (d.pain < 3.0) add(`살짝 따끔한 정도였다고 해요.`);
  else if (d.pain < 3.6) add(`통증은 참을 만했다는 평이 많아요.`);
  else if (d.pain < 4.4) add(`통증은 센 편이었다는 분이 많아요.`);
  else add(`꽤 아팠다는 분이 많아요.`);
  // 5) 다운타임 (절대값, 응답 있을 때만)
  if (d.dtAns > 0) {
    if (dtAvg < 0.5) add(`다운타임 없이 바로 일상으로 돌아갔어요.`);
    else if (dtAvg < 1.5) add(`다운타임이 짧았다는 분이 많아요.`);
    else if (dtAvg < 3) add(`다운타임은 2~3일이었다고 해요.`);
    else if (dtAvg < 5) add(`다운타임은 3~5일 정도였어요.`);
    else if (dtAvg < 11) add(`회복에 일주일 안팎 걸렸다는 분이 많아요.`);
    else add(`회복에 2주 이상 걸렸다는 분도 있어요.`);
  }
  // 6) 효과시점 (응답 있을 때만)
  if (d.onSum > 0) {
    if (d.oi === 0) add(`시술 직후부터 효과를 느꼈다는 분이 많아요.`);
    else if (d.oi === 1) add(`1~2주 안에 효과를 느꼈다고 해요.`);
    else if (d.oi === 2) add(`한 달쯤부터 효과를 느꼈다는 분이 많아요.`);
    else add(`두세 달에 걸쳐 천천히 느꼈다고 해요.`);
  }
  // 7) 조합형 (두 조건 모두 참)
  if (e) {
    if (d.pain >= 3.6 && d.yesPct >= 75) add(`아파도 다시 받고 싶다는 분이 많아요.`);
    if (d.pain < 2.2 && d.dtAns > 0 && dtAvg < 1.0)
      add(`통증도 다운타임도 부담이 적었다고 해요.`);
    if (d.onSum > 0 && d.oi >= 2 && d.yesPct >= 85)
      add(`천천히 와도 만족했다는 분이 많아요.`);
    if (d.dtAns > 0 && dtAvg >= 5 && d.yesPct >= 75)
      add(`회복은 필요해도 다시 받았다는 분이 많아요.`);
    if (d.e1s >= 85) add(`${e} 효과를 봤다는 분이 유독 많아요.`);
    if (d.yesPct >= 98 && d.sat >= 4.7) add(`만족도도 재시술 의향도 최상위예요.`);
    if (d.dtAns > 0 && dtAvg < 1.0 && d.yesPct >= 90)
      add(`부담 없이 다시 찾는다는 분이 많아요.`);
  }
  // 8) 결합형 (두 지표를 한 문장에 — 자연스럽고 풍부하게)
  if (e) {
    if (d.sat >= 4.0 && d.e1s >= 50) add(`만족도 ${x}점에, 주로 ${e} 효과를 본다고 해요.`);
    if (d.onSum > 0 && d.e1s >= 40) {
      const w = ["시술 직후에", "1~2주쯤", "한 달쯤", "두세 달쯤"][d.oi];
      add(`${e} 효과는 ${w} 느꼈다는 분이 많아요.`);
    }
    if (d.dtAns > 0 && dtAvg < 1.5 && d.e1s >= 40)
      add(`${e} 효과를 보면서 다운타임도 짧았다는 분이 많아요.`);
    if (d.yesPct >= 80 && d.e1s >= 40) add(`${e} 효과를 보고 다시 찾는다는 분이 많아요.`);
    if (d.pain < 2.5 && d.yesPct >= 80)
      add(`통증 부담은 적고, 다시 받고 싶다는 분이 많아요.`);
  }
  return P;
}

/**
 * 집계(ProcedureReport) → 시그널(§5.3·§5.7).
 *   분포 배열에서 sat/pain/yesPct/dtAvg/oi/onSum 을 직접 계산.
 *
 *   대표 효과(e1/e2)는 기본적으로 report.effects[0]/[1] 에서 읽는다(§5.7 SSOT — getProcedureReport
 *   단독 경로). 다만 컴팩트 풀(getReviewSummaryFeedPool)은 effects 가 비어 있어 report 만으로는
 *   알 수 없으므로, 호출부가 family 합산 효과를 topEffect/topEffect2 로 주입하면 그 값으로 덮어쓴다
 *   (override 우선). 둘 다 없으면 e1/e2=null, e1s/e2s=0 → 효과 분기 자동 생략.
 */
export function toSignals(
  report: ProcedureReport,
  topEffect?: { label: string; pct: number } | null,
  topEffect2?: { label: string; pct: number } | null,
): HeadlineSignals {
  // 만족도 — 분포(satisfactionDist, index0=1점)에서 가중평균.
  let satSum = 0;
  let satN = 0;
  for (let i = 0; i < report.satisfactionDist.length; i++) {
    const c = report.satisfactionDist[i] ?? 0;
    satSum += c * (i + 1);
    satN += c;
  }
  const sat = satN > 0 ? satSum / satN : report.avgSatisfaction || 0;

  // 통증 — painDist 가 채워져 있으면 그것으로, 비었으면 report.avgPain(컴팩트 풀) 사용.
  let painSum = 0;
  let painN = 0;
  for (let i = 0; i < report.painDist.length; i++) {
    const c = report.painDist[i] ?? 0;
    painSum += c * (i + 1);
    painN += c;
  }
  const pain = painN > 0 ? painSum / painN : report.avgPain || 0;

  // 재시술 의향 — yes/(yes+maybe+no).
  const rTotal = report.revisit.yes + report.revisit.maybe + report.revisit.no;
  const yesPct = rTotal > 0 ? Math.round((report.revisit.yes / rTotal) * 100) : 0;

  // 다운타임 — 평균 일수(DOWNTIME_DAYS 코딩). 응답 0이면 null(다운타임 문장 생략).
  const dtAns = report.downtimeAnswered;
  const dtAvg =
    dtAns > 0
      ? report.downtimeDist.reduce(
          (acc, c, i) => acc + c * (DOWNTIME_DAYS[i] ?? 0),
          0,
        ) / dtAns
      : null;

  // 효과시점 — 0~3 구간 최다 인덱스(still_watching=index4 제외) + 0~3 합.
  const onSum = report.onsetDist.slice(0, 4).reduce((a, b) => a + b, 0);
  const oi = [0, 1, 2, 3].reduce(
    (best, i) => ((report.onsetDist[i] ?? 0) > (report.onsetDist[best] ?? 0) ? i : best),
    0,
  );

  // 대표 효과 — override(컴팩트 풀 family 합산) 우선, 없으면 report.effects[0]/[1](§5.7 기본 SSOT).
  const eff1 = topEffect ?? report.effects[0] ?? null;
  const eff2 = topEffect2 ?? report.effects[1] ?? null;

  return {
    n: report.count,
    sat,
    pain,
    yesPct,
    dtAvg,
    dtAns,
    oi,
    onSum,
    e1: eff1?.label ?? null,
    e1s: eff1?.pct ?? 0,
    e2: eff2?.label ?? null,
    e2s: eff2?.pct ?? 0,
  };
}

/**
 * 회전(§5.6) — 풀에서 1개 선택. seed 없으면 Math.random(서버에서 요청마다 1회 호출 → 매 방문 변경).
 *   seed 를 주면 결정적 선택(테스트·SSR 재현용).
 */
export function pickHeadline(pool: string[], seed?: number): string {
  if (pool.length === 0) return "";
  const r = seed === undefined ? Math.random() : seed;
  const idx = Math.min(pool.length - 1, Math.max(0, Math.floor(r * pool.length)));
  return pool[idx] ?? "";
}
