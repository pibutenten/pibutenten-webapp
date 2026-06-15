"use client";

/**
 * BetaAdminUserDetailView — /admin/users/[id] 회원 상세 베타 셸 래퍼 (클라이언트).
 *
 * 원칙(베타 스킨 통일): 상단바·배경만 BetaSkinShell(베타 톤)로 덮고, 본문 큰 틀
 *   (ID 스위처·헤더 카드·통계·원장 명함 신설 폼·작성글/댓글/좋아요 섹션)은
 *   서버(page.tsx)가 만든 JSX 를 children 으로 그대로 받는다.
 *   - 데이터 fetch·가드(getIdentityContext)·active identity 분기·매핑은 서버 page.tsx 에 남아 있다(운영 로직 무수정).
 *   - 이 컴포넌트는 BetaSkinShell 로 감싸는 셸 역할만 한다.
 *
 * 격리: 운영 /beta-skin/admin 템플릿과 달리 ABSOLUTE import + 링크는 /admin/* 로 통일.
 *   BetaSkinShell wide 모드(1080px, 하단 탭바 숨김) 사용 — admin 전폭.
 */

import type { ReactNode } from "react";
import BetaSkinShell from "@/app/beta-skin/BetaSkinShell";
import { useBetaSearchRouting } from "@/app/beta-skin/beta-ui";

export default function BetaAdminUserDetailView({
  children,
}: {
  children: ReactNode;
}) {
  const search = useBetaSearchRouting();
  return (
    <BetaSkinShell active="마이" wide back="/admin/users" {...search}>
      {children}
    </BetaSkinShell>
  );
}
