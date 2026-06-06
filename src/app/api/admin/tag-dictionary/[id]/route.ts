/**
 * PATCH /api/admin/tag-dictionary/[id]
 *
 * 태그 매니저 인라인 편집 (2단계). tag_dictionary 한 행의
 * 분류·영문·부모·시술·온보딩을 수정.
 *
 * 권한: requireAdmin (active 명함 단위 admin, ADR 0012).
 * 검증: zod strict (부분 수정, 최소 1필드).
 * 부수: audit_logs('tag_dictionary.update').
 *
 * 주의: tag_dictionary 편집은 매니저 화면·DB 엔 즉시 반영되나, 사이트 색상·칩
 *   (categoryFor 스냅샷)은 다음 배포의 prebuild 스냅샷에서 반영된다.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-guard";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { logAudit } from "@/lib/audit-log";
import { slugifyEn } from "@/lib/tag-slug";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  "피부고민",
  "리프팅",
  "스킨부스터",
  "홈케어",
  "피부상식",
  "미지정",
] as const;

// 부분 수정 — 보낸 필드만 갱신. null 허용(en/parent_ko/onboarding 비우기).
const BodySchema = z
  .object({
    category: z.enum(CATEGORIES).optional(),
    en: z.string().trim().max(120).nullable().optional(),
    parent_ko: z.string().trim().max(120).nullable().optional(),
    is_procedure: z.boolean().optional(),
    onboarding: z.string().trim().max(40).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "수정할 필드가 없습니다.",
  });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const limited = await rateLimit({
    request: req,
    bucketPrefix: "admin-tagdict-patch",
    userId: guard.userId,
    max: 120,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const { id: idRaw } = await params;
  const id = Number.parseInt(idRaw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return errorResponse(null, "invalid_input", "[tag-dictionary PATCH] invalid id", 400, undefined, {
      userMessage: "유효하지 않은 태그 ID",
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[tag-dictionary PATCH] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[tag-dictionary PATCH] zod", 400, undefined, {
      userMessage: "수정 값이 올바르지 않습니다.",
    });
  }

  // 빈 문자열 → null 정규화 (en/parent_ko/onboarding)
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const d = parsed.data;
  if (d.category !== undefined) patch.category = d.category;
  if (d.is_procedure !== undefined) patch.is_procedure = d.is_procedure;
  // 영문은 slug 로 정규화 (E1). 정규화 결과가 빈 문자열이면 null.
  if (d.en !== undefined) patch.en = d.en ? slugifyEn(d.en) || null : null;
  if (d.parent_ko !== undefined) patch.parent_ko = d.parent_ko ? d.parent_ko : null;
  if (d.onboarding !== undefined) patch.onboarding = d.onboarding ? d.onboarding : null;

  const admin = createSupabaseAdminClient();
  const { data: updated, error } = await admin
    .from("tag_dictionary")
    .update(patch)
    .eq("id", id)
    .select("id, ko, category, en, parent_ko, is_procedure, onboarding")
    .maybeSingle();
  if (error) {
    return errorResponse(error, "save_failed", "[tag-dictionary PATCH] update", 500);
  }
  if (!updated) {
    return errorResponse(null, "not_found", "[tag-dictionary PATCH] not found", 404, undefined, {
      userMessage: "태그를 찾을 수 없습니다.",
    });
  }

  await logAudit({
    action: "tag_dictionary.update",
    actorProfileId: guard.activeProfileId,
    actorAuthUserId: guard.userId,
    targetTable: "tag_dictionary",
    targetId: id,
    request: req,
    metadata: { fields: Object.keys(patch).filter((k) => k !== "updated_at"), ko: (updated as { ko?: string }).ko },
  });

  return NextResponse.json({ ok: true, row: updated });
}
