/**
 * POST /api/admin/tag-dictionary/[id]/rename
 *
 * 태그 한글(ko) 자체 rename — 단순 셀 저장(PATCH)과 분리된 위험 작업.
 * 2단계 #2. ko 는 cards.keywords(자유텍스트 배열)와 시술 태그의 경우
 * procedure_taxonomy(ko) → procedure_reviews 가 참조하므로 전파가 필요.
 *
 * 2-step 게이트:
 *   - confirm=false (미리보기): 영향 카드 수·후기 수·충돌 여부만 반환. DB 변경 없음.
 *   - confirm=true (확정): rename_tag RPC(단일 tx 전파) 실행.
 *
 * 권한: requireAdmin (active 명함 단위 admin, ADR 0012) + service_role RPC.
 * 부수: audit_logs('tag_dictionary.rename').
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-guard";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { logAudit } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    newKo: z.string().trim().min(1).max(120),
    confirm: z.boolean().optional().default(false),
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const limited = await rateLimit({
    request: req,
    bucketPrefix: "admin-tagdict-rename",
    userId: guard.userId,
    max: 40,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const { id: idRaw } = await params;
  const id = Number.parseInt(idRaw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return errorResponse(null, "invalid_input", "[tag rename] invalid id", 400, undefined, {
      userMessage: "유효하지 않은 태그 ID",
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[tag rename] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[tag rename] zod", 400, undefined, {
      userMessage: "변경할 태그 이름이 올바르지 않습니다.",
    });
  }
  const { newKo, confirm } = parsed.data;

  const admin = createSupabaseAdminClient();

  // 현재 태그
  const { data: cur, error: curErr } = await admin
    .from("tag_dictionary")
    .select("id, ko, is_procedure")
    .eq("id", id)
    .maybeSingle();
  if (curErr) return errorResponse(curErr, "save_failed", "[tag rename] fetch");
  if (!cur) {
    return errorResponse(null, "not_found", "[tag rename] not found", 404, undefined, {
      userMessage: "태그를 찾을 수 없습니다.",
    });
  }
  const oldKo = cur.ko as string;
  const isProc = Boolean(cur.is_procedure);

  if (newKo === oldKo) {
    return NextResponse.json({
      ok: true,
      unchanged: true,
      oldKo,
      newKo,
      isProcedure: isProc,
      affectedCards: 0,
      affectedReviews: 0,
      conflict: false,
    });
  }

  // 충돌 체크 (사전 + 시술 분류표)
  const { data: dup } = await admin
    .from("tag_dictionary")
    .select("id")
    .eq("ko", newKo)
    .neq("id", id)
    .maybeSingle();
  // 시술 태그는 tag_dictionary 단일 SSOT (procedure_taxonomy 청산 2026-06-06). 사전 충돌만 검사.
  const conflict = !!dup;
  const conflictReason = conflict ? "사전에 이미 같은 이름의 태그가 있어요." : null;

  // 영향 규모
  const { count: cardsCount } = await admin
    .from("cards")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .contains("keywords", [oldKo]);
  const affectedCards = cardsCount ?? 0;
  let affectedReviews = 0;
  if (isProc) {
    const { count: revCount } = await admin
      .from("procedure_reviews")
      .select("id", { count: "exact", head: true })
      .eq("procedure_ko", oldKo);
    affectedReviews = revCount ?? 0;
  }

  // 미리보기 — DB 변경 없음
  if (!confirm) {
    return NextResponse.json({
      ok: true,
      preview: true,
      oldKo,
      newKo,
      isProcedure: isProc,
      affectedCards,
      affectedReviews,
      conflict,
      conflictReason,
    });
  }

  // 확정 — 충돌이면 차단
  if (conflict) {
    return errorResponse(null, "invalid_input", "[tag rename] conflict", 409, undefined, {
      userMessage: conflictReason ?? "이미 같은 이름이 있어 변경할 수 없어요.",
    });
  }

  const { data: result, error: rpcErr } = await admin.rpc("rename_tag", {
    p_id: id,
    p_new_ko: newKo,
  });
  if (rpcErr) return errorResponse(rpcErr, "save_failed", "[tag rename] rpc");

  const r = (result ?? {}) as {
    old?: string;
    new?: string;
    is_procedure?: boolean;
    affected_cards?: number;
    affected_reviews?: number;
  };

  await logAudit({
    action: "tag_dictionary.rename",
    actorProfileId: guard.activeProfileId,
    actorAuthUserId: guard.userId,
    targetTable: "tag_dictionary",
    targetId: id,
    request: req,
    metadata: {
      old: oldKo,
      new: newKo,
      is_procedure: isProc,
      affected_cards: r.affected_cards ?? affectedCards,
      affected_reviews: r.affected_reviews ?? affectedReviews,
    },
  });

  return NextResponse.json({
    ok: true,
    oldKo: r.old ?? oldKo,
    newKo: r.new ?? newKo,
    isProcedure: r.is_procedure ?? isProc,
    affectedCards: r.affected_cards ?? affectedCards,
    affectedReviews: r.affected_reviews ?? affectedReviews,
  });
}
