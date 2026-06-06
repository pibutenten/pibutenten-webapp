/**
 * PUT /api/admin/doctors/[slug]/profile — 의사 확장 프로필 (`doctors.profile_data`) 저장.
 *
 * 배경 (2026-05-29):
 *   admin/doctors/[slug]/edit/DoctorProfileEditForm 이 그동안 브라우저 supabase
 *   client 로 `doctors` 테이블에 직접 UPDATE 를 시도했으나 production `doctors`
 *   에는 UPDATE RLS 정책 0개 + authenticated GRANT 0개라서 항상 "permission denied
 *   for table doctors" 로 실패하던 상태 (504d6ee 회귀 패턴과 동일 부류 — 클라이언트
 *   직접 write + 가드 부재). 본 라우트가 그 미완성 흐름을 완결.
 *
 * 권한:
 *   - super admin (active 명함 role='admin') → 모든 doctor 의 profile_data 수정
 *   - doctor admin 본인 (active.doctorId === target doctor.id) → 본인 것만
 *   - 그 외 (다른 의사 / 회원 / 비로그인) → 403
 *
 * 입력 (zod 화이트리스트):
 *   DoctorProfileData (lib/doctor-profile.ts SSOT) 의 12 필드만. strict 모드라
 *   알 수 없는 키는 자동 차단.
 *
 * DB write:
 *   service_role admin client 로 직접 UPDATE. `doctors` 테이블 표면적을 SELECT-only
 *   유지하기 위해 RLS/GRANT 변경 없이 라우트 가드로만 권한 책임 (504d6ee 패턴 정합).
 *
 * Audit:
 *   `doctor.profile_update` 적재. actor / target / via (super_admin | self_doctor).
 *
 * Rate limit: 사용자당 분당 10회.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { logAudit } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

// DoctorProfileData (SSOT: src/lib/doctor-profile.ts) 의 입력 형태를 zod 화이트리스트로.
//   - 배열 필드는 빈 항목 제거된 상태 (cleanState) 가 들어옴 — 각 항목 1~500자 (publications 만 1000).
//   - URL 필드는 URL 검증 + 최대 500자.
//   - 주소 필드는 평문, 최대 100자.
//   - .strict() 로 추가 키 차단.
const ProfileDataSchema = z
  .object({
    education: z.array(z.string().min(1).max(500)).max(20).optional(),
    career: z.array(z.string().min(1).max(500)).max(20).optional(),
    expertise: z.array(z.string().min(1).max(500)).max(20).optional(),
    memberOf: z.array(z.string().min(1).max(500)).max(20).optional(),
    publications: z.array(z.string().min(1).max(1000)).max(20).optional(),
    youtube: z.string().url().max(500).optional(),
    instagram: z.string().url().max(500).optional(),
    blog: z.string().url().max(500).optional(),
    threads: z.string().url().max(500).optional(),
    clinicUrl: z.string().url().max(500).optional(),
    addressRegion: z.string().max(100).optional(),
    addressLocality: z.string().max(100).optional(),
    // 학술·자격 (2026-06-06)
    orcid: z
      .string()
      .regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dXx]$/)
      .optional(),
    googleScholarUrl: z.string().url().max(500).optional(),
    pmids: z.array(z.string().regex(/^\d{1,12}$/)).max(10).optional(),
    societyRoles: z.array(z.string().min(1).max(200)).max(20).optional(),
    boardCertifiedYear: z.number().int().gte(1900).lte(2100).optional(),
  })
  .strict();

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;

  // slug 형식 가드 — doctors.slug 가 a-z0-9- 패턴 (지금 9명 모두 정합).
  if (!/^[a-z0-9-]+$/.test(slug) || slug.length > 60) {
    return errorResponse(null, "invalid_input", "[doctor profile PUT] bad slug", 400, undefined, {
      userMessage: "잘못된 의사 식별자",
    });
  }

  const supabase = await createSupabaseServerClient();
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.user || !idCtx.active) {
    return errorResponse(null, "unauthorized", "[doctor profile PUT] no auth", 401, undefined, {
      userMessage: "로그인이 필요합니다.",
    });
  }
  const user = idCtx.user;

  // Rate limit — 사용자당 분당 10회.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "doctor-profile-put",
    userId: user.id,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // Zod 입력 검증.
  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[doctor profile PUT] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }
  const parsed = ProfileDataSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[doctor profile PUT] zod", 400, undefined, {
      userMessage: "입력 형식이 올바르지 않습니다.",
      devOnly: {
        issues: parsed.error.issues.slice(0, 5).map((iss) => ({
          path: iss.path.join("."),
          code: iss.code,
        })),
      },
    });
  }
  const profile_data = parsed.data;

  // 대상 doctor 조회 (slug → id). SELECT 는 RLS 통과 (public read).
  const { data: doctor, error: fetchErr } = await supabase
    .from("doctors")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (fetchErr) {
    return errorResponse(fetchErr, "generic", "[doctor profile PUT] fetch", 500);
  }
  if (!doctor) {
    return errorResponse(null, "not_found", "[doctor profile PUT] doctor not found", 404, undefined, {
      userMessage: "의사를 찾을 수 없습니다.",
    });
  }

  // 권한 — super admin OR (doctor admin AND 본인 doctor).
  const isSuperAdmin = idCtx.isSuperAdmin;
  const isSelfDoctor =
    idCtx.isDoctorAdmin && !!idCtx.activeDoctorId && idCtx.activeDoctorId === doctor.id;
  if (!isSuperAdmin && !isSelfDoctor) {
    return errorResponse(null, "forbidden", "[doctor profile PUT] denied", 403, undefined, {
      userMessage: "본인 의사 프로필만 수정할 수 있습니다.",
    });
  }

  // UPDATE — admin client (service_role). doctors 테이블은 UPDATE RLS 정책 0 + GRANT 0
  // 이라 anon/authenticated 로는 통과 불가. 본 라우트가 권한을 책임진 위에서 service_role
  // 로 직접 update 하는 게 504d6ee 패턴 정합.
  const admin = createSupabaseAdminClient();
  const { error: updErr } = await admin
    .from("doctors")
    .update({ profile_data })
    .eq("id", doctor.id);
  if (updErr) {
    return errorResponse(updErr, "generic", "[doctor profile PUT] update", 500, undefined, {
      userMessage: "저장에 실패했습니다.",
    });
  }

  // Audit
  await logAudit({
    action: "doctor.profile_update",
    actorProfileId: idCtx.active.profileId,
    actorAuthUserId: user.id,
    targetTable: "doctors",
    targetId: doctor.id,
    request: req,
    metadata: {
      slug: doctor.slug,
      keys: Object.keys(profile_data),
      via: isSuperAdmin ? "super_admin" : "self_doctor",
    },
  });

  return NextResponse.json({ saved: true });
}
