import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProfileEditClient from "./ProfileEditClient";

export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/profile");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, marketing_email_consent")
    .eq("id", user.id)
    .maybeSingle()
    .returns<{
      role: "admin" | "doctor" | "user";
      display_name: string | null;
      marketing_email_consent: boolean | null;
    }>();

  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");

  // OAuth 가입자 식별 — identities 중 password provider 가 있는지
  const identities = user.identities ?? [];
  const hasPassword = identities.some((i) => i.provider === "email");

  return (
    <section className="w-full py-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-[var(--text)]">내 정보</h1>
        <Link
          href="/me"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
        >
          ← 마이페이지
        </Link>
      </div>

      {/* 기본 정보 (읽기 전용) */}
      <div className="mb-5 space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-soft)] p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">이메일</span>
          <span className="text-[var(--text)]">{user.email ?? "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">역할</span>
          <span className="text-[var(--text)]">
            {profile.role === "doctor"
              ? "원장"
              : profile.role === "admin"
                ? "관리자"
                : "회원"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">로그인 방식</span>
          <span className="text-[var(--text)]">
            {identities
              .map((i) =>
                i.provider === "email"
                  ? "이메일"
                  : i.provider === "google"
                    ? "Google"
                    : i.provider === "kakao"
                      ? "카카오"
                      : i.provider,
              )
              .join(" · ") || "-"}
          </span>
        </div>
      </div>

      <ProfileEditClient
        userId={user.id}
        currentEmail={user.email ?? ""}
        currentDisplayName={profile.display_name ?? ""}
        currentMarketingConsent={!!profile.marketing_email_consent}
        hasPassword={hasPassword}
      />
    </section>
  );
}
