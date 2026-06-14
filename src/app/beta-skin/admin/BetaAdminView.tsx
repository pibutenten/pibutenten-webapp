"use client";

/**
 * BetaAdminView — /beta-skin/admin "관리자 대시보드" 본문 (클라이언트).
 *
 * 원칙: UI 는 베타 스킨 톤(.card · var(--ink-*) · var(--tt-blue*) 토큰), 데이터·로직은 운영 /admin 재사용.
 *   - 통계 8개 + 리서치 패널 3개 = 베타 톤 Stat 카드. 클릭 시 운영 /admin/* 로 이동(화면별 베타 이식은 다음 단계).
 *   - 활동 KPI = 운영 ActivityKpis 임베드. 인기 검색어/태그 = 운영 PopularCards 임베드(Tailwind 톤 그대로).
 *   - 운영 프로그램 Tool = 운영 page.tsx 와 동일 노출 조건(isSuperAdmin)·동일 href, 베타 톤 카드.
 *     (super admin 기준 12개, 일반 admin 은 super 전용 5개 숨겨 7개 노출.)
 *   - 계정 스위처 = 운영 AccountSwitcherCard, 최하단 로그아웃 = 운영 LogoutButton 임베드.
 */

import Link from "next/link";
import type { OauthHealth } from "@/lib/ai/youtube-oauth";
import { PopularSearchesCard, PopularTagsCard } from "@/app/admin/PopularCards";
import ActivityKpis from "@/app/admin/ActivityKpis";
import LogoutButton from "@/components/LogoutButton";
import AccountSwitcherCard from "@/components/AccountSwitcherCard";
import BetaSkinShell from "../BetaSkinShell";
import { useBetaSearchRouting } from "../beta-ui";
import styles from "../beta-skin.module.css";

type SearchRow = { query: string; cnt: number };
type TagRow = { keyword: string; cnt: number };
type KpiRow = {
  visitors: number;
  new_members: number;
  views: number;
  new_cards: number;
  comments: number;
  likes: number;
  saves: number;
  shares: number;
};

export type BetaAdminStats = {
  userCount: number;
  doctorCount: number;
  qaPublished: number;
  postPublished: number;
  reviewPublished: number;
  reportPublished: number;
  pendingReview: number;
  totalComments: number;
};

