import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveIdentity } from "@/lib/identity-server";
import { ROLES } from "@/lib/identity-shared";
import BackButton from "@/components/BackButton";
import AccountSwitcherCard from "@/components/AccountSwitcherCard";
import DoctorActivityKpis, { type DoctorKpi } from "./DoctorActivityKpis";
import { PopularSearchesCard, PopularTagsCard } from "@/app/admin/PopularCards";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "원장 대시보드",
  robots: { index: false, follow: false },
};

// admin/page.tsx 와 동일 기간 세트
const PERIOD_DAYS = [1, 7, 30, 90, 365, 0];

type SearchRow = { query: string; cnt: number };
type TagRow = { keyword: string; cnt: number };

/**
 * /doctor — 원장 본인 전용 대시보드 (2026-05-22 v3 — admin 톤 통일).
 *
 * 구조 (admin 과 동일 패턴):
 *   1) 본인 글 KPI (DoctorActivityKpis) — 조회수·댓글·저장·공유·내 글·검수 대기
 *      각 카드 클릭 → 관련 페이지로 이동 (doctor admin 자동 강제 필터링)
 *   2) 운영 프로그램 (Tool) — 본인 한정: 전체 글 관리·검수 대기·프로필 편집
 *   3) 인기 검색어 / 인기 태그 — 사이트 전체 (admin 과 동일 컴포넌트 재사용)
 *
 * 가드: 비로그인 → /login, doctor_accounts 매핑 없으면 → /admin (admin) or /
 * Q&A 추출(/admin/draft) 은 admin 전용 — doctor Tool 에 노출 X
 */
export default async function DoctorDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/doctor");

  const active = await resolveActiveIdentity(supabase, user.id, user.email);
  if (!active?.doctorId) {
    if (active?.role === ROLES.ADMIN) redirect("/admin");
    redirect("/");
  }

  // doctor 정보 lookup
  const { data: doctorRow } = await supabase
    .from("doctors")
    .select("slug, name")
    .eq("id", active.doctorId)
    .maybeSingle();
  const doctorSlug = (doctorRow as { slug: string } | null)?.slug ?? "";
  const doctorName =
    (doctorRow as { name: string } | null)?.name ?? active.displayName;

  // 모든 기간 KPI 일괄 prefetch + 인기 검색어/태그
  const [kpiResults, searchResults, tagResults] = await Promise.all([
    Promise.all(
      PERIOD_DAYS.map((d) =>
        supabase.rpc("get_doctor_kpi", {
          p_doctor_id: active.doctorId,
          p_profile_id: active.profileId,
          p_days: d,
        }),
      ),
    ),
    Promise.all(
      PERIOD_DAYS.map((d) =>
        supabase.rpc("get_top_search_queries", {
          p_days: d || 36500,
          p_limit: 10,
        }),
      ),
    ),
    Promise.all(
      PERIOD_DAYS.map((d) =>
        supabase.rpc("get_top_tags", {
          p_days: d,
          p_min_count: 1,
          p_limit: 10,
        }),
      ),
    ),
  ]);

  const EMPTY_KPI: DoctorKpi = {
    views_received: 0,
    comments_received: 0,
    saves_received: 0,
    shares_received: 0,
    published_total: 0,
    pending_review: 0,
  };
  const kpiByDays: Record<number, DoctorKpi> = {};
  PERIOD_DAYS.forEach((d, i) => {
    const rows = kpiResults[i]?.data;
    const row = Array.isArray(rows) ? rows[0] : rows;
    kpiByDays[d] = row
      ? {
          views_received: Number(row.views_received ?? 0),
          comments_received: Number(row.comments_received ?? 0),
          saves_received: Number(row.saves_received ?? 0),
          shares_received: Number(row.shares_received ?? 0),
          published_total: Number(row.published_total ?? 0),
          pending_review: Number(row.pending_review ?? 0),
        }
      : EMPTY_KPI;
  });

  const searchesByDays: Record<number, SearchRow[]> = {};
  PERIOD_DAYS.forEach((d, i) => {
    searchesByDays[d] = (searchResults[i]?.data ?? []) as SearchRow[];
  });
  const tagsByDays: Record<number, TagRow[]> = {};
  PERIOD_DAYS.forEach((d, i) => {
    tagsByDays[d] = ((tagResults[i]?.data ?? []) as TagRow[]).slice(0, 10);
  });

  const pendingCount = kpiByDays[0]?.pending_review ?? 0;

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1">
        <BackButton fallbackHref="/" />
      </div>
      {/* 계정 스위처 — 어느 명함에서든 전환 가능(마이페이지와 동일). */}
      <AccountSwitcherCard compact />
      <div className="mb-5 pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          원장 대시보드
        </h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {doctorName} · 본인 글 활동·관리 (영구 noindex)
        </p>
      </div>

      {/* 1) 본인 글 KPI — 기간 토글 6종 */}
      <DoctorActivityKpis initialDays={1} dataByDays={kpiByDays} />

      {/* 2) 운영 프로그램 — Tool 카드 (admin 동일 패턴, doctor 한정 메뉴) */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
          운영 프로그램
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Q&A 카드 직접 작성 — admin 과 동일하게 원장 대시보드에도 노출. 통합 글쓰기 Q&A 탭. */}
          <Tool
            href="/write?tab=qa"
            emoji="📝"
            title="Q&A 카드 작성하기"
            desc="원장 명의 Q&A 카드를 직접 작성합니다"
          />
          <Tool
            href="/admin/cards"
            emoji="📚"
            title="전체 글 관리"
            desc="본인 카드 검색·필터·발행/보관 (본인 글 강제 필터링)"
          />
          <Tool
            href="/admin/cards?status=pending_review"
            emoji="⏳"
            title="검수 대기"
            desc={
              pendingCount > 0
                ? `검수 대기 ${pendingCount}건`
                : "검수 후 발행 대기"
            }
            highlight={pendingCount > 0}
          />
          {doctorSlug && (
            <Tool
              href={`/admin/doctors/${doctorSlug}/edit`}
              emoji="👤"
              title="원장 프로필 편집"
              desc="본인 소개·사진·전문분야 수정"
            />
          )}
          <Tool
            href="/admin/comments"
            emoji="💬"
            title="댓글 관리"
            desc="본인 카드의 댓글 모더레이션"
          />
        </div>
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          새 글 쓰기는 우하단 글쓰기 버튼 또는{" "}
          <Link
            href="/write"
            className="underline hover:text-[var(--primary)]"
          >
            /write
          </Link>{" "}
          로.
        </p>
      </div>

      {/* 3) 인기 검색어 / 인기 태그 — 사이트 전체 (admin 동일 컴포넌트 재사용) */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <PopularSearchesCard initialDays={1} dataByDays={searchesByDays} />
        <PopularTagsCard initialDays={0} dataByDays={tagsByDays} />
      </div>
    </section>
  );
}

/** admin/page.tsx 의 Tool 컴포넌트 동일 스타일. */
function Tool({
  href,
  emoji,
  title,
  desc,
  highlight,
}: {
  href: string;
  emoji: string;
  title: string;
  desc: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "group flex items-center gap-3 rounded-[var(--radius)] border bg-white p-4 transition-colors " +
        (highlight
          ? "border-amber-300 hover:border-amber-400"
          : "border-[var(--border)] hover:border-[var(--primary)]")
      }
    >
      <div className="text-2xl">{emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-[var(--text)]">{title}</div>
        <div className="mt-0.5 text-xs text-[var(--text-muted)]">{desc}</div>
      </div>
    </Link>
  );
}
