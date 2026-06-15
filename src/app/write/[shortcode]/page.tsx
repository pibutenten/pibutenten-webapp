import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import UserEditClient from "./EditClient";
import AdminEditClient from "@/app/admin/cards/[id]/edit/EditClient";
import BackButton from "@/components/BackButton";
import WriteEditShell from "@/components/skin/write/WriteEditShell";
import { getIdentityContext } from "@/lib/identity";
import { fetchAdminCardExtras } from "@/lib/admin-card-extras";
import type { PubmedRefObj } from "@/lib/schema/api/articles";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ shortcode: string }>;
};

type QaRow = {
  id: number;
  title: string;
  body: string;
  keywords: string[] | null;
  type: "qa" | "post";
  status: string;
  category: string | null;
  author_id: string | null;
  doctor_id: string | null;
  shortcode: string | null;
  external_url: string | null;
  external_title: string | null;
  external_description: string | null;
  external_image: string | null;
  external_site_name: string | null;
  pubmed_refs: PubmedRefObj[] | null;
  author:
    | { handle: string | null }
    | { handle: string | null }[]
    | null;
};

/**
 * 글 수정 페이지 — /write/{shortcode}
 *
 * v5.1 spec: /write 통합. 신규 작성은 /write, 수정은 /write/{shortcode}.
 * 권한 체크는 shortcode 기반으로만 진행 (handle 검증은 보기 라우트에서 처리됨).
 *
 * 권한 (모든 판정은 **active profile 한 장** 기준 — CLAUDE.md 원칙 #1):
 *   - active.role='admin' → 모든 카드 수정 가능
 *   - qa.author_id === active.profileId 면 수정 가능 (묶음 다른 profile 자동 인정 X)
 *   - active.role='doctor' + 그 doctor 의 카드면 수정 가능
 *
 * Critical-2 (2026-05-27): 묶음 OR 합산 폐지. 묶음의 alt profile 로 쓴 글은 그 profile
 *   로 active 전환했을 때만 본인 글로 인정. 카드 컴포넌트(useCardViewer)의 ⋮ 노출
 *   판정과 정확히 동일 기준이 되어 UX 일관.
 */
export default async function PostEditPage({ params }: Props) {
  const { shortcode } = await params;

  // shortcode 형식 사전 검증 (base58 6~12자)
  if (!/^[1-9A-HJ-NP-Za-km-z]{6,12}$/.test(shortcode)) notFound();

  const supabase = await createSupabaseServerClient();

  // active identity 조회 (식별자 전환 반영). 미로그인 → /login.
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx) redirect(`/login?next=/write/${shortcode}`);
  if (!idCtx.active) {
    redirect("/login?error=프로필을 찾을 수 없습니다");
  }

  // qa 로드 — handle은 viewer URL 만들기 용도로만.
  // Phase 2 (260518): EditClient 풀폼 확장 위해 category / external_* / pubmed_* 추가.
  const { data: qa } = await supabase
    .from("cards")
    .select(
      `id, title, body, keywords, type, status, category, author_id, doctor_id, shortcode,
       external_url, external_title, external_description, external_image, external_site_name,
       pubmed_refs,
       author:profiles!cards_author_id_profiles_fkey(handle)`,
    )
    .eq("shortcode", shortcode)
    .maybeSingle()
    .returns<QaRow>();
  if (!qa) notFound();

  // 권한 체크 — 전부 active profile 한 장 기준 (CLAUDE.md 원칙 #1)
  //   isAdmin       : active 가 admin role
  //   isAuthor      : qa.author_id === active.profileId (묶음 OR 합산 X)
  //   isDoctorOfQa  : active 의 doctor_id 매핑 + qa.doctor_id 일치
  const isAdmin = idCtx.isSuperAdmin;
  const isAuthor =
    !!qa.author_id && qa.author_id === idCtx.active.profileId;
  const isDoctorOfQa =
    !!idCtx.activeDoctorId && qa.doctor_id === idCtx.activeDoctorId;
  const canEdit = isAdmin || isAuthor || isDoctorOfQa;
  if (!canEdit) {
    redirect("/?error=본인 글만 편집할 수 있습니다");
  }

  // returnUrl 계산 — viewer URL (취소·저장 후 돌아갈 곳)
  const a = Array.isArray(qa.author) ? qa.author[0] : qa.author;
  const handle = a?.handle ?? null;
  const returnUrl = handle ? `/${handle}/${shortcode}` : "/";

  // admin 분기 — 같은 경로 진입이라도 super admin 은 admin extras (글쓴이 변경, 숨김,
  // soft-delete, status 토글, LLM 태그 등) 전부 노출. 추가 풀 select 후 AdminEditClient 렌더.
  if (isAdmin) {
    const { data: fullRaw } = await supabase
      .from("cards")
      .select(
        `id, title, body, meta, keywords, status, type, category, is_pick,
         doctor_id, author_id, video_id, like_count, view_count, created_at,
         external_url, external_title, external_image, external_site_name,
         pubmed_refs,
         author:profiles!cards_author_id_profiles_fkey(id, display_name, handle, role),
         doctor:doctors(id, slug, name, branch)`,
      )
      .eq("id", qa.id)
      .maybeSingle();
    if (!fullRaw) notFound();
    const card = {
      ...fullRaw,
      author: Array.isArray(fullRaw.author)
        ? fullRaw.author[0] ?? null
        : fullRaw.author,
      doctor: Array.isArray(fullRaw.doctor)
        ? fullRaw.doctor[0] ?? null
        : fullRaw.doctor,
    } as Parameters<typeof AdminEditClient>[0]["card"];

    const extras = await fetchAdminCardExtras(supabase, card, {
      isSuperAdmin: true,
    });

    return (
      <WriteEditShell>
        <section className="w-full py-6">
          <div className="mb-1 -ml-1"><BackButton /></div>
          <AdminEditClient
            card={card}
            doctors={extras.doctors}
            doctorPickCount={extras.doctorPickCount}
            commentCount={extras.commentCount}
            canChangeAuthor={true}
            authorOptions={extras.authorOptions}
          />
        </section>
      </WriteEditShell>
    );
  }

  return (
    <WriteEditShell>
      <section className="w-full py-6">
        <div className="mb-1 -ml-1"><BackButton /></div>
        <div className="mb-5 flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-[var(--text)]">글 수정</h1>

        </div>
        <UserEditClient
        cardId={qa.id}
        type={qa.type}
        category={qa.category}
        viewerRole={(idCtx.active.role ?? "user") as "admin" | "doctor" | "user"}
        initialTitle={qa.title}
        initialBody={qa.body}
        initialKeywords={qa.keywords ?? []}
        initialExternalUrl={qa.external_url ?? ""}
        initialExternalMeta={
          qa.external_title || qa.external_description
            ? {
                title: qa.external_title ?? undefined,
                description: qa.external_description ?? undefined,
                image: qa.external_image,
                siteName: qa.external_site_name ?? undefined,
              }
            : null
        }
        initialPubmedRefs={qa.pubmed_refs ?? []}
        returnUrl={returnUrl}
      />
      </section>
    </WriteEditShell>
  );
}
