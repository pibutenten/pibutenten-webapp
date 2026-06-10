import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";
import { getReviewProcedures } from "@/lib/review-procedures";
import type { ProcedureOption } from "@/app/review/new/ReviewForm";
import WriteTabs from "./WriteTabs";

type Doctor = { id: string; slug: string; name: string; branch: string | null };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "글쓰기 — 피부텐텐 베타",
  robots: { index: false, follow: false },
};

export default async function BetaWritePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role: "admin" | "doctor" | "user" = "user";
  let displayName = "";
  let myDoctor: { slug: string; name: string } | null = null;
  let doctors: Doctor[] = [];
  let handle = ""; // 시술후기(ReviewForm) 제출 성공 시 /{handle}/{shortcode} 이동에 사용.

  // 시술후기 폼 시술 선택지 — /review/new 와 동일 헬퍼(태그 인기순). 로그인 무관 빌드(가벼움).
  const procedures: ProcedureOption[] = await getReviewProcedures(supabase);

  if (user) {
    const idCtx = await getIdentityContext(supabase);
    if (idCtx?.active) {
      role = (idCtx.active.role ?? "user") as "admin" | "doctor" | "user";
      displayName = idCtx.active.displayName ?? "";
      handle = idCtx.active.handle ?? "";
      if (role === ROLES.DOCTOR && idCtx.active.doctorId) {
        const { data: d } = await supabase
          .from("doctors").select("slug, name").eq("id", idCtx.active.doctorId)
          .maybeSingle().returns<{ slug: string; name: string } | null>();
        myDoctor = d ?? null;
      }
      if (role === ROLES.ADMIN) {
        const { data } = await supabase
          .from("doctors").select("id, slug, name, branch").order("name", { ascending: true })
          .returns<Doctor[]>();
        doctors = data ?? [];
      }
    }
  }

  return <WriteTabs tab={tab} isLoggedIn={!!user} role={role} displayName={displayName} myDoctor={myDoctor} doctors={doctors} procedures={procedures} handle={handle} />;
}
