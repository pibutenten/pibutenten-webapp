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

/**
 * 생년월일 마스킹 (보안 2.5차 D-4, 2026-05-19): '2002-03-14' → '2002-**-**'.
 * ISO date / Date 객체 / Timestamp 문자열 모두 허용.
 * - 입력이 비어 있으면 null
 * - 연도만 노출 (연령 추정은 가능하지만 정확한 생일 미노출 — PIPA 안전성 확보조치 권고)
 */
export function maskBirthdate(raw: string | Date | null | undefined): string | null {
  if (!raw) return null;
  const s = typeof raw === "string" ? raw : raw.toISOString();
  const m = s.match(/^(\d{4})-\d{2}-\d{2}/);
  if (!m) return null;
  return `${m[1]}-**-**`;
}

/**
 * 임의 객체에서 흔한 PII 키를 마스킹 (보안 2.5차 D-4, 2026-05-19).
 * console.error 직전 또는 errorResponse extra 에 sensitive 메타 넣을 때 사용.
 *
 * 마스킹 대상 키: email, contact_email, attempted_email, birthdate, dob, ip, ip_address, phone
 */
export function scrubPii<T extends Record<string, unknown>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const out: Record<string, unknown> = { ...obj };
  for (const key of Object.keys(out)) {
    const lower = key.toLowerCase();
    const val = out[key];
    if (typeof val !== "string" && !(val instanceof Date)) continue;
    if (lower.includes("email")) {
      out[key] = maskEmail(val as string);
    } else if (lower === "ip" || lower.includes("ip_address") || lower.endsWith("ip")) {
      out[key] = maskIp(val as string);
    } else if (
      lower === "birthdate" ||
      lower === "dob" ||
      lower === "birth_date" ||
      lower === "birthday"
    ) {
      out[key] = maskBirthdate(val as string | Date);
    } else if (lower === "phone" || lower === "mobile" || lower === "tel") {
      // 010-1234-5678 → 010-****-5678
      const v = String(val);
      out[key] = v.replace(/(\d{2,3})[-\s]?(\d{3,4})[-\s]?(\d{4})/, "$1-****-$3");
    }
  }
  return out as T;
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
 *
 * 보안 2.5차 D-4 (2026-05-19): extra 에 흔한 PII 키(email/birthdate/ip/phone)가 들어있으면
 * 로그 기록 전 자동 마스킹. server log 가 외부에 노출되더라도 PII 누설 최소화.
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
  const safeExtra = extra ? scrubPii(extra) : undefined;
  console.error(`[error:${errorId}] ${context}`, { ...detail, ...safeExtra });
  return errorId;
}

/**
 * JSON 에러 응답.
 * Body: { error: <kind>, message: <표준 문구 또는 opts.userMessage>, error_id: <uuid> }
 *
 * opts.userMessage: 도메인 검증 메시지 등 사용자에게 보여줄 구체 문구. 미지정 시
 *   STANDARD_ERROR_MESSAGES[kind] 사용. 단, **내부 시스템 메시지 (DB err.message,
 *   Supabase 컬럼명, 스택 등) 는 절대 여기에 넣지 말 것** — server log 에만 남도록
 *   err 로 전달.
 *
 * opts.devOnly: dev 환경(NODE_ENV !== 'production') 에서만 응답 body 에 머지될 객체
 *   (예: Zod issues 배열). production 에서는 무시.
 *
 * opts.bodyExtra: 운영·개발 모두 응답 body 에 항상 머지될 비-민감 보조 필드
 *   (예: OAuth state, 운영 분기 플래그). **민감 정보 금지** — DB err.message 등은 err 로.
 */
export function errorResponse(
  err: unknown,
  kind: ErrorKind,
  context: string,
  status = 500,
  extra?: Record<string, unknown>,
  opts?: {
    userMessage?: string;
    devOnly?: Record<string, unknown>;
    bodyExtra?: Record<string, unknown>;
  },
): NextResponse {
  const errorId = logErrorWithId(err, context, extra);
  const body: Record<string, unknown> = {
    error: kind,
    message: opts?.userMessage ?? STANDARD_ERROR_MESSAGES[kind],
    error_id: errorId,
  };
  if (opts?.bodyExtra) {
    Object.assign(body, opts.bodyExtra);
  }
  if (opts?.devOnly && process.env.NODE_ENV !== "production") {
    Object.assign(body, opts.devOnly);
  }
  return NextResponse.json(body, { status });
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
