"use client";

/**
 * MySettingsView — /my/settings "프로필·설정" 전용 화면 본문 (클라이언트, 회원 전용).
 *
 * UI 개편 Phase 4-1 (D9): 구 본인 공개 프로필(/{handle}) 아코디언을 전용 화면으로 이관.
 *   - AppShell canvas="profile"(#F5FBFF — R5 헤더·캔버스 동색화가 내정보와 함께 적용, 의도된 파급)
 *     + backHeader(fallback=/my — R2-2 2뎁스 헤더 variant:
 *     모바일은 헤더 좌측 로고 자리 뒤로가기, 데스크탑은 본문 뒤로 행. 진입은 주로
 *     /my "정보 수정·앱 설정·탈퇴하기" 또는 프로필 "프로필 수정/수정").
 *   - 화면 타이틀은 ProfileEditClient 자체 헤더(h1 "내 정보", embedded=false)가 담당 —
 *     backTitle 을 추가하면 이중 타이틀이라 셸에는 뒤로가기만 둔다(중복 조율, 계획서 Phase 4-1).
 *   - ProfileEditClient 계약 불변: 변경 즉시 저장(autosave) + 탈퇴 footer(typed-confirmation →
 *     /api/me/delete) 내장. 저장 후 [← 프로필]은 profileHref(/{handle}) 로.
 *   - ClinicLinksSection(연결된 병원 관리, B5)은 무조건 렌더(Phase 4-4) — 구 isOwner&&settingsOpen
 *     조건은 이 화면에선 항상 참(서버 게이트가 본인 한정). 이력 0건이면 컴포넌트가 스스로 숨음.
 */

import ProfileEditClient, {
  type ProfileEditProps,
} from "@/app/settings/profile/ProfileEditClient";
import AppShell from "../AppShell";
import PolicyFooter from "../PolicyFooter";
import ClinicLinksSection from "../u/[handle]/ClinicLinksSection";
import styles from "../app.module.css";
import { useSearchRouting } from "../ui";

export default function MySettingsView({
  settings,
}: {
  settings: ProfileEditProps;
}) {
  // 헤더 검색 → 피드로 라우팅(운영 공용 헬퍼) — 다른 스킨 페이지와 동일하게 AppShell 에 주입.
  const search = useSearchRouting();

  return (
    <AppShell
      active="마이"
      canvas="profile"
      /* 2뎁스 헤더 variant(R2-2) — 구 back="/my"(본문 뒤로 행)에서 전환: 모바일은 헤더 좌측
         로고 자리 뒤로가기(1줄 회수), 데스크탑은 본문 뒤로 행(.backRowDesktop)으로 동일 위치 유지. */
      backHeader={{ fallbackHref: "/my" }}
      {...search}
    >
      {/* 설정 폼 — 흰 카드 래핑(구 프로필 아코디언과 동일 톤). embedded=false → 자체 h1 "내 정보". */}
      <section className={`${styles.card} ${styles.mb20}`}>
        <ProfileEditClient {...settings} embedded={false} />
      </section>

      {/* 연결된 병원 관리 — 무조건 렌더(Phase 4-4). 이력 0건·로드 실패면 자체 숨김. */}
      <ClinicLinksSection />

      <PolicyFooter />
    </AppShell>
  );
}
