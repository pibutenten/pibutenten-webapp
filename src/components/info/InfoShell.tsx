"use client";

/**
 * InfoShell — 신뢰·법적·안내 페이지(/about·/terms·/privacy·/contact·/disclaimer·
 *   /editorial-policy·/medical-review·/corrections·/disclosures·/doctor-guidelines)
 *   본문을 신규 스킨(앱 셸)로 감싸는 공용 클라이언트 wrapper.
 *
 * 선례: src/app/doctor/DoctorDashboardView.tsx (server page = 메타·데이터 / client View = 셸+본문).
 *   이 페이지들은 정적/법적 텍스트라 데이터 fetch 가 없어, 각 server page 가 기존
 *   <InfoPageLayout>…</InfoPageLayout> 본문을 그대로 이 wrapper 의 children 으로 넘긴다.
 *   본문 텍스트·구조·링크·하단 InfoPageNav/InfoPageFooter 는 일절 손대지 않고(과한 재디자인 금지),
 *   상단바·캔버스만 앱 셸로 교체한다.
 *
 * 셸 설정(선례 admin/doctor 동일):
 *   - active="마이" — 미강조 톤(안내 페이지는 GNB 5탭 어디에도 속하지 않음. wide 모드라 하단 탭바 숨김).
 *   - wide — 운영 admin/doctor 와 같은 풀폭(1080px). 안내 페이지 본문도 풀폭 단일 칼럼이라 정합.
 *   - back={false} — InfoPageLayout 이 자체 BackButton(fallback "/")을 이미 렌더하므로 중복 방지.
 *     (셸의 back 을 켜면 BackButton 이 2개가 됨 → 본문 무수정 원칙상 셸 쪽을 끈다.)
 *   - 검색 제출은 운영 홈(/?q=)으로 라우팅(useSearchRouting, 운영 정합).
 *
 * 격리: app.module.css / GlobalChrome / layout.tsx / robots.ts 무수정.
 *   server page 의 generateMetadata·robots·canonical 은 그대로 보존(색인/noindex 구분 유지).
 */

import type { ReactNode } from "react";
import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";

export default function InfoShell({ children }: { children: ReactNode }) {
  const search = useSearchRouting();
  return (
    <AppShell active="마이" wide back={false} {...search}>
      {children}
    </AppShell>
  );
}
