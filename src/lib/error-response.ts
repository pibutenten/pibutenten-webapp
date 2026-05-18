/**
 * 표준 에러 응답 헬퍼 (A10, 2026-05-17)
 *
 * 목적: 사용자에게는 일반 문구 + error_id 만 노출, 상세는 서버 로그에만.
 * 클라이언트나 redirect URL 로 `error.message` 직접 흘러가는 패턴 방지
 * (Supabase 컬럼명·내부 RLS 정책·SDK 스택 노출 위험).
 *
 * 사용 패턴:
 *
 *   import { errorResponse, errorRedirectLogin } from "@/lib/error-response";
 *
 *   // 1) JSON Route Handler
 *   if (insErr) {
 *     return errorResponse(insErr, "save_failed", "저장에 실패했어요.", 500);
 *   }
 *
 *   // 2) redirect 흐름 (OAuth callback 등) — referer 누설 방지 위해 detail 미포함
 *   if (e) {
 *     return errorRedirectLogin(e, "auth_failed", "로그인 처리 중 오류가 발생했어요.", request.url);
 *   }
 *
 * error_id 는 UUID v4. Vercel logs 에서 `grep <error_id>` 로 추적 가능.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** 이메일 마스킹: 'jminbae@gmail.com' → 'jm****@gmail.com'. */
export function maskEmail(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const at = raw.indexOf("@");
  if (at <= 0) return null;
  const local = raw.slice(0, at);
  const domain = raw.slice(at);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}${domain}`;
}

/** IPv4 마지막 옥텟 마스킹: '203.0.113.42' → '203.0.113.***'. IPv6 는 첫 2 그룹만 유지. */
export function maskIp(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const v4 = raw.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.***`;
  if (raw.includes(":")) {
    const parts = raw.split(":");
    return `${parts.slice(0, 2).join(":")}:***`;
  }
  return "***";
}

/** auth 콜백 에러 추적 메타 (PR-OPS, 0135). */
export type AuthErrorTrack = {
  provider: "google" | "kakao" | "naver" | "magiclink" | "unknown";
  step: string;
  attemptedEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * auth_callback_errors 테이블에 한 줄 적재. 실패해도 로그만 — 본 로그인 흐름은 막지 않음.
 * INSERT 는 admin client (service_role) 으로만 — RLS 가 anon/authenticated 차단.
 *
 * 다른 모듈(예: Naver callback)에서 자체 errorId/catch 로 처리하는 경로용으로도 노출.
 */
export async function trackAuthError(
  errorId: string,
  track: AuthErrorTrack,
  kind: string,
  errorMessage: string | null,
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("auth_callback_errors").insert({
      error_id: errorId,
      provider: track.provider,
      step: track.step,
      error_kind: kind,
      error_message: errorMessage ? errorMessage.slice(0, 2000) : null,
      attempted_email_masked: maskEmail(track.attemptedEmail),
      ip_masked: maskIp(track.ip),
      user_agent: track.userAgent ? track.userAgent.slice(0, 500) : null,
    });
  } catch (e) {
    console.error(`[auth-track:${errorId}] insert failed`, e);
  }
}

/** 표준 클라이언트 메시지 (유형별). */
export const STANDARD_ERROR_MESSAGES = {
  generic: "요청 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
  unauthorized: "로그인이 필요합니다.",
  forbidden: "권한이 없습니다.",
  not_found: "찾을 수 없는 항목이에요.",
  rate_limited: "잠시 후 다시 시도해 주세요.",
  save_failed: "저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
  network_failed: "외부 서비스 연결에 실패했어요.",
  auth_failed: "로그인 처리 중 오류가 발생했어요.",
  invalid_input: "입력값이 올바르지 않아요.",
} as const;

export type ErrorKind = keyof typeof STANDARD_ERROR_MESSAGES;

/**
 * 서버 로그에 상세 에러를 기록하고 error_id 발급.
 * 호출자가 응답 body / redirect URL 에 ID 만 노출하면 운영자가 ID 로 로그 추적 가능.
 */
export function logErrorWithId(
  err: unknown,
  context: string,
  extra?: Record<string, unknown>,
): string {
  const errorId = randomUUID();
  const detail =
    err instanceof Error
      ? { message: err.message, name: err.name, stack: err.stack }
      : { value: String(err) };
  console.error(`[error:${errorId}] ${context}`, { ...detail, ...extra });
  return errorId;
}

/**
 * JSON 에러 응답.
 * Body: { error: <kind>, message: <표준 문구>, error_id: <uuid> }
 */
export function errorResponse(
  err: unknown,
  kind: ErrorKind,
  context: string,
  status = 500,
  extra?: Record<string, unknown>,
): NextResponse {
  const errorId = logErrorWithId(err, context, extra);
  return NextResponse.json(
    {
      error: kind,
      message: STANDARD_ERROR_MESSAGES[kind],
      error_id: errorId,
    },
    { status },
  );
}

/**
 * OAuth callback 등에서 /login 으로 redirect 하면서 error_id 만 query 에 노출.
 * 상세 메시지를 query 에 박지 않아 referer 로 누설되지 않음.
 *
 * baseUrl: request.url 또는 site URL (NextResponse.redirect 가 절대 URL 요구).
 */
export function errorRedirectLogin(
  err: unknown,
  kind: ErrorKind,
  context: string,
  baseUrl: string,
  /** PR-OPS (0135): auth_callback_errors 테이블에 추적용 메타. 있으면 비동기 INSERT. */
  track?: AuthErrorTrack,
): NextResponse {
  const errorId = logErrorWithId(err, context);
  if (track) {
    // 비동기 적재 — 본 흐름 막지 않음.
    const message = err instanceof Error ? err.message : String(err ?? "");
    void trackAuthError(errorId, track, kind, message);
  }
  const url = new URL("/login", baseUrl);
  // 사용자에게 보이는 query 는 error_id 와 kind 만. 상세 X.
  url.searchParams.set("error", kind);
  url.searchParams.set("error_id", errorId);
  return NextResponse.redirect(url);
}
