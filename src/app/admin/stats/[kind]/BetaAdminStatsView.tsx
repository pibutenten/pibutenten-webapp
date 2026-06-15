"use client";

/**
 * BetaAdminStatsView — /admin/stats/[kind] 의 베타 스킨 셸 래퍼 (클라이언트).
 *
 * 원칙(Agent 5):
 *   - 상단바·배경만 BetaSkinShell 로 교체. 본문(제목 + StatsListClient TOP 리스트)은 운영 구조 유지.
 *   - 운영 클라 컴포넌트 StatsListClient 는 로직 변경 없이 import 해서 그대로 임베드.
 *   - 제목 영역 색/라운드 토큰만 베타 톤으로 (var(--text)→var(--ink-900), var(--primary)→var(--tt-blue-deep), var(--text-muted)→var(--ink-500)).
 *   - 데이터 fetch·가드는 server page.tsx 가 담당. import 절대경로(@/app/beta-skin/*), back="/admin".
 */

import BetaSkinShell from "@/components/skin/BetaSkinShell";
import { useBetaSearchRouting } from "@/components/skin/beta-ui";
import styles from "@/components/skin/beta-skin.module.css";
import StatsListClient, {
  type Kind,
  type VisitorRow,
  type CardRow,
  type NewMemberRow,
  type NewCardRow,
} from "./StatsListClient";

type StatsRow = VisitorRow | CardRow | NewMemberRow | NewCardRow;

type Props = {
  kind: Kind;
  title: string;
  useDoctorFilter: boolean;
  firstPage: StatsRow[];
  hasMore: boolean;
  days: number;
};

export default function BetaAdminStatsView({
  kind,
  title,
  useDoctorFilter,
  firstPage,
  hasMore,
  days,
}: Props) {
  const search = useBetaSearchRouting();

  return (
    <BetaSkinShell active="마이" wide back="/admin" {...search}>
      <div className={styles.mb20}>
        <h1 className={styles.profileName}>
          {title} TOP
          {useDoctorFilter && (
            <span
              style={{
                marginLeft: 8,
                verticalAlign: "middle",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--tt-blue-deep)",
              }}
            >
              내 글 한정
            </span>
          )}
        </h1>
        <p className={styles.muted} style={{ marginTop: 4, fontSize: 12 }}>
          기간별 TOP 리스트 — 클릭하면 해당 사용자/글로 이동합니다.
        </p>
      </div>

      <StatsListClient
        kind={kind}
        initial={firstPage}
        initialHasMore={hasMore}
        initialDays={days}
      />
    </BetaSkinShell>
  );
}
