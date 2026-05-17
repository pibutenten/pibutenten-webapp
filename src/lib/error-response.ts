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
): NextResponse {
  const errorId = logErrorWithId(err, context);
  const url = new URL("/login", baseUrl);
  // 사용자에게 보이는 query 는 error_id 와 kind 만. 상세 X.
  url.searchParams.set("error", kind);
  url.searchParams.set("error_id", errorId);
  return NextResponse.redirect(url);
}
