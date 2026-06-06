/**
 * POST /api/admin/tag-dictionary/merge-dismiss
 *
 * 병합 후보 무시목록에 영문 태그 ko 추가 (H). 자동등록으로 재유입돼도 후보로 안 뜨게.
 * body.ko = 제외할 태그 ko. 멱등(이미 있으면 무동작).
 * 권한: requireAdmin(ADR 0012) + service_role.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-guard";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ ko: z.string().trim().min(1).max(120) }).strict();

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const limited = await rateLimit({
    request: req,
    bucketPrefix: "admin-tagdict-dismiss",
    userId: guard.userId,
    max: 120,
    windowSeconds: 60,
  });
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[merge-dismiss] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[merge-dismiss] zod", 400, undefined, {
      userMessage: "제외할 태그가 올바르지 않습니다.",
    });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("tag_merge_dismissed")
    .upsert({ ko: parsed.data.ko }, { onConflict: "ko" });
  if (error) return errorResponse(error, "save_failed", "[merge-dismiss] upsert");

  return NextResponse.json({ ok: true, ko: parsed.data.ko });
}
