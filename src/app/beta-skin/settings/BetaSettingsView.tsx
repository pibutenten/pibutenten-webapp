"use client";

/**
 * BetaSettingsView — /beta-skin/settings 본문 (클라이언트).
 *
 * 설정 폼은 자체 재구현하지 않고 운영 ProfileEditClient 를 그대로 임베드(알림·프로필·피부·공개범위·
 *   동의·탈퇴 + 자동저장 로직 100% 재사용). 베타는 셸(BetaSkinShell)만 제공.
 */

import { type ComponentProps } from "react";
import ProfileEditClient from "@/app/settings/profile/ProfileEditClient";
import BetaSkinShell from "../BetaSkinShell";
import styles from "../beta-skin.module.css";
import { useBetaSearchRouting } from "../beta-ui";

export default function BetaSettingsView(
  props: ComponentProps<typeof ProfileEditClient>,
) {
  const search = useBetaSearchRouting();
  return (
    <BetaSkinShell active="마이" {...search}>
      <div className={styles.writeWrap}>
        <div className={styles.sectionHead} style={{ marginTop: 8 }}>
          <h2>설정</h2>
        </div>
        {/* 운영 설정 폼 그대로 — 베타 셸 안에서 동작. */}
        <ProfileEditClient {...props} />
      </div>
    </BetaSkinShell>
  );
}
