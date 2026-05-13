import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/user-grades";

export const dynamic = "force-dynamic";

/**
 * Phase 9: 회원관리 페이지 단순화.
 *
 * - 모든 ID = 1 `profiles` row (메인/부계정 구분 없음, 모두 동등)
 * - 묶음: 같은 `auth_user_id` 값을 가진 row끼리 한 사람
 * - 미가입 원장: `auth_user_id = NULL`
 * - `profile_identities` 의존 제거됨
 */
type ProfileRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  role: UserRole;
  bio: string | null;
  created_at: string;
  terms_agreed_at: string | null;
  auth_user_id: string | null;
};

type Props = {
  searchParams: Promise<{
    q?: string;
    role?: string;
  }>;
};

export default async function AdminUsersPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/users");

  // Phase 9: 권한 검사를 묶음(auth_user_id) 기준으로.
  // 같은 사람의 profiles 중 admin role이 하나라도 있으면 admin 권한 인정.
  // (예: 배정민의 메인은 doctor, developer identity가 admin → 묶음에 admin 존재)
  const { data: myProfiles } = await supabase
    .from("profiles")
    .select("role")
    .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`);
  const hasAdmin = (myProfiles ?? []).some(
    (p) => (p as { role: string }).role === "admin",
  );
  if (!hasAdmin) {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  const sp = await searchParams;
  const qParam = (sp.q ?? "").trim();
  const roleParam = sp.role ?? "";

  // profiles 전체 조회 (auth_user_id 포함)
  let q = supabase
    .from("profiles")
    .select(
      "id, handle, display_name, role, bio, created_at, terms_agreed_at, auth_user_id",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (qParam) {
    const escaped = qParam.replace(/[%_]/g, "\\$&");
    q = q.or(`display_name.ilike.%${escaped}%,handle.ilike.%${escaped}%`);
  }
  const { data: profiles } = await q.returns<ProfileRow[]>();

  // 카드 작성 수 집계 (author_id = profiles.id 기준)
  const allIds = (profiles ?? []).map((p) => p.id);
  const postCountMap = new Map<string, number>();
  if (allIds.length > 0) {
    const { data: counts } = await supabase
      .from("qas")
      .select("author_id")
      .in("author_id", allIds);
    for (const r of counts ?? []) {
      const id = (r as { author_id: string }).author_id;
      postCountMap.set(id, (postCountMap.get(id) ?? 0) + 1);
    }
  }

  // 등급 필터 적용
  const filtered = (profiles ?? []).filter((p) => {
    if (roleParam && p.role !== roleParam) return false;
    return true;
  });

  // auth_user_id 기준 그룹핑 — 같은 묶음끼리 시각적으로 인접
  // (auth_user_id가 NULL인 row는 각자 별도 묶음으로 취급)
  const groups = new Map<string, ProfileRow[]>();
  for (const p of filtered) {
    const key = p.auth_user_id ?? `__null__:${p.id}`;
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }
  // 묶음 내 정렬: doctor → admin → user 순서, 그 안에선 handle 순
  const ROLE_ORDER: Record<string, number> = { doctor: 0, admin: 1, user: 2 };
  for (const arr of groups.values()) {
    arr.sort((a, b) => {
      const ra = ROLE_ORDER[a.role] ?? 9;
      const rb = ROLE_ORDER[b.role] ?? 9;
      if (ra !== rb) return ra - rb;
      return (a.handle ?? "").localeCompare(b.handle ?? "");
    });
  }
  // 묶음 순서: 묶음 크기 큰 것부터, 그 다음 doctor 묶음, 마지막 단독
  const groupArr = Array.from(groups.values()).sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    const aHasDoc = a.some((r) => r.role === "doctor");
    const bHasDoc = b.some((r) => r.role === "doctor");
    if (aHasDoc !== bHasDoc) return aHasDoc ? -1 : 1;
    return (a[0].created_at ?? "").localeCompare(b[0].created_at ?? "");
  });

  // 미가입 원장 카운트 (auth_user_id IS NULL)
  const unregisteredDoctorCount = (profiles ?? []).filter(
    (p) => p.role === "doctor" && p.auth_user_id == null,
  ).length;

  return (
    <section className="w-full py-6">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">회원 관리</h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            총 {filtered.length} ID · {groupArr.length} 묶음
            {unregisteredDoctorCount > 0 && (
              <span> · 미가입 원장 {unregisteredDoctorCount}명</span>
            )}
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
          <option value="admin">admin</option>
          <option value="doctor">doctor</option>
          <option value="user">user</option>
        </select>
        <input
          type="text"
          name="q"
          defaultValue={qParam}
          placeholder="닉네임/핸들 검색"
          className="h-9 flex-1 min-w-[140px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
        <button
          type="submit"
          className="h-9 rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-dark)]"
        >
          검색
        </button>
      </form>

      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
          조건에 맞는 ID가 없어요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">닉네임</th>
                <th className="px-3 py-2 text-left font-medium">핸들</th>
                <th className="px-3 py-2 text-left font-medium">등급</th>
                <th className="px-3 py-2 text-right font-medium">글수</th>
                <th className="px-3 py-2 text-left font-medium">가입일</th>
                <th className="px-3 py-2 text-left font-medium">묶음</th>
              </tr>
            </thead>
            <tbody>
              {groupArr.map((grp, gi) => {
                const groupKey = grp[0].auth_user_id ?? grp[0].id;
                const groupLabel = grp.length > 1 ? `${grp.length}명` : "—";
                return grp.map((p, idx) => {
                  const isUnregistered =
                    p.role === "doctor" && p.auth_user_id == null;
                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors hover:bg-[var(--bg-soft)] ${
                        idx === 0
                          ? "border-t-2 border-[var(--border)]"
                          : "border-t border-dashed border-[var(--border)]/50"
                      } ${isUnregistered ? "bg-amber-50/30" : ""}`}
                    >
                      <td className="px-3 py-2 align-top text-[var(--text)]">
                        <Link
                          href={`/admin/users/${p.id}`}
                          className="font-medium hover:text-[var(--primary)] hover:underline"
                        >
                          {p.display_name ?? "(이름 없음)"}
                        </Link>
                        {isUnregistered && (
                          <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            미가입
                          </span>
                        )}
                        {!isUnregistered && !p.terms_agreed_at && (
                          <span className="ml-1 text-[10px] text-amber-700">
                            (온보딩 미완료)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-[var(--text-muted)]">
                        {p.handle ? `@${p.handle}` : "—"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className="inline-flex items-center rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-xs font-medium text-[var(--text)]">
                          {p.role}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-right tabular-nums text-[var(--text-secondary)]">
                        {(postCountMap.get(p.id) ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-[var(--text-muted)]">
                        {p.created_at?.slice(0, 10) ?? "—"}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-[var(--text-muted)]">
                        {idx === 0 ? (
                          <span title={`auth_user_id: ${groupKey}`}>
                            {groupLabel}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]/60">↳</span>
                        )}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
