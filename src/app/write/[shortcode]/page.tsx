import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import EditClient from "./EditClient";
import BackButton from "@/components/BackButton";
import { bundleProfileFilter } from "@/lib/identity-shared";
import { getDoctorIdForProfile } from "@/lib/doctor-mapping";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ shortcode: string }>;
};

type QaRow = {
  id: number;
  question: string;
  answer: string;
  keywords: string[] | null;
  type: "qa" | "post";
  status: string;
  author_id: string | null;
  doctor_id: string | null;
  shortcode: string | null;
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
    .from("cards")
    .select(
      `id, question, answer, keywords, type, status, author_id, doctor_id, shortcode,
       author:profiles!cards_author_id_profiles_fkey(handle)`,
    )
    .eq("shortcode", shortcode)
    .maybeSingle()
    .returns<QaRow>();
  if (!qa) notFound();

  // Phase 9 묶음 내 모든 profile.id 수집 — author_id가 묶음 안 어떤 profile이든 본인으로 인정.
  // (이전 버그: qa.author_id === user.id 만 비교 → 묶음의 alt profile로 쓴 글은 본인 글 인정 안 됨)
  const { data: myProfiles } = await supabase
    .from("profiles")
    .select("id")
    .or(bundleProfileFilter(user.id));
  const myProfileIds = new Set((myProfiles ?? []).map((p) => p.id as string));

  // 본인 doctor_id (doctor 본인 글 권한 체크용) — lib/doctor-mapping 헬퍼
  let myDoctorId: string | null = null;
  if (profile.role === "doctor") {
    myDoctorId = await getDoctorIdForProfile(supabase, user.id);
  }

  // 권한 체크 — author_id가 묶음 안 어떤 profile이든 isAuthor=true
  const isAdmin = profile.role === "admin";
  const isAuthor = !!qa.author_id && myProfileIds.has(qa.author_id);
  const isDoctorOfQa = !!myDoctorId && qa.doctor_id === myDoctorId;
  const canEdit = isAdmin || isAuthor || isDoctorOfQa;
  if (!canEdit) {
    redirect("/?error=본인 글만 편집할 수 있습니다");
  }

  // returnUrl 계산 — viewer URL (취소·저장 후 돌아갈 곳)
  const a = Array.isArray(qa.author) ? qa.author[0] : qa.author;
  const handle = a?.handle ?? null;
  const returnUrl = handle ? `/${handle}/${shortcode}` : "/";

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1"><BackButton /></div>
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-[var(--text)]">글 수정</h1>
        
      </div>
      <EditClient
        cardId={qa.id}
        type={qa.type}
        initialTitle={qa.question}
        initialBody={qa.answer}
        initialKeywords={qa.keywords ?? []}
        returnUrl={returnUrl}
      />
    </section>
  );
}
