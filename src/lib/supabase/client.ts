import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IDENTITY_MIRROR_COOKIE, UUID_RE } from "@/lib/identity-shared";

/**
 * 브라우저(Client Component)에서 사용하는 Supabase 클라이언트.
 *
 * - 같은 페이지 안에서 여러 컴포넌트가 호출해도 **싱글톤** 으로 1개 인스턴스만 반환.
 *   → /auth/v1/user 호출 폭주 완화, supabase-js 내부 state 일관.
 *
 * Active identity 헤더 (2026-05-26, ADR 0001 active 권한 정합):
 *   mirror cookie `pibutenten:identity-mirror` (httpOnly X) 가 UUID 면 매 supabase
 *   요청에 `x-active-profile-id` HTTP 헤더로 전송. PostgREST 가 GUC `request.headers`
 *   로 노출 → DB 의 `current_active_profile_id()` 헬퍼가 읽어 RLS/RPC 가 active
 *   신분 단위로 동작.
 *
 *   신분 전환은 IdentitySwitcher 가 `window.location.assign('/')` 풀 리로드로
 *   처리하므로 cached client lifetime 안에서 cookie 가 바뀌지 않음 — 헤더 일관.
 *   cookie 가 'primary' 또는 UUID 가 아니면 헤더 미설정 → DB fallback (auth.uid()).
 *
 * 변경 (2026-05-15 — P1-3 fix):
 *   - 모듈 스코프 캐시로 단일 인스턴스
 *
 * 변경 (2026-05-15 — Google/Kakao OAuth 회귀 fix):
 *   - 옛 onAuthStateChange('SIGNED_OUT') → window.location.reload() 핸들러 제거.
 */

let cached: SupabaseClient | null = null;

function readActiveIdFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const cookieStr = document.cookie || "";
  const target = `${IDENTITY_MIRROR_COOKIE}=`;
  for (const part of cookieStr.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      const raw = decodeURIComponent(trimmed.slice(target.length));
      if (raw && raw !== "primary" && UUID_RE.test(raw)) return raw;
      return null;
    }
  }
  return null;
}

export function createSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;
  const activeId = readActiveIdFromCookie();
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    activeId
      ? { global: { headers: { "x-active-profile-id": activeId } } }
      : undefined,
  );
  return cached;
}
