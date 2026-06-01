import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { isPostCategorySlug, type PostCategorySlug } from "@/lib/post-category";
import { ROLES } from "@/lib/identity-shared";
import WriteClient from "./WriteClient";

export const dynamic = "force-dynamic";

type Doctor = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
};

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function WritePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const rawType = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  const rawCategory = Array.isArray(sp.category) ? sp.category[0] : sp.category;
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
  if (role === ROLES.DOCTOR && idCtx.active.doctorId) {
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
  if (role === ROLES.ADMIN) {
    const { data } = await supabase
      .from("doctors")
      .select("id, slug, name, branch")
      .order("name", { ascending: true })
      .returns<Doctor[]>();
    doctors = data ?? [];
  }

  // URL 파라미터 → 초기 카테고리.
  //   1) ?category=qa|doodle 우선 (isPostCategorySlug 검증 — 폐지 카테고리는 자동 거부)
  //   2) ?type=qa (legacy) → 'qa'로 매핑 / 그 외 type은 무시
  //   3) role 권한 검증 — qa는 doctor/admin 한정
  let initialCategory: PostCategorySlug | undefined;
  if (rawCategory && isPostCategorySlug(rawCategory)) {
    initialCategory = rawCategory;
  } else if (rawType === "qa") {
    initialCategory = "qa";
  }
  if (initialCategory === "qa" && role === ROLES.USER) {
    initialCategory = undefined;
  }

  return (
    <WriteClient
      role={role}
      myDoctor={myDoctor}
      doctors={doctors}
      displayName={displayName}
      initialCategory={initialCategory}
    />
  );
}
