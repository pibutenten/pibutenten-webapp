import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

/**
 * OAuth 콜백 후 신규 가입자 온보딩 페이지.
 *
 *  - 비로그인 → /login
 *  - 이미 온보딩 완료(terms_agreed_at not null) → next 또는 role별 페이지
 */
export default async function SignupPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = sp.next;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, terms_agreed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.terms_agreed_at) {
    // 이미 가입 완료된 사용자
    const role = profile.role ?? "user";
    if (role === "admin") redirect("/admin");
    if (role === "doctor") redirect("/me");
    redirect(next || "/feed");
  }

  // OAuth 메타에서 가져온 닉네임 후보
  const meta = user.user_metadata || {};
  const initialName: string =
    profile?.display_name ||
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.nickname === "string" && meta.nickname) ||
    (user.email ? user.email.split("@")[0] : "") ||
    "";

  return (
    <section className="mx-auto w-full max-w-[440px] py-10">
      <h1 className="mb-2 text-center text-xl font-bold text-[var(--text)]">
        가입 마무리하기
      </h1>
      <p className="mb-6 text-center text-sm text-[var(--text-secondary)]">
        피부텐텐에 오신 걸 환영해요. 잠깐만 확인해 주세요.
      </p>
      <SignupForm initialDisplayName={initialName} next={next} />
    </section>
  );
}
