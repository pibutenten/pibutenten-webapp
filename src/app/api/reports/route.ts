/**
 * POST /api/reports — 콘텐츠 신고 접수 (보안 2.5차 B묶음, 2026-05-19)
 *
 * - 비로그인/로그인 모두 가능 (rate-limit 으로 abuse 방어).
 * - URL/카드 ID 자유 입력 + 사유 필수.
 * - admin 검토 큐로 직접 INSERT.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";

const ReportSchema = z
  .object({
    reason: z.enum([
      "spam",
      "harassment",
      "medical_ad",
      "false_info",
      "csam",
      "self_harm",
      "copyright",
      "personal_info",
      "other",
    ]),
    target_url: z.string().max(500).nullable().optional(),
    reporter_email: z.string().email().max(200).nullable().optional(),
    detail: z.string().max(2000).nullable().optional(),
    card_id: z.number().int().positive().nullable().optional(),
    comment_id: z.number().int().positive().nullable().optional(),
  })
  .strict();

export async function POST(req: Request) {
  // Identity 추출 — 로그인 사용자는 reporter_profile_id 자동 기록.
  const supabase = await createSupabaseServerClient();
  const idCtx = await getIdentityContext(supabase);
  const reporterProfileId = idCtx?.active?.profileId ?? null;

  // Rate limit: 분당 3건 (사용자 또는 IP 기준).
  // 비로그인 사용자가 다수 신고를 보내는 도배 패턴 방어.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "reports-post",
    userId: reporterProfileId,
    max: 3,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // 입력 검증.
  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }
  const parsed = ReportSchema.safeParse(rawJson);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_input",
        message: "입력값이 올바르지 않아요.",
      },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  // URL 또는 상세 사유 둘 중 하나는 필수 (UX 안전망).
  if (
    !payload.target_url?.trim() &&
    !payload.detail?.trim() &&
    !payload.card_id &&
    !payload.comment_id
  ) {
    return NextResponse.json(
      {
        error: "invalid_input",
        message: "신고 대상 URL 또는 상세 사유 중 하나는 입력해 주세요.",
      },
      { status: 400 },
    );
  }

  // service_role 로 INSERT — RLS 의 anon INSERT 정책이 있지만,
  // 비로그인 신고도 안정적으로 받기 위해 admin client 사용.
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("content_reports")
    .insert({
      card_id: payload.card_id ?? null,
      comment_id: payload.comment_id ?? null,
      reporter_profile_id: reporterProfileId,
      reporter_email: payload.reporter_email ?? null,
      target_url: payload.target_url ?? null,
      reason: payload.reason,
      detail: payload.detail ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return errorResponse(error, "save_failed", "[reports POST] insert", 500, {
      reporter_email: payload.reporter_email,
    });
  }

  return NextResponse.json({ ok: true, report_id: data.id });
}
