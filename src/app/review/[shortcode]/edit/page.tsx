import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { getReviewProcedures } from "@/lib/review-procedures";
import { ROLES } from "@/lib/identity-shared";
import ReviewEditView from "./ReviewEditView";

export const dynamic = "force-dynamic";

// 소유자 전용 수정 폼 — robots.ts 가 /review 를 막지 않으므로 page-level noindex 로 색인 차단.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * /review/{shortcode}/edit — 시술후기 수정 페이지 (서버 컴포넌트).
 *
 * 일반 글 에디터(/write) 대신 후기 전용 에디터를 띄운다. 흐름:
 *   1. 비로그인 → /login?next=...
 *   2. 카드(type=review) + procedure_reviews 로드. 없으면 404.
 *   3. 소유권: admin 명함 또는 작성자 본인(묶음) 만. 아니면 404(노출 차단).
 *   4. 시술 선택지(getReviewProcedures) + 기존 값 프리필 → ReviewForm mode='edit'.
 *      시술명은 잠금(변경 불가). 제출은 PATCH /api/reviews/{shortcode}.
 */
type CardRow = {
  id: number;
  author_id: string | null;
  title: string | null;
  body: string | null;
};
type ReviewRow = {
  procedure_ko: string;
  satisfaction: number;
  pain: number;
  downtime: string | null;
  revisit: string;
  effect_areas: string[] | null;
  effect_onset: string | null;
};

export default async function ReviewEditPage({
  params,
}: {
  params: Promise<{ shortcode: string }>;
}) {
  const { shortcode } = await params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{6,12}$/.test(shortcode)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/review/${shortcode}/edit`);

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) redirect("/login?error=프로필을 찾을 수 없습니다");

  // 2. 카드 로드 (type=review).
  const { data: card } = await supabase
    .from("cards")
    .select("id, author_id, title, body")
    .eq("shortcode", shortcode)
    .eq("type", "review")
    .is("deleted_at", null)
    .maybeSingle()
    .returns<CardRow>();
  if (!card) notFound();

  // 3. 소유권 — admin(묶음 내 admin 명함) 또는 작성자 본인(묶음). RPC 권한 검증과 동일 기준.
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
  if (!authorized && card.author_id) {
    const { data: ownerRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", card.author_id)
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (ownerRow) authorized = true;
  }
  if (!authorized) notFound();

  // 정량 항목 로드.
  const { data: pr } = await supabase
    .from("procedure_reviews")
    .select("procedure_ko, satisfaction, pain, downtime, revisit, effect_areas, effect_onset")
    .eq("card_id", card.id)
    .maybeSingle()
    .returns<ReviewRow>();
  if (!pr) notFound();

  const procedures = await getReviewProcedures(supabase);

  // 본문(ReviewForm mode='edit')은 운영 형태 그대로 유지하되 베타 셸로 감싸 렌더(WriteView 선례 동일).
  //   카드/정량값 로드·소유권 가드·404 는 위 server 로직이 책임, 표시(셸 래핑)만 View 에 위임.
  return (
    <ReviewEditView
      procedures={procedures}
      handle={idCtx.active.handle}
      shortcode={shortcode}
      initial={{
        procedureKo: pr.procedure_ko,
        satisfaction: pr.satisfaction,
        pain: pr.pain,
        downtime: pr.downtime ?? "",
        revisit: pr.revisit,
        effectAreas: pr.effect_areas ?? [],
        effectOnset: pr.effect_onset ?? "",
        body: card.body ?? "",
      }}
    />
  );
}
