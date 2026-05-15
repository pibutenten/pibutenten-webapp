import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 브라우저(Client Component)에서 사용하는 Supabase 클라이언트.
 *
 * - 같은 페이지 안에서 여러 컴포넌트가 호출해도 **싱글톤** 으로 1개 인스턴스만 반환.
 *   → /auth/v1/user 호출 폭주 완화, supabase-js 내부 state 일관.
 *
 * 이전 동작:
 *   - 컴포넌트마다 createBrowserClient() 호출 → 각각 별도 인스턴스
 *
 * 변경 (2026-05-15 — P1-3 fix):
 *   - 모듈 스코프 캐시로 단일 인스턴스
 *
 * 변경 (2026-05-15 — Google/Kakao OAuth 회귀 fix):
 *   - 옛 onAuthStateChange('SIGNED_OUT') → window.location.reload() 핸들러 제거.
 *     OAuth signInWithOAuth 흐름 중 supabase-js 가 내부적으로 잔여 세션 정리하며
 *     SIGNED_OUT 이벤트 발사 → reload 트리거 → provider redirect 끊김.
 *     "구글·카카오 로그인 둘 다 안 됨" 증상 직접 원인.
 *   - 무한 refresh 재시도 보호는 supabase-js 기본 동작에 위임.
 */

let cached: SupabaseClient | null = null;

export function createSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return cached;
}
