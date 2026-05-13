import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import EditClient from "./EditClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminEditQAPage({ params }: Props) {
  const { id } = await params;
  const numId = Number.parseInt(id, 10);
  if (!Number.isFinite(numId) || numId <= 0) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/admin/qas/${id}/edit`);

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
    .from("qas")
    .select(
      `id, question, answer, meta, keywords, status, type, is_pick,
       doctor_id, video_id, like_count, view_count, created_at,
       external_url, external_title, external_image, external_site_name,
       pubmed_ref, pubmed_refs,
       doctor:doctors(id, slug, name, branch),
       video:videos(youtube_id, youtube_url, topic, upload_date)`,
    )
    .eq("id", numId)
    .maybeSingle();
  if (!qaRaw) notFound();

  // 원장 admin은 본인 doctor 글만 편집 가능 (super admin은 모두)
  if (isDoctorAdmin && !isSuperAdmin) {
    if (qaRaw.doctor_id !== idCtx.activeDoctorId) {
      redirect("/admin/qas?error=본인 글만 편집할 수 있습니다");
    }
  }
  // PostgREST join은 배열로 추론되므로 단일 객체로 normalize
  const qa = {
    ...qaRaw,
    doctor: Array.isArray(qaRaw.doctor) ? qaRaw.doctor[0] ?? null : qaRaw.doctor,
    video: Array.isArray(qaRaw.video) ? qaRaw.video[0] ?? null : qaRaw.video,
  } as Parameters<typeof EditClient>[0]["qa"];

  // 원장 목록 (doctor 변경 가능)
  const { data: doctors } = await supabase
    .from("doctors")
    .select("id, slug, name, branch")
    .order("sort_order", { ascending: true });

  // 같은 doctor의 현재 Pick 개수 (5개 제한 표시)
  let doctorPickCount = 0;
  if (qa.doctor_id) {
    const { count } = await supabase
      .from("qas")
      .select("id", { count: "exact", head: true })
      .eq("doctor_id", qa.doctor_id)
      .eq("is_pick", true);
    doctorPickCount = count ?? 0;
  }

  // (sameVideoQaCount는 카드별 external_* 편집으로 전환 후 불필요 — 제거)

  // 댓글 수 (Phase B comments 테이블 — 없으면 0)
  let commentCount = 0;
  try {
    const { count } = await supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("qa_id", qa.id)
      .eq("status", "visible");
    commentCount = count ?? 0;
  } catch {
    commentCount = 0;
  }

  return (
    <section className="w-full py-6">
      <div className="mb-5 flex items-baseline justify-between pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          Q&A #{qa.id} 편집
        </h1>
        <Link
          href="/admin/qas"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
        >
          ← 목록
        </Link>
      </div>
      <EditClient
        qa={qa}
        doctors={doctors ?? []}
        doctorPickCount={doctorPickCount}
        commentCount={commentCount}
        canChangeAuthor={isSuperAdmin}
      />
    </section>
  );
}
