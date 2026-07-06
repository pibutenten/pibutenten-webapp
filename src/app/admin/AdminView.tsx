"use client";

/**
 * AdminView — /admin "관리자 대시보드" 본문 (클라이언트).
 *
 * 원칙: 상단바·배경은 앱 셸(AppShell), 본문 큰 틀은 기존 운영 대시보드 유지.
 *   radius·컬러만 앱 토큰(var(--ink-*)/var(--tt-blue*)/var(--line)/borderRadius:14)으로 재조정.
 *   - 통계 8개 + 리서치 패널 3개 = 앱 톤 Stat 카드. 클릭 시 운영 /admin/* 로 이동.
 *   - 활동 KPI = 운영 ActivityKpis 임베드. 인기 검색어/태그 = 운영 PopularCards 임베드(Tailwind 톤 그대로).
 *   - 운영 프로그램 Tool = 운영 page.tsx 와 동일 노출 조건(isSuperAdmin)·동일 href, 앱 톤 카드.
 *     (super admin 기준 12개, 일반 admin 은 super 전용 5개 숨겨 7개 노출.)
 *   - 계정 스위처 = 운영 AccountSwitcherCard, 최하단 로그아웃 = 운영 LogoutButton 임베드.
 *
 * app skin admin 템플릿/AdminView.tsx 에서 승격. 셸 back="/", 내부 링크 /admin/* 정본.
 */

import type { OauthHealth } from "@/lib/ai/youtube-oauth";
import { PopularSearchesCard, PopularTagsCard } from "@/app/admin/PopularCards";
import ActivityKpis from "@/app/admin/ActivityKpis";
import LogoutButton from "@/components/LogoutButton";
import AccountSwitcherCard from "@/components/AccountSwitcherCard";
import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";
import { Stat, Tool } from "@/components/skin/OpsCards";
import styles from "@/components/skin/app.module.css";

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

export type AdminStats = {
  userCount: number;
  doctorCount: number;
  qaPublished: number;
  postPublished: number;
  reviewPublished: number;
  reportPublished: number;
  pendingReview: number;
  totalComments: number;
};

export default function AdminView({
  isSuperAdmin,
  stats,
  research,
  oauthHealth,
  kpiByDays,
  searchesByDays,
  tagsByDays,
}: {
  isSuperAdmin: boolean;
  stats: AdminStats;
  research: { totalMembers: number; active90d: number; reviewers: number };
  oauthHealth: OauthHealth;
  kpiByDays: Record<number, KpiRow>;
  searchesByDays: Record<number, SearchRow[]>;
  tagsByDays: Record<number, TagRow[]>;
}) {
  const search = useSearchRouting();
  const pendingReview = stats.pendingReview;

  return (
    <AppShell active="마이" wide back="/" {...search}>
      {/* 계정(명함) 스위처 — 운영 공용 카드 임베드(전환 로직 100% 재사용). */}
      <AccountSwitcherCard compact />

      {/* 제목 + noindex 설명 */}
      <section className={styles.mb20}>
        <div className={styles.profileName} style={{ marginBottom: 4 }}>
          관리자 대시보드
        </div>
        <p className={styles.muted}>
          운영 통계·모더레이션·회원 관리 (영구 noindex)
        </p>
      </section>

      {/* 운영 통계 — 누적 카드 8개. 모바일 4개씩 2줄, 데스크탑 8개 한 줄.
          순서: 회원·원장·Q&A·끄적끄적·시술후기·시술 리포트·검수 대기·댓글(운영 동일). */}
      <section className={styles.mb20}>
        <div className={GRID8}>
          <Stat label="회원" value={stats.userCount} href="/admin/users" />
          <Stat label="원장" value={stats.doctorCount} href="/admin/doctors" />
          <Stat label="Q&A" value={stats.qaPublished} href="/admin/cards?type=qa&status=published" />
          <Stat label="끄적끄적" value={stats.postPublished} href="/admin/cards?type=post&status=published" />
          <Stat label="시술후기" value={stats.reviewPublished} href="/admin/cards?type=review&status=published" />
          {/* 시술 리포트 Stat 은 카드 목록 대신 전용 요약 표(/admin/review-reports)로 직행 — 원장 요청(2026-07-04). */}
          <Stat label="시술 리포트" value={stats.reportPublished} href="/admin/review-reports" />
          <Stat
            label="검수 대기"
            value={pendingReview}
            highlight={pendingReview > 0}
            href="/admin/cards?status=pending_review"
          />
          <Stat label="댓글" value={stats.totalComments} href="/admin/comments" />
        </div>
      </section>

      {/* 리서치 패널 (F-2B) — 사람(번들) 기준 집계. 상단 "회원"(명함 row)과 기준 다름(운영 동일). */}
      <section className={styles.mb20}>
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
      <section className={styles.mb20}>
        <ActivityKpis initialDays={1} dataByDays={kpiByDays} />
      </section>

      {/* 운영 프로그램 — 액션·관리 도구. 운영 page.tsx 와 동일 노출 조건·href(앱 톤 카드). */}
      <section className={styles.mb20}>
        <h2 className={SECTION_HEAD} style={{ color: "var(--ink-900)" }}>운영 프로그램</h2>
        <div className={TOOL_GRID}>
          <Tool
            href="/admin/cards"
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
            href="/admin/cards?status=pending_review"
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
      <section className={styles.mb20}>
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
    </AppShell>
  );
}

/* 인라인 레이아웃 클래스 — module.css 에 별도 추가 없이 Tailwind 유틸로 그리드만 구성.
   카드 자체 톤은 Stat/Tool 의 앱 .card 스타일(아래)이 책임진다. */
const GRID8 = "grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-8";
const GRID3 = "grid grid-cols-3 gap-2 sm:gap-3";
// 운영 /admin 과 동일하게 2열(데스크탑·태블릿)·모바일 1열 — 사용자 결정(2026-06-14, 운영 모습 정합).
const TOOL_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2";
const POPULAR_GRID = "grid grid-cols-1 gap-4 md:grid-cols-2";
const SECTION_HEAD =
  "mb-3 text-sm font-bold";
