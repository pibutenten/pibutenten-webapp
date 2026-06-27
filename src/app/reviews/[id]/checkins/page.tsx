import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";
import CheckinView from "./CheckinView";
import {
  CHECKIN_TIMEPOINTS,
  type CheckinTimepoint,
  type CheckinPrefill,
} from "./checkin-shared";

export const dynamic = "force-dynamic";

// 소유자 전용 시계열 체크인 폼 — 알림 딥링크 진입. 색인 차단.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * /reviews/{id}/checkins?t={timepoint} — 시점별 체크인 입력 페이지 (서버 컴포넌트).
 *
 * 알림 딥링크 진입점. URL 형식은 scheduled_notification.url 적재 로직과 정확히 일치한다:
 *   create_visit_with_entries / 0302_lenient_visit_date.sql 의 트랙A 예약 적재
 *   ('/reviews/' || pr.id || '/checkins?t=' || tp.timepoint).
 *   → [id] = procedure_reviews.id(bigint), t = week1 | month1 | month4.
 *
 * 흐름:
 *   1. id(숫자)·t(timepoint) 형식 검증. 어긋나면 404.
 *   2. 비로그인 → /login?next=...
 *   3. 후기(procedure_reviews) 로드. 없으면 404.
 *   4. 소유권: 후기 author 본인(묶음) 또는 admin 만. 아니면 404(노출 차단).
 *   5. 해당 시점 기존 review_checkin 값 prefill(upsert) → CheckinView.
 *      제출은 POST /api/reviews/checkins(upsert_review_checkin RPC) 가 권한 재검증.
 *
 * 추이 그래프는 본 화면 범위 아님(입력 폼만).
 */
type ReviewRow = {
  id: number;
  author_id: string | null;
  procedure_ko: string | null;
};

type CheckinRow = {
  satisfaction: number | null;
  recommend: number | null;
  effect_felt: number | null;
  pain: number | null;
  changed_points: string[] | null;
};

/** ?t= 쿼리 → 유효 timepoint 만 통과(없으면 null). day0 는 즉시 입력이라 딥링크 대상 아님. */
function parseTimepoint(raw: string | string[] | undefined): CheckinTimepoint | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return CHECKIN_TIMEPOINTS.includes(v as CheckinTimepoint)
    ? (v as CheckinTimepoint)
    : null;
}

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  // 1. id 형식(양의 정수) + timepoint 형식 검증.
  if (!/^\d+$/.test(id)) notFound();
  const reviewId = Number(id);
  if (!Number.isSafeInteger(reviewId) || reviewId < 1) notFound();
  const timepoint = parseTimepoint(sp.t);
  if (!timepoint) notFound();

  const supabase = await createSupabaseServerClient();

  // 2. 로그인 검증 — 비로그인이면 로그인 후 같은 딥링크로 복귀.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // 딥링크가 쿼리스트링(?t=)을 포함하므로 next 를 인코딩해 로그인 후 시점까지 보존.
    const next = encodeURIComponent(`/reviews/${reviewId}/checkins?t=${timepoint}`);
    redirect(`/login?next=${next}`);
  }

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) redirect("/login?error=프로필을 찾을 수 없습니다");

  // 3. 후기 로드(procedure_reviews). 없으면 404.
  const { data: review } = await supabase
    .from("procedure_reviews")
    .select("id, author_id, procedure_ko")
    .eq("id", reviewId)
    .maybeSingle()
    .returns<ReviewRow>();
  if (!review) notFound();

  // 4. 소유권 — admin(묶음 내 admin 명함) 또는 후기 author 본인(묶음).
  //    upsert_review_checkin RPC 권한 검증(author 묶음 = auth.uid())과 동일 기준.
  let authorized = idCtx.active.role === ROLES.ADMIN;
  if (!authorized) {
    const { data: adminRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("role", ROLES.ADMIN)
      .maybeSingle();
    if (adminRow) authorized = true;
  }
  if (!authorized && review.author_id) {
    const { data: ownerRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", review.author_id)
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (ownerRow) authorized = true;
  }
  if (!authorized) notFound();

  // 5. 해당 시점 기존 체크인 값 prefill(이미 입력했으면 upsert 로 덮어쓰기).
  const { data: existing } = await supabase
    .from("review_checkin")
    .select("satisfaction, recommend, effect_felt, pain, changed_points")
    .eq("review_id", reviewId)
    .eq("timepoint", timepoint)
    .maybeSingle()
    .returns<CheckinRow>();

  const prefill: CheckinPrefill = {
    satisfaction: existing?.satisfaction ?? null,
    recommend: existing?.recommend ?? null,
    effectFelt: existing?.effect_felt ?? null,
    pain: existing?.pain ?? null,
    changedPoints: existing?.changed_points ?? [],
  };

  // 6. 단답 질문 풀 — 이 시점(week1/month1/month4) + 공통('any') 활성 질문만 로드(단답 2칸이 사용).
  //    단독 후기폼('any'만)과 달리 시점별 질문을 함께 불러오는 게 차이점.
  //    RLS(question_pool_read_active)가 is_active=true 만 노출하나 명시적으로 한 번 더 필터.
  //    비면 빈 배열 → 폼이 단답 블록을 graceful 숨김.
  const { data: qpRows } = await supabase
    .from("question_pool")
    .select("id, question_text")
    .in("timepoint", [timepoint, "any"])
    .eq("is_active", true)
    .order("id", { ascending: true });
  const shortAnswerQuestions = (qpRows ?? []).map((r) => ({
    id: r.id as number,
    text: r.question_text as string,
  }));

  return (
    <CheckinView
      reviewId={reviewId}
      timepoint={timepoint}
      procedureKo={review.procedure_ko}
      prefill={prefill}
      shortAnswerQuestions={shortAnswerQuestions}
    />
  );
}
