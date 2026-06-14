import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "마이페이지",
  robots: { index: false, follow: false },
};

/**
 * /my — 활성 명함(계정) 역할에 따라 분기 redirect.
 *
 * 신규 스킨 승격(2026-06-15): 마이 = 본인 공개 프로필로 통일(베타 /beta-skin/my 선례).
 *   - 관리자(admin) → /admin
 *   - 원장(doctor) → /doctor (원장 대시보드)
 *   - 회원(user) → 본인 공개 프로필 /{handle} (승격된 BetaProfileView — '프로필·설정' 아코디언 + 활동 탭)
 *   - 비로그인 → /login?next=/my
 *   - handle 미설정(예외) → /
 *
 * 역할분기는 운영 그대로 보존. 회원의 활동/설정은 모두 승격된 공개 프로필 안에서 처리하므로
 *   별도 마이페이지 본문(옛 MyPageClient)을 렌더하지 않고 공개 프로필로 redirect 한다.
 */
export default async function MyPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/my");

  const idCtx = await getIdentityContext(supabase);
  const active = idCtx?.active;
  if (active?.role === ROLES.ADMIN) redirect("/admin");
  if (active?.role === ROLES.DOCTOR) redirect("/doctor");

  // 회원 — active 명함 handle 로 본인 공개 프로필로.
  if (active?.handle) redirect(`/${active.handle}`);

  // handle 없는 예외(거의 도달 안 함) — base 프로필 handle fallback.
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("id", user.id)
    .maybeSingle()
    .returns<{ handle: string | null }>();
  if (profile?.handle) redirect(`/${profile.handle}`);

  redirect("/");
}
