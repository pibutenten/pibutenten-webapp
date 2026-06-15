"use client";

/**
 * WriteEditShell — 글 수정(/write/{shortcode}) 본문을 신규 스킨(베타 셸)로 감싸는 얇은 클라이언트 wrapper.
 *
 * 선례: src/components/info/InfoBetaShell.tsx (server page = 권한·데이터 / client wrapper = 셸+본문).
 *   수정 페이지(server)는 권한 검사·카드 조회 후 admin/일반 두 분기의 본문을 그대로 이 wrapper 의
 *   children 으로 넘긴다. Edit 클라이언트(AdminEditClient / UserEditClient)·props·BackButton 은 무수정.
 *
 * 셸 설정:
 *   - active="글쓰기" — 신규 글쓰기 화면(WriteView)과 동일한 강조 톤(GNB·탭바 '글쓰기' 활성).
 *   - 검색 제출은 운영 홈(/?q=)으로 라우팅(useBetaSearchRouting, WriteView 와 동일 정합).
 *   - back={false} — 수정 본문이 자체 BackButton 을 이미 렌더하므로 중복 방지(InfoBetaShell 선례).
 *     (셸의 back 을 켜면 '< 뒤로'가 2개가 됨 → 본문 무수정 원칙상 셸 쪽을 끈다.)
 *   - sidebar 미지정 — 수정 본문은 사이드 팁이 없는 단일 칼럼(운영 무수정). WriteView 와 달리 sidebar 없음.
 *   - wide 미지정 — WriteView 와 동일하게 좁은 중앙 정렬 유지(admin 풀폭 모드 아님).
 *
 * 격리: BetaSkinShell / GlobalChrome / write/layout.tsx(noindex) 무수정.
 */

import type { ReactNode } from "react";
import BetaSkinShell from "@/app/beta-skin/BetaSkinShell";
import { useBetaSearchRouting } from "@/app/beta-skin/beta-ui";

export default function WriteEditShell({ children }: { children: ReactNode }) {
  const search = useBetaSearchRouting();
  return (
    <BetaSkinShell active="글쓰기" back={false} {...search}>
      {children}
    </BetaSkinShell>
  );
}
