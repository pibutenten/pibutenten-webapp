import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { getReviewProcedures } from "@/lib/review-procedures";
import ReviewNewView from "./ReviewNewView";

export const dynamic = "force-dynamic";

// 로그인 필요 작성 폼 — robots.ts 가 /review 를 막지 않으므로 page-level noindex 로 색인 차단.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * /review/new — 시술후기 작성 페이지 (P3-d, 서버 컴포넌트).
 *
 * 흐름 (write/page.tsx 모사):
 *   1. 비로그인 → /login?next=/review/new.
 *   2. active identity 없음 → /login?error=...
 *   3. 미온보딩(birthdate NULL)은 middleware 가 /onboarding 으로 자동 게이트.
 *   4. 시술 선택지는 getReviewProcedures 헬퍼(태그 인기순) — /review/[shortcode]/edit 와 공유.
 *   5. active handle 도 전달 — 제출 성공 시 /{handle}/{shortcode} 상세 이동에 사용.
 */
export default async function ReviewNewPage({
  searchParams,
}: {
  searchParams: Promise<{ procedure?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/review/new");

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) redirect("/login?error=프로필을 찾을 수 없습니다");

  const procedures = await getReviewProcedures(supabase);

  // ?procedure 값이 taxonomy 의 ko 에 실제 존재할 때만 미리선택. 없으면 undefined → 평소처럼 고르게.
  const initialProcedure =
    sp.procedure && procedures.some((p) => p.value === sp.procedure)
      ? sp.procedure
      : undefined;

  // 본문(ReviewForm)은 운영 형태 그대로 유지하되 앱 셸로 감싸 렌더(WriteView 선례 동일).
  //   데이터·권한 가드는 위 server 로직이 책임, 표시(셸 래핑)만 View 에 위임.
  return (
    <ReviewNewView
      procedures={procedures}
      handle={idCtx.active.handle}
      initialProcedure={initialProcedure}
    />
  );
}
