"use client";

/**
 * BetaAdminCardEditView — /admin/cards/[id]/edit "카드 편집" 셸 래퍼 (클라이언트).
 *
 * 원칙(승격·단일화): UI 는 베타 스킨 톤(BetaSkinShell), 편집 폼 로직·검증·저장 액션은
 *   운영 EditClient 를 그대로 재사용.
 *   - 서버(page.tsx)가 가드(auth·active identity·super/doctor admin 분기·본인 doctor 글 강제)·
 *     카드 fetch·type 분기 리다이렉트·admin extras fetch 로직을 담당해 EditClient props 를 그대로 내려준다.
 *   - 이 컴포넌트는 BetaSkinShell + useBetaSearchRouting 안에 운영 EditClient 를 그대로 임베드한다.
 *   - EditClient 가 폼·저장·슬러그·복구 흐름을 자체 처리하므로 로직 재구현 없이 그대로 사용.
 *
 * 격리: 운영 EditClient 무수정. 베타 셸만 입힌다. props 계약은 EditClient 의 것을 그대로 따른다
 *   (React.ComponentProps 로 단일 출처 — 타입 중복 정의 없음).
 */

import type { ComponentProps } from "react";
import EditClient from "./EditClient";
import BetaSkinShell from "@/app/beta-skin/BetaSkinShell";
import { useBetaSearchRouting } from "@/app/beta-skin/beta-ui";

export type BetaAdminCardEditViewProps = ComponentProps<typeof EditClient>;

export default function BetaAdminCardEditView(
  props: BetaAdminCardEditViewProps,
) {
  const search = useBetaSearchRouting();

  return (
    <BetaSkinShell active="마이" wide back="/admin/cards" {...search}>
      {/* 운영 EditClient 임베드 — 폼·저장·슬러그·복구 흐름 자체 처리.
          운영 admin/cards/[id]/edit/page 와 동일 props 계약(서버에서 그대로 전달). */}
      <EditClient {...props} />
    </BetaSkinShell>
  );
}
