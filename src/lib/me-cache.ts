/**
 * 클라이언트 me 정보 모듈 캐시.
 *
 * 같은 페이지에 여러 Card가 있을 때 각각 getUser + profiles select 하면
 * 부수적으로 수정/삭제 버튼이 시간차로 나타남. 첫 호출만 실제 fetch하고
 * 나머지는 그 promise를 share.
 *
 * 페이지 navigate 시 localStorage·세션 변경에 의해 자동 stale되지 않으므로
 * 본인 변경(로그아웃 등) 후 풀 reload 권장. logout 흐름은 이미 reload 함.
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type MeInfo = {
  id: string;
  role: "admin" | "doctor" | "user";
} | null;

let cached: MeInfo | undefined; // undefined = 아직 안 fetch
let pending: Promise<MeInfo> | null = null;

export async function getMeClient(): Promise<MeInfo> {
  if (cached !== undefined) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      const sb = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        cached = null;
        return null;
      }
      const { data: prof } = await sb
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      cached = {
        id: user.id,
        role:
          ((prof?.role as "admin" | "doctor" | "user" | undefined) ?? "user"),
      };
      return cached;
    } catch {
      cached = null;
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** 로그인·로그아웃 직후 캐시 무효화 (현재는 logout 시 풀 reload라 불필요하지만 미래용) */
export function invalidateMeCache() {
  cached = undefined;
  pending = null;
}
