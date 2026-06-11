import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { DiaryCreateSchema } from "@/lib/schema/api/diaries";

export const dynamic = "force-dynamic";

/**
 * POST /api/diaries — 시술일기(비공개) 생성.
 *
 * 시술후기(/api/reviews)와 달리 공개 콘텐츠가 아니므로 shortcode·검수·마스킹 없음.
 * diaries 1행 + diary_procedures N행을 create_diary RPC 가 원자적으로 INSERT.
 *
 * 흐름:
 *   1. active identity(로그인) 확인 — 없으면 401.
 *   2. rate limit (분당 10회).
 *   3. zod 형식·크기 검증.
 *   4. 시술명 → tag_dictionary 매칭(있는 것만 tag_dict_ko 로 연결, FK 위반 방지).
 *   5. create_diary RPC(p_profile_id=active.profileId). 소유검증·CHECK 는 RPC/RLS 가 보장.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  // 1. active identity — 비공개 데이터지만 소유자(active 명함)로 저장. 온보딩 게이트는 불필요(공개 X).
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[diaries POST] auth required", 401, undefined, {
      userMessage: "로그인 후 저장할 수 있어요.",
    });
  }
  const user = idCtx.user;

  // 2. rate limit — 도배 방어.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "diaries-post",
    userId: user.id,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // 3. zod 검증.
  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[diaries POST] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식입니다.",
    });
  }
  const parsed = DiaryCreateSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[diaries POST] zod", 400, undefined, {
      userMessage: "입력 형식이 올바르지 않습니다.",
      devOnly: {
        issues: parsed.error.issues.slice(0, 5).map((iss) => ({
          path: iss.path.join("."),
          code: iss.code,
        })),
      },
    });
  }
  const p = parsed.data;

  // 4. 시술명 → tag_dictionary(is_procedure) 매칭. 존재하는 것만 tag_dict_ko 로 연결(FK 위반 방지).
  const procKos = Array.from(new Set(p.procedures.map((pr) => pr.procedure_ko)));
  const { data: tagRows } = await supabase
    .from("tag_dictionary")
    .select("ko")
    .eq("is_procedure", true)
    .in("ko", procKos);
  const validTags = new Set((tagRows ?? []).map((r) => (r as { ko: string }).ko));

  // 5. create_diary RPC — 원자적 부모+자식 INSERT. 소유검증은 RPC 내부(auth.uid()).
  const { data: diaryId, error } = await supabase.rpc("create_diary", {
    p_profile_id: idCtx.active.profileId,
    p_visited_on: p.visited_on,
    p_clinic_id: p.clinic_id ?? null,
    p_clinic_name: p.clinic_name ?? null,
    p_clinic_addr: p.clinic_addr ?? null,
    p_clinic_tel: p.clinic_tel ?? null,
    p_clinic_x: p.clinic_x ?? null,
    p_clinic_y: p.clinic_y ?? null,
    p_doctor_name: p.doctor_name ?? null,
    p_manager_name: p.manager_name ?? null,
    p_diary_body: p.diary_body ?? null,
    p_procedures: p.procedures.map((pr, i) => ({
      procedure_ko: pr.procedure_ko,
      tag_dict_ko: validTags.has(pr.procedure_ko) ? pr.procedure_ko : null,
      unit_text: pr.unit_text ?? null,
      price: pr.price ?? null,
      note: pr.note ?? null,
      sort_order: i,
    })),
  });
  if (error) {
    return errorResponse(error, "save_failed", "[diaries POST] create_diary", 500, undefined, {
      userMessage: "저장에 실패했어요. 잠시 후 다시 시도해주세요.",
    });
  }

  return NextResponse.json({ diary_id: diaryId });
}
