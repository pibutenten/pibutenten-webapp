import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { IDENTITY_COOKIE, UUID_RE } from "@/lib/identity-shared";

/**
 * 서버(Server Component / Route Handler / Server Action)용 Supabase 클라이언트.
 * Next.js 15+ 의 비동기 cookies() API에 맞춰 await 사용.
 *
 * Active identity 헤더 (2026-05-26, ADR 0001 active 권한 정합):
 *   httpOnly cookie `pibutenten:identity` 값이 UUID 면 매 supabase 요청에
 *   `x-active-profile-id` HTTP 헤더로 전송. PostgREST 가 GUC `request.headers`
 *   로 노출 → DB 의 `current_active_profile_id()` 헬퍼가 읽어 RLS/RPC 가 active
 *   신분 단위로 동작.
 *
 *   cookie 가 'primary' 또는 없거나 UUID 가 아니면 헤더 미설정 → fallback 으로
 *   auth.uid() (primary profile.id) 사용. 회귀 0.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  const activeIdRaw = cookieStore.get(IDENTITY_COOKIE)?.value;
  const activeId =
    activeIdRaw && activeIdRaw !== "primary" && UUID_RE.test(activeIdRaw)
      ? activeIdRaw
      : null;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component에서는 쿠키 set이 무시됨 (정상). middleware/Server Action에서만 동작.
          }
        },
      },
      ...(activeId
        ? { global: { headers: { "x-active-profile-id": activeId } } }
        : {}),
    },
  );
}
