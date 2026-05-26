import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import UserEditClient from "./EditClient";
import AdminEditClient from "@/app/admin/cards/[id]/edit/EditClient";
import BackButton from "@/components/BackButton";
import { bundleProfileFilter } from "@/lib/identity-shared";
import { getIdentityContext } from "@/lib/identity";
import { fetchAdminCardExtras } from "@/lib/admin-card-extras";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ shortcode: string }>;
};

type PubmedRefRow = {
  pmid?: string | null;
  doi?: string | null;
  title?: string | null;
  journal?: string | null;
  year?: string | null;
  authors_short?: string | null;
  pubmed_url?: string | null;
  doi_url?: string | null;
} | null;

type QaRow = {
  id: number;
  question: string;
  answer: string;
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
  pubmed_refs: NonNullable<PubmedRefRow>[] | null;
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
 * 권한 (모든 판정은 **active identity** 기준 — 식별자 전환 결과를 따름):
 *   - active.role='admin' → 모든 카드 수정 가능
 *   - active 카드 author이면 수정 가능 (묶음 안 어떤 profile이든 author 면 인정)
 *   - active.role='doctor' + 그 doctor 의 카드면 수정 가능
 *
 * 260518 fix: 기존 코드는 `auth.getUser()` 의 base profile.role 만 봐서 식별자
 *   전환(예: admin profile 로 전환)이 무시되어 admin이 다른 사람 글 수정 차단되던
 *   회귀. 카드 컴포넌트(useCardViewer)는 이미 active identity 기준으로 ⋮ 노출
 *   판정하는데, 진입 페이지가 다른 기준이라 "통로는 있는데 들어가면 막힘" UX
 *   모순 발생. getIdentityContext() 표준 헬퍼로 통일.
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
      `id, question, answer, keywords, type, status, category, author_id, doctor_id, shortcode,
       external_url, external_title, external_description, external_image, external_site_name,
       pubmed_refs,
       author:profiles!cards_author_id_profiles_fkey(handle)`,
    )
    .eq("shortcode", shortcode)
    .maybeSingle()
    .returns<QaRow>();
  if (!qa) notFound();

  // Phase 9 묶음 내 모든 profile.id 수집 — author_id가 묶음 안 어떤 profile이든 본인으로 인정.
  // (묶음의 alt profile로 쓴 글도 본인 글로 인정)
  const { data: myProfiles } = await supabase
    .from("profiles")
    .select("id")
    .or(bundleProfileFilter(idCtx.user.id));
  const myProfileIds = new Set((myProfiles ?? []).map((p) => p.id as string));

  // 권한 체크 — 전부 active identity 기준
  //   isAdmin       : active 가 admin role (식별자 전환된 그 profile 의 role)
  //   isAuthor      : qa.author_id 가 묶음 안 어느 profile (묶음 인지)
  //   isDoctorOfQa  : active 가 매핑된 doctor (identity-server.ts 에서 doctor_accounts
  //                    lookup 으로 채워짐 — active profile.id 기반이라 두 anchor 패턴
  //                    모두 호환)
  const isAdmin = idCtx.isSuperAdmin;
  const isAuthor = !!qa.author_id && myProfileIds.has(qa.author_id);
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
        `id, question, answer, meta, keywords, status, type, category, is_pick,
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
    );
  }

  return (
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
        initialTitle={qa.question}
        initialBody={qa.answer}
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
  );
}
