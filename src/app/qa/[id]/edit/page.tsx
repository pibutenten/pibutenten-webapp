import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import EditClient from "./EditClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

type QaRow = {
  id: number;
  question: string;
  answer: string;
  keywords: string[] | null;
  type: "qa" | "post" | "article";
  status: string;
  author_id: string | null;
  doctor_id: string | null;
};

export default async function QaEditPage({ params }: Props) {
  const { id } = await params;
  const numId = Number.parseInt(id, 10);
  if (!Number.isFinite(numId) || numId <= 0) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/qa/${id}/edit`);

  // 본인 프로필 + role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");

  // qa 로드
  const { data: qa } = await supabase
    .from("qas")
    .select("id, question, answer, keywords, type, status, author_id, doctor_id")
    .eq("id", numId)
    .maybeSingle()
    .returns<QaRow>();
  if (!qa) notFound();

  // 본인 doctor_id (doctor 본인 글 권한 체크용)
  let myDoctorId: string | null = null;
  if (profile.role === "doctor") {
    const { data: da } = await supabase
      .from("doctor_accounts")
      .select("doctor_id")
      .eq("profile_id", user.id)
      .maybeSingle()
      .returns<{ doctor_id: string } | null>();
    myDoctorId = da?.doctor_id ?? null;
  }

  // 권한:
  //   - admin은 모두
  //   - 본인 author이면 가능
  //   - doctor 본인의 doctor_id 글이면 가능
  const isAdmin = profile.role === "admin";
  const isAuthor = qa.author_id === user.id;
  const isDoctorOfQa = !!myDoctorId && qa.doctor_id === myDoctorId;
  const canEdit = isAdmin || isAuthor || isDoctorOfQa;
  if (!canEdit) {
    redirect("/?error=본인 글만 편집할 수 있습니다");
  }

  return (
    <section className="w-full py-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-[var(--text)]">글 수정</h1>
        <Link
          href={`/qa/${qa.id}`}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
        >
          ← 글로 돌아가기
        </Link>
      </div>
      <EditClient
        qaId={qa.id}
        type={qa.type}
        initialTitle={qa.question}
        initialBody={qa.answer}
        initialKeywords={qa.keywords ?? []}
      />
    </section>
  );
}
