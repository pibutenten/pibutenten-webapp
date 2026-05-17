import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase Admin (service_role) 클라이언트.
 *
 * ⚠️ **서버 전용** — service_role 키는 RLS를 무시하므로 클라이언트에 절대 노출 금지.
 *  - Route Handler / Server Action / Server Component 안에서만 import
 *  - 클라이언트 컴포넌트("use client")에서 import 시 빌드 단계에서 에러
 *
 * 사용처:
 *  - Naver/Apple 등 외부 OAuth provider에서 받은 user info를 Supabase Auth와 동기화
 *  - admin 전용 쿼리 (RLS 우회 필요한 경우)
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.");
  }
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다. (.env.local 또는 Vercel Environment Variables 확인)",
    );
  }
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
