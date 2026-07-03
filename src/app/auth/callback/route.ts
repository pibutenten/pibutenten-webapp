import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { errorRedirectLogin, type AuthErrorTrack } from "@/lib/error-response";
import { ROLES } from "@/lib/identity-shared";
import { logAudit } from "@/lib/audit-log";
import { SITE_URL } from "@/lib/site";

/** PR-OPS (0135): auth 콜백 provider 추정 — 정확한 분기는 force 가능한 상태에서만. */
function inferProvider(url: URL): AuthErrorTrack["provider"] {
  const t = url.searchParams.get("type");
  if (t === "magiclink") return "magiclink";
  return "unknown";
}

/** IP 추출 — rate-limit.ts 와 같은 우선순위. */
function extractIp(req: NextRequest): string | null {
  const h = req.headers;
  return (
    h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    null
  );
}

/**
 * OAuth 콜백 Route Handler.
 *
 * Provider(Google/Kakao 등) → Supabase → 이 endpoint 로 redirect 된다.
 *  - ?code=...      : auth code (PKCE)  → exchangeCodeForSession 으로 세션 발급
 *  - ?error=...     : provider 에러 메시지 (취소/거부 등)
 *  - ?next=/        : 최종 도착 경로 (signInWithOAuth 호출 시 redirectTo 에 같이 실어 보냄)
 *
 * 동작:
 *  1) code 교환 → 쿠키에 세션 저장
 *  2) profiles 조회
 *     - 온보딩 미완료(terms_agreed_at IS NULL) → /signup
 *     - role 별 destination
 *  3) NextResponse.redirect 로 풀 navigation (브라우저 cookies 가 layout 으로 전달되도록)
 *
 * Next.js 16 의 Route Handler 규약(GET 함수, NextRequest, NextResponse) 준수.
 */
/**
 * Open Redirect 방어 — next 파라미터 sanitize.
 *
 * 허용: /로 시작하는 단일 슬래시 + 우리 사이트 path-only
 *   ex) "/", "/columns/123", "/settings"
 * 차단:
 *   - // 또는 /\ 로 시작 (protocol-relative URL)
 *   - http:// / https:// 등 절대 URL
 *   - 공백·제어 문자
 *   - 안전하지 않은 값은 빈 문자열 반환 → 호출자가 "/" 폴백 사용
 */
