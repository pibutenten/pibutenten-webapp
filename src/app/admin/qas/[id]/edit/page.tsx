import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  const { data: qaRaw } = await supabase
    .from("qas")
    .select(
      `id, question, answer, meta, keywords, status, type, is_pick,
       doctor_id, video_id, like_count, view_count, created_at,
       doctor:doctors(id, slug, name, branch),
       video:videos(youtube_id, youtube_url, topic, upload_date)`,
    )
    .eq("id", numId)
    .maybeSingle();
  if (!qaRaw) notFound();
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

  // 같은 video를 공유하는 다른 qa 개수 (영상 정보 변경 시 영향받는 글)
  let sameVideoQaCount = 0;
  if (qa.video_id) {
    const { count } = await supabase
      .from("qas")
      .select("id", { count: "exact", head: true })
      .eq("video_id", qa.video_id)
      .neq("id", qa.id);
    sameVideoQaCount = count ?? 0;
  }

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
      <div className="mb-5 flex items-baseline justify-between">
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
        sameVideoQaCount={sameVideoQaCount}
        commentCount={commentCount}
      />
    </section>
  );
}