export default function BetaAdminView({
  isSuperAdmin,
  stats,
  research,
  oauthHealth,
  kpiByDays,
  searchesByDays,
  tagsByDays,
}: {
  isSuperAdmin: boolean;
  stats: BetaAdminStats;
  research: { totalMembers: number; active90d: number; reviewers: number };
  oauthHealth: OauthHealth;
  kpiByDays: Record<number, KpiRow>;
  searchesByDays: Record<number, SearchRow[]>;
  tagsByDays: Record<number, TagRow[]>;
}) {
  const search = useBetaSearchRouting();
  const pendingReview = stats.pendingReview;

  return (
    <BetaSkinShell active="마이" {...search}>
      {/* 계정(명함) 스위처 — 운영 공용 카드 임베드(전환 로직 100% 재사용). */}
      <AccountSwitcherCard compact />

      {/* 제목 + noindex 설명 */}
      <section className={`${styles.card} ${styles.mb20}`}>
        <div className={styles.profileName} style={{ marginBottom: 4 }}>
          관리자 대시보드
        </div>
        <p className={styles.muted}>
          운영 통계·모더레이션·회원 관리 (영구 noindex)
        </p>
      </section>

      {/* 운영 통계 — 누적 카드 8개. 모바일 4개씩 2줄, 데스크탑 8개 한 줄.
          순서: 회원·원장·Q&A·끄적끄적·시술후기·시술 리포트·검수 대기·댓글(운영 동일). */}
      <section className={`${styles.card} ${styles.mb20}`}>
        <div className={GRID8}>
          <Stat label="회원" value={stats.userCount} href="/admin/users" />
          <Stat label="원장" value={stats.doctorCount} href="/admin/doctors" />
          <Stat label="Q&A" value={stats.qaPublished} href="/beta-skin/admin/cards?type=qa&status=published" />
          <Stat label="끄적끄적" value={stats.postPublished} href="/beta-skin/admin/cards?type=post&status=published" />
          <Stat label="시술후기" value={stats.reviewPublished} href="/beta-skin/admin/cards?type=review&status=published" />
          <Stat label="시술 리포트" value={stats.reportPublished} href="/beta-skin/admin/cards?type=review_summary&status=published" />
          <Stat
            label="검수 대기"
            value={pendingReview}
            highlight={pendingReview > 0}
            href="/beta-skin/admin/cards?status=pending_review"
          />
          <Stat label="댓글" value={stats.totalComments} href="/beta-skin/admin/comments" />
        </div>
      </section>

      {/* 리서치 패널 (F-2B) — 사람(번들) 기준 집계. 상단 "회원"(명함 row)과 기준 다름(운영 동일). */}
      <section className={`${styles.card} ${styles.mb20}`}>
        <h2 className={SECTION_HEAD} style={{ color: "var(--ink-900)" }}>
          리서치 패널{" "}
          <span style={{ fontWeight: 400, color: "var(--ink-500)" }}>
            (사람 기준 · 같은 사람의 여러 명함은 1명으로 집계)
          </span>
        </h2>
        <div className={GRID3}>
          <Stat
            label="총 가입자"
            value={research.totalMembers}
            title="탈퇴 제외 · 사람 기준(distinct 가입 계정). 상단 '회원'은 명함 수 기준이라 다를 수 있습니다."
          />
          <Stat
            label="활성 회원 (90일)"
            value={research.active90d}
            title="최근 90일 방문 기준(site_visits) · 사람 기준. site_visits 적재 시작(2026-05-23) 이후라 윈도가 점차 채워집니다."
          />
          <Stat
            label="후기 작성 회원"
            value={research.reviewers}
            title="시술 후기(procedure_reviews) 작성자 · 사람 기준(distinct 가입 계정)."
          />
        </div>
      </section>

      {/* 활동 KPI (기간 토글) — 운영 ActivityKpis 임베드(Tailwind 톤 그대로, 차트·토글 로직 재사용). */}
      <section className={`${styles.card} ${styles.mb20}`}>
        <ActivityKpis initialDays={1} dataByDays={kpiByDays} />
      </section>

      {/* 운영 프로그램 — 액션·관리 도구. 운영 page.tsx 와 동일 노출 조건·href(베타 톤 카드). */}
      <section className={`${styles.card} ${styles.mb20}`}>
        <h2 className={SECTION_HEAD} style={{ color: "var(--ink-900)" }}>운영 프로그램</h2>
        <div className={TOOL_GRID}>
          <Tool
            href="/beta-skin/admin/cards"
            emoji="📚"
            title="전체 글 관리"
            desc="Q&A·끄적끄적 검색·필터·발행/보관"
          />
          {isSuperAdmin && (
            <Tool
              href="/admin/tags"
              emoji="🏷"
              title="태그 관리"
              desc="태그 분류·영문·부모·시술·온보딩 인라인 편집 + 병합"
            />
          )}
          <Tool
            href="/admin/review-reports"
            emoji="📊"
            title="시술 리포트"
            desc="시술별 후기 집계 요약 (후기수·재시술·만족도·통증·조회/저장/공유)"
          />
          {isSuperAdmin && (
            <Tool
              href="/admin/draft"
              emoji="📝"
              title="새 Q&A 추출하기"
              desc="소스에서 Q&A 카드를 추출하여 검수를 보냅니다"
            />
          )}
          <Tool
            href="/write?tab=qa"
            emoji="📝"
            title="Q&A 카드 작성하기"
            desc="원장 명의 Q&A 카드를 직접 작성합니다"
          />
          <Tool
            href="/beta-skin/admin/cards?status=pending_review"
            emoji="⏳"
            title="검수 대기"
            desc={
              pendingReview > 0
                ? `${pendingReview}개 검수 대기 중 →`
                : "검수 후 발행 대기"
            }
            highlight={pendingReview > 0}
          />
          <Tool
            href="/admin/users"
            emoji="👥"
            title="회원 관리"
            desc="권한 변경·원장 매핑·계정 관리"
          />
          {isSuperAdmin && (
            <Tool
              href="/admin/reports"
              emoji="🚩"
              title="신고 검토"
              desc="회원 신고 큐 — 숨김(영구·복구가능) / 완전삭제(익명화)"
            />
          )}
          <Tool
            href="/admin/doctors"
            emoji="🩺"
            title="의사 프로필 관리"
            desc="학력·경력·전문분야 등 확장 프로필"
          />
          {isSuperAdmin && (
            <Tool
              href="/admin/clinics"
              emoji="🏥"
              title="병원 정보 동기화"
              desc="심평원 피부과 의원 정보 가져오기 (피부일기 검색용)"
            />
          )}
          {isSuperAdmin && (
            <Tool
              href="/admin/auth-errors"
              emoji="🪪"
              title="회원가입 에러 로그"
              desc="Google·Kakao·Naver 콜백 에러 (PII 마스킹)"
            />
          )}
          <Tool
            prefetch={false}
            href="/api/admin/youtube-oauth/start"
            emoji={
              oauthHealth.state === "ok"
                ? "✅"
                : oauthHealth.state === "expired"
                ? "⚠"
                : oauthHealth.state === "error"
                ? "⚠"
                : "🔑"
            }
            title={
              oauthHealth.state === "ok"
                ? "YouTube 자막 OAuth (연동 중)"
                : oauthHealth.state === "expired"
                ? "YouTube 자막 OAuth (재인증 필요)"
                : oauthHealth.state === "error"
                ? "YouTube 자막 OAuth (오류)"
                : "YouTube 자막 OAuth 연동"
            }
            desc={
              oauthHealth.state === "ok"
                ? "본인 채널 영상 자막 자동 fetch 작동 중. 클릭하면 다른 계정으로 재인증."
                : oauthHealth.state === "expired"
                ? "토큰 만료(테스트 모드 7일). 클릭 → 5초 내 재인증 → 자동 갱신."
                : oauthHealth.state === "error"
                ? `오류: ${oauthHealth.detail.slice(0, 60)} — 클릭해 재인증.`
                : "피부텐텐 본인 채널 영상 자막 자동 fetch (1회 설정)"
            }
            highlight={
              oauthHealth.state === "expired" || oauthHealth.state === "error"
            }
          />
        </div>
      </section>

      {/* 인기 검색어·태그 — 운영 PopularCards 임베드(Tailwind 톤 그대로). */}
      <section className={`${styles.card} ${styles.mb20}`}>
        <div className={POPULAR_GRID}>
          <PopularSearchesCard initialDays={1} dataByDays={searchesByDays} />
          <PopularTagsCard initialDays={0} dataByDays={tagsByDays} />
        </div>
      </section>

      {/* 본인 대시보드 최하단 로그아웃 — 운영 LogoutButton 임베드. */}
      <div
        style={{
          marginTop: 32,
          display: "flex",
          justifyContent: "center",
          paddingTop: 24,
          borderTop: "1px solid var(--line)",
        }}
      >
        <LogoutButton />
      </div>
    </BetaSkinShell>
  );
}

