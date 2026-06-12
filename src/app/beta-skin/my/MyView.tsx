"use client";

/**
 * MyView — /beta-skin/my "마이" 본문 (클라이언트).
 *
 * 공용 셸(BetaSkinShell)을 active="마이" 로 사용.
 * 프로필 카드·통계는 샘플. 메뉴 리스트 2묶음은 실제 목적지로 연결:
 *   - 내 노트→/beta-skin/record(베타), 노트 기록→/beta-skin/write(베타)
 *   - 북마크→/my, 키워드/프로필 편집→/settings/profile
 *   - 알림→/notifications, 계정→/settings, 문의→/contact, 약관→/terms
 * 쇼핑 주문 내역(미완성)·팔로우(운영 미지원) 항목은 제거.
 */

import BetaSkinShell from "../BetaSkinShell";
import styles from "../beta-skin.module.css";
import { useBetaSearchRouting } from "../beta-ui";

const STATS = [
  { num: "12", lab: "시술 노트" },
  { num: "5", lab: "작성한 글" },
  { num: "23", lab: "북마크" },
];

const MENU_MAIN = [
  { icon: "💉", bg: "var(--tag-pink-bg)", label: "내 시술 노트", href: "/beta-skin/record" },
  { icon: "🔖", bg: "var(--tag-blue-bg)", label: "북마크한 글", href: "/my" },
  { icon: "🏷️", bg: "var(--tag-green-bg)", label: "관심 키워드 관리", href: "/settings/profile" },
  // 쇼핑 주문 내역: 쇼핑 미완성으로 항목 제거(연결할 운영 화면 없음).
];

const MENU_SUB = [
  { icon: "🔔", label: "알림 설정", href: "/notifications" },
  { icon: "🔒", label: "계정 및 개인정보", href: "/settings" },
  { icon: "💬", label: "고객센터 · 문의하기", href: "/contact" },
  { icon: "📄", label: "이용약관 · 개인정보처리방침", href: "/terms" },
];

export default function MyView() {
  const search = useBetaSearchRouting();
  const sidebar = (
    <>
      <section
        className={`${styles.card} ${styles.sideCard}`}
        style={{ background: "var(--tt-blue-tint)" }}
      >
        <h3>써마지 시술 3일차</h3>
        <p className={styles.muted} style={{ marginBottom: 14 }}>
          오늘의 회복 상태를 노트에 남겨 보세요.
        </p>
        <a
          className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}
          href="/beta-skin/write"
        >
          노트 기록하기
        </a>
      </section>
    </>
  );

  return (
    <BetaSkinShell active="마이" sidebar={sidebar} {...search}>
      {/* 프로필 + 통계 */}
      <section className={`${styles.card} ${styles.mb20}`}>
        <div className={styles.profileCard}>
          <span className={styles.avatar} />
          <div>
            <div className={styles.profileName}>텐즈님</div>
            <div className={styles.profileSub}>
              피부텐텐과 함께한 지 248일째
            </div>
          </div>
          <a className={styles.profileEdit} href="/settings/profile">
            프로필 편집 ›
          </a>
        </div>
        <div className={styles.statRow}>
          {STATS.map((s) => (
            <div key={s.lab}>
              <div className={styles.num}>{s.num}</div>
              <div className={styles.lab}>{s.lab}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 메뉴 (주요) */}
      <section className={`${styles.card} ${styles.menu} ${styles.mb20}`}>
        {MENU_MAIN.map((m) => (
          <a href={m.href} key={m.label}>
            <span className={styles.mi} style={{ background: m.bg }}>
              {m.icon}
            </span>
            {m.label}
            <span className={styles.chev}>›</span>
          </a>
        ))}
      </section>

      {/* 메뉴 (설정) */}
      <section className={`${styles.card} ${styles.menu}`}>
        {MENU_SUB.map((m) => (
          <a href={m.href} key={m.label}>
            <span className={styles.mi} style={{ background: "#F2F5F8" }}>
              {m.icon}
            </span>
            {m.label}
            <span className={styles.chev}>›</span>
          </a>
        ))}
      </section>
    </BetaSkinShell>
  );
}
