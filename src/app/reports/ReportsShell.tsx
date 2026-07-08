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

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import AppShell from "@/components/skin/AppShell";
import ReportsIndexSidebar, {
  type SidebarTopProcedure,
} from "@/components/report/ReportsIndexSidebar";
import { useSearchRouting } from "@/components/skin/ui";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import type { ProcedureSlug } from "@/lib/categories";
import { ReportsCategoryContext } from "./category-context";
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
  // 상세(/reports/[시술])에서만 저장·공유 버튼을 사이드바 푸터로 노출. 허브(/reports)는 제외.
  const isDetail = pathname !== "/reports" && pathname.startsWith("/reports/");

  const onCategory = (slug: ProcedureSlug) => {
    setCategory((c) => (c === slug ? null : slug));
    // 칩을 상세 페이지에서 누르면 허브로 이동 — 필터된 목록은 허브에서만 의미가 있다.
    if (pathname !== "/reports") router.push("/reports");
  };

  return (
    <ReportsCategoryContext.Provider value={category}>
      <AppShell
        active="리포트"
        /* 페이지별 캔버스 variant(Phase 0-4, 커밋 d8eea01) — /reports 계열 배경 #F5FBFF.
           sticky 정렬 칩·헤더·상태바 필러가 --tt-canvas 재정의를 자동 추종한다. */
        canvas="report"
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
            자식 sticky 정렬칩(ReportsIndexView)을 무력화한다(피드는 칩이 헤더라 무관). 훅이 당기는 중에만
            transform 을 동적으로 직접 설정하므로 GPU 합성은 그대로 일어난다. */}
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
    </ReportsCategoryContext.Provider>
  );
}
