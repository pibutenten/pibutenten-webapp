import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";
import { getReviewProcedures } from "@/lib/review-procedures";
import type { ProcedureOption } from "@/app/review/new/ReviewForm";
import WriteView from "./WriteView";

type Doctor = { id: string; slug: string; name: string; branch: string | null };

/**
 * /beta-skin/write — 신규 스킨 "글쓰기" 프리뷰.
 *
 * 격리: 운영 파일 무수정. BetaSkinShell(fixed z-100 오버레이)로 글로벌 크롬을 덮음.
 * 폼은 자체 재구현(누더기) 폐기 → 운영 작성 컴포넌트를 그대로 재사용:
 *   - 시술노트: 운영 DiaryForm / 시술후기: 운영 ReviewOnlyForm
 *   - 끄적끄적: 운영 WriteClient(initialCategory="doodle")
 *   - Q&A: 운영 WriteClient(initialCategory="qa") — 원장·관리자만
 *   WriteClient 가 요구하는 role/displayName/myDoctor/doctors 는 운영 /write 와 동일하게 서버에서 주입.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 글쓰기",
  robots: { index: false, follow: false },
};

export default async function BetaSkinWritePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: "admin" | "doctor" | "user" = "user";
  let displayName = "";
  let handle = ""; // 시술후기(ReviewForm) 제출 후 /{handle}/{shortcode} 이동용(운영 정합).
  let myDoctor: { slug: string; name: string } | null = null;
  let doctors: Doctor[] = [];

  // 시술후기 폼 시술 선택지 — 운영 /write 와 동일 헬퍼(로그인 무관 빌드).
  const procedures: ProcedureOption[] = await getReviewProcedures(supabase);

  if (user) {
    const idCtx = await getIdentityContext(supabase);
    if (idCtx?.active) {
      role = (idCtx.active.role ?? "user") as "admin" | "doctor" | "user";
      displayName = idCtx.active.displayName ?? "";
      handle = idCtx.active.handle ?? "";
      if (role === ROLES.DOCTOR && idCtx.active.doctorId) {
        const { data: d } = await supabase
          .from("doctors")
          .select("slug, name")
          .eq("id", idCtx.active.doctorId)
          .maybeSingle()
          .returns<{ slug: string; name: string } | null>();
        myDoctor = d ?? null;
      }
      if (role === ROLES.ADMIN) {
        const { data } = await supabase
          .from("doctors")
          .select("id, slug, name, branch")
          .order("name", { ascending: true })
          .returns<Doctor[]>();
        doctors = data ?? [];
      }
    }
  }

  return (
    <WriteView
      isLoggedIn={!!user}
      role={role}
      displayName={displayName}
      handle={handle}
      myDoctor={myDoctor}
      doctors={doctors}
      procedures={procedures}
    />
  );
}
