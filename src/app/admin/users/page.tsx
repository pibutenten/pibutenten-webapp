import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { ROLES } from "@/lib/identity-shared";
import type { UserRole } from "@/lib/user-grades";
import BackButton from "@/components/BackButton";
import { getDoctorMetaBatch } from "@/lib/doctor-mapping";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "회원 관리",
  robots: { index: false, follow: false },
};

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
    days?: string;
  }>;
};

// 기간 토글 6종 — 사이트 전체 통일
const PERIOD_OPTIONS: Array<{ label: string; days: number }> = [
  { label: "24시간", days: 1 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
  { label: "90일", days: 90 },
  { label: "1년", days: 365 },
  { label: "전체", days: 0 },
];

type UserKpi = {
  profile_id: string;
  /** 0118 (2026-05-17): 세션 단위 방문 수 (card_impressions DISTINCT session_id).
   *  0117 의 /admin/stats/visitors 정책과 통일 — 같은 세션의 여러 impression = 1 방문. */
  visit_sessions: number;
  views_received: number;
  comments_written: number;
  likes_received: number;
  shares_received: number;
};

export default async function AdminUsersPage({ searchParams }: Props) {
  // PRD §C — 묶음 OR 가드. 회원관리는 super admin 전용 (doctor 차단).
  await requireAdminPage("/admin/users", { superAdminOnly: true });
  const supabase = await createSupabaseServerClient();

  const sp = await searchParams;
  const qParam = (sp.q ?? "").trim();
  const roleParam = sp.role ?? "";
  const daysRaw = parseInt(sp.days ?? "0", 10);
  const daysParam = PERIOD_OPTIONS.some((p) => p.days === daysRaw) ? daysRaw : 7;

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
  // 매핑된 의사 — profile_id → doctor {slug, name} (SSOT: profiles.doctor_id)
  const doctorByProfile = new Map<string, { slug: string; name: string }>();
  if (allIds.length > 0) {
    const metaMap = await getDoctorMetaBatch(supabase, allIds);
    for (const [pid, meta] of metaMap) {
      if (meta.slug && meta.name) {
        doctorByProfile.set(pid, { slug: meta.slug, name: meta.name });
      }
    }
  }
  if (allIds.length > 0) {
    const { data: counts } = await supabase
      .from("cards")
      .select("author_id")
      .in("author_id", allIds);
    for (const r of counts ?? []) {
      const id = (r as { author_id: string }).author_id;
      postCountMap.set(id, (postCountMap.get(id) ?? 0) + 1);
    }
  }

  // 회원별 KPI (방문 일수/받은 조회/작성 댓글/받은 좋아요/받은 공유) — 기간 RPC
  const kpiMap = new Map<string, UserKpi>();
  const kpiResult = await supabase.rpc("get_users_kpi", { p_days: daysParam });
  const kpiRows = (kpiResult.data ?? []) as UserKpi[];
  for (const r of kpiRows) kpiMap.set(r.profile_id, r);

  // 기간 필터 — 가입일(created_at) 기준. days=0 (전체) 면 필터 X.
  // 사용자 요청 (2026-05-15): 기간 토글 = 가입 기간 필터.
  //   24시간 → 최근 24시간 내 가입한 사람만, 전체 → 전체 회원.
  const sinceTs =
    daysParam > 0
      ? Date.now() - daysParam * 24 * 60 * 60 * 1000
      : null;

  // 등급 + 가입기간 필터 적용
  const filtered = (profiles ?? []).filter((p) => {
    if (roleParam && p.role !== roleParam) return false;
    if (sinceTs !== null) {
      const created = p.created_at ? new Date(p.created_at).getTime() : 0;
      if (created < sinceTs) return false;
    }
    return true;
  });

  // auth_user_id 기준 그룹핑 — 같은 묶음끼리 시각적으로 인접.
  // 키 산정 규칙:
  //   - auth_user_id NOT NULL → 그 값을 키로 (sub, 또는 자기 자신 가리키는 primary).
  //   - auth_user_id NULL     → 자기 id 를 키로. id 자체가 auth.users.id 이면
  //     같은 묶음의 sub(auth_user_id = 이 id)와 동일 키로 정확히 합쳐짐.
  //
  // 이전 버그(`__null__:${id}` 접두사 사용)는 auth_user_id NULL 인 primary 와
  // 그 id 를 가리키는 sub 의 키를 서로 다르게 만들어 화면에서 분리 표시되었음.
  // 0127 묶음 작업 후 발견 (260518 fix).
  const groups = new Map<string, ProfileRow[]>();
  for (const p of filtered) {
    const key = p.auth_user_id ?? p.id;
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
    const aHasDoc = a.some((r) => r.role === ROLES.DOCTOR);
    const bHasDoc = b.some((r) => r.role === ROLES.DOCTOR);
    if (aHasDoc !== bHasDoc) return aHasDoc ? -1 : 1;
    return (a[0].created_at ?? "").localeCompare(b[0].created_at ?? "");
  });

  // 미가입 원장 카운트 (auth_user_id IS NULL)
  const unregisteredDoctorCount = (profiles ?? []).filter(
    (p) => p.role === ROLES.DOCTOR && p.auth_user_id == null,
  ).length;

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1"><BackButton /></div>
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
        {/* 현재 days 값을 폼에 보존 (검색 시 함께 전송) */}
        <input type="hidden" name="days" value={String(daysParam)} />
      </form>

      {/* 기간 토글 — 회원별 KPI 5개에 적용 */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[var(--text-muted)]">기간</span>
        <div className="flex flex-wrap gap-1">
          {PERIOD_OPTIONS.map((opt) => {
            const active = opt.days === daysParam;
            const params = new URLSearchParams();
            if (qParam) params.set("q", qParam);
            if (roleParam) params.set("role", roleParam);
            params.set("days", String(opt.days));
            return (
              <Link
                key={opt.days}
                href={`/admin/users?${params.toString()}`}
                className={
                  "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors " +
                  (active
                    ? "bg-[var(--primary-active)] font-semibold text-white"
                    : "border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]")
                }
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
      </div>

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
                <th className="px-3 py-2 whitespace-nowrap text-right font-medium">글수</th>
                <th
                  className="px-2 py-2 whitespace-nowrap text-right font-medium"
                  title="세션 단위 방문 수 (같은 세션 안 여러 임프레션 = 1방문, 기간 내 / 0117·0118 정책)"
                >
                  방문
                </th>
                <th className="px-2 py-2 whitespace-nowrap text-right font-medium" title="받은 조회수">
                  조회
                </th>
                <th
                  className="px-2 py-2 whitespace-nowrap text-right font-medium"
                  title="작성한 댓글 수"
                >
                  댓글
                </th>
                <th className="px-2 py-2 whitespace-nowrap text-right font-medium" title="받은 좋아요">
                  좋아요
                </th>
                <th className="px-2 py-2 whitespace-nowrap text-right font-medium" title="받은 공유">
                  공유
                </th>
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
                    p.role === ROLES.DOCTOR && p.auth_user_id == null;
                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors hover:bg-[var(--bg-soft)] ${
                        idx === 0
                          ? "border-t-2 border-[var(--border)]"
                          : "border-t border-dashed border-[var(--border)]/50"
                      } ${isUnregistered ? "bg-amber-50/30" : ""}`}
                    >
                      <td className="px-3 py-2 align-middle text-[var(--text)]">
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
                      <td className="px-3 py-2 align-middle text-xs text-[var(--text-muted)]">
                        {p.handle ? `@${p.handle}` : "—"}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <span className="inline-flex items-center rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-xs font-medium text-[var(--text)]">
                          {p.role}
                        </span>
                        {/* doctor_accounts 매핑 표시 — 매핑된 doctor name */}
                        {doctorByProfile.has(p.id) && (
                          <span
                            className="ml-1 inline-flex items-center rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--primary)]"
                            title="매핑된 원장님"
                          >
                            🩺 {doctorByProfile.get(p.id)!.name}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle text-right tabular-nums text-[var(--text-secondary)]">
                        {(postCountMap.get(p.id) ?? 0).toLocaleString()}
                      </td>
                      {/* 5개 KPI — 기간 토글 적용 (default 7일) */}
                      <td className="px-2 py-2 align-middle text-right tabular-nums text-xs text-[var(--text-secondary)]">
                        {(kpiMap.get(p.id)?.visit_sessions ?? 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 align-middle text-right tabular-nums text-xs text-[var(--text-secondary)]">
                        {(kpiMap.get(p.id)?.views_received ?? 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 align-middle text-right tabular-nums text-xs text-[var(--text-secondary)]">
                        {(kpiMap.get(p.id)?.comments_written ?? 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 align-middle text-right tabular-nums text-xs text-[var(--text-secondary)]">
                        {(kpiMap.get(p.id)?.likes_received ?? 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 align-middle text-right tabular-nums text-xs text-[var(--text-secondary)]">
                        {(kpiMap.get(p.id)?.shares_received ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-middle text-xs text-[var(--text-muted)]">
                        {p.created_at?.slice(0, 10) ?? "—"}
                      </td>
                      <td className="px-3 py-2 align-middle text-xs text-[var(--text-muted)]">
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
