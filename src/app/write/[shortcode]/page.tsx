import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import EditClient from "./EditClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ shortcode: string }>;
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
  shortcode: string | null;
  posted_as: "official" | "personal" | string | null;
  author:
    | { handle: string | null; alt_handle: string | null }
    | { handle: string | null; alt_handle: string | null }[]
    | null;
};

/**
 * 글 수정 페이지 — /write/{shortcode}
 *
 * v5.1 spec: /write 통합. 신규 작성은 /write, 수정은 /write/{shortcode}.
 * 권한 체크는 shortcode 기반으로만 진행 (handle 검증은 보기 라우트에서 처리됨).
 *
 * 권한:
 *   - admin은 모두 수정 가능
 *   - 본인 author이면 수정 가능
 *   - doctor 본인 doctor_id 글이면 수정 가능
 */
export default async function PostEditPage({ params }: Props) {
  const { shortcode } = await params;

  // shortcode 형식 사전 검증 (base58 6~12자)
  if (!/^[1-9A-HJ-NP-Za-km-z]{6,12}$/.test(shortcode)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/write/${shortcode}`);

  // 본인 프로필 + role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");

  // qa 로드 — handle은 viewer URL 만들기 용도로만
  const { data: qa } = await supabase
    .from("qas")
    .select(
      `id, question, answer, keywords, type, status, author_id, doctor_id, shortcode, posted_as,
       author:profiles!qas_author_id_profiles_fkey(handle, alt_handle)`,
    )
    .eq("shortcode", shortcode)
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

  // 권한 체크
  const isAdmin = profile.role === "admin";
  const isAuthor = qa.author_id === user.id;
  const isDoctorOfQa = !!myDoctorId && qa.doctor_id === myDoctorId;
  const canEdit = isAdmin || isAuthor || isDoctorOfQa;
  if (!canEdit) {
    redirect("/?error=본인 글만 편집할 수 있습니다");
  }

  // returnUrl 계산 — viewer URL (취소·저장 후 돌아갈 곳)
  const a = Array.isArray(qa.author) ? qa.author[0] : qa.author;
  const isPersonal = qa.posted_as === "personal";
  const handle = isPersonal
    ? a?.alt_handle ?? a?.handle ?? null
    : a?.handle ?? null;
  const returnUrl = handle ? `/${handle}/${shortcode}` : "/";

  return (
    <section className="w-full py-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-[var(--text)]">글 수정</h1>
        <Link
          href={returnUrl}
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
        returnUrl={returnUrl}
      />
    </section>
  );
}
