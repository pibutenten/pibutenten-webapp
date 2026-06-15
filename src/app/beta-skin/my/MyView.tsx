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
import { useSession } from "@/lib/session-context";
import BetaSkinShell from "../BetaSkinShell";
import BetaPolicyFooter from "../BetaPolicyFooter";
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
  { label: "내 시술 노트", href: "/record" },
  { label: "북마크한 글", href: "/my" },
  { label: "관심 키워드 관리", href: "/settings/profile" },
];

const MENU_SUB = [
  { label: "알림 설정", href: "/notifications" },
  { label: "계정 및 개인정보", href: "/settings" },
  { label: "고객센터 · 문의하기", href: "/contact" },
  { label: "이용약관 · 개인정보처리방침", href: "/terms" },
];

type TabKey = "notes" | "reviews" | "posts" | "received";

export default function MyView({ activity }: { activity?: MyActivity | null }) {
  const search = useBetaSearchRouting();
  const session = useSession();
  const [tab, setTab] = useState<TabKey>("notes");
  // 명함 단위(ADR 0012): 프로필 아바타·이름·핸들은 헤더/계정 스위처와 동일하게 active 명함 기준(useSession).
  //   page.tsx 의 profiles.avatar_url(개인 업로드)을 쓰면 원장 명함인데 개인 사진이 뜨는 버그 → active 우선.
  const active =
    session?.identities.find((i) => i.id === session.activeIdentityId) ?? null;
  const profAvatar = active?.avatarUrl ?? session?.avatarUrl ?? activity?.avatarUrl ?? null;
  const profName = active?.displayName || activity?.displayName || "회원";
  const profHandle = active?.handle ?? activity?.handle ?? null;

  const sidebar = (
    <section className={`${styles.card} ${styles.sideCard}`} style={{ background: "var(--tt-blue-tint)" }}>
      <h3>내 노트 바로가기</h3>
      <p className={styles.muted} style={{ marginBottom: 14 }}>
        오늘 받은 시술·회복 상태를 노트에 남겨 보세요.
      </p>
      <a className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`} href="/record">
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
              {m.label}
              <span className={styles.chev}>›</span>
            </a>
          ))}
        </section>
        {/* 신뢰·법적 길목(about·약관·문의 등) — 비로그인에게도 노출(SNS 표준 in-page 푸터). */}
        <BetaPolicyFooter />
      </BetaSkinShell>
    );
  }

  // 탭 라벨은 짧게(가로 스크롤 방지) — 빈 상태 문구는 별도 풀네임(emptyLabel) 사용.
  const TABS: [TabKey, string, ActivityItem[], string][] = [
    ["notes", "노트", activity.notes, "작성한 노트가"],
    ["reviews", "후기", activity.reviews, "작성한 후기가"],
    ["posts", "글", activity.posts, "작성한 글이"],
    ["received", "받은 댓글", activity.received, "받은 댓글이"],
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
          <CardAvatar memberAvatarUrl={profAvatar} name={profName} size={56} />
          <div>
            <div className={styles.profileName}>{profName}님</div>
            <div className={styles.profileSub}>{profHandle ? `@${profHandle}` : "피부텐텐 회원"}</div>
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
        {/* 탭 토글 — 짧은 라벨로 한 줄에 균등 배치(가로 스크롤 제거). */}
        <div className={styles.myTabs}>
          {TABS.map(([k, label, list]) => (
            <button
              key={k}
              type="button"
              className={`${styles.myTab} ${tab === k ? styles.myTabOn : ""}`}
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
            >
              {label} {list.length}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <p className={styles.muted} style={{ textAlign: "center", padding: "24px 8px" }}>
            아직 {current[3]} 없어요.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {items.map((it) => {
              const hasHref = it.href !== "/";
              // 내부 앱 경로(/...)는 같은 탭 SPA 이동, 외부(http) 링크만 새 탭.
              //   (구 판정은 /beta-skin 접두어를 '내부' 기준으로 써서, 커토버로 카드 href 가
              //    운영경로로 바뀐 뒤 내 글·후기·노트가 전부 새 탭으로 열리던 잠재버그 — 교정.)
              const external = hasHref && !it.href.startsWith("/");
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

      {/* 메뉴 (주요) — 습관적 컬러 아이콘 제거(텍스트 + chevron 만). */}
      <section className={`${styles.card} ${styles.menu} ${styles.mb20}`}>
        {MENU_MAIN.map((m) => (
          <a href={m.href} key={m.label}>
            {m.label}
            <span className={styles.chev}>›</span>
          </a>
        ))}
      </section>

      {/* 메뉴 (설정) */}
      <section className={`${styles.card} ${styles.menu}`}>
        {MENU_SUB.map((m) => (
          <a href={m.href} key={m.label}>
            {m.label}
            <span className={styles.chev}>›</span>
          </a>
        ))}
      </section>

      {/* 신뢰·법적 길목(about·약관·문의 등) — SNS 표준 in-page 푸터. */}
      <BetaPolicyFooter />
    </BetaSkinShell>
  );
}
