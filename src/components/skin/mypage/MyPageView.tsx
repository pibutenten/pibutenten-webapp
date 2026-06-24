"use client";

/**
 * MyPageView — /my "마이페이지" 허브 본문 (클라이언트, 회원 전용).
 *
 * 디자인('전달용/마이페이지 업데이트.png')을 운영 스킨 토큰으로 재현:
 *   ① 상단 타이틀 바: "마이페이지" + 알림 벨(→/notifications) + 설정 톱니(→/settings)
 *   ② 프로필 카드: 아바타 + 이름 + @handle + 태그칩[연령대][얼굴형][피부타입] + 우측 chevron(공개 프로필로)
 *      └ 하단 풀폭 "내 피부 정보" 버튼(→ 공개 프로필 피부 탭)
 *   ③ 퀵 스탯 3열: 좋아요 / 북마크 / 최근 본 글
 *   ④ 나의 활동: 내가 쓴 글 / 내 노트 / 내 댓글
 *   ⑤ 나의 관심: 좋아요 / 북마크
 *   ⑥ 설정: 앱 설정
 *   ⑦ 고객지원: 공지사항 / 고객센터 / 의견 남기기 / 탈퇴하기
 *
 * 데이터·링크는 모두 운영 라우트 재사용(신규 백엔드 없음):
 *   - 프로필/태그/카운트는 server(/my/page.tsx)가 active 명함 기준으로 조립해 props 로 주입.
 *   - 활동/관심 목록은 공개 프로필(/{handle})의 탭(?tab=posts|comments|likes|saves)으로 연결.
 *
 * AppShell(active="마이")이 브랜드 헤더 + 하단 탭바를 제공하므로, 디자인의 타이틀 바는
 *   본문 최상단에 in-content 로 재현한다(/today RecordView 와 동일하게 셸 헤더는 유지).
 */

import Link from "next/link";
import type { ReactNode } from "react";
import LogoutButton from "@/components/LogoutButton";
import CardAvatar from "@/components/card/CardAvatar";
import { useSearchRouting } from "../ui";
import AppShell from "../AppShell";
import PolicyFooter from "../PolicyFooter";
import styles from "../app.module.css";

export type MyPageProps = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** 디자인 태그칩 — 연령대(예: "30대") / 얼굴형(예: "각진형") / 피부타입(예: "건성"). null 은 미입력 → 칩 생략. */
  ageGroupLabel: string | null;
  faceShapeLabel: string | null;
  skinTypeLabel: string | null;
  likesCount: number;
  savesCount: number;
  postCount: number;
  commentCount: number;
  /** 최근 본 글 개수(get_my_recent_view_count RPC). 0 이면 "최근 본 글" 스탯 비활성(링크 없음). */
  recentCount: number;
};

/* ---------- 아이콘 (운영 스킨 인라인 SVG 컨벤션 — currentColor stroke) ---------- */
function IconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
function IconHeartFill() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={26} height={26}>
      <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.3 5c2 0 3.4 1.1 4.2 2.3l.5.8.5-.8C11.3 6.1 12.7 5 14.7 5 18 5 19.6 8.4 22 11.7 19.5 16.4 12 21 12 21z" />
    </svg>
  );
}
function IconBookmarkFill() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={26} height={26}>
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function IconPencilSquare() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
      <path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function IconBook() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
      <path d="M2 4h7a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H2zM22 4h-7a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H22z" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
    </svg>
  );
}
function IconHeart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
      <path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}
function IconBookmark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
      <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconSettings() {
  return <IconGear />;
}
function IconMegaphone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V7L6 11H4a1 1 0 0 0-1 0z" />
      <path d="M14 8a5 5 0 0 1 0 8M10 7l8-4v18l-8-4" />
    </svg>
  );
}
function IconHeadset() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2zM20 14a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2z" />
      <path d="M20 18v1a3 3 0 0 1-3 3h-3" />
    </svg>
  );
}
function IconEnvelope() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

/* ---------- 공용 행 / 섹션 ---------- */

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 13,
  padding: "15px 4px",
  color: "var(--text, #2b3440)",
  textDecoration: "none",
  fontSize: 15,
  fontWeight: 600,
};

