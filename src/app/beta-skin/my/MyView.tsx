"use client";

/**
 * MyView — /beta-skin/my "마이" 본문 (클라이언트).
 *
 * 원칙: UI 는 베타 스킨 유지, 데이터·로직은 운영(my/record) 재사용.
 *   - 프로필·통계: 서버(page.tsx)가 active 명함 기준 실데이터를 prop 으로 주입(샘플 제거).
 *   - 내 활동 대시보드 4탭(사용자 요구): 내가 쓴 노트 / 내가 쓴 후기 / 내가 쓴 글 / 내 글에 달린 댓글.
 *     (운영 ProfileTabs 의 데이터 의미를 따르되, 표시는 베타 카드 UI 로.)
 *   - 메뉴 리스트 2묶음은 기존 운영 라우트로 연결(유지).
 *   - 비로그인: 로그인 CTA(게스트 안내).
 */

import { useState } from "react";
import CardAvatar from "@/components/card/CardAvatar";
import AccountSwitcherCard from "@/components/AccountSwitcherCard";
import BetaSkinShell from "../BetaSkinShell";
import styles from "../beta-skin.module.css";
import { useBetaSearchRouting } from "../beta-ui";

/** 활동 탭 아이템(제목 + 보조 + 링크). */
export type ActivityItem = { id: string; title: string; sub: string; href: string };

/** 내 활동(4탭) + 프로필 — 서버(page.tsx)에서 active 명함 기준 prefetch. */
export type MyActivity = {
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
  handle: string | null;
  notes: ActivityItem[]; // 내가 쓴 노트
  reviews: ActivityItem[]; // 내가 쓴 후기
  posts: ActivityItem[]; // 내가 쓴 글
  received: ActivityItem[]; // 내 글에 달린 댓글
};

const MENU_MAIN = [
  { icon: "💉", bg: "var(--tag-pink-bg)", label: "내 시술 노트", href: "/beta-skin/record" },
  { icon: "🔖", bg: "var(--tag-blue-bg)", label: "북마크한 글", href: "/my" },
  { icon: "🏷️", bg: "var(--tag-green-bg)", label: "관심 키워드 관리", href: "/settings/profile" },
];

const MENU_SUB = [
  { icon: "🔔", label: "알림 설정", href: "/notifications" },
  { icon: "🔒", label: "계정 및 개인정보", href: "/settings" },
  { icon: "💬", label: "고객센터 · 문의하기", href: "/contact" },
  { icon: "📄", label: "이용약관 · 개인정보처리방침", href: "/terms" },
];

type TabKey = "notes" | "reviews" | "posts" | "received";

export default function MyView({ activity }: { activity?: MyActivity | null }) {
  const search = useBetaSearchRouting();
  const [tab, setTab] = useState<TabKey>("notes");

  const sidebar = (
    <section className={`${styles.card} ${styles.sideCard}`} style={{ background: "var(--tt-blue-tint)" }}>
      <h3>내 노트 바로가기</h3>
      <p className={styles.muted} style={{ marginBottom: 14 }}>
        오늘 받은 시술·회복 상태를 노트에 남겨 보세요.
      </p>
      <a className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`} href="/beta-skin/record">
        내 노트 열기
      </a>
    </section>
  );

  // 비로그인 — 로그인 CTA(게스트 안내).
  if (!activity) {
    return (
      <BetaSkinShell active="마이" sidebar={sidebar} {...search}>
        <section className={`${styles.card} ${styles.mb20}`} style={{ textAlign: "center", padding: "40px 24px" }}>
          <div className={styles.profileName} style={{ marginBottom: 6 }}>
            마이페이지
          </div>
          <p className={styles.muted} style={{ marginBottom: 18 }}>
            로그인하면 내 노트·후기·글과 활동을 한눈에 볼 수 있어요.
          </p>
          <a className={`${styles.btn} ${styles.btnPrimary}`} href="/login">
            로그인
          </a>
        </section>
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

  const TABS: [TabKey, string, ActivityItem[]][] = [
    ["notes", "내가 쓴 노트", activity.notes],
    ["reviews", "내가 쓴 후기", activity.reviews],
    ["posts", "내가 쓴 글", activity.posts],
    ["received", "내 글에 달린 댓글", activity.received],
  ];
  const current = TABS.find(([k]) => k === tab) ?? TABS[0];
  const items = current[2];

  return (
    <BetaSkinShell active="마이" sidebar={sidebar} {...search}>
      {/* 계정(명함) 스위처 — 운영 공용 카드를 그대로 임베드(데이터·전환 로직 100% 재사용).
          useSession() 기반이라 props 불필요. 전환 시 /api/identity/switch → /my reload(운영 동일).
          비로그인은 activity=null 게스트 분기라 이 블록에 도달하지 않음(스위처 자동 숨김).
          카드 자체 하단 여백(mb-4)을 사용하므로 별도 wrapper 간격은 주지 않음. */}
      <AccountSwitcherCard />

      {/* 프로필 + 통계(실데이터) */}
      <section className={`${styles.card} ${styles.mb20}`}>
        <div className={styles.profileCard}>
          <CardAvatar memberAvatarUrl={activity.avatarUrl} name={activity.displayName} size={56} />
          <div>
            <div className={styles.profileName}>{activity.displayName}님</div>
            <div className={styles.profileSub}>{activity.handle ? `@${activity.handle}` : "피부텐텐 회원"}</div>
          </div>
          <a className={styles.profileEdit} href="/settings/profile">
            프로필 편집 ›
          </a>
        </div>
        <div className={styles.statRow} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div>
            <div className={styles.num}>{activity.notes.length}</div>
            <div className={styles.lab}>노트</div>
          </div>
          <div>
            <div className={styles.num}>{activity.reviews.length}</div>
            <div className={styles.lab}>후기</div>
          </div>
          <div>
            <div className={styles.num}>{activity.posts.length}</div>
            <div className={styles.lab}>글</div>
          </div>
          <div>
            <div className={styles.num}>{activity.received.length}</div>
            <div className={styles.lab}>받은 댓글</div>
          </div>
        </div>
      </section>

      {/* 내 활동 4탭 대시보드 (베타 카드 UI, 운영 데이터) */}
      <section className={`${styles.card} ${styles.mb20}`}>
        {/* 탭 토글 — 베타 3토글 칩 스타일 재사용(가로 스크롤) */}
        <div className={styles.recToggle} style={{ overflowX: "auto", marginBottom: 14 }}>
          {TABS.map(([k, label, list]) => (
            <button
              key={k}
              type="button"
              className={`${styles.recToggleBtn} ${tab === k ? styles.recToggleBtnOn : ""}`}
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
              style={{ whiteSpace: "nowrap" }}
            >
              {label} {list.length}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <p className={styles.muted} style={{ textAlign: "center", padding: "24px 8px" }}>
            {current[1]}이(가) 아직 없어요.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {items.map((it) => {
              const hasHref = it.href !== "/";
              const external = hasHref && it.href.startsWith("/") && !it.href.startsWith("/beta-skin");
              return (
                <a
                  key={it.id}
                  href={hasHref ? it.href : undefined}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  style={{
                    display: "block",
                    padding: "12px 6px",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14.5,
                      fontWeight: 700,
                      color: "var(--ink-900)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.title}
                  </div>
                  {it.sub && <div style={{ marginTop: 3, fontSize: 12.5, color: "var(--ink-500)" }}>{it.sub}</div>}
                </a>
              );
            })}
          </div>
        )}
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
