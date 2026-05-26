/**
 * 클라이언트 me 정보 모듈 캐시.
 *
 * ADR 0012 정합 (2026-05-26): 명함 단위 완전 독립.
 * role 은 **현재 active profile** 의 role 을 읽음. base profile (id=auth.uid) 만 읽던
 * 옛 패턴은 sub-identity 의사 사용자에게 잘못된 권한 표시 회귀 발생 (정한미 원장 패턴).
 *
 * 같은 페이지에 여러 Card가 있을 때 각각 getUser + profiles select 하면
 * 부수적으로 수정/삭제 버튼이 시간차로 나타남. 첫 호출만 실제 fetch하고
 * 나머지는 그 promise를 share.
 *
 * IdentitySwitcher 가 신분 전환 시 풀 reload 하므로 cache invalidation 불필요.
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveIdentityId } from "@/lib/active-identity";

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
      // ADR 0012 — active profile.id 의 role 조회. 옛 패턴 (user.id 만) 폐기.
      const activeId = getActiveIdentityId() ?? user.id;
      const { data: prof } = await sb
        .from("profiles")
        .select("role")
        .eq("id", activeId)
        .maybeSingle();
      cached = {
        id: activeId,
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

// (invalidateMeCache 폐기됨 — logout/identity switch 흐름이 풀 reload이므로 불필요)