function NavRow({ icon, label, href }: { icon: ReactNode; label: string; href: string }) {
  return (
    <Link href={href} style={ROW_STYLE}>
      <span style={{ display: "inline-flex", color: "var(--ink-300)", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ display: "inline-flex", color: "var(--ink-300)", flexShrink: 0 }} aria-hidden>
        <IconChevron />
      </span>
    </Link>
  );
}

/**
 * 로그아웃 행 — NavRow 와 동일한 행 레이아웃이되 링크가 아닌 LogoutButton(버튼) 재사용.
 *   버튼 라벨 typography 를 NavRow 라벨과 맞추기 위해 ROW_STYLE 의 글자 속성을 className 대신
 *   wrapper 에 부여하고, 버튼은 색·폰트를 inherit 하도록 무톤 className 으로 오버라이드.
 */
function LogoutRow() {
  return (
    <div style={{ ...ROW_STYLE, cursor: "default" }}>
      <span style={{ display: "inline-flex", color: "var(--ink-300)", flexShrink: 0 }} aria-hidden>
        <IconLogout />
      </span>
      <LogoutButton
        label="로그아웃"
        className="flex-1 text-left bg-transparent border-0 p-0 m-0 cursor-pointer text-[15px] font-semibold text-[var(--text,#2b3440)] disabled:opacity-50"
      />
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
      <h2
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "var(--ink-300)",
          margin: "0 4px 8px",
        }}
      >
        {title}
      </h2>
      <div className={styles.card} style={{ padding: "6px 18px" }}>
        {children}
      </div>
    </section>
  );
}

