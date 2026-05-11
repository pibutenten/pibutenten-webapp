import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PersonaSetupClient from "./PersonaSetupClient";

export const dynamic = "force-dynamic";

/**
 * OAuth(구글/카카오/네이버) 가입 시 가져온 프로필 이미지 추출 — 페르소나 디폴트 fallback.
 * Supabase Auth user_metadata에 provider별로 키가 다양하게 들어와서 둘 다 본다.
 */
function pickOauthAvatar(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const candidates = [m.avatar_url, m.picture];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

export default async function PersonaSetupPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/profile/persona");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "role, display_name, alt_display_name, alt_avatar_url, alt_bio",
    )
    .eq("id", user.id)
    .maybeSingle()
    .returns<{
      role: "admin" | "doctor" | "user";
      display_name: string | null;
      alt_display_name: string | null;
      alt_avatar_url: string | null;
      alt_bio: string | null;
    }>();
  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");

  if (profile.role !== "doctor" && profile.role !== "admin") {
    return (
      <section className="w-full py-10 text-center">
        <div className="mx-auto max-w-[420px] rounded-[var(--radius)] bg-white p-8">
          <p className="text-sm text-[var(--text-secondary)]">
            개인 페르소나 기능은 원장님·관리자에게만 제공됩니다.
          </p>
          <Link
            href="/settings"
            className="mt-3 inline-block text-sm text-[var(--primary)] hover:underline"
          >
            마이페이지로 →
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full py-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          개인 페르소나
        </h1>
        <Link
          href="/settings/profile"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
        >
          ← 내 정보
        </Link>
      </div>

      <p className="mb-5 text-sm text-[var(--text-secondary)]">
        공식 활동(<strong>{profile.display_name ?? "원장님"}</strong>)과 별개로 개인 모드로 활동할 수 있어요.
        <br />
        개인 모드에서는 본명·verified 노출 없이 일반 회원처럼 글을 남길 수 있습니다.
      </p>

      <PersonaSetupClient
        userId={user.id}
        initialName={profile.alt_display_name ?? ""}
        initialAvatar={profile.alt_avatar_url ?? null}
        oauthAvatar={pickOauthAvatar(user.user_metadata)}
        initialBio={profile.alt_bio ?? ""}
      />
    </section>
  );
}
