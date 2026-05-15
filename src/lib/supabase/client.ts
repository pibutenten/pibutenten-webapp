import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 브라우저(Client Component)에서 사용하는 Supabase 클라이언트.
 *
 * - 같은 페이지 안에서 여러 컴포넌트가 호출해도 **싱글톤** 으로 1개 인스턴스만 반환.
 *   → onAuthStateChange 핸들러 중복 등록 방지, /auth/v1/user 호출 폭주 완화.
 * - 한 번만 onAuthStateChange('SIGNED_OUT') 핸들러 등록:
 *   다른 탭에서 로그아웃하거나 세션 만료되면 토큰 리프레시 무한 재시도 멈추도록
 *   페이지 강제 리로드 (/login 미들웨어 가드에 위임).
 *
 * 이전 동작:
 *   - 컴포넌트마다 createBrowserClient() 호출 → 각각 별도 인스턴스
 *   - refresh 실패 시 ERR_FAILED 11회+ 재시도 누적 (콘솔 폭주)
 *
 * 변경 (2026-05-15 — P1-3 fix):
 *   - 모듈 스코프 캐시로 단일 인스턴스
 *   - SIGNED_OUT 이벤트 받으면 location.reload() 로 깨끗하게 재진입
 */

let cached: SupabaseClient | null = null;

export function createSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;
  const sb = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  cached = sb;

  // SIGNED_OUT — 다른 탭 로그아웃 / 세션 만료 / refresh 실패 → 페이지 리로드.
  // 리로드 시 미들웨어가 비로그인이면 그대로 통과, 로그인 필요 페이지면 /login 으로 보냄.
  // 무한 refresh 재시도 루프 끊는 안전망.
  if (typeof window !== "undefined") {
    sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        // 약간의 debounce — 동시에 여러 콜백 트리거되면 1번만 리로드
        if (!(window as unknown as { __pibutenten_reloading?: boolean })
          .__pibutenten_reloading) {
          (window as unknown as { __pibutenten_reloading?: boolean })
            .__pibutenten_reloading = true;
          setTimeout(() => window.location.reload(), 150);
        }
      }
    });
  }

  return sb;
}
