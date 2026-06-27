import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { VisitUpdateSchema } from "@/lib/schema/api/visits";

export const dynamic = "force-dynamic";

/** path param(visit id) 파싱 — 양수 정수만. */
function parseVisitId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** RPC 에러 → HTTP 매핑(소유 위반 403 / 미존재 404 / 입력 400 / 기타 500). */
function mapVisitRpcError(rpcErr: { code?: string; message?: string }, ctx: string) {
  const code = rpcErr.code ?? "";
  const msg = typeof rpcErr.message === "string" ? rpcErr.message : "";
  if (code === "42501" || msg.includes("not_authorized")) {
    return errorResponse(rpcErr, "forbidden", `${ctx} not_authorized`, 403, undefined, {
      userMessage: "본인 시술노트만 변경할 수 있습니다.",
    });
  }
  if (code === "P0002" || msg.includes("visit_not_found")) {
    return errorResponse(rpcErr, "not_found", `${ctx} visit_not_found`, 404, undefined, {
      userMessage: "대상 시술노트를 찾을 수 없습니다.",
    });
  }
  if (code === "22023" || code === "22001") {
    return errorResponse(rpcErr, "invalid_input", `${ctx} rpc validation`, 400, undefined, {
      userMessage: "입력 형식이 올바르지 않습니다.",
    });
  }
  return errorResponse(rpcErr, "save_failed", `${ctx} rpc`, 500, undefined, {
    userMessage: "처리에 실패했어요. 잠시 후 다시 시도해주세요.",
  });
}

/**
 * PATCH /api/visits/{id} — 시술노트 본문 전체 덮어쓰기.
 *
 * update_visit RPC(0297) 를 위임. 폼이 항상 전체 값을 전송하는 전제로 모든 clinic·precision
 * 컬럼을 받은 값으로 SET(§3.4 전체 덮어쓰기). 자식 후기·시술 목록은 미수정(v1, D-J).
 * 소유 검증은 RPC 내부(42501 → 403).
 *
 * CSRF Origin 검증은 middleware.ts 가 unsafe-method /api/* 에 적용(라우트 무중복).
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const visitId = parseVisitId(id);
  if (visitId === null) {
    return errorResponse(null, "invalid_input", "[visits PATCH] bad id", 400, undefined, {
      userMessage: "잘못된 주소입니다.",
    });
  }

  const supabase = await createSupabaseServerClient();

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[visits PATCH] auth required", 401, undefined, {
      userMessage: "로그인 후 변경할 수 있어요.",
    });
  }
  const user = idCtx.user;

  const limited = await rateLimit({
    request: req,
    bucketPrefix: "visits-patch",
    userId: user.id,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[visits PATCH] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식입니다.",
    });
  }
  const parsed = VisitUpdateSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[visits PATCH] zod", 400, undefined, {
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

  const { error: rpcErr } = await supabase.rpc("update_visit", {
    p_visit_id: visitId,
    p_visited_on: p.visited_on,
    p_visited_on_precision: p.visited_on_precision,
    p_clinic_id: p.clinic_id ?? null,
    p_clinic_name: p.clinic_name ?? null,
    p_clinic_addr: p.clinic_addr ?? null,
    p_clinic_tel: p.clinic_tel ?? null,
    p_clinic_x: p.clinic_x ?? null,
    p_clinic_y: p.clinic_y ?? null,
    p_clinic_home: p.clinic_home ?? null,
    p_clinic_kakao: p.clinic_kakao ?? null,
    p_doctor_name: p.doctor_name ?? null,
    p_manager_name: p.manager_name ?? null,
    p_diary_body: p.diary_body ?? null,
    p_total_price: p.total_price ?? null,
    p_is_complete: p.is_complete,
  });
  if (rpcErr) {
    return mapVisitRpcError(rpcErr as { code?: string; message?: string }, "[visits PATCH]");
  }

  // 캐시 무효화 — visit 은 비공개라 SEO 무관이나 /notes 등 본인 화면 ISR 정합 위해 프로필 재검증.
  try {
    revalidatePath("/");
    if (idCtx.active.handle) revalidatePath(`/${idCtx.active.handle}`);
  } catch {
    /* noop */
  }

  return NextResponse.json({ visit_id: visitId });
}

/**
 * DELETE /api/visits/{id} — 시술노트 단건 삭제(v1 필수, D-I).
 *
 * delete_visit RPC(0297) 를 위임. 연결 후기를 standalone 전환 + 트랙A pending 예약 cancel 후
 * 일기 삭제(raw DELETE FROM diaries 금지 — source_link_chk × SET NULL 모순 회피).
 * 소유 검증은 RPC 내부(42501 → 403).
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const visitId = parseVisitId(id);
  if (visitId === null) {
    return errorResponse(null, "invalid_input", "[visits DELETE] bad id", 400, undefined, {
      userMessage: "잘못된 주소입니다.",
    });
  }

  const supabase = await createSupabaseServerClient();

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[visits DELETE] auth required", 401, undefined, {
      userMessage: "로그인 후 삭제할 수 있어요.",
    });
  }
  const user = idCtx.user;

  const limited = await rateLimit({
    request: req,
    bucketPrefix: "visits-delete",
    userId: user.id,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const { error: rpcErr } = await supabase.rpc("delete_visit", {
    p_visit_id: visitId,
  });
  if (rpcErr) {
    return mapVisitRpcError(rpcErr as { code?: string; message?: string }, "[visits DELETE]");
  }

  // 캐시 무효화 — 삭제로 본인 프로필·피드에서 빠질 수 있어 재검증.
  try {
    revalidatePath("/");
    if (idCtx.active.handle) revalidatePath(`/${idCtx.active.handle}`);
  } catch {
    /* noop */
  }

  return NextResponse.json({ visit_id: visitId, deleted: true });
}
