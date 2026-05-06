import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, birthdate")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");

  const role = (profile.role ?? "user") as "admin" | "doctor" | "user";

  // 일반 사용자가 추가정보(생년월일 등) 미입력 — 글쓰기 시점에 받기
  if (role === "user" && !profile.birthdate) {
    redirect("/onboarding");
  }

  // 원장 본인 매핑
  let myDoctor: { slug: string; name: string } | null = null;
  if (role === "doctor") {
    const { data: da } = await supabase
      .from("doctor_accounts")
      .select("doctor:doctors(slug, name)")
      .eq("profile_id", user.id)
      .maybeSingle()
      .returns<{ doctor: { slug: string; name: string } | null } | null>();
    myDoctor = da?.doctor ?? null;
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
      displayName={profile.display_name ?? ""}
    />
  );
}
