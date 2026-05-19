/**
 * Rate limit helper (A8, 2026-05-17)
 *
 * 0105 마이그레이션의 `public.check_and_increment_rate_limit(bucket, max, window_sec)`
 * RPC 를 호출 + 429 응답 표준화 + Vercel 프록시 헤더 안전 파싱.
 *
 * 사용 패턴:
 *
 *   import { rateLimit } from "@/lib/rate-limit";
 *
 *   const limited = await rateLimit({
 *     request,
 *     bucketPrefix: "comments-post",
 *     // 사용자 ID 가 있으면 user 기반, 없으면 IP 기반.
 *     userId: user?.id,
 *     max: 10,
 *     windowSeconds: 60,
 *   });
 *   if (limited) return limited; // 429 응답
 *
 * 정책:
 *   - userId 가 있으면 user 키 (`<prefix>:user:<uuid>`), 없으면 IP 키 (`<prefix>:ip:<ip>`).
 *   - 두 식별자 모두 부재면 fail-closed 로 429 차단 (2026-05-19 보안 2.5차).
 *     Vercel 환경에서는 x-vercel-forwarded-for 가 항상 부여되므로 정상 사용자는 영향 없음.
 *     식별자 부재는 헤더 위조 봇 패턴 → 차단이 안전.
 *   - 응답: 429 + Retry-After (윈도우 끝까지 남은 초) + 표준 JSON body.
 *   - console.warn 로 ops 알림 (반복 시 모니터링 대상).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type RateLimitOptions = {
  /** Next.js Request — 헤더에서 IP 추출. */
  request: Request | NextRequest;
  /**
   * 버킷 키 prefix — 엔드포인트별로 고유하게.
   * 예: "comments-post", "og-extract", "upload", "naver-start", "preview-link", "articles-post".
   */
  bucketPrefix: string;
  /** 로그인 사용자 ID — 있으면 user 단위 제한, 없으면 IP 단위. */
  userId?: string | null;
  /** 윈도우당 최대 호출 수. */
  max: number;
  /** 윈도우 길이(초). */
  windowSeconds: number;
};

/**
 * Vercel 프록시 헤더에서 신뢰 가능한 클라이언트 IP 추출.
 *
 * Vercel 환경 우선순위:
 *   1. `x-vercel-forwarded-for` — Vercel 이 직접 set, 신뢰 가능.
 *   2. `x-real-ip` — Vercel proxy 직전 IP, 신뢰 가능.
 *   3. `x-forwarded-for` 의 **가장 오른쪽** IP — 클라이언트가 set 가능하므로
 *      좌측 IP 는 위조 가능, 가장 오른쪽이 Vercel 가까운 신뢰 가능 hop.
 *      (단, 본 서비스는 Vercel proxy 1단계라 사실상 첫 IP 가 곧 클라이언트지만
 *       방어적으로 rightmost 정책 적용 — 공격자의 좌측 IP 위조 무력화.)
 *
 * 반환값이 null 이면 IP 불명 → rateLimit 은 통과 (false negative 허용).
 */
function extractClientIp(req: Request | NextRequest): string | null {
  const h = req.headers;
  const vercelXff = h.get("x-vercel-forwarded-for");
  if (vercelXff) {
    // 첫 번째 콤마 앞이 클라이언트 IP (Vercel 보장).
    const first = vercelXff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = h.get("x-real-ip");
  if (realIp) return realIp.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    // Defense: 가장 오른쪽(우리 프록시에 가장 가까운 hop)을 사용.
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return null;
}

export type RateLimitResult =
  /** 통과 */
  | null
  /** 차단 — 호출자가 그대로 return 하면 됨 */
  | NextResponse;

/**
 * rate limit 체크 + (필요 시) 차단 응답 반환.
 *
 * 반환값:
 *   - `null` → 통과, 계속 진행
 *   - `NextResponse` → 429 응답, 즉시 return
 */
export async function rateLimit(
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const { request, bucketPrefix, userId, max, windowSeconds } = opts;
  const ip = extractClientIp(request);
  const bucketKey = userId
    ? `${bucketPrefix}:user:${userId}`
    : ip
      ? `${bucketPrefix}:ip:${ip}`
      : null;

  // 식별자 둘 다 부재 — fail-closed 로 429 (보안 2.5차, 2026-05-19).
  // Vercel 환경에서는 x-vercel-forwarded-for 가 항상 부여되므로 정상 사용자는 도달 X.
  // 도달한다면 헤더 위조 봇 시도이므로 차단이 안전.
  if (!bucketKey) {
    console.warn("[rate-limit] BLOCKED — no identifier (anon + no IP)", {
      bucketPrefix,
    });
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "요청 식별자를 확인할 수 없어 일시 차단되었습니다.",
        retry_after_seconds: windowSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(windowSeconds) },
      },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("check_and_increment_rate_limit", {
    p_bucket_key: bucketKey,
    p_max_count: max,
    p_window_seconds: windowSeconds,
  });

  // RPC 호출 자체가 실패하면 fail-open (서비스 가용성 우선) — 단, 로그.
  if (error) {
    console.error("[rate-limit] RPC failed — fail-open", {
      bucketPrefix,
      error: error.message,
    });
    return null;
  }

  // RPC 가 true 면 통과.
  if (data === true) return null;

  // 차단. 운영자 모니터링용 로그.
  console.warn("[rate-limit] BLOCKED", {
    bucketPrefix,
    userId: userId ?? null,
    ip: ip ?? null,
    max,
    windowSeconds,
  });

  const retryAfter = windowSeconds; // 윈도우 시작 기준 단순화 — 클라이언트 backoff 안내.
  return NextResponse.json(
    {
      error: "rate_limited",
      message: "잠시 후 다시 시도해 주세요.",
      retry_after_seconds: retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
      },
    },
  );
}
