import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { mapClinicLinkRpcError, parseLinkId } from "@/lib/clinic-link-rpc";
import { ClinicVisitEditSchema } from "@/lib/schema/api/clinic";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

/**
 * PATCH · DELETE /api/clinic/visits/{visitId} — 병원: 시술노트 대행 수정·삭제 (S3a).
 *
 * clinic_update_visit / clinic_delete_visit RPC(0350) 위임. 대상 지정은 path param(diary_id).
 * 소유·연결 검증은 전부 RPC 내부(3중 소유경계 source='clinic' AND clinic_id=자기 AND
 * profile_id=연결회원 + active 만 revoked 차단 C2 + 후기 있으면 차단 C5·수정도 차단 §4.2-8).
 * 수정·삭제는 회원에게 알림 미발송(C13, RPC 가 담당).
 *
 * 가드: active 명함 role=clinic + clinic_id 보유(POST /api/clinic/visits 인라인 검사 계승).
 * rate limit: 사용자 단위 분당 30회(visits 관례). CSRF Origin 검증은 middleware.ts 가 담당(무중복).
 */

/** POST /api/clinic/visits 의 가드 3단(auth → clinic role → visitId 파싱)을 PATCH·DELETE 공유. */
async function guard(
  req: Request,
  ctx: { params: Promise<{ visitId: string }> },
  tag: string,
) {
  const { visitId: rawVisitId } = await ctx.params;
  const visitId = parseLinkId(rawVisitId);
  if (visitId === null) {
    return {
      error: errorResponse(null, "invalid_input", `${tag} bad id`, 400, undefined, {
        userMessage: "잘못된 주소입니다.",
      }),
    };
  }

  const supabase = await createSupabaseServerClient();
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return {
      error: errorResponse(null, "unauthorized", `${tag} auth required`, 401, undefined, {
        userMessage: "로그인이 필요합니다.",
      }),
    };
  }
  if (idCtx.active.role !== ROLES.CLINIC || idCtx.active.clinicId == null) {
    return {
      error: errorResponse(null, "forbidden", `${tag} clinic role required`, 403, undefined, {
        userMessage: "병원 계정만 사용할 수 있어요.",
      }),
    };
  }

  // active 비-null 확정 후 필요한 값만 추림(호출부 재-narrow 불필요).
  return { supabase, userId: idCtx.user.id, profileId: idCtx.active.profileId, visitId };
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ visitId: string }> },
) {
  const tag = "[clinic/visits/:visitId PATCH]";
  const g = await guard(req, ctx, tag);
  if (g.error) return g.error;
  const { supabase, userId, profileId, visitId } = g;

  const limited = await rateLimit({
    request: req,
    bucketPrefix: "clinic-visits-patch",
    userId,
    max: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", `${tag} body parse`, 400, undefined, {
      userMessage: "잘못된 요청 형식입니다.",
    });
  }
  const parsed = ClinicVisitEditSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", `${tag} zod`, 400, undefined, {
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

  // 시술명 → tag_dictionary(is_procedure) 매칭 — POST /api/clinic/visits 와 동일 로직.
  //   병원 폼은 tag_dict_ko 를 직접 보내지 않으므로 서버가 매칭해 채운다(사전 연결 정합 —
  //   미매칭 시 병원 대행 노트만 tag_dict_ko=NULL 이 되어 회원 노트와 데이터 품질이 갈라짐).
  const procKos = Array.from(new Set(p.procedures.map((pr) => pr.procedure_ko)));
  let validTags = new Set<string>();
  if (procKos.length > 0) {
    const { data: tagRows } = await supabase
      .from("tag_dictionary")
      .select("ko")
      .eq("is_procedure", true)
      .in("ko", procKos);
    validTags = new Set((tagRows ?? []).map((r) => (r as { ko: string }).ko));
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc("clinic_update_visit", {
    p_clinic_profile_id: profileId,
    p_diary_id: visitId,
    p_visited_on: p.visited_on,
    p_procedures: p.procedures.map((pr, i) => ({
      procedure_ko: pr.procedure_ko,
      // 클라 지정값 우선, 없으면 서버 매칭(사전 미등록은 RPC 가 최종 NULL 처리 — FK 이중 방어).
      tag_dict_ko: pr.tag_dict_ko ?? (validTags.has(pr.procedure_ko) ? pr.procedure_ko : null),
      unit_text: pr.unit_text ?? null,
      price: pr.price ?? null,
      note: pr.note ?? null,
      sort_order: pr.sort_order ?? i,
    })),
    p_doctor_id: p.doctor_id ?? null,
    p_doctor_name: p.doctor_name ?? null,
    p_manager_name: p.manager_name ?? null,
    p_diary_body: p.diary_body ?? null,
    p_total_price: p.total_price ?? null,
    p_next_appointment_date: p.next_appointment_date ?? null,
  });
  if (rpcErr) {
    return mapClinicLinkRpcError(rpcErr as { code?: string; message?: string }, tag);
  }

  return NextResponse.json({ visit_id: Number(rpcData) });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ visitId: string }> },
) {
  const tag = "[clinic/visits/:visitId DELETE]";
  const g = await guard(req, ctx, tag);
  if (g.error) return g.error;
  const { supabase, userId, profileId, visitId } = g;

  const limited = await rateLimit({
    request: req,
    bucketPrefix: "clinic-visits-delete",
    userId,
    max: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const { error: rpcErr } = await supabase.rpc("clinic_delete_visit", {
    p_clinic_profile_id: profileId,
    p_diary_id: visitId,
  });
  if (rpcErr) {
    return mapClinicLinkRpcError(rpcErr as { code?: string; message?: string }, tag);
  }

  return NextResponse.json({ ok: true });
}
