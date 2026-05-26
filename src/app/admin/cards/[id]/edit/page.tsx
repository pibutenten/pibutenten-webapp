import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { fetchAdminCardExtras } from "@/lib/admin-card-extras";
import EditClient from "./EditClient";
import BackButton from "@/components/BackButton";

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
      `id, question, answer, meta, keywords, status, type, category, is_pick,
       doctor_id, author_id, video_id, like_count, view_count, created_at,
       external_url, external_title, external_image, external_site_name,
       pubmed_refs,
       author:profiles!cards_author_id_profiles_fkey(id, display_name, handle, role),
       doctor:doctors(id, slug, name, branch),
       video:videos(youtube_id, youtube_url, topic, upload_date)`,
    )
    .eq("id", numId)
    .maybeSingle();
  if (!qaRaw) notFound();

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

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1"><BackButton /></div>
      <EditClient
        card={card}
        doctors={extras.doctors}
        doctorPickCount={extras.doctorPickCount}
        commentCount={extras.commentCount}
        canChangeAuthor={isSuperAdmin}
        authorOptions={extras.authorOptions}
      />
    </section>
  );
}
