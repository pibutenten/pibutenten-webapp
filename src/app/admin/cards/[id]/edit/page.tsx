import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { fetchAdminCardExtras } from "@/lib/admin-card-extras";
import EditClient from "./EditClient";
import AdminCardEditView from "./AdminCardEditView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "카드 편집",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminEditQAPage({ params }: Props) {
  const { id } = await params;
  const numId = Number.parseInt(id, 10);
  if (!Number.isFinite(numId) || numId <= 0) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/admin/cards/${id}/edit`);

  // active identity 기반 권한 분기 — super admin만 글쓴이 변경 가능
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    redirect("/login?error=권한이 필요합니다");
  }
  const isSuperAdmin = idCtx.isSuperAdmin;
  const isDoctorAdmin = idCtx.isDoctorAdmin;
  if (!isSuperAdmin && !isDoctorAdmin) {
    redirect("/login?error=권한이 필요합니다");
  }

  const { data: qaRaw } = await supabase
    .from("cards")
    .select(
      `id, title, body, meta, keywords, status, type, category, is_pick, shortcode,
       doctor_id, author_id, video_id, post_slug, post_year, like_count, view_count, created_at,
       deleted_at,
       external_url, external_title, external_image, external_site_name,
       pubmed_refs,
       author:profiles!cards_author_id_profiles_fkey(id, display_name, handle, role),
       doctor:doctors(id, slug, name, branch),
       video:videos(youtube_id, youtube_url, topic, upload_date)`,
    )
    .eq("id", numId)
    .maybeSingle();
  if (!qaRaw) notFound();

  // 시술후기(type=review)는 일반 카드 에디터가 아니라 후기 전용 에디터로 — 사용자 정책.
  if (qaRaw.type === "review" && qaRaw.shortcode) {
    redirect(`/review/${qaRaw.shortcode}/edit`);
  }
  // 시술 리포트(type=review_summary)는 자동 집계물 → 편집 불가. 공개 리포트로 보냄(slug 없으면 404).
  if (qaRaw.type === "review_summary") {
    if (qaRaw.post_slug) redirect(`/reports/${qaRaw.post_slug}`);
    notFound();
  }

  // 원장 admin은 본인 doctor 글만 편집 가능 (super admin은 모두)
  if (isDoctorAdmin && !isSuperAdmin) {
    if (qaRaw.doctor_id !== idCtx.activeDoctorId) {
      redirect("/admin/cards?error=본인 글만 편집할 수 있습니다");
    }
  }
  // PostgREST join은 배열로 추론되므로 단일 객체로 normalize
  const card = {
    ...qaRaw,
    author: Array.isArray(qaRaw.author) ? qaRaw.author[0] ?? null : qaRaw.author,
    doctor: Array.isArray(qaRaw.doctor) ? qaRaw.doctor[0] ?? null : qaRaw.doctor,
    video: Array.isArray(qaRaw.video) ? qaRaw.video[0] ?? null : qaRaw.video,
  } as Parameters<typeof EditClient>[0]["card"];

  // admin extras 통합 fetch (헬퍼 — /write/[shortcode] admin 분기와 공통)
  const extras = await fetchAdminCardExtras(supabase, card, { isSuperAdmin });

  // 렌더만 앱 셸 래퍼(AdminCardEditView)로 위임 — 운영 EditClient 를 AppShell 안에 임베드.
  //   back="/admin/cards" 뒤로가기는 셸이 담당(기존 BackButton 대체).
  return (
    <AdminCardEditView
      card={card}
      doctors={extras.doctors}
      doctorPickCount={extras.doctorPickCount}
      commentCount={extras.commentCount}
      canChangeAuthor={isSuperAdmin}
      authorOptions={extras.authorOptions}
      // ★ slug 가시성·편집 = active 명함 기준 (ADR 0012). super admin 명함만 표시.
      //   편집은 잠금 전(status=draft)만 — 검수 발송(pending_review)·발행 글은 read-only.
      showSlug={isSuperAdmin}
      slugEditable={isSuperAdmin && card.status === "draft"}
    />
  );
}
