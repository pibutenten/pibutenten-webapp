/**
 * PUT /api/admin/doctors/[slug]/settings — 원장 운영 설정 저장 (super admin 전용, 2026-07-05).
 *
 * 배경 (마이그 0341 · docs/plans/260704 병원계정 시술기록 대행입력 계획.md):
 *   0341 이 doctors 에 clinic_id(근무 지점 FK)·is_affiliated(재직)·is_listed(공개)
 *   3개 필드를 추가했다. 본 라우트가 관리자에게 이 값들의 수정 경로를 제공한다.
 *   profile_data(경력·SNS 등 확장 프로필)는 별도 라우트(../profile)에서 다루고,
 *   본 라우트는 운영 설정(소속·재직·공개·slug)만 다룬다. name 은 여기서 다루지 않음.
 *
 * 권한:
 *   requireAdmin (active 명함 role='admin' = super admin) 전용.
 *   원장 본인(active=doctor)은 requireAdmin 이 403 → 통과 못 함(의도된 설계).
 *   운영 설정(공개·소속·URL slug)은 운영진만 조정.
 *
 * 입력 (zod strict):
 *   - clinic_id: number(5지점 화이트리스트) | null
 *   - is_affiliated: boolean
 *   - is_listed: boolean
 *   - slug: string(optional) — URL 안정성 규칙(아래) 하에서만 변경 허용
 *
 * slug 변경 규칙 (URL 안정성):
 *   현재 대상이 미공개(is_listed=false)일 때만 slug 변경 허용.
 *   공개(is_listed=true) 상태면 slug 변경을 409 로 거부(공개 URL 은 불변).
 *   형식(^[a-z0-9]([a-z0-9-]*[a-z0-9])?$) + 중복(doctors.slug UNIQUE) 검증.
 *   ※ 판정 기준은 요청 body 의 is_listed 가 아니라 DB 의 "현재" is_listed.
 *
 * DB write:
 *   service_role admin client 로 직접 UPDATE. doctors 는 UPDATE RLS 정책 0 + GRANT 0
 *   이라 anon/authenticated 로는 통과 불가 — 본 라우트가 가드를 책임진 위에서
 *   service_role 로 update(../profile 라우트와 동일 패턴).
 *
 * Audit:
 *   `doctor.settings_update` 적재. via='super_admin', 변경 키 기록.
 *
 * Rate limit: 사용자당 분당 10회.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-guard";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { logAudit } from "@/lib/audit-log";
import { isValidClinicId } from "@/lib/clinic-branches";

export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const SettingsSchema = z
  .object({
    // 근무 지점(건보 clinics 코드). 5지점 화이트리스트 또는 null(미지정).
    clinic_id: z
      .number()
      .int()
      .nullable()
      .refine((v) => v === null || isValidClinicId(v), {
        message: "허용되지 않은 지점입니다.",
      }),
    is_affiliated: z.boolean(),
    is_listed: z.boolean(),
    // slug 는 선택 — 오면 미공개일 때만 변경 적용(아래 규칙).
    slug: z
      .string()
      .trim()
      .transform((s) => s.toLowerCase())
      .pipe(z.string().min(2).max(50).regex(SLUG_RE, "slug 형식 오류"))
      .optional(),
  })
  .strict();

type DoctorRow = {
  id: string;
  slug: string;
  is_listed: boolean;
};

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug: pathSlug } = await ctx.params;

  // path slug 형식 가드 — doctors.slug 패턴.
  if (!/^[a-z0-9-]+$/.test(pathSlug) || pathSlug.length > 60) {
    return errorResponse(null, "invalid_input", "[doctor settings PUT] bad slug", 400, undefined, {
      userMessage: "잘못된 의사 식별자",
    });
  }

  // 권한 — super admin 전용(active 명함 role='admin'). 원장 본인(doctor)은 403.
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  // Rate limit — 사용자당 분당 10회.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "doctor-settings-put",
    userId: guard.userId,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // Zod 입력 검증.
  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[doctor settings PUT] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }
  const parsed = SettingsSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[doctor settings PUT] zod", 400, undefined, {
      userMessage: "입력 형식이 올바르지 않습니다.",
      devOnly: {
        issues: parsed.error.issues.slice(0, 5).map((iss) => ({
          path: iss.path.join("."),
          code: iss.code,
        })),
      },
    });
  }
  const { clinic_id, is_affiliated, is_listed, slug: newSlugRaw } = parsed.data;

  // 대상 doctor 조회 (slug → id, 현재 is_listed 포함). SELECT 는 RLS 통과(public read).
  const supabase = await createSupabaseServerClient();
  const { data: doctor, error: fetchErr } = await supabase
    .from("doctors")
    .select("id, slug, is_listed")
    .eq("slug", pathSlug)
    .maybeSingle()
    .returns<DoctorRow>();
  if (fetchErr) {
    return errorResponse(fetchErr, "generic", "[doctor settings PUT] fetch", 500);
  }
  if (!doctor) {
    return errorResponse(null, "not_found", "[doctor settings PUT] doctor not found", 404, undefined, {
      userMessage: "의사를 찾을 수 없습니다.",
    });
  }

  // slug 변경 규칙 — 현재 대상이 미공개(is_listed=false)일 때만 허용.
  //   판정 기준은 DB 의 "현재" is_listed (요청 body 값이 아니라).
  let slugToUpdate: string | undefined;
  if (typeof newSlugRaw === "string" && newSlugRaw !== doctor.slug) {
    if (doctor.is_listed) {
      // 공개 상태 → URL 불변. slug 변경 거부.
      return errorResponse(null, "invalid_input", "[doctor settings PUT] slug locked (listed)", 409, undefined, {
        userMessage: "공개 상태에서는 원장 주소(slug)를 변경할 수 없습니다. 먼저 비공개로 전환해 주세요.",
      });
    }
    // 중복 확인 (doctors.slug UNIQUE — 명확한 메시지).
    const { data: dup, error: dupErr } = await supabase
      .from("doctors")
      .select("id")
      .eq("slug", newSlugRaw)
      .maybeSingle();
    if (dupErr) {
      return errorResponse(dupErr, "generic", "[doctor settings PUT] slug dup check", 500);
    }
    if (dup) {
      return errorResponse(null, "invalid_input", "[doctor settings PUT] slug taken", 409, undefined, {
        userMessage: "이미 사용 중인 원장 주소(slug)입니다.",
      });
    }
    slugToUpdate = newSlugRaw;
  }

  // UPDATE — admin client (service_role). doctors 는 UPDATE RLS 0 + GRANT 0.
  const admin = createSupabaseAdminClient();
  const patch: {
    clinic_id: number | null;
    is_affiliated: boolean;
    is_listed: boolean;
    slug?: string;
  } = { clinic_id, is_affiliated, is_listed };
  if (slugToUpdate) patch.slug = slugToUpdate;

  const { error: updErr } = await admin
    .from("doctors")
    .update(patch)
    .eq("id", doctor.id);
  if (updErr) {
    return errorResponse(updErr, "generic", "[doctor settings PUT] update", 500, undefined, {
      userMessage: "저장에 실패했습니다.",
    });
  }

  // Audit
  await logAudit({
    action: "doctor.settings_update",
    actorProfileId: guard.activeProfileId,
    actorAuthUserId: guard.userId,
    targetTable: "doctors",
    targetId: doctor.id,
    request: req,
    metadata: {
      slug: doctor.slug,
      keys: Object.keys(patch),
      via: "super_admin",
      slugChanged: slugToUpdate ? { from: doctor.slug, to: slugToUpdate } : null,
    },
  });

  return NextResponse.json({ saved: true, slug: slugToUpdate ?? doctor.slug });
}
