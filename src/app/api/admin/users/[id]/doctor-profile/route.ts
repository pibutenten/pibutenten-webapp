/**
 * POST /api/admin/users/[id]/doctor-profile
 *
 * 원장 계정 연결 (CRITICAL-3 제거 자리 대체, 2026-05-30).
 *
 * [id] = 원본으로 삼을 회원 명함(profile)의 id.
 * Body: { slug, name, clinic?, branch?, title? }
 *
 * 동작 (DB 단일 트랜잭션 RPC admin_create_doctor_profile, 마이그 0192):
 *  - 같은 묶음(auth_user_id)에 새 원장 명함(role=doctor) 생성
 *  - doctors row 신설 (slug·name 필수)
 *  - 회원 명함의 온보딩 PII 를 새(빈) 원장 명함에 복사 (이후 명함별 독립 수정)
 *
 * ★ 회원 명함의 role 변경·회원 글 doctor_id 백필은 하지 않는다 (ADR 0012 / CRITICAL-3 방지).
 *   RPC 는 INSERT(doctors 1, profiles 1) + 회원 명함에서 읽기만 한다.
 *
 * 권한: requireAdmin (active 명함이 admin, ADR 0012). RPC 는 service_role 전용.
 * 부수: audit_logs 적재 (action 'admin.doctor_profile_create').
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-guard";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { logAudit } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z
  .object({
    // slug: 소문자 영숫자 + 하이픈. 입력은 소문자로 정규화 후 검증.
    slug: z
      .string()
      .trim()
      .transform((s) => s.toLowerCase())
      .pipe(
        z
          .string()
          .min(2)
          .max(50)
          .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "slug 형식 오류"),
      ),
    name: z.string().trim().min(1).max(100),
    clinic: z.string().trim().max(100).optional(),
    branch: z.string().trim().max(100).optional(),
    title: z.string().trim().max(100).optional(),
  })
  .strict();

/** RPC 가 RAISE 하는 메시지 → 사용자 친화 응답 매핑. */
function mapRpcError(msg: string): { status: number; userMessage: string } {
  if (msg.includes("slug already exists")) {
    return { status: 409, userMessage: "이미 사용 중인 원장 주소(slug)입니다. 다른 값을 입력해 주세요." };
  }
  if (msg.includes("bundle already has doctor profile")) {
    return { status: 409, userMessage: "이 사용자는 이미 원장 명함을 가지고 있습니다." };
  }
  if (msg.includes("source not onboarded")) {
    return { status: 400, userMessage: "이 회원은 온보딩(생년월일 등)을 완료하지 않아 원장 명함을 만들 수 없습니다." };
  }
  if (msg.includes("source profile not found")) {
    return { status: 404, userMessage: "원본 회원 명함을 찾을 수 없습니다." };
  }
  if (msg.includes("invalid slug") || msg.includes("invalid name")) {
    return { status: 400, userMessage: "입력값이 올바르지 않습니다." };
  }
  return { status: 500, userMessage: "원장 명함 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const limited = await rateLimit({
    request: req,
    bucketPrefix: "admin-doctor-profile-create",
    userId: guard.userId,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const { id: sourceProfileId } = await params;
  if (!UUID_RE.test(sourceProfileId)) {
    return errorResponse(null, "invalid_input", "[admin/doctor-profile] invalid id", 400, undefined, {
      userMessage: "유효하지 않은 회원 ID입니다.",
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[admin/doctor-profile] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식입니다.",
    });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[admin/doctor-profile] zod", 400, undefined, {
      userMessage:
        "원장 주소(slug)는 소문자·숫자·하이픈만, 이름은 필수입니다.",
    });
  }
  const { slug, name, clinic, branch, title } = parsed.data;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_create_doctor_profile", {
    p_source_profile_id: sourceProfileId,
    p_slug: slug,
    p_name: name,
    p_clinic: clinic ?? null,
    p_branch: branch ?? null,
    p_title: title ?? null,
  });

  if (error) {
    const { status, userMessage } = mapRpcError(error.message ?? "");
    return errorResponse(error, status === 500 ? "save_failed" : "invalid_input", "[admin/doctor-profile] rpc", status, undefined, {
      userMessage,
    });
  }

  const result = (data ?? {}) as {
    profile_id?: string;
    doctor_id?: string;
    handle?: string;
    auth_user_id?: string;
    slug?: string;
  };

  await logAudit({
    action: "admin.doctor_profile_create",
    actorProfileId: guard.activeProfileId,
    actorAuthUserId: guard.userId,
    targetTable: "profiles",
    targetId: result.profile_id ?? null,
    request: req,
    metadata: {
      sourceProfileId,
      newDoctorId: result.doctor_id ?? null,
      newHandle: result.handle ?? null,
      slug: result.slug ?? slug,
    },
  });

  return NextResponse.json({ ok: true, ...result });
}
