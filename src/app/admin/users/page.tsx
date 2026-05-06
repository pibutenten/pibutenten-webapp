import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ROLE_LABELS,
  LEVEL_LABELS,
  LEVEL_COLORS,
  type UserRole,
  type UserLevel,
} from "@/lib/user-grades";

export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  display_name: string | null;
  role: UserRole;
  level: UserLevel;
  activity_score: number;
  bio: string | null;
  created_at: string;
  terms_agreed_at: string | null;
};

type Props = {
  searchParams: Promise<{
    q?: string;
    role?: string;
    level?: string;
  }>;
};

export default async function AdminUsersPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/users");

  const { data: meProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (meProfile?.role !== "admin") {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  const sp = await searchParams;
  const qParam = (sp.q ?? "").trim();
  const roleParam = sp.role ?? "";
  const levelParam = sp.level ?? "";

  // profiles 조회
  let q = supabase
    .from("profiles")
    .select(
      "id, display_name, role, level, activity_score, bio, created_at, terms_agreed_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (roleParam) q = q.eq("role", roleParam);
  if (levelParam) q = q.eq("level", parseInt(levelParam, 10) || 0);
  if (qParam) {
    const escaped = qParam.replace(/[%_]/g, "\\$&");
    q = q.ilike("display_name", `%${escaped}%`);
  }
  const { data: profiles, count: total } = await q.returns<ProfileRow[]>();

  // 각 회원의 작성 글 수 (post type만 + 모든 type 포함 합)
  const userIds = (profiles ?? []).map((p) => p.id);
  const postCountMap = new Map<string, number>();
  if (userIds.length > 0) {
    const { data: counts } = await supabase
      .from("qas")
      .select("author_id", { count: "exact", head: false })
      .in("author_id", userIds);
    if (counts) {
      for (const r of counts) {
        const id = (r as { author_id: string }).author_id;
        postCountMap.set(id, (postCountMap.get(id) ?? 0) + 1);
      }
    }
  }

  return (
    <section className="w-full py-6">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">회원 관리</h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            총 {(total ?? 0).toLocaleString()}명
          </p>
        </div>
      </div>

      {/* 필터 */}
      <form
        method="get"
        action="/admin/users"
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <select
          name="role"
          defaultValue={roleParam}
          className="h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
        >
          <option value="">전체 등급</option>
          <option value="admin">관리자</option>
          <option value="doctor">원장</option>
          <option value="user">일반회원</option>
        </select>
        <select
          name="level"
          defaultValue={levelParam}
          className="h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
        >
          <option value="">전체 활동</option>
          <option value="0">일반</option>
          <option value="1">활동회원</option>
          <option value="2">단골</option>
          <option value="3">VIP</option>
        </select>
        <input
          type="text"
          name="q"
          defaultValue={qParam}
          placeholder="닉네임 검색"
          className="h-9 flex-1 min-w-[140px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
        <button
          type="submit"
          className="h-9 rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-dark)]"
        >
          검색
        </button>
      </form>

      {(!profiles || profiles.length === 0) ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
          회원이 없어요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">닉네임</th>
                <th className="px-3 py-2 text-left font-medium">등급</th>
                <th className="px-3 py-2 text-left font-medium">활동</th>
                <th className="px-3 py-2 text-right font-medium">점수</th>
                <th className="px-3 py-2 text-right font-medium">글수</th>
                <th className="px-3 py-2 text-left font-medium">자기소개</th>
                <th className="px-3 py-2 text-left font-medium">가입일</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const lvlColor = LEVEL_COLORS[p.level] ?? LEVEL_COLORS[0];
                return (
                  <tr
                    key={p.id}
                    className="border-t border-[var(--border)] transition-colors hover:bg-[var(--bg-soft)]"
                  >
                    <td className="px-3 py-2 align-top text-[var(--text)]">
                      <Link
                        href={`/admin/users/${p.id}`}
                        className="font-medium hover:text-[var(--primary)] hover:underline"
                      >
                        {p.display_name ?? "(이름 없음)"}
                      </Link>
                      {!p.terms_agreed_at && (
                        <span className="ml-1 text-[10px] text-amber-700">
                          (온보딩 미완료)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex items-center rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-xs font-medium text-[var(--text)]">
                        {ROLE_LABELS[p.role] ?? p.role}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {p.role === "user" && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: lvlColor.bg, color: lvlColor.fg }}
                        >
                          {LEVEL_LABELS[p.level] ?? "일반"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-right tabular-nums text-[var(--text-secondary)]">
                      {p.activity_score.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 align-top text-right tabular-nums text-[var(--text-secondary)]">
                      {(postCountMap.get(p.id) ?? 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-[var(--text-muted)]">
                      {p.bio
                        ? p.bio.length > 30
                          ? p.bio.slice(0, 30) + "…"
                          : p.bio
                        : "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-[var(--text-muted)]">
                      {p.created_at?.slice(0, 10)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