function sanitizeNext(raw: string | null): string {
  if (!raw) return "";
  // 제어 문자 / 공백 차단
  if (/[\s\x00-\x1f]/.test(raw)) return "";
  // 단일 슬래시로 시작해야 하고 protocol-relative 차단
  if (!raw.startsWith("/")) return "";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "";
  // 절대 URL 패턴 차단 (스킴 어디든 포함된 경우)
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw.slice(1))) return "";
  // path만 허용 — 한 번 더 URL parser로 검증.
  //   base origin 은 SITE_URL(SSOT) 기반 — 도메인 이전 후에도 env 한 곳만 보고 동작.
  //   (raw 는 위에서 이미 절대 URL/스킴 차단됨. base 는 same-origin 판정 기준일 뿐.)
  try {
    const base = new URL(SITE_URL);
    const parsed = new URL(raw, base);
    if (parsed.origin !== base.origin) return "";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return "";
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDesc = url.searchParams.get("error_description");
  const next = sanitizeNext(url.searchParams.get("next"));

  // origin 은 same-host 안전 redirect 베이스
  const origin = url.origin;

  // PR-OPS (0135): 에러 추적 메타 기본값.
  const trackBase: AuthErrorTrack = {
    provider: inferProvider(url),
    step: "callback",
    ip: extractIp(request),
    userAgent: request.headers.get("user-agent"),
  };

  // 1) provider 측 에러 (사용자가 취소했거나 거부)
  if (oauthError) {
    const msg = oauthErrorDesc || oauthError;
    return errorRedirectLogin(
      new Error(msg),
      "auth_failed",
      "[auth/callback] provider error",
      request.url,
      { ...trackBase, step: "provider_error" },
    );
  }

  // 2) 세션 발급 — 두 흐름 모두 지원
  //    (a) Google/Kakao OAuth (PKCE): ?code=...
  //    (b) Naver/Magic link (admin generateLink): ?token_hash=...&type=magiclink
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");

  if (!code && !tokenHash) {
    return errorRedirectLogin(
      new Error("OAuth 콜백 파라미터 누락"),
      "auth_failed",
      "[auth/callback] missing params",
      request.url,
      { ...trackBase, step: "missing_params" },
    );
  }

  const supabase = await createSupabaseServerClient();

  if (code) {
    // (a) PKCE — OAuth provider code 교환
    const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeErr) {
      return errorRedirectLogin(
        exchangeErr,
        "auth_failed",
        "[auth/callback] code_exchange",
        request.url,
        { ...trackBase, step: "code_exchange" },
      );
    }
  } else if (tokenHash && otpType) {
    // (b) Magic link verify — Naver 자체 OAuth 흐름의 자동 로그인 경로.
    //   ⚠ 다른 계정으로 전환하는 경우(예: 구글 user@gmail.com 세션이 살아있는 상태에서
    //     네이버 user@naver.com 시도)에 잔여 세션이 우선되어 사용자가 혼란을 겪음.
    //     → 명시적으로 signOut 후 verifyOtp.
    //   단 recovery(비밀번호 재설정)는 제외(검수 반영, 2026-07-03) — signOut(기본 global
    //     스코프)이 다른 기기의 세션까지 무효화할 수 있고, 이후 verifyOtp 가 실패하면
    //     (만료 링크 등) 기존 세션만 잃는 사고가 된다. recovery 는 verifyOtp 가 로컬
    //     세션을 교체하므로 사전 signOut 이 불필요하다.
    if (otpType !== "recovery") {
      await supabase.auth.signOut();
    }

    const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType as "magiclink" | "signup" | "recovery" | "invite" | "email_change" | "email",
    });
    if (verifyErr || !verifyData.session) {
      return errorRedirectLogin(
        verifyErr ?? new Error("토큰 검증 실패"),
        "auth_failed",
        "[auth/callback] token_verify",
        request.url,
        { ...trackBase, step: "token_verify" },
      );
    }

    // (b-1) 비밀번호 재설정(recovery) — 프로필·약관·온보딩 분기 없이 곧장 새 비밀번호
    //   설정 화면으로 보낸다(Phase 2, 2026-07-03). 세션은 위 verifyOtp 로 확립됐고,
    //   /auth/reset-password 가 updateUser({ password }) 를 처리한다.
    //   ★실경로: recovery 메일 템플릿이 token_hash 링크(SiteURL/auth/callback?token_hash=…
    //   &type=recovery, config 2026-07-03)라 이 분기가 유일한 재설정 진입점(cross-device 지원).
    if (otpType === "recovery") {
      return NextResponse.redirect(`${origin}/auth/reset-password`);
    }
  }

  // 3) 사용자/프로필 조회
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorRedirectLogin(
      new Error("사용자 확인 실패"),
      "auth_failed",
      "[auth/callback] user_lookup",
      request.url,
      { ...trackBase, step: "user_lookup" },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, terms_agreed_at, display_name, birthdate, avatar_url, contact_email")
    .eq("id", user.id)
    .maybeSingle();

  // PIPA 안전성 확보조치 §8: 신규 가입자 생성 audit (경량 — provider 만).
  // profile row 가 없으면 첫 콜백 — Supabase trigger 가 곧 생성. provider 는
  // app_metadata.provider (Supabase OAuth) 또는 user_metadata.provider (naver fallback).
  if (!profile) {
    const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
    const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const provider =
      (typeof appMeta.provider === "string" && appMeta.provider) ||
      (typeof userMeta.provider === "string" && userMeta.provider) ||
      "unknown";
    await logAudit({
      action: "auth.signup",
      actorAuthUserId: user.id,
      targetTable: "auth.users",
      targetId: user.id,
      request,
      metadata: { provider },
    });
  }

  // 4-1) OAuth provider 메타 → profiles.{avatar_url, display_name} 자동 채우기
  //   Google: user_metadata.{picture, name, full_name}
  //   Kakao: user_metadata.{avatar_url, name, nickname}
  //   Naver: user_metadata.{avatar_url, name} (Naver 콜백에서 set)
  //   profiles 컬럼이 비어 있을 때만 채움 (사용자가 직접 설정한 값은 보존).
  if (profile) {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const updates: Record<string, string> = {};

    // avatar_url 자동 채우기 (기존 로직)
    if (!profile.avatar_url) {
      let oauthAvatar =
        (typeof meta.avatar_url === "string" && meta.avatar_url) ||
        (typeof meta.picture === "string" && meta.picture) ||
        null;
      if (oauthAvatar && oauthAvatar.startsWith("http://")) {
        oauthAvatar = "https://" + oauthAvatar.slice(7);
      }
      if (oauthAvatar) updates.avatar_url = oauthAvatar;
    }

    // display_name 자동 채우기 — OAuth provider 이름 사용
    //   Google: name 또는 full_name, Kakao: name 또는 nickname, Naver: name
    if (!profile.display_name) {
      const nameCandidate =
        (typeof meta.name === "string" && meta.name.trim() && meta.name.trim()) ||
        (typeof meta.full_name === "string" && meta.full_name.trim() &&
          meta.full_name.trim()) ||
        (typeof meta.nickname === "string" && meta.nickname.trim() &&
          meta.nickname.trim()) ||
        null;
      if (nameCandidate) updates.display_name = nameCandidate;
    }

    // contact_email 자동 채우기 (ADR 0003) — dedup 매칭 정확도 향상.
    // 비어 있을 때만 user.email (= auth.users.email, OAuth provider 이메일) 사용.
    // 사용자가 온보딩에서 직접 수정한 값은 보존.
    //   ⚠ Apple "이메일 가리기" relay 주소(@privaterelay.appleid.com)는 사용자마다
    //     다르고 실제 연락처가 아니라 dedup(ADR 0003)을 무력화하므로 저장하지 않는다.
    //     (사용자가 온보딩에서 실제 이메일을 직접 입력하면 그 값으로 dedup 동작)
    if (!profile.contact_email && typeof user.email === "string" && user.email.trim()) {
      const email = user.email.trim().toLowerCase();
      if (!email.endsWith("@privaterelay.appleid.com")) {
        updates.contact_email = email;
      }
    }

    if (Object.keys(updates).length > 0) {
      try {
        await supabase.from("profiles").update(updates).eq("id", user.id);
      } catch (e) {
        // 실패해도 로그인 흐름은 계속 — 단, 사용자 메타 동기화 누락은 회원 화면에서
        // 빈 표시·아바타 깨짐을 유발할 수 있어 추적용으로 기록.
        const isDev = process.env.NODE_ENV !== "production";
        if (isDev) {
          console.warn("[auth-callback] profile 메타 동기화 실패:", e instanceof Error ? e.message : e);
        } else {
          console.error("[auth-callback] profile 메타 동기화 실패:", e instanceof Error ? e.message : e);
        }
      }
    }
  }

  // 3-b) (작업 b) 동일 이메일 '다른 provider' 기존 계정 감지 — 표준 OAuth(Google/Kakao) 중복 방어.
  //   Naver 는 자체 콜백에서 이미 차단(A5). 표준 콜백은 신규 auth_user 가 이미 생성된 뒤이므로
  //   '현재 user 제외' RPC(find_other_auth_user_by_email, 0233)로 기존 계정 존재를 확인한다.
  //   존재하면: 현재(새) 세션 signOut + /login/conflict 안내. 단, 현재 계정이 '약관 미동의 +
  //   작성물 0' 일 때만 빈 신규 계정을 fail-safe 삭제(의심 시 보존 — 빈 계정은 무해).
  if (user.email) {
    try {
      const admin = createSupabaseAdminClient();
      const { data: otherRows } = await admin.rpc("find_other_auth_user_by_email", {
        p_email: user.email,
        p_exclude_user_id: user.id,
      });
      const other = (otherRows as { auth_user_id: string; providers: string[] }[] | null)?.[0];
      if (other) {
        const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
        const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
        const attemptedProvider =
          (typeof appMeta.provider === "string" && appMeta.provider) ||
          (typeof userMeta.provider === "string" && userMeta.provider) ||
          "unknown";
        const existingProvider =
          (other.providers ?? []).find((p) => p !== "email") ??
          (other.providers ?? [])[0] ??
          "other";

        // fail-safe 정리 조건: (현재 약관 미동의) + (작성물 0건). 하나라도 불확실하면 삭제 안 함.
        const isUnused = !profile || !profile.terms_agreed_at;
        let emptyContent = false;
        if (isUnused) {
          const [{ count: cardN }, { count: cmtN }] = await Promise.all([
            admin.from("cards").select("id", { count: "exact", head: true }).eq("author_id", user.id),
            admin.from("comments").select("id", { count: "exact", head: true }).eq("author_id", user.id),
          ]);
          emptyContent = (cardN ?? 0) === 0 && (cmtN ?? 0) === 0;
        }

        // 현재(새) 세션 로그아웃 — /login/conflict 가 로그인 상태로 안 갇히게.
        await supabase.auth.signOut();

        if (isUnused && emptyContent) {
          // 멱등·실패 무시. FK/캐스케이드 문제로 실패하면 빈 계정 남겨도 무해(보존).
          try {
            await admin.from("profiles").delete().eq("id", user.id);
            await admin.auth.admin.deleteUser(user.id);
            await logAudit({
              action: "auth.duplicate_cleanup",
              actorAuthUserId: user.id,
              targetTable: "auth.users",
              targetId: user.id,
              request,
              metadata: { existing_provider: existingProvider, attempted_provider: attemptedProvider },
            });
          } catch (cleanupErr) {
            console.warn(
              "[auth/callback] 빈 중복계정 정리 실패(보존):",
              cleanupErr instanceof Error ? cleanupErr.message : cleanupErr,
            );
          }
        }

        const url = new URL("/login/conflict", SITE_URL);
        url.searchParams.set("existing_provider", existingProvider);
        url.searchParams.set("attempted_provider", attemptedProvider);
        return NextResponse.redirect(url);
      }
    } catch (dupErr) {
      // 가용성 우선 — 충돌 감지 실패해도 로그인 흐름은 계속(단, 중복 방어 누락 가능성 기록).
      console.error(
        "[auth/callback] 중복 계정 감지 실패:",
        dupErr instanceof Error ? dupErr.message : dupErr,
      );
    }
  }

  // 4) 약관 미동의 → /signup
  if (!profile || !profile.terms_agreed_at) {
    const qs = next ? `?next=${encodeURIComponent(next)}` : "";
    return NextResponse.redirect(`${origin}/signup${qs}`);
  }

  // 5) 약관 동의는 했지만 추가정보(생년월일 등) 미입력 → /onboarding
  //    일반 사용자에게만 강제 (doctor / admin은 운영용 계정이라 스킵 가능)
  if (
    profile.role !== ROLES.DOCTOR &&
    profile.role !== ROLES.ADMIN &&
    !profile.birthdate
  ) {
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  // 6) 모든 role은 / 메인 피드로 (관리/내 글 페이지는 헤더 본인 아이콘으로 진입)
  const dest = next || "/";
  return NextResponse.redirect(`${origin}${dest}`);
}
