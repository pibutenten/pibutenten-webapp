import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { getReviewProcedures } from "@/lib/review-procedures";
import ReviewForm from "./ReviewForm";

export const dynamic = "force-dynamic";

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

  return (
    <ReviewForm
      procedures={procedures}
      handle={idCtx.active.handle}
      initialProcedure={initialProcedure}
    />
  );
}
