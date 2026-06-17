import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual, randomUUID } from "crypto";
import {
  exchangeNaverCode,
  fetchNaverUserInfo,
  loadNaverEnv,
} from "@/lib/auth/naver";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";
import { NATIVE_OAUTH_CALLBACK } from "@/lib/auth/oauth-providers";
import { trackAuthError, type AuthErrorTrack } from "@/lib/error-response";
import { logAudit } from "@/lib/audit-log";

/** state cookie timing-safe 비교. 길이 mismatch 도 동일 시간으로 처리. */
function stateMatches(cookieState: string, urlState: string): boolean {
  const a = Buffer.from(cookieState, "utf8");
  const b = Buffer.from(urlState, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return timingSafeEqual(a, b);
}

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/naver/callback?code=...&state=...
 *
 * Naver OAuth 콜백 처리 흐름:
 *  1) state 검증 (CSRF) — naver_oauth_state 쿠키와 비교
 *  2) code → access_token 교환
 *  3) access_token으로 user info 조회
 *  4) Supabase에 해당 이메일 사용자 있는지 확인
 *      - 있으면: 기존 사용자 사용 + metadata에 naver_id 보강
 *      - 없으면: createUser (email_confirm=true, user_metadata에 naver_id/name/picture)
 *  5) generateLink(magiclink)로 자동 로그인 링크 발급 → 그 URL로 redirect
 *      → Supabase가 토큰 검증 + 세션 쿠키 발급 + /auth/callback으로 다시 redirect
 *      → 기존 약관/온보딩 게이트 그대로 통과
 *
 * 실패 시 /login?error=... 로 redirect.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  // 0) provider 측 에러 처리
  if (oauthError) {
    const desc = url.searchParams.get("error_description") ?? oauthError;
    return redirectToLogin(`네이버 로그인 취소: ${desc}`);
  }

  if (!code || !state) {
    return redirectToLogin("네이버 콜백 파라미터 누락");
  }

  // 1) state 검증
  const cookieState = request.cookies.get("naver_oauth_state")?.value;
  if (!cookieState || !stateMatches(cookieState, state)) {
    return redirectToLogin("CSRF 검증 실패 (state mismatch)");
  }
  const next = request.cookies.get("naver_oauth_next")?.value || "/";

  // 2) Naver 환경 변수
  const env = loadNaverEnv(SITE_URL);
  if (!env) {
    return redirectToLogin("네이버 로그인 환경변수 미설정");
  }

  try {
    // 2) code → access_token
    const tokens = await exchangeNaverCode(env, code, state);

    // 3) user info
    const profile = await fetchNaverUserInfo(tokens.access_token);
    const email = profile.email?.trim().toLowerCase();
    if (!email) {
      return redirectToLogin(
        "네이버 계정에 이메일이 없습니다. 이메일 동의 후 다시 시도해주세요.",
      );
    }

    const displayName =
      profile.nickname?.trim() ||
      profile.name?.trim() ||
      email.split("@")[0];

    // 4) Supabase 사용자 동기화 (admin SDK)
    const admin = createSupabaseAdminClient();

    // Phase 6-3 (2026-05-16): listUsers 풀스캔 (DoS amplifier) 제거.
    //   기존: perPage=1000 × 최대 50 페이지 순회 — 호출 1회당 최대 50,000 row 비용.
    //         외부 무인증 endpoint 라 공격자가 반복 호출 시 DB 풀 마비 위험.
    //   개선 (0133, 2026-05-19): auth 스키마는 PostgREST 가 노출하지 않아
    //     `.schema("auth").from("users")` 가 "Invalid schema: auth" 로 실패. →
    //     `find_auth_user_by_email_with_providers` RPC (SECURITY DEFINER, service_role only) 로
    //     auth.users + auth.identities 한 번에 조회. email unique index 로 O(1).
    let userId: string | null = null;
    let providers: string[] = [];
    {
      const { data: rpcRows, error: lookupErr } = await admin.rpc(
        "find_auth_user_by_email_with_providers",
        { p_email: email },
      );
      if (lookupErr) {
        throw new Error(`사용자 조회 실패: ${lookupErr.message}`);
      }
      const row = (rpcRows as { auth_user_id: string; providers: string[] }[] | null)?.[0];
      if (row) {
        userId = row.auth_user_id;
        providers = row.providers ?? [];
      }
    }

    // ── A5 (2026-05-17): provider 충돌 검사 ─────────────────────────────
    // 같은 email 로 이미 Google/Kakao 등 다른 provider 로 가입된 사용자라면
    // 자동 매칭하지 않고 안내 페이지로 분기 — 계정 인수(Account Takeover) 방어.
    // Naver 가 이메일 변경/미검증 이메일을 줘서 기존 계정을 가로채는 시나리오 차단.
    // (0133, 2026-05-19): providers 는 위 RPC 한 번 호출에서 이미 받음.
    if (userId) {
      const hasNaver = providers.some((p) => p === "naver");
      const hasOther = providers.some(
        (p) => p !== "naver" && p !== "email",
      );
      // naver identity 가 이미 연결되어 있으면 정상 로그인.
      // naver identity 가 없고 다른 OAuth provider 가 있으면 차단.
      if (!hasNaver && hasOther) {
        const otherProvider = providers.find(
          (p) => p !== "naver" && p !== "email",
        );
        const url = new URL("/login/conflict", SITE_URL);
        url.searchParams.set("existing_provider", otherProvider ?? "other");
        url.searchParams.set("attempted_provider", "naver");
        // state/next 쿠키 정리
        const res = NextResponse.redirect(url);
        res.cookies.set("naver_oauth_state", "", { maxAge: 0, path: "/" });
        res.cookies.set("naver_oauth_next", "", { maxAge: 0, path: "/" });
        res.cookies.set("naver_oauth_native", "", { maxAge: 0, path: "/" });
        return res;
      }
      // naver 외 어떤 identity 도 없는 케이스(예: email 가입만) → 새 identity 연결 허용 X.
      // 사용자가 기존 email 로그인 후 명시적으로 연결해야 함.
      if (!hasNaver && providers.length > 0 && !hasOther) {
        const url = new URL("/login/conflict", SITE_URL);
        url.searchParams.set("existing_provider", "email");
        url.searchParams.set("attempted_provider", "naver");
        const res = NextResponse.redirect(url);
        res.cookies.set("naver_oauth_state", "", { maxAge: 0, path: "/" });
        res.cookies.set("naver_oauth_next", "", { maxAge: 0, path: "/" });
        res.cookies.set("naver_oauth_native", "", { maxAge: 0, path: "/" });
        return res;
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    if (!userId) {
      // 신규 사용자 생성
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            full_name: profile.name ?? null,
            name: displayName,
            nickname: displayName,
            naver_id: profile.id,
            provider: "naver",
            picture: profile.profile_image ?? null,
            avatar_url: profile.profile_image ?? null,
          },
        });
      if (createErr || !created.user) {
        throw new Error(`사용자 생성 실패: ${createErr?.message ?? "unknown"}`);
      }
      userId = created.user.id;
      // PIPA 안전성 확보조치 §8: 신규 가입자 생성 audit (경량 — provider 만).
      await logAudit({
        action: "auth.signup",
        actorAuthUserId: userId,
        targetTable: "auth.users",
        targetId: userId,
        request,
        metadata: { provider: "naver" },
      });
    } else {
      // 기존 사용자 — naver_id metadata 보강 (이미 있으면 무시됨)
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          naver_id: profile.id,
          // provider는 첫 가입 provider를 보존하는 게 안전 → 덮어쓰지 않음
        },
      });
    }

    // profiles.avatar_url / display_name / contact_email 자동 채우기 (비어 있을 때만)
    //  → /auth/callback에서도 한 번 더 시도하지만 magic link 경로에서 user_metadata 동기화 타이밍이
    //    완벽하지 않을 수 있어 admin SDK로 즉시 set
    //  → contact_email: ADR 0003 dedup 매칭 정확도 향상. 사용자 수정값은 보존.
    {
      const updates: Record<string, unknown> = {};
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("avatar_url, display_name, contact_email")
        .eq("id", userId)
        .maybeSingle();
      if (
        profile.profile_image &&
        !(existingProfile as { avatar_url?: string | null } | null)?.avatar_url
      ) {
        updates.avatar_url = profile.profile_image;
      }
      if (
        displayName &&
        !(existingProfile as { display_name?: string | null } | null)
          ?.display_name
      ) {
        updates.display_name = displayName;
      }
      if (
        email &&
        !(existingProfile as { contact_email?: string | null } | null)
          ?.contact_email
      ) {
        updates.contact_email = email.trim().toLowerCase();
      }
      if (Object.keys(updates).length > 0) {
        await admin.from("profiles").update(updates).eq("id", userId);
      }
    }

    // 5) 자동 로그인 — generateLink로 hashed_token 받아서 우리 callback에 직접 전달
    //    (action_link로 가면 Supabase verify endpoint를 거쳐 redirect_to로 가는데
    //     그 흐름이 PKCE/OTP 모드별로 query 파라미터 달라 일관성 없음.
    //     hashed_token을 직접 token_hash로 우리 callback에 넘기면 verifyOtp로 일관 처리.)
    const callbackBase = `${SITE_URL.replace(/\/$/, "")}/auth/callback`;
    const { data: linkData, error: linkErr } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: callbackBase },
      });
    const hashedToken = (linkData?.properties as { hashed_token?: string } | undefined)?.hashed_token;
    if (linkErr || !hashedToken) {
      throw new Error(
        `자동 로그인 토큰 발급 실패: ${linkErr?.message ?? "no hashed_token"}`,
      );
    }

    // 우리 callback URL을 직접 구성: token_hash + type=magiclink
    const finalCallback = new URL(callbackBase);
    finalCallback.searchParams.set("token_hash", hashedToken);
    finalCallback.searchParams.set("type", "magiclink");
    if (next) finalCallback.searchParams.set("next", next);

    // 네이티브 앱(Capacitor) 진입이면 custom scheme 딥링크로 token_hash 를 앱에 되돌린다.
    //   앱(NativeAuthDeepLink)이 받아 웹뷰 /auth/callback?token_hash=... 로 넘겨 verifyOtp 처리.
    const isNative = request.cookies.get("naver_oauth_native")?.value === "1";

    let res: NextResponse;
    if (isNative) {
      // custom scheme 은 WHATWG URL 파싱이 비표준이라 템플릿으로 직접 조립(쿼리만 인코딩).
      const params = new URLSearchParams({
        token_hash: hashedToken,
        type: "magiclink",
      });
      if (next) params.set("next", next);
      const deepLinkUrl = `${NATIVE_OAUTH_CALLBACK}?${params.toString()}`;
      // NextResponse.redirect 는 http(s) 외 스킴을 거부할 수 있어 Location 헤더를 직접 설정.
      res = new NextResponse(null, {
        status: 302,
        headers: { Location: deepLinkUrl },
      });
    } else {
      // state/next 쿠키 정리 후 우리 callback으로 redirect (verifyOtp 처리)
      res = NextResponse.redirect(finalCallback.toString());
    }
    res.cookies.set("naver_oauth_state", "", { maxAge: 0, path: "/" });
    res.cookies.set("naver_oauth_next", "", { maxAge: 0, path: "/" });
    res.cookies.set("naver_oauth_native", "", { maxAge: 0, path: "/" });
    return res;
  } catch (e) {
    // A10: 상세 메시지를 redirect URL 에 박지 않음 (referer 누설 차단).
    // 상세는 서버 로그에만, 사용자에겐 표준 문구 + error_id.
    const errorId = randomUUID();
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    console.error(`[error:${errorId}] [naver callback] ${msg}`, e);

    // PR-OPS (0135): admin UI 추적용 비동기 적재.
    const track: AuthErrorTrack = {
      provider: "naver",
      step: "callback",
      ip:
        request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        null,
      userAgent: request.headers.get("user-agent"),
    };
    void trackAuthError(errorId, track, "auth_failed", msg);

    return redirectToLoginWithId(errorId);
  }
}

