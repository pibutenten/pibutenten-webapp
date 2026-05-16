import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  exchangeNaverCode,
  fetchNaverUserInfo,
  loadNaverEnv,
} from "@/lib/auth/naver";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

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
    //   개선: service_role 권한으로 auth.users 테이블 직접 조회 — email unique index 로 O(1).
    let userId: string | null = null;
    {
      const { data: existingUser, error: lookupErr } = await admin
        .schema("auth" as never)
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (lookupErr) {
        throw new Error(`사용자 조회 실패: ${lookupErr.message}`);
      }
      const row = existingUser as { id: string } | null;
      if (row) userId = row.id;
    }

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
    } else {
      // 기존 사용자 — naver_id metadata 보강 (이미 있으면 무시됨)
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          naver_id: profile.id,
          // provider는 첫 가입 provider를 보존하는 게 안전 → 덮어쓰지 않음
        },
      });
    }

    // profiles.avatar_url / display_name 자동 채우기 (비어 있을 때만)
    //  → /auth/callback에서도 한 번 더 시도하지만 magic link 경로에서 user_metadata 동기화 타이밍이
    //    완벽하지 않을 수 있어 admin SDK로 즉시 set
    if (profile.profile_image || displayName) {
      const updates: Record<string, unknown> = {};
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("avatar_url, display_name")
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

    // state/next 쿠키 정리 후 우리 callback으로 redirect (verifyOtp 처리)
    const res = NextResponse.redirect(finalCallback.toString());
    res.cookies.set("naver_oauth_state", "", { maxAge: 0, path: "/" });
    res.cookies.set("naver_oauth_next", "", { maxAge: 0, path: "/" });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    console.error("[naver callback]", msg);
    return redirectToLogin(msg);
  }
}

function redirectToLogin(error: string): NextResponse {
  const url = new URL("/login", SITE_URL);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}