/* 인라인 레이아웃 클래스 — module.css 에 별도 추가 없이 Tailwind 유틸로 그리드만 구성.
   카드 자체 톤은 Stat/Tool 의 베타 .card 스타일(아래)이 책임진다. */
const GRID8 = "grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-8";
const GRID3 = "grid grid-cols-3 gap-2 sm:gap-3";
const TOOL_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2";
const POPULAR_GRID = "grid grid-cols-1 gap-4 md:grid-cols-2";
const SECTION_HEAD =
  "mb-3 text-sm font-bold";

function Stat({
  label,
  value,
  highlight,
  href,
  title,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  href?: string;
  title?: string;
}) {
  const inner = (
    <>
      <div
        style={{
          whiteSpace: "nowrap",
          fontSize: 11,
          lineHeight: 1.2,
          color: "var(--ink-500)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          whiteSpace: "nowrap",
          fontSize: 20,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          color: highlight ? "var(--tt-blue-deep)" : "var(--ink-900)",
        }}
      >
        {value.toLocaleString()}
      </div>
    </>
  );
  const boxStyle: React.CSSProperties = {
    display: "block",
    overflow: "hidden",
    borderRadius: 14,
    border: `1px solid ${highlight ? "var(--tt-blue-soft)" : "var(--line)"}`,
    background: highlight ? "var(--tt-blue-tint)" : "#fff",
    padding: 12,
  };
  if (href) {
    return (
      <Link href={href} style={boxStyle} title={title}>
        {inner}
      </Link>
    );
  }
  return (
    <div style={boxStyle} title={title}>
      {inner}
    </div>
  );
}

function Tool({
  href,
  emoji,
  title,
  desc,
  highlight,
  prefetch,
}: {
  href: string;
  emoji: string;
  title: string;
  desc: string;
  highlight?: boolean;
  /** API endpoint나 사이드 이펙트 있는 라우트는 prefetch={false} 권장 */
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderRadius: 14,
        border: `1px solid ${highlight ? "var(--tt-blue-soft)" : "var(--line)"}`,
        background: highlight ? "var(--tt-blue-tint)" : "#fff",
        padding: 16,
      }}
    >
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ink-900)" }}>
          {title}
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: "var(--ink-500)" }}>
          {desc}
        </div>
      </div>
      <span style={{ color: "var(--ink-300)" }}>→</span>
    </Link>
  );
}
