/**
 * /reports 공유 layout(서버) — 허브(/reports)와 시술 상세(/reports/[procedure])가 공유하는
 * 셸·사이드바 백본. 사이드바 '후기 많은 시술' 상위 7개를 요청 단위 캐시(getReportsPoolCached)에서
 * 파생해 클라이언트 ReportsShell 에 주입한다.
 *
 * force-dynamic: 풀 RPC 가 매 요청 집계(published 후기 실시간) 라 정적 캐시 부적합.
 */

import type { ReactNode } from "react";
import { getReportsPoolCached } from "./reports-pool";
import ReportsShell from "./ReportsShell";

export const dynamic = "force-dynamic";

export default async function ReportsLayout({ children }: { children: ReactNode }) {
  const pool = await getReportsPoolCached();
  const topProcedures = [...pool]
    .sort((a, b) => b.count - a.count)
    .slice(0, 7)
    .map((r) => ({ ko: r.procedureKo, count: r.count }));
  return <ReportsShell topProcedures={topProcedures}>{children}</ReportsShell>;
}
