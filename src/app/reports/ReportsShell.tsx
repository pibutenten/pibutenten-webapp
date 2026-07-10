"use client";

/**
 * ReportsShell — /reports 공유 layout 의 클라이언트 백본.
 *
 * 역할:
 *   - AppShell(active="리포트") 로 글로벌 크롬 + 우측 사이드바 슬롯을 채운다.
 *   - 사이드바 카테고리 칩의 선택 상태(category)를 보유하고, ReportsCategoryContext 로 자식에게 내려준다.
 *   - 칩 클릭(onCategory): 같은 칩 재클릭 시 해제(전체), 그리고 허브(/reports) 가 아닌 상세 페이지에서
 *     칩을 누르면 허브로 이동시켜 필터 결과를 보여준다.
 *   - 헤더 검색은 useSearchRouting()(엔터 시 /?q= 라우팅)을 그대로 위임.
 *
 * sidebarMobileBelow: 모바일에서 사이드바를 숨기지 않고 본문 아래로 노출(리포트 사이드 박스는 모바일에서도 유용).
 */

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import AppShell from "@/components/skin/AppShell";
import ReportsIndexSidebar, {
  type SidebarTopProcedure,
} from "@/components/report/ReportsIndexSidebar";
import { useSearchRouting } from "@/components/skin/ui";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import type { ProcedureSlug } from "@/lib/categories";
import {
  ReportsCategoryContext,
  ReportsSortContext,
  SORTS,
  type SortKey,
} from "./category-context";
import ReportShareButtons from "./ReportShareButtons";

export default function ReportsShell({
  topProcedures,
  children,
}: {
  topProcedures: SidebarTopProcedure[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchRouting();
  const { containerRef: ptrRef, indicatorRef: ptrIndicatorRef, refreshing: ptrRefreshing } = usePullToRefresh(
    async () => {
      router.refresh();
      await new Promise((r) => setTimeout(r, 800));
    }
  );
  const [category, setCategory] = useState<ProcedureSlug | null>(null);
  // 허브 정렬 상태 — 셸이 소유해 헤더 칩바 슬롯(AppShell chips)에 칩을 렌더(피드처럼 헤더와 한
  //   덩어리로 함께 이동). 허브 본문(ReportsIndexView)은 ReportsSortContext 로 sort 를 구독하고,
  //   뒤로가기 스냅샷 복원 시 setSort 로 되돌린다. 상세의 '후기 정렬'은 별개(자체 소유).
  const [sort, setSort] = useState<SortKey>("recent");
  // 컨텍스트 value 는 useMemo — sort 변경 시에만 새 객체(불필요한 소비자 리렌더 방지). setSort 는 안정.
  const sortCtx = useMemo(() => ({ sort, setSort }), [sort]);
  // 상세(/reports/[시술])에서만 저장·공유 버튼을 사이드바 푸터로 노출. 허브(/reports)는 제외.
  const isDetail = pathname !== "/reports" && pathname.startsWith("/reports/");

  const onCategory = (slug: ProcedureSlug) => {
    setCategory((c) => (c === slug ? null : slug));
    // 칩을 상세 페이지에서 누르면 허브로 이동 — 필터된 목록은 허브에서만 의미가 있다.
    if (pathname !== "/reports") router.push("/reports");
  };

  return (
    <ReportsCategoryContext.Provider value={category}>
      <ReportsSortContext.Provider value={sortCtx}>
      <AppShell
        active="리포트"
        /* 페이지별 캔버스 variant(Phase 0-4, 커밋 d8eea01) — /reports 계열 배경 #F5FBFF.
           sticky 정렬 칩·헤더·상태바 필러가 --tt-canvas 재정의를 자동 추종한다. */
        canvas="report"
        /* 허브 정렬 칩(2026-07-09) — 헤더 칩바 슬롯에 렌더해 피드처럼 헤더와 한 덩어리(.topStack)로
           붙여 함께 이동/숨김. 피드와 동일하게 버튼 배열을 그대로 넘긴다(AppShell 이 .chipRow 로 감쌈 —
           group 래퍼 없이 버튼별 aria-pressed 로 상태 전달). 상세는 후기 정렬이 후기 섹션 소속이라 미노출. */
        chips={
          isDetail
            ? undefined
            : SORTS.map((s) => {
                const on = sort === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSort(s.key)}
                    aria-pressed={on}
                    className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors"
                    style={
                      on
                        ? { backgroundColor: "var(--accent-blue)", color: "#fff" }
                        : { backgroundColor: "#fff", color: "#5A646C" }
                    }
                  >
                    {s.label}
                  </button>
                );
              })
        }
        /* 2뎁스 헤더 variant(R2-2) — 상세(/reports/[시술])에서만 모바일 헤더 좌측 로고 자리에
           뒤로가기(직접 진입 fallback=/reports 허브). 허브(/reports)는 1뎁스라 현행 로고 유지. */
        backHeader={isDetail ? { fallbackHref: "/reports" } : undefined}
        sidebar={
          <ReportsIndexSidebar
            topProcedures={topProcedures}
            activeCategory={category}
            onCategory={onCategory}
            footer={isDetail ? <ReportShareButtons /> : undefined}
          />
        }
        sidebarMobileBelow
        {...search}
      >
        {/* PTR 래퍼 — willChange:transform 생략: 상시 적용 시 stacking context/containing block 이 되어
            자식 sticky 요소(상세의 '후기 헤더+정렬칩' 블록)를 무력화한다. 훅이 당기는 중에만 transform 을
            동적으로 직접 설정하므로 GPU 합성은 그대로 일어난다.
            (허브 정렬칩은 2026-07-09 부터 셸 헤더 칩바 슬롯으로 이전 — 본문 sticky 아님, 피드와 동일.) */}
        <div ref={ptrRef} className="relative">
          {/* PTR 인디케이터 — 바깥 div: 훅이 transform으로 갭 중앙 배치, 안쪽 div: 새로고침 중 spin */}
          <div ref={ptrIndicatorRef}
            className="absolute top-0 left-1/2 pointer-events-none z-10"
            style={{ opacity: 0 }}>
            <div className={`w-6 h-6 border-2 border-gray-300 border-t-[var(--primary)] rounded-full ${ptrRefreshing ? "animate-spin" : ""}`} />
          </div>
          {children}
        </div>
      </AppShell>
      </ReportsSortContext.Provider>
    </ReportsCategoryContext.Provider>
  );
}
