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
  searchParams: Promise<{ procedure?: string; visit?: string; dp?: string }>;
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

  // 노트↔후기 연결(2c) — 시술노트 상세의 '시술후기 쓰기'가 넘긴 ?visit=&dp= 를 수용.
  //   그 visit 이 active 명함 소유(diaries.profile_id)일 때만 통과 → 폼이 payload 에 담아 제출.
  //   미소유·비정수·미존재면 무시(=standalone 폴백). RPC 가 최종 검증하나 여기서도 사전 확인(친절).
  //   판정은 FK 기준(id) — 텍스트매칭 없음.
  const visitIdRaw = Number.parseInt(sp.visit ?? "", 10);
  const dpIdRaw = Number.parseInt(sp.dp ?? "", 10);
  let visitId: number | undefined;
  let diaryProcedureId: number | undefined;
  if (Number.isFinite(visitIdRaw) && visitIdRaw > 0) {
    const { data: ownVisit } = await supabase
      .from("diaries")
      .select("id")
      .eq("id", visitIdRaw)
      .eq("profile_id", idCtx.active.profileId)
      .maybeSingle();
    if (ownVisit) {
      visitId = visitIdRaw;
      // dp 는 visit 이 유효할 때만 의미 — 그 방문 소속 시술(diary_procedures.diary_id=visit)만 통과.
      if (Number.isFinite(dpIdRaw) && dpIdRaw > 0) {
        const { data: ownDp } = await supabase
          .from("diary_procedures")
          .select("id")
          .eq("id", dpIdRaw)
          .eq("diary_id", visitIdRaw)
          .maybeSingle();
        if (ownDp) diaryProcedureId = dpIdRaw;
      }
    }
  }

  // 단답 질문 풀 — 시점 무관('any') 활성 질문만 폼에 전달(단답 2칸이 사용).
  //   RLS(question_pool_read_active)가 is_active=true 만 노출하나, 명시적으로 한 번 더 필터.
  //   비면 빈 배열 → 폼이 단답 블록을 graceful 숨김.
  const { data: qpRows } = await supabase
    .from("question_pool")
    .select("id, question_text")
    .eq("timepoint", "any")
    .eq("is_active", true)
    .order("id", { ascending: true });
  const shortAnswerQuestions = (qpRows ?? []).map((r) => ({
    id: r.id as number,
    text: r.question_text as string,
  }));

  // 본문(ReviewForm)은 운영 형태 그대로 유지하되 앱 셸로 감싸 렌더(WriteView 선례 동일).
  //   데이터·권한 가드는 위 server 로직이 책임, 표시(셸 래핑)만 View 에 위임.
  return (
    <ReviewNewView
      procedures={procedures}
      handle={idCtx.active.handle}
      initialProcedure={initialProcedure}
      shortAnswerQuestions={shortAnswerQuestions}
      visitId={visitId}
      diaryProcedureId={diaryProcedureId}
    />
  );
}
