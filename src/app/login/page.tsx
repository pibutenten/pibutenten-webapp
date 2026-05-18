import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ next?: string; error?: string; error_id?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    // 이미 로그인 → 역할에 따라 리다이렉트
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    // 모든 role은 / 메인 피드로 (관리/내 글은 헤더 본인 아이콘으로 진입)
    redirect(sp.next || "/");
  }

  return (
    <section className="mx-auto w-full max-w-[400px] py-10">
      <h1 className="mb-6 text-center text-xl font-bold text-[var(--text)]">
        피부텐텐 로그인
      </h1>
      <LoginForm next={sp.next} error={sp.error} errorId={sp.error_id} />
    </section>
  );
}
