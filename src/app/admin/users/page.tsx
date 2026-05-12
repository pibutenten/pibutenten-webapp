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
  handle: string | null;
  display_name: string | null;
  role: UserRole;
  level: UserLevel;
  activity_score: number;
  bio: string | null;
  created_at: string;
  terms_agreed_at: string | null;
};

type IdentityRow = {
  id: string;
  profile_id: string;
  handle: string;
  display_name: string;
  kind: string;
  doctor_id: string | null;
  created_at: string;
};

type DoctorRow = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
  sort_order: number;
};

/** 표 한 줄 — primary profile 또는 profile_identities row */
type DisplayRow = {
  key: string;
  profileId: string | null; // 미가입 원장은 null
  doctorId: string | null;
  isPrimary: boolean;
  /** 가입 안 한 원장은 unregistered=true */
  unregistered?: boolean;
  handle: string;
  displayName: string;
  /** "관리자" | "원장" | "회원" */
  roleLabel: string;
  level: UserLevel | null;
  activityScore: number | null;
  postCount: number;
  createdAt: string;
  termsAgreedAt: string | null;
};

/** identity.kind → 등급 라벨 매핑 (admin / doctor / user 3가지) */
function kindToRoleLabel(kind: string): string {
  switch (kind) {
    case "admin":
      return "관리자";
    case "doctor":
      return "원장";
    case "user":
      return "회원";
    default:
      return kind;
  }
}

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
      "id, handle, display_name, role, level, activity_score, bio, created_at, terms_agreed_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (qParam) {
    const escaped = qParam.replace(/[%_]/g, "\\$&");
    q = q.ilike("display_name", `%${escaped}%`);
  }
  const { data: profiles, count: total } = await q.returns<ProfileRow[]>();

  // 각 회원의 작성 글 수
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

  // 모든 profile의 profile_identities (부계정) 조회
  let identitiesByProfile = new Map<string, IdentityRow[]>();
  if (userIds.length > 0) {
    const { data: idents } = await supabase
      .from("profile_identities")
      .select("id, profile_id, handle, display_name, kind, doctor_id, created_at")
      .in("profile_id", userIds)
      .returns<IdentityRow[]>();
    for (const it of idents ?? []) {
      const arr = identitiesByProfile.get(it.profile_id) ?? [];
      arr.push(it);
      identitiesByProfile.set(it.profile_id, arr);
    }
  }

  // doctors 9명 — 회원관리 상단 섹션 (미가입 포함)
  const { data: doctorsAll } = await supabase
    .from("doctors")
    .select("id, slug, name, branch, sort_order")
    .order("sort_order", { ascending: true })
    .returns<DoctorRow[]>();

  // doctor_accounts 매핑 (어느 profile이 어느 doctor의 가입자인지)
  const { data: docAccounts } = await supabase
    .from("doctor_accounts")
    .select("profile_id, doctor_id");
  const profileToDoctor = new Map<string, string>(); // profile_id → doctor_id
  const doctorToProfile = new Map<string, string>(); // doctor_id → profile_id
  for (const da of (docAccounts ?? []) as Array<{ profile_id: string; doctor_id: string }>) {
    profileToDoctor.set(da.profile_id, da.doctor_id);
    doctorToProfile.set(da.doctor_id, da.profile_id);
  }
  const doctorProfileIds = new Set(profileToDoctor.keys());

  // ─── 원장 섹션 row (9명, doctors 기준) ───
  const doctorRows: DisplayRow[] = [];
  for (const doc of doctorsAll ?? []) {
    const profileId = doctorToProfile.get(doc.id) ?? null;
    const profile = profileId
      ? (profiles ?? []).find((p) => p.id === profileId) ?? null
      : null;

    if (profile) {
      // 가입한 원장 — primary row (원장 등급으로 강제)
      doctorRows.push({
        key: `doc-${doc.id}::primary`,
        profileId: profile.id,
        doctorId: doc.id,
        isPrimary: true,
        handle: profile.handle ?? doc.slug,
        displayName: profile.display_name ?? doc.name,
        roleLabel: "원장",
        level: profile.level,
        activityScore: profile.activity_score,
        postCount: postCountMap.get(profile.id) ?? 0,
        createdAt: profile.created_at,
        termsAgreedAt: profile.terms_agreed_at,
      });
      // 부계정 identity row들 (primary handle과 중복 제거)
      const idents = identitiesByProfile.get(profile.id) ?? [];
      for (const it of idents) {
        if (it.handle === profile.handle) continue;
        doctorRows.push({
          key: `doc-${doc.id}::${it.id}`,
          profileId: profile.id,
          doctorId: doc.id,
          isPrimary: false,
          handle: it.handle,
          displayName: it.display_name,
          roleLabel: kindToRoleLabel(it.kind),
          level: null,
          activityScore: null,
          postCount: 0,
          createdAt: it.created_at,
          termsAgreedAt: profile.terms_agreed_at,
        });
      }
    } else {
      // 미가입 원장
      doctorRows.push({
        key: `doc-${doc.id}::unreg`,
        profileId: null,
        doctorId: doc.id,
        isPrimary: true,
        unregistered: true,
        handle: doc.slug,
        displayName: doc.name,
        roleLabel: "원장",
        level: null,
        activityScore: null,
        postCount: 0,
        createdAt: "",
        termsAgreedAt: null,
      });
    }
  }

  // ─── 일반 회원 섹션 row (doctor 매핑 없는 profiles) ───
  const memberRows: DisplayRow[] = [];
  for (const p of profiles ?? []) {
    if (doctorProfileIds.has(p.id)) continue; // 원장 섹션에 이미 표시됨

    // primary row — kind 결정: profile.role='admin'이면 '관리자', 그 외 '회원'
    const primaryRoleLabel =
      p.role === "admin" ? "관리자" : p.role === "doctor" ? "원장" : "회원";
    memberRows.push({
      key: `${p.id}::primary`,
      profileId: p.id,
      doctorId: null,
      isPrimary: true,
      handle: p.handle ?? "",
      displayName: p.display_name ?? "(이름 없음)",
      roleLabel: primaryRoleLabel,
      level: p.level,
      activityScore: p.activity_score,
      postCount: postCountMap.get(p.id) ?? 0,
      createdAt: p.created_at,
      termsAgreedAt: p.terms_agreed_at,
    });
    // 부계정
    const idents = identitiesByProfile.get(p.id) ?? [];
    for (const it of idents) {
      if (it.handle === p.handle) continue;
      memberRows.push({
        key: `${p.id}::${it.id}`,
        profileId: p.id,
        doctorId: null,
        isPrimary: false,
        handle: it.handle,
        displayName: it.display_name,
        roleLabel: kindToRoleLabel(it.kind),
        level: null,
        activityScore: null,
        postCount: 0,
        createdAt: it.created_at,
        termsAgreedAt: p.terms_agreed_at,
      });
    }
  }

  const rows: DisplayRow[] = [...doctorRows, ...memberRows];

  // 등급/활동 필터 (DisplayRow에 적용)
  const filteredRows = rows.filter((r) => {
    if (roleParam) {
      // roleParam: 'admin'|'doctor'|'user' → 매핑
      const want =
        roleParam === "admin"
          ? "관리자"
          : roleParam === "doctor"
            ? "원장"
            : roleParam === "user"
              ? "회원"
              : roleParam;
      if (r.roleLabel !== want) return false;
    }
    if (levelParam !== "") {
      if (!r.isPrimary) return false;
      if (r.level !== (parseInt(levelParam, 10) || 0)) return false;
    }
    return true;
  });

  return (
    <section className="w-full py-6">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">회원 관리</h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            원장 {doctorRows.filter((r) => r.isPrimary).length}명
            (연결 {doctorRows.filter((r) => r.isPrimary && !r.unregistered).length}
            /연결안됨 {doctorRows.filter((r) => r.unregistered).length})
            · 일반 회원 {memberRows.filter((r) => r.isPrimary).length}명
            · 총 {filteredRows.length} ID
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

      {filteredRows.length === 0 ? (
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
                <th className="px-3 py-2 text-left font-medium">활동</th>
                <th className="px-3 py-2 text-right font-medium">점수</th>
                <th className="px-3 py-2 text-right font-medium">글수</th>
                <th className="px-3 py-2 text-left font-medium">가입일</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, idx) => {
                const prev = idx > 0 ? filteredRows[idx - 1] : null;
                const sameProfileAsPrev = prev && prev.profileId === r.profileId;
                const lvl = r.level ?? 0;
                const lvlColor = LEVEL_COLORS[lvl] ?? LEVEL_COLORS[0];
                return (
                  <tr
                    key={r.key}
                    className={`transition-colors hover:bg-[var(--bg-soft)] ${
                      sameProfileAsPrev
                        ? "border-t border-dashed border-[var(--border)]/50"
                        : "border-t border-[var(--border)]"
                    } ${r.unregistered ? "bg-amber-50/30" : ""}`}
                  >
                    <td className="px-3 py-2 align-top text-[var(--text)]">
                      {!r.isPrimary && (
                        <span className="mr-1 text-[var(--text-muted)]">↳</span>
                      )}
                      {r.profileId ? (
                        <Link
                          href={
                            r.isPrimary
                              ? `/admin/users/${r.profileId}?identity=primary`
                              : `/admin/users/${r.profileId}?identity=${r.key.split("::")[1]}`
                          }
                          className="font-medium hover:text-[var(--primary)] hover:underline"
                        >
                          {r.displayName}
                        </Link>
                      ) : r.doctorId ? (
                        // 미가입(연결 안된) 원장 — doctor 관리 페이지로
                        <Link
                          href={`/admin/doctors/${r.handle}`}
                          className="font-medium text-[var(--text-secondary)] hover:text-[var(--primary)] hover:underline"
                        >
                          {r.displayName}
                        </Link>
                      ) : (
                        <span className="font-medium text-[var(--text-secondary)]">
                          {r.displayName}
                        </span>
                      )}
                      {r.unregistered && (
                        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          연결 안됨
                        </span>
                      )}
                      {r.isPrimary && !r.unregistered && !r.termsAgreedAt && (
                        <span className="ml-1 text-[10px] text-amber-700">
                          (온보딩 미완료)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-[var(--text-muted)]">
                      {r.handle ? `@${r.handle}` : "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex items-center rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-xs font-medium text-[var(--text)]">
                        {r.roleLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {r.isPrimary && r.roleLabel === "회원" && r.level !== null && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: lvlColor.bg, color: lvlColor.fg }}
                        >
                          {LEVEL_LABELS[r.level] ?? "일반"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-right tabular-nums text-[var(--text-secondary)]">
                      {r.activityScore !== null
                        ? r.activityScore.toLocaleString()
                        : ""}
                    </td>
                    <td className="px-3 py-2 align-top text-right tabular-nums text-[var(--text-secondary)]">
                      {r.isPrimary ? r.postCount.toLocaleString() : ""}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-[var(--text-muted)]">
                      {r.createdAt?.slice(0, 10)}
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
