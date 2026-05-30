/**
 * GET /api/admin/slug-check?doctorId&year&slug&excludeCardId
 *
 * slug 편집 UI 공용 중복·형식 검사 (2026-05-30).
 *   draft 화면 / edit 화면이 같은 이 API 를 호출 (규칙 엇갈림 방지).
 *
 * 가드: requireAdmin — ★ active 명함이 admin 일 때만 (계정/사람 아님, ADR 0012).
 *   원장 명함으로 로그인하면 isSuperAdmin=false → 403.
 *
 * 응답: { available, reason, normalized, suggestion }
 *   - available: 그 (doctor_id, post_year) 에 normalized slug 가 비어 있는지
 *   - reason: 'ok' | 'taken' | 'invalid_format'
 *   - normalized: 입력을 형식 규칙으로 정규화한 값
 *   - suggestion: 사용 가능한 대안 (taken 이면 -2/-3 부여, ok 면 normalized)
 *
 * 검사 범위는 DB 부분 UNIQUE 인덱스(cards_doctor_year_slug_uidx)와 동일:
 *   doctor_id NOT NULL + post_slug NOT NULL 인 모든 행 (status/삭제 무관).
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-guard";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import {
  isValidPostSlug,
  normalizeToSlug,
  resolveSlugCollision,
} from "@/data/procedure-mappings/slug-mapping";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const limited = await rateLimit({
    request: req,
    bucketPrefix: "admin-slug-check",
    userId: guard.userId,
    max: 60,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const url = new URL(req.url);
  const doctorIdRaw = (url.searchParams.get("doctorId") ?? "").trim();
  const doctorSlug = (url.searchParams.get("doctorSlug") ?? "").trim();
  const yearRaw = (url.searchParams.get("year") ?? "").trim();
  const slugRaw = url.searchParams.get("slug") ?? "";
  const excludeRaw = url.searchParams.get("excludeCardId");

  const admin = createSupabaseAdminClient();

  // doctor 식별: doctorId(uuid) 우선, 없으면 doctorSlug → id 해석 (draft 화면은 slug 만 보유).
  let doctorId = "";
  if (UUID_RE.test(doctorIdRaw)) {
    doctorId = doctorIdRaw;
  } else if (doctorSlug && /^[a-z0-9-]{1,60}$/.test(doctorSlug)) {
    const { data: doc } = await admin
      .from("doctors")
      .select("id")
      .eq("slug", doctorSlug)
      .maybeSingle();
    doctorId = (doc as { id?: string } | null)?.id ?? "";
  }
  if (!UUID_RE.test(doctorId)) {
    return errorResponse(null, "invalid_input", "[slug-check] doctor", 400, undefined, {
      userMessage: "doctor 식별 실패 (doctorId 또는 doctorSlug 필요)",
    });
  }
  const year = Number.parseInt(yearRaw, 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return errorResponse(null, "invalid_input", "[slug-check] year", 400, undefined, {
      userMessage: "post_year 형식 오류",
    });
  }
  const excludeCardId =
    excludeRaw && /^\d+$/.test(excludeRaw) ? Number.parseInt(excludeRaw, 10) : null;

  const normalized = normalizeToSlug(slugRaw);
  if (!isValidPostSlug(normalized)) {
    return NextResponse.json({
      available: false,
      reason: "invalid_format",
      normalized,
      suggestion: null,
    });
  }

  const { data, error } = await admin
    .from("cards")
    .select("id, post_slug")
    .eq("doctor_id", doctorId)
    .eq("post_year", year)
    .not("post_slug", "is", null);
  if (error) {
    return errorResponse(error, "generic", "[slug-check] query", 500);
  }

  const existing = new Set<string>(
    (data ?? [])
      .filter((r) => excludeCardId == null || (r as { id: number }).id !== excludeCardId)
      .map((r) => (r as { post_slug: string | null }).post_slug)
      .filter((s): s is string => !!s),
  );

  const available = !existing.has(normalized);
  const suggestion = available ? normalized : resolveSlugCollision(normalized, existing);

  return NextResponse.json({
    available,
    reason: available ? "ok" : "taken",
    normalized,
    suggestion,
  });
}
