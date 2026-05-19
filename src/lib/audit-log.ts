/**
 * Audit log 헬퍼 (보안 2.5차 F묶음, 2026-05-19)
 *
 * PIPA 안전성 확보조치 기준 §8 — 민감 API 호출의 누가/언제/어떤 작업 기록.
 * 1년 이상 보관 (5만 명 미만 기준).
 *
 * 사용:
 *   await logAudit({
 *     action: 'profile.delete',
 *     actorAuthUserId: user.id,
 *     request,
 *   });
 *
 * 실패해도 본 처리 흐름 막지 않음 (try/catch 내부에서 console.error 만).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { maskIp } from "@/lib/error-response";

export type AuditLogInput = {
  /** 'profile.delete' / 'admin.role_change' / 'identity.switch' / ... */
  action: string;
  /** active profile id (있으면). */
  actorProfileId?: string | null;
  /** auth.users.id (있으면). profile 삭제 후에도 추적용. */
  actorAuthUserId?: string | null;
  /** 대상 테이블명 (예: 'profiles', 'doctor_accounts'). */
  targetTable?: string | null;
  /** 대상 row 식별자 (uuid·int·shortcode 자유 형식). */
  targetId?: string | number | null;
  /** Request — IP 추출용. */
  request?: Request | null;
  /** 자유 메타 (from/to·notes 등). **PII 직접 입력 금지** — 저장 전 자동 검사 X. */
  metadata?: Record<string, unknown>;
};

/**
 * Request 헤더에서 IP 추출 (rate-limit.ts 의 로직과 동일 우선순위).
 */
function extractIp(req: Request | null | undefined): string | null {
  if (!req) return null;
  const h = req.headers;
  const vercelXff = h.get("x-vercel-forwarded-for");
  if (vercelXff) {
    const first = vercelXff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = h.get("x-real-ip");
  if (realIp) return realIp.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return null;
}

/**
 * Audit log INSERT. 실패해도 throw 안 함 (본 흐름 보존).
 */
export async function logAudit(opts: AuditLogInput): Promise<void> {
  try {
    const ip = extractIp(opts.request ?? null);
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      actor_profile_id: opts.actorProfileId ?? null,
      actor_auth_user_id: opts.actorAuthUserId ?? null,
      action: opts.action,
      target_table: opts.targetTable ?? null,
      target_id:
        opts.targetId === null || opts.targetId === undefined
          ? null
          : String(opts.targetId),
      ip_masked: maskIp(ip),
      metadata: opts.metadata ?? null,
    });
    if (error) {
      console.error("[audit-log] insert failed", {
        action: opts.action,
        error: error.message,
      });
    }
  } catch (e) {
    console.error("[audit-log] threw", {
      action: opts.action,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
