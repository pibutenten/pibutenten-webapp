/**
 * POST /api/admin/tag-dictionary/[id]/merge
 *
 * 태그 병합 (F-Phase2). [id] = source(흡수되어 삭제될 태그, 보통 영문/중복).
 * body.targetKo = 흡수할 대표어(유지). source 카드 keywords 를 target 으로 치환·dedup,
 * source 태그 삭제. rename(개명)과 분리 — target 이 이미 존재하는 중복 정리용.
 *
 * 2-step 게이트:
 *   - confirm=false (미리보기): source/target 존재·영향 카드 수만. DB 변경 없음.
 *   - confirm=true (확정): merge_tag RPC(단일 tx 전파).
 *
 * 권한: requireAdmin(ADR 0012) + service_role RPC. 부수: audit_logs('tag_dictionary.merge').
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
    targetKo: z.string().trim().min(1).max(120),
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
    bucketPrefix: "admin-tagdict-merge",
    userId: guard.userId,
    max: 60,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const { id: idRaw } = await params;
  const id = Number.parseInt(idRaw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return errorResponse(null, "invalid_input", "[tag merge] invalid id", 400, undefined, {
      userMessage: "유효하지 않은 태그 ID",
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[tag merge] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[tag merge] zod", 400, undefined, {
      userMessage: "병합 대상이 올바르지 않습니다.",
    });
  }
  const { targetKo, confirm } = parsed.data;

  const admin = createSupabaseAdminClient();

  const { data: src, error: srcErr } = await admin
    .from("tag_dictionary")
    .select("id, ko")
    .eq("id", id)
    .maybeSingle();
  if (srcErr) return errorResponse(srcErr, "save_failed", "[tag merge] fetch source");
  if (!src) {
    return errorResponse(null, "not_found", "[tag merge] source not found", 404, undefined, {
      userMessage: "병합할 태그를 찾을 수 없습니다.",
    });
  }
  const sourceKo = src.ko as string;

  if (sourceKo === targetKo) {
    return errorResponse(null, "invalid_input", "[tag merge] same tag", 400, undefined, {
      userMessage: "같은 태그로는 병합할 수 없습니다.",
    });
  }

  const { data: tgt } = await admin
    .from("tag_dictionary")
    .select("id")
    .eq("ko", targetKo)
    .maybeSingle();
  if (!tgt) {
    return errorResponse(null, "invalid_input", "[tag merge] target not found", 400, undefined, {
      userMessage: `대표 태그 '${targetKo}' 가 사전에 없습니다.`,
    });
  }

  const { count: cardsCount } = await admin
    .from("cards")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .contains("keywords", [sourceKo]);
  const affectedCards = cardsCount ?? 0;

  if (!confirm) {
    return NextResponse.json({
      ok: true,
      preview: true,
      sourceKo,
      targetKo,
      affectedCards,
    });
  }

  const { data: result, error: rpcErr } = await admin.rpc("merge_tag", {
    p_source_id: id,
    p_target_ko: targetKo,
  });
  if (rpcErr) return errorResponse(rpcErr, "save_failed", "[tag merge] rpc");

  const r = (result ?? {}) as { affected_cards?: number; affected_reviews?: number };

  await logAudit({
    action: "tag_dictionary.merge",
    actorProfileId: guard.activeProfileId,
    actorAuthUserId: guard.userId,
    targetTable: "tag_dictionary",
    targetId: id,
    request: req,
    metadata: {
      source: sourceKo,
      target: targetKo,
      affected_cards: r.affected_cards ?? affectedCards,
      affected_reviews: r.affected_reviews ?? 0,
    },
  });

  return NextResponse.json({
    ok: true,
    sourceKo,
    targetKo,
    affectedCards: r.affected_cards ?? affectedCards,
    affectedReviews: r.affected_reviews ?? 0,
  });
}
