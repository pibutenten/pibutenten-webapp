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
import type { ProcedureSlug } from "@/lib/categories";
import { ReportsCategoryContext } from "./category-context";

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
  const [category, setCategory] = useState<ProcedureSlug | null>(null);

  const onCategory = (slug: ProcedureSlug) => {
    setCategory((c) => (c === slug ? null : slug));
    // 칩을 상세 페이지에서 누르면 허브로 이동 — 필터된 목록은 허브에서만 의미가 있다.
    if (pathname !== "/reports") router.push("/reports");
  };

  return (
    <ReportsCategoryContext.Provider value={category}>
      <AppShell
        active="리포트"
        sidebar={
          <ReportsIndexSidebar
            topProcedures={topProcedures}
            activeCategory={category}
            onCategory={onCategory}
          />
        }
        sidebarMobileBelow
        {...search}
      >
        {children}
      </AppShell>
    </ReportsCategoryContext.Provider>
  );
}
