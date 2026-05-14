import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import WriteClient from "./WriteClient";

export const dynamic = "force-dynamic";

type Doctor = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
};

export default async function WritePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/write");

  // Phase 9: active identity 기반 role 결정 (cookie 'pibutenten:identity').
  // 같은 사람의 admin/doctor/user profile 묶음에서 cookie로 선택된 active만 권한 인정.
  // 예: 배정민(admin) + 배스킨(user 부계정) → 배스킨 cookie active 시 role='user'.
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) redirect("/login?error=프로필을 찾을 수 없습니다");

  const role = (idCtx.active.role ?? "user") as "admin" | "doctor" | "user";
  const displayName = idCtx.active.displayName ?? "";

  // 원장 본인 매핑 — active identity의 doctor_id로 조회
  let myDoctor: { slug: string; name: string } | null = null;
  if (role === "doctor" && idCtx.active.doctorId) {
    const { data: d } = await supabase
      .from("doctors")
      .select("slug, name")
      .eq("id", idCtx.active.doctorId)
      .maybeSingle()
      .returns<{ slug: string; name: string } | null>();
    myDoctor = d ?? null;
  }

  // 관리자/qa용 원장 목록
  let doctors: Doctor[] = [];
  if (role === "admin") {
    const { data } = await supabase
      .from("doctors")
      .select("id, slug, name, branch")
      .order("name", { ascending: true })
      .returns<Doctor[]>();
    doctors = data ?? [];
  }

  return (
    <WriteClient
      role={role}
      myDoctor={myDoctor}
      doctors={doctors}
      displayName={displayName}
    />
  );
}
