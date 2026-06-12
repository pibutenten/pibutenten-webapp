import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";
import { getReviewProcedures } from "@/lib/review-procedures";
import type { ProcedureOption } from "@/app/review/new/ReviewForm";
import WriteTabs from "./WriteTabs";

type Doctor = { id: string; slug: string; name: string; branch: string | null };

export const dynamic = "force-dynamic";

// noindex 는 write/layout.tsx 가 담당. 페이지는 타이틀만(템플릿이 "| 피부텐텐" 부착).
export const metadata: Metadata = {
  title: "글쓰기",
};

/**
 * /write — 통합 글쓰기(2026-06-11 메인 승격). 한 화면 3탭(시술노트·시술후기·끄적끄적).
 *   탭 전환은 BetaNav 2차 바의 ?tab= (record|review|doodle). 기존 단독 /write(qa/카테고리 선택) 폐기.
 *   - 시술노트: 목업 DiaryForm (DB 저장 배선은 후속).
 *   - 시술후기: 기존 ReviewForm(/review/new 공유) — 로그인 필요.
 *   - 끄적끄적: 기존 WriteClient(initialCategory=doodle) — 로그인 필요.
 */
export default async function WritePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; category?: string; proc?: string }>;
}) {
  const sp = await searchParams;
  // 기존 admin 링크(/write?category=qa) 호환 — category=qa → tab=qa 로 정규화.
  const tab = sp.tab ?? (sp.category === "qa" ? "qa" : undefined);
  // 시술노트 저장 후 후기 유도 시 미리 정해진 시술(?proc=) — ReviewForm 잠금 프리필.
  const initialProcedure = sp.proc?.trim() || undefined;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  return <WriteTabs tab={tab} isLoggedIn={!!user} role={role} displayName={displayName} myDoctor={myDoctor} doctors={doctors} procedures={procedures} handle={handle} initialProcedure={initialProcedure} />;
}