/**
 * 사용자 표시용 redirect — 상세 메시지를 query 에 박지 않고 error_id 만 노출.
 * 운영자는 Vercel logs 에서 `grep <error_id>` 로 상세 추적.
 */
function redirectToLogin(error: string): NextResponse {
  // 표준 문구만 — 상세 message 직접 전달 X.
  // (legacy 호출이 그대로 string 을 넘기는 케이스 대비)
  const url = new URL("/login", SITE_URL);
  // 메시지 단축 + 일반화. 사용자 입력/내부 SDK 메시지 누설 차단.
  const standard = standardizeNaverError(error);
  url.searchParams.set("error", standard);
  return NextResponse.redirect(url);
}

function redirectToLoginWithId(errorId: string): NextResponse {
  const url = new URL("/login", SITE_URL);
  url.searchParams.set("error", "auth_failed");
  url.searchParams.set("error_id", errorId);
  return NextResponse.redirect(url);
}

function standardizeNaverError(raw: string): string {
  // 사용자 노출용 표준 카테고리 매핑.
  if (raw.includes("CSRF") || raw.includes("state")) return "csrf_failed";
  if (raw.includes("취소") || raw.toLowerCase().includes("cancel"))
    return "cancelled";
  if (raw.includes("환경변수") || raw.includes("env")) return "config_error";
  if (raw.includes("파라미터")) return "missing_param";
  return "auth_failed";
}
