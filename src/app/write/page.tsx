import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";
import { getReviewProcedures } from "@/lib/review-procedures";
import type { ProcedureOption } from "@/app/review/new/ReviewForm";
import WriteView from "@/app/beta-skin/write/WriteView";

type Doctor = { id: string; slug: string; name: string; branch: string | null };

export const dynamic = "force-dynamic";

// noindex 는 write/layout.tsx 가 담당. 페이지는 타이틀만(템플릿이 "| 피부텐텐" 부착).
export const metadata: Metadata = {
  title: "글쓰기",
};

/**
 * /write — 통합 글쓰기(신규 스킨 승격 Phase 1b). 신규 스킨 WriteView(베타 UI)를 운영 라우트에서
 *   직접 렌더한다. WriteView 내부는 운영 WriteTabs(시술노트=DiaryForm / 시술후기=ReviewForm /
 *   끄적끄적·Q&A=WriteClient)를 그대로 사용 — 작성 로직·RLS·권한은 운영 패턴 무수정.
 *   서버는 구 /beta-skin/write(page.tsx)와 동일하게 role/displayName/myDoctor/doctors/handle/
 *   procedures 를 주입. metadata 는 운영용("글쓰기", noindex 는 write/layout.tsx 담당).
 *   운영 딥링크(?tab=qa|review|doodle, ?category=qa, ?proc=)는 WriteView 의 initialTab/
 *   initialProcedure 로 전달 — 구 /write 의 탭 프리셀렉트 동선 보존(회귀 방지).
 */
export default async function WritePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; category?: string; proc?: string }>;
}) {
  const sp = await searchParams;
  // 기존 admin 링크(/write?category=qa) 호환 — category=qa → tab=qa 로 정규화.
  const initialTab = sp.tab ?? (sp.category === "qa" ? "qa" : undefined);
  // 시술노트 저장 후 후기 유도 시 미리 정해진 시술(?proc=) — ReviewForm 잠금 프리필.
  const initialProcedure = sp.proc?.trim() || undefined;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: "admin" | "doctor" | "user" = "user";
  let displayName = "";
  let handle = ""; // 시술후기(ReviewForm) 제출 후 /{handle}/{shortcode} 이동용(운영 정합).
  let myDoctor: { slug: string; name: string } | null = null;
  let doctors: Doctor[] = [];

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
      initialTab={initialTab}
      initialProcedure={initialProcedure}
    />
  );
}
