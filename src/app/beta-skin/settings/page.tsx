import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";

/**
 * /beta-skin/settings — 신규 스킨 "설정".
 *
 * 설정은 별도 페이지가 아니라 본인 공개 프로필(/beta-skin/u/{handle})의 '프로필·설정'
 *   아코디언으로 인라인 편집한다(ProfileEditClient embedded). 따라서 이 라우트로의 직접 접속·
 *   기존 링크는 본인 공개 프로필로 redirect 한다(동선 통일, 링크 깨짐 방지).
 * - 비로그인 → /login?next=/beta-skin/settings (재진입 후 다시 본인 프로필로 redirect).
 * - active 명함 handle 은 getIdentityContext SSOT 로 결정.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 설정",
  robots: { index: false, follow: false },
};

export default async function BetaSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/beta-skin/settings");

  // active 명함 handle 로 본인 공개 프로필 아코디언으로 보냄.
  const idCtx = await getIdentityContext(supabase);
  const handle = idCtx?.active?.handle;
  redirect(handle ? `/beta-skin/u/${handle}` : "/beta-skin");
}