export default function MyPageView({
  handle,
  displayName,
  avatarUrl,
  ageGroupLabel,
  faceShapeLabel,
  skinTypeLabel,
  likesCount,
  savesCount,
  postCount,
  commentCount,
  recentCount,
}: MyPageProps) {
  // 헤더 검색 → 피드로 라우팅(운영 공용 헬퍼) — 다른 스킨 페이지와 동일하게 AppShell 에 주입.
  const search = useSearchRouting();

  const profileHref = `/${handle}`;
  const tags = [ageGroupLabel, faceShapeLabel, skinTypeLabel].filter(
    (t): t is string => !!t,
  );

  return (
    <AppShell active="마이" {...search}>
      {/* ① 타이틀 바 — "마이페이지" + 벨 + 톱니. 디자인의 in-content 헤더(셸 브랜드 헤더는 그대로 위에 유지). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          margin: "2px 2px 16px",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text, #2b3440)", margin: 0 }}>
          마이페이지
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Link
            href="/notifications"
            aria-label="알림"
            style={{ display: "inline-flex", padding: 6, color: "var(--ink-300)" }}
          >
            <IconBell />
          </Link>
          <Link
            href="/settings"
            aria-label="설정"
            style={{ display: "inline-flex", padding: 6, color: "var(--ink-300)" }}
          >
            <IconGear />
          </Link>
        </div>
      </div>

      {/* ② 프로필 카드 — 카드 전체가 공개 프로필 링크. */}
      <section className={styles.card} style={{ padding: 18 }}>
        <Link
          href={profileHref}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <CardAvatar memberAvatarUrl={avatarUrl} name={displayName} size={62} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.profileName} style={{ fontSize: 18, fontWeight: 800, color: "var(--text, #2b3440)" }}>
              {displayName}
            </div>
            <div className={styles.profileSub} style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 1 }}>
              @{handle}
            </div>
            {tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {tags.map((t) => (
                  <span
                    key={t}
                    style={{
                      display: "inline-block",
                      background: "var(--tt-blue-tint)",
                      color: "var(--tt-blue-deep)",
                      fontSize: 11.5,
                      fontWeight: 600,
                      padding: "3px 9px",
                      borderRadius: "var(--r-chip, 8px)",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span style={{ display: "inline-flex", color: "var(--ink-300)", flexShrink: 0 }} aria-hidden>
            <IconChevron />
          </span>
        </Link>

        {/* 내 피부 정보 — 공개 프로필 '피부' 탭으로. */}
        <Link
          href={`${profileHref}?tab=skin`}
          className={`${styles.btn} ${styles.btnGhost} ${styles.btnBlock}`}
          style={{ marginTop: 14 }}
        >
          내 피부 정보
        </Link>
      </section>

      {/* ③ 퀵 스탯 3열 — 좋아요 / 북마크 / 최근 본 글. */}
      <section className={styles.card} style={{ marginTop: 12, padding: "16px 10px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
          <StatCol href={`${profileHref}?tab=likes`} color="#f76d9b" icon={<IconHeartFill />} label="좋아요" value={likesCount} />
          <StatCol href={`${profileHref}?tab=saves`} color="var(--tt-blue)" icon={<IconBookmarkFill />} label="북마크" value={savesCount} />
          {/* 최근 본 글 — 개수>0 이면 /my/recent 로, 0 이면 비활성(링크 없음·이동 없음·토스트 없음). */}
          <StatCol
            href={recentCount > 0 ? "/my/recent" : null}
            color="#3fb98f"
            icon={<IconClock />}
            label="최근 본 글"
            value={recentCount}
          />
        </div>
      </section>

      {/* ④ 나의 활동 */}
      <SectionCard title="나의 활동">
        <NavRow icon={<IconPencilSquare />} label={postCount > 0 ? `내가 쓴 글 ${postCount}` : "내가 쓴 글"} href={`${profileHref}?tab=posts`} />
        <Divider />
        <NavRow icon={<IconBook />} label="내 노트" href="/notes" />
        <Divider />
        <NavRow icon={<IconChat />} label={commentCount > 0 ? `내 댓글 ${commentCount}` : "내 댓글"} href={`${profileHref}?tab=comments`} />
      </SectionCard>

      {/* ⑤ 나의 관심 */}
      <SectionCard title="나의 관심">
        <NavRow icon={<IconHeart />} label={likesCount > 0 ? `좋아요 ${likesCount}` : "좋아요"} href={`${profileHref}?tab=likes`} />
        <Divider />
        <NavRow icon={<IconBookmark />} label={savesCount > 0 ? `북마크 ${savesCount}` : "북마크"} href={`${profileHref}?tab=saves`} />
      </SectionCard>

      {/* ⑥ 설정 */}
      <SectionCard title="설정">
        <NavRow icon={<IconSettings />} label="앱 설정" href="/settings" />
      </SectionCard>

      {/* ⑦ 고객지원 */}
      <SectionCard title="고객지원">
        {/* 공지사항 — 전용 라우트 없음 → 사이트 안내(/about)로. (NOTE) */}
        <NavRow icon={<IconMegaphone />} label="공지사항" href="/about" />
        <Divider />
        <NavRow icon={<IconHeadset />} label="고객센터" href="/contact" />
        <Divider />
        {/* 의견 남기기 — 전용 피드백 폼 없음 → 문의 채널(/contact)로. (NOTE) */}
        <NavRow icon={<IconEnvelope />} label="의견 남기기" href="/contact" />
        <Divider />
        {/* 탈퇴하기 — 전용 페이지 없음. 탈퇴 UI 는 공개 프로필 '프로필·설정' 아코디언 안. (NOTE) */}
        <NavRow icon={<IconLogout />} label="탈퇴하기" href={profileHref} />
      </SectionCard>

      {/* ⑧ 계정 — 로그아웃 행. NavRow 와 같은 행 톤이되 링크가 아닌 버튼(LogoutButton 재사용). */}
      <SectionCard title="계정">
        <LogoutRow />
      </SectionCard>

      <PolicyFooter />
    </AppShell>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--line)", margin: "0 -18px" }} />;
}

function StatCol({
  href,
  color,
  icon,
  label,
  value,
}: {
  /** null 이면 링크 대신 비활성 span 으로 렌더(이동 없음). "최근 본 글" 0개 케이스. */
  href: string | null;
  color: string;
  icon: ReactNode;
  label: string;
  value: number | null;
}) {
  const inner = (
    <>
      <span style={{ display: "inline-flex", color }}>{icon}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-500)" }}>{label}</span>
      {value !== null && (
        <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text, #2b3440)", lineHeight: 1 }}>
          {value}
        </span>
      )}
    </>
  );
  const colStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 7,
    padding: "6px 4px",
    textDecoration: "none",
    color: "var(--text, #2b3440)",
  };
  // href 가 null 이면 클릭 비활성(링크 아님) — 이동·토스트 없음.
  if (href === null) {
    return <span style={colStyle}>{inner}</span>;
  }
  return (
    <Link href={href} style={colStyle}>
      {inner}
    </Link>
  );
}
