"use client";

/**
 * MyView — /beta-skin/my "마이" 본문 (클라이언트).
 *
 * 공용 셸(BetaSkinShell)을 active="마이" 로 사용.
 * 전부 샘플 데이터: 프로필 카드 + 통계 3개 + 메뉴 리스트 2묶음 + 사이드(CTA·팔로우).
 * 메뉴 항목은 프리뷰 라우트로 연결(내 노트→record / 노트 기록→write).
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
  { icon: "🔖", bg: "var(--tag-blue-bg)", label: "북마크한 글", href: "#" },
  { icon: "🏷️", bg: "var(--tag-green-bg)", label: "관심 키워드 관리", href: "#" },
  { icon: "🛍️", bg: "var(--tag-purple-bg)", label: "쇼핑 주문 내역", href: "#" },
];

const MENU_SUB = [
  { icon: "🔔", label: "알림 설정" },
  { icon: "🔒", label: "계정 및 개인정보" },
  { icon: "💬", label: "고객센터 · 문의하기" },
  { icon: "📄", label: "이용약관 · 개인정보처리방침" },
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

      <section className={`${styles.card} ${styles.sideEmoji}`}>
        <h3>내가 팔로우한 전문의</h3>
        <div className={styles.sideList}>
          <a href="#">
            <span aria-hidden="true">👩‍⚕️</span>
            <span>
              <b>정한미</b> · 힐하우스피부과의원
            </span>
          </a>
          <a href="#">
            <span aria-hidden="true">👨‍⚕️</span>
            <span>
              <b>이도영</b> · 피부과 전문의
            </span>
          </a>
        </div>
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
          <a className={styles.profileEdit} href="#">
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
          <a href="#" key={m.label}>
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
