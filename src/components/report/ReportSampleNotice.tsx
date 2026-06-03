/**
 * ReportSampleNotice — 시술 리포트 표본 수가 적을 때(<10) 카드 **바로 위**에 띄우는 안내 한 줄.
 *
 * 문구는 구간(1~3 / 4~9)별 3개 중 시술명 해시로 고정 선택(같은 시술은 항상 같은 문구).
 * count >= 10 이면 아무것도 렌더하지 않는다. (서버 컴포넌트 — 훅 없음)
 */

const WARN_1_3 = [
  "아직 후기가 {n}개뿐이에요. 한두 분의 경험이라 일반적인 결과로 보긴 일러요.",
  "후기 {n}개로 만든 초기 집계예요. 더 쌓이면 숫자가 크게 달라질 수 있어요.",
  "표본이 {n}개로 매우 적어, 참고만 해주세요.",
];
const WARN_4_9 = [
  "후기 {n}개를 모은 결과예요. 표본이 적어 아직은 참고용으로 봐주세요.",
  "아직 후기 {n}개 기준이라, 더 쌓이면 결과가 달라질 수 있어요.",
  "{n}명의 경험을 모았어요. 경향성 정도로 가볍게 참고해주세요.",
];

function hashIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i)) % mod;
  return h;
}

export default function ReportSampleNotice({
  count,
  procedureKo,
}: {
  count: number;
  procedureKo: string;
}) {
  if (count >= 10) return null;
  const pool = count <= 3 ? WARN_1_3 : WARN_4_9;
  const text = pool[hashIndex(procedureKo, pool.length)].replace(
    "{n}",
    String(count),
  );
  return (
    <p className="mb-2 px-1 text-[11.5px] leading-[1.45] text-[var(--text-muted)]">
      {text}
    </p>
  );
}
