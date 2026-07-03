import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SignupForm from "./SignupForm";
import ReturningUserNotice from "@/components/auth/ReturningUserNotice";
import { ROLES } from "@/lib/identity-shared";
import SignupView from "./SignupView";

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
    if (role === ROLES.ADMIN) redirect("/admin");
    if (role === ROLES.DOCTOR) redirect("/settings");
    redirect(next || "/");
  }

  // OAuth 메타에서 가져온 닉네임 후보
  const meta = user.user_metadata || {};
  // 이메일 가입자는 기본값 비움(2026-07-03 원장 결정) — 닉네임은 공개 표시명이라
  //   이메일 아이디(로컬파트)가 그대로 노출되는 것을 방지, 본인이 직접 작성.
  //   소셜 가입자는 provider 이름 폴백 유지(이름 미제공 provider 만 이메일 폴백).
  //   provider 판별은 두 위치 참조(검수 반영): 표준 OAuth(Google/Kakao)=app_metadata.provider,
  //   Naver 자체 흐름=user_metadata.provider(naver 콜백이 세팅). 둘 다 없으면 email 취급(폴백 생략 안전측).
  const provider =
    (typeof user.app_metadata?.provider === "string" &&
      user.app_metadata.provider) ||
    (typeof meta.provider === "string" && meta.provider) ||
    "email";
  const initialName: string =
    profile?.display_name ||
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.nickname === "string" && meta.nickname) ||
    (provider !== "email" && user.email ? user.email.split("@")[0] : "") ||
    "";

  return (
    <SignupView>
      {/* 작업 B — 중복 가입 재발방지 안내 + 탈출 버튼(상단 눈에 띄게). */}
      <ReturningUserNotice />

      <SignupForm initialDisplayName={initialName} next={next} />
    </SignupView>
  );
}
