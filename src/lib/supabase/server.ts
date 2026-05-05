import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * 서버(Server Component / Route Handler / Server Action)용 Supabase 클라이언트.
 * Next.js 15+ 의 비동기 cookies() API에 맞춰 await 사용.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

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
    },
  );
}
