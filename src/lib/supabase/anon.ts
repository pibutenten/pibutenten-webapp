import { createServerClient } from "@supabase/ssr";

/**
 * 쿠키리스 공개 읽기 전용 Supabase 클라이언트 (anon 역할).
 *
 * 목적 (R-Phase, 2026-06-06):
 *   ISR/정적 렌더가 가능한 공개 페이지(의사 Q&A 상세 · 토픽 hub 등)에서
 *   `cookies()` 를 건드리지 않게 하여 Next.js 가 라우트를 동적(force-dynamic)으로
 *   강제 전환하지 않도록 한다. (createSupabaseServerClient 는 cookies() 를 읽어
 *   항상 dynamic 이 되므로 엣지 캐시가 전부 MISS.)
 *
 * 제약:
 *   - 인증 컨텍스트 없음 → RLS 상 published(공개) 행만 읽힌다. 공개 페이지엔 충분.
 *   - 개인화(내 좋아요/저장 여부 등)는 화면의 Card("use client")가 마운트 후
 *     별도(uncached) 호출로 가져온다 → 공용 캐시 HTML 에 개인 상태가 섞이지 않음.
 */
export function createSupabaseAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          /* no-op — 쿠키 미사용(정적/ISR 렌더 유지) */
        },
      },
    },
  );
}
