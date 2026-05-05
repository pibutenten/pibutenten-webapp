import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DoctorEditClient from "./DoctorEditClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function DoctorEditQAPage({ params }: Props) {
  const { id } = await params;
  const numId = Number.parseInt(id, 10);
  if (!Number.isFinite(numId) || numId <= 0) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/me/qnas/${id}/edit`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");
  if (profile.role !== "doctor" && profile.role !== "admin") {
    redirect("/?error=원장 또는 관리자만 접근 가능합니다");
  }

  // doctor 매핑
  const { data: da } = await supabase
    .from("doctor_accounts")
    .select("doctor_id")
    .eq("profile_id", user.id)
    .maybeSingle()
    .returns<{ doctor_id: string } | null>();
  const myDoctorId = da?.doctor_id ?? null;

  // qa 로드
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

  const qa = {
    ...qaRaw,
    doctor: Array.isArray(qaRaw.doctor) ? qaRaw.doctor[0] ?? null : qaRaw.doctor,
    video: Array.isArray(qaRaw.video) ? qaRaw.video[0] ?? null : qaRaw.video,
  } as Parameters<typeof DoctorEditClient>[0]["qa"];

  // 권한: admin은 모두 가능 / doctor는 본인 doctor의 글만
  const isAdmin = profile.role === "admin";
  if (!isAdmin) {
    if (!myDoctorId || qa.doctor_id !== myDoctorId) {
      redirect("/me/qnas?error=본인 글만 편집할 수 있습니다");
    }
  }

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

  // 같은 video를 공유하는 다른 qa 개수
  let sameVideoQaCount = 0;
  if (qa.video_id) {
    const { count } = await supabase
      .from("qas")
      .select("id", { count: "exact", head: true })
      .eq("video_id", qa.video_id)
      .neq("id", qa.id);
    sameVideoQaCount = count ?? 0;
  }

  // 댓글 수
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
    <section className="mx-auto w-full max-w-[820px] py-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          내 글 #{qa.id} 편집
        </h1>
        <Link
          href="/me/qnas"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
        >
          ← 내 글 목록
        </Link>
      </div>
      <DoctorEditClient
        qa={qa}
        doctorPickCount={doctorPickCount}
        sameVideoQaCount={sameVideoQaCount}
        commentCount={commentCount}
      />
    </section>
  );
}
