"use client";

/**
 * ReportsNewView — /reports-new(시술 리포트 인덱스 개선판) 본문 (클라이언트).
 *
 * 원칙(ReportsHubView 선례): "상단바(헤더)만 앱 셸, 본문은 기능적 목록".
 *   데이터·메타·헤드라인 확정은 server page(page.tsx)가 책임. 여기선 표시·정렬·필터만.
 *
 * 좌측 메인:
 *   - 정렬 칩 레일(컴팩트 풀로 계산 가능한 것만): 후기 많은 순(기본)/다시 받고 싶은 순/
 *     만족도 높은 순/통증 적은 순. 다운타임·최신은 컴팩트 풀에 없어 제외.
 *   - 카테고리 필터(사이드바 칩과 연동).
 *   - 각 시술 = ReportsNewCard(자체 구현, 컴팩트 풀 값만 쓰는 요약 카드) + 서버 확정 headline.
 *     (공용 ProcedureReportCard 는 병렬 세션 소유라 import·의존하지 않는다.)
 *
 * 헤드라인은 서버 prop 그대로 표시(클라 재랜덤 금지 → SSR/CSR 일치, 하이드레이션 안전).
 *
 * 격리: app.module.css 클래스 의존 금지 — Tailwind 유틸 + globals.css 토큰만.
 */

import { useMemo, useState } from "react";
import type { ProcedureReport } from "@/lib/procedure-report";
import type { ProcedureSlug } from "@/lib/categories";
import ReportsNewCard from "./ReportsNewCard";
import ReportsIndexSidebar, {
  type SidebarTopProcedure,
} from "@/components/report/ReportsIndexSidebar";
import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";
import styles from "@/components/skin/app.module.css";

// 포커스 링 — globals.css 가 :focus-visible 만 살려두므로 키보드 포커스에서만 보임.
const FOCUS_RING =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-active)]";

type ReportItem = {
  report: ProcedureReport;
  headline: string;
  /** 서버 선집계 대표 효과 top3(즉시 표시·끊김 없음). */
  effects: { label: string; pct: number }[];
  /** 효과 발현 최다 시점 라벨(없으면 null). */
  onsetLabel: string | null;
};

type SortKey = "count" | "revisit" | "satisfaction" | "pain";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "count", label: "후기 많은 순" },
  { key: "revisit", label: "다시 받고 싶은 순" },
  { key: "satisfaction", label: "만족도 높은 순" },
  { key: "pain", label: "통증 적은 순" },
];

/** 재시술 의향 yes 비율(%) — 정렬용. 분모 0이면 0. */
function revisitYesPct(r: ProcedureReport): number {
  const total = r.revisit.yes + r.revisit.maybe + r.revisit.no;
  return total > 0 ? r.revisit.yes / total : 0;
}

export default function ReportsNewView({
  items,
  topProcedures,
}: {
  /** 서버 정렬(count desc) + 헤드라인 확정 목록. */
  items: ReportItem[];
  /** 사이드바 '후기 많은 시술' 상위. */
  topProcedures: SidebarTopProcedure[];
}) {
  const search = useSearchRouting();
  const [sort, setSort] = useState<SortKey>("count");
  const [category, setCategory] = useState<ProcedureSlug | null>(null);

  // 카테고리 칩 토글 — 같은 칩 재클릭 시 전체(null) 해제.
  const onCategory = (slug: ProcedureSlug) =>
    setCategory((cur) => (cur === slug ? null : slug));

  // 필터 + 정렬 — 서버 목록을 클라에서 재배열(헤드라인은 item 에 고정 동행).
  const visible = useMemo(() => {
    const filtered = category
      ? items.filter((it) => it.report.category === category)
      : items;
    const sorted = [...filtered].sort((a, b) => {
      const ra = a.report;
      const rb = b.report;
      switch (sort) {
        case "revisit": {
          const d = revisitYesPct(rb) - revisitYesPct(ra);
          return d !== 0 ? d : rb.count - ra.count;
        }
        case "satisfaction": {
          const d = rb.avgSatisfaction - ra.avgSatisfaction;
          return d !== 0 ? d : rb.count - ra.count;
        }
        case "pain": {
          // 통증 적은 순 — avgPain 오름차순. 평균이 0(미응답)인 시술은 뒤로.
          const pa = ra.avgPain || Infinity;
          const pb = rb.avgPain || Infinity;
          const d = pa - pb;
          return d !== 0 ? d : rb.count - ra.count;
        }
        case "count":
        default:
          return (
            rb.count - ra.count ||
            ra.procedureKo.localeCompare(rb.procedureKo, "ko")
          );
      }
    });
    return sorted;
  }, [items, sort, category]);

  const sidebar = (
    <ReportsIndexSidebar
      topProcedures={topProcedures}
      activeCategory={category}
      onCategory={onCategory}
    />
  );

  const chips = (
    <div role="group" aria-label="정렬" style={{ display: "contents" }}>
      {SORTS.map((s) => {
        const on = sort === s.key;
        return (
          <button
            type="button"
            key={s.key}
            onClick={() => setSort(s.key)}
            aria-pressed={on}
            className={
              styles.chip +
              (on ? " " + styles.chipActive : "") +
              " " +
              FOCUS_RING
            }
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <AppShell
      active="리포트"
      sidebar={sidebar}
      sidebarMobileBelow
      chips={chips}
      {...search}
    >
      {visible.length === 0 ? (
        <p className="px-1 py-8 text-center text-[14px] leading-[1.6] text-[var(--text-muted)]">
          {items.length === 0
            ? "아직 집계된 시술 리포트가 없어요."
            : "이 카테고리에는 아직 리포트가 없어요."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((it) => (
            <ReportsNewCard
              key={it.report.procedureKo}
              report={it.report}
              headline={it.headline}
              effects={it.effects}
              onsetLabel={it.onsetLabel}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}
