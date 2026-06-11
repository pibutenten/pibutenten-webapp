import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";
import MyPageClient from "./MyPageClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "마이페이지",
  robots: { index: false, follow: false },
};

// 마이페이지 — 활성 명함(계정) 역할에 따라:
//   관리자 → /admin(KPI 대시보드), 원장 → /doctor(원장 대시보드)로 바로 이동.
//   회원·비로그인 → 마이페이지(계정 스위처 + 활동 + 설정). 계정 스위처는 각 대시보드 상단에도 있어
//   어디서든 전환 가능(전환 시 /my 로 reload → 새 역할로 재라우팅).
export default async function MyPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const idCtx = await getIdentityContext(supabase);
    const role = idCtx?.active?.role;
    if (role === ROLES.ADMIN) redirect("/admin");
    if (role === ROLES.DOCTOR) redirect("/doctor");
  }
  return <MyPageClient />;
}
