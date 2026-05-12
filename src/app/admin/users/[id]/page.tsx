import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ROLE_LABELS,
  LEVEL_LABELS,
  LEVEL_COLORS,
  type UserRole,
  type UserLevel,
} from "@/lib/user-grades";
import RoleChangeForm from "./RoleChangeForm";
import { getQaUrl } from "@/lib/qa-url";

export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  role: UserRole;
  level: UserLevel;
  activity_score: number;
  bio: string | null;
  birth_date: string | null;
  created_at: string;
  terms_agreed_at: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
};

type QaRow = {
  id: number;
  type: "qa" | "post" | "article";
  status: string;
  question: string;
  like_count: number | null;
  view_count: number | null;
  created_at: string;
};

type CommentRow = {
  id: number;
  qa_id: number;
  body: string;
  created_at: string;
  status: string;
  qa: { id: number; question: string } | null;
};

type LikeRow = {
  qa: {
    id: number;
    question: string;
    created_at: string;
    type?: string | null;
    posted_as?: string | null;
    post_year?: number | null;
    post_slug?: string | null;
    shortcode?: string | null;
    doctor?: { slug: string } | { slug: string }[] | null;
    author?:
      | { handle?: string | null; alt_handle?: string | null }
      | { handle?: string | null; alt_handle?: string | null }[]
      | null;
  } | null;
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ identity?: string }>;
};

type IdentityRow = {
  id: string;
  profile_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  kind: string;
  doctor_id: string | null;
  created_at: string;
};

type DoctorRow = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
  photo_url: string | null;
};

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const identityParam = (sp.identity ?? "primary").trim();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: me },
  } = await supabase.auth.getUser();
  if (!me) redirect(`/login?next=/admin/users/${id}`);

  const { data: meProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", me.id)
    .maybeSingle();
  if (meProfile?.role !== "admin") {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, handle, display_name, role, level, activity_score, bio, birth_date, created_at, terms_agreed_at, avatar_url, is_public",
    )
    .eq("id", id)
    .maybeSingle()
    .returns<ProfileRow>();
  if (!profile) notFound();

  // ─── Active identity 결정 (URL ?identity= 기반) ───
  //  'primary' or 미설정 → profile row 자체 (배정민 원장 / 정한미 원장 / 일반회원 자기 자신)
  //  UUID → profile_identities row (개발자 부계정, 배스킨 개인계정 등)
  let activeIdentity:
    | (IdentityRow & { isPrimary: false })
    | null = null;
  if (identityParam !== "primary" && /^[0-9a-f-]{36}$/i.test(identityParam)) {
    const { data: row } = await supabase
      .from("profile_identities")
      .select(
        "id, profile_id, handle, display_name, avatar_url, kind, doctor_id, created_at",
      )
      .eq("id", identityParam)
      .eq("profile_id", id) // 본인 profile의 identity만
      .maybeSingle()
      .returns<IdentityRow>();
    if (row) activeIdentity = { ...row, isPrimary: false };
  }

  // 모든 identity 목록 (탭/링크용)
  const { data: allIdentities } = await supabase
    .from("profile_identities")
    .select("id, handle, display_name, kind, doctor_id")
    .eq("profile_id", id)
    .order("created_at", { ascending: true })
    .returns<IdentityRow[]>();

  // primary identity의 doctor 매핑 (doctor_accounts)
  const { data: primaryMapping } = await supabase
    .from("doctor_accounts")
    .select("doctor_id")
    .eq("profile_id", id)
    .maybeSingle()
    .returns<{ doctor_id: string } | null>();
  const primaryDoctorId = primaryMapping?.doctor_id ?? null;

  // 현재 active identity의 doctor_id 결정
  const activeDoctorId = activeIdentity
    ? activeIdentity.doctor_id
    : primaryDoctorId;

  // active identity가 doctor면 doctors.photo_url 사용
  let activeDoctor: DoctorRow | null = null;
  if (activeDoctorId) {
    const { data: doc } = await supabase
      .from("doctors")
      .select("id, slug, name, branch, photo_url")
      .eq("id", activeDoctorId)
      .maybeSingle()
      .returns<DoctorRow>();
    activeDoctor = doc;
  }

  // 작성 글 — identity별 필터:
  //   doctor identity → qa.doctor_id = 그 doctor (원장 글)
  //   그 외 (personal/admin/primary 비매핑) → doctor_id IS NULL (개인 글)
  let qasQuery = supabase
    .from("qas")
    .select("id, type, status, question, like_count, view_count, created_at")
    .eq("author_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (activeDoctorId) {
    qasQuery = qasQuery.eq("doctor_id", activeDoctorId);
  } else {
    qasQuery = qasQuery.is("doctor_id", null);
  }
  const { data: qas } = await qasQuery.returns<QaRow[]>();

  // 댓글
  const { data: comments } = await supabase
    .from("comments")
    .select("id, qa_id, body, created_at, status, qa:qas(id, question)")
    .eq("author_id", id)
    .order("created_at", { ascending: false })
    .limit(30)
    .returns<CommentRow[]>();

  // 좋아요
  const { data: likes } = await supabase
    .from("qa_likes")
    .select(
      `qa:qas(id, question, created_at, type, posted_as, post_year, post_slug, shortcode,
        doctor:doctors(slug),
        author:profiles!qas_author_id_profiles_fkey(handle, alt_handle))`,
    )
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(30)
    .returns<LikeRow[]>();

  // 현재 매핑된 doctor_id (있으면)
  const { data: myMapping } = await supabase
    .from("doctor_accounts")
    .select("doctor_id")
    .eq("profile_id", id)
    .maybeSingle()
    .returns<{ doctor_id: string } | null>();
  const currentDoctorId = myMapping?.doctor_id ?? null;

  // 매핑용 doctors 목록 (각 doctor의 매핑 상태 포함)
  const { data: allDoctors } = await supabase
    .from("doctors")
    .select("id, slug, name, branch, doctor_accounts(profile_id)")
    .order("name", { ascending: true })
    .returns<
      {
        id: string;
        slug: string;
        name: string;
        branch: string | null;
        doctor_accounts: { profile_id: string }[] | null;
      }[]
    >();
  const doctorsForForm = (allDoctors ?? []).map((d) => {
    // doctor_accounts는 1:1 관계라 Supabase가 객체/배열/null로 반환할 수 있음 — 모두 처리
    const da = d.doctor_accounts;
    let isMapped = false;
    if (Array.isArray(da)) isMapped = da.length > 0;
    else if (da) isMapped = true;
    return {
      id: d.id,
      slug: d.slug,
      name: d.name,
      branch: d.branch,
      is_mapped: isMapped,
    };
  });

  const lvlColor = LEVEL_COLORS[profile.level] ?? LEVEL_COLORS[0];
  const formatDate = (s: string | null) => (s ? s.slice(0, 10) : "—");

  // active identity의 표시 정보 결정
  const showDoctor = !!activeDoctor; // doctor identity면 doctor 정보 우선
  const headerAvatar = showDoctor
    ? activeDoctor!.photo_url
    : activeIdentity?.avatar_url ?? profile.avatar_url;
  const headerName = showDoctor
    ? activeDoctor!.name
    : activeIdentity?.display_name ?? profile.display_name;
  const headerRoleLabel = showDoctor
    ? "원장"
    : activeIdentity
      ? activeIdentity.kind === "admin"
        ? "관리자"
        : activeIdentity.kind === "personal"
          ? "회원"
          : activeIdentity.kind
      : ROLE_LABELS[profile.role] ?? profile.role;

  return (
    <section className="w-full py-6">
      <Link
        href="/admin/users"
        className="mb-3 inline-block text-xs text-[var(--text-muted)] hover:text-[var(--primary)]"
      >
        ← 회원 목록
      </Link>

      {/* Identity 스위처 (한 사람의 여러 ID) */}
      {(allIdentities?.length ?? 0) > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)]">이 회원의 ID:</span>
          <Link
            href={`/admin/users/${id}?identity=primary`}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              activeIdentity === null
                ? "border-[var(--primary)] bg-[var(--primary)]/10 font-semibold text-[var(--primary)]"
                : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--primary)]/50"
            }`}
          >
            {primaryDoctorId ? "원장" : "주 ID"} (@{profile.handle ?? ""})
          </Link>
          {(allIdentities ?? [])
            .filter((it) => it.handle !== profile.handle)
            .map((it) => (
              <Link
                key={it.id}
                href={`/admin/users/${id}?identity=${it.id}`}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  activeIdentity?.id === it.id
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 font-semibold text-[var(--primary)]"
                    : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--primary)]/50"
                }`}
              >
                {it.kind === "admin"
                  ? "관리자"
                  : it.kind === "personal"
                    ? "개인"
                    : it.kind}
                {" "}({it.display_name} @{it.handle})
              </Link>
            ))}
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--bg-soft)]">
            {headerAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headerAvatar}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl text-[var(--text-muted)]">
                👤
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-[var(--text)]">
                {headerName ?? "(이름 없음)"}
              </h1>
              <span className="inline-flex items-center rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-xs font-medium text-[var(--text)]">
                {headerRoleLabel}
              </span>
              {!showDoctor && !activeIdentity && profile.role === "user" && (
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: lvlColor.bg, color: lvlColor.fg }}
                >
                  {LEVEL_LABELS[profile.level] ?? "일반"}
                </span>
              )}
            </div>
            {showDoctor && activeDoctor!.branch && (
              <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
                {activeDoctor!.branch}
              </p>
            )}
            {!showDoctor && profile.bio && (
              <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
                {profile.bio}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
              <span>가입일: {formatDate(profile.created_at)}</span>
              {profile.birth_date && (
                <span>생일: {formatDate(profile.birth_date)}</span>
              )}
              <span>활동점수: {profile.activity_score.toLocaleString()}</span>
              <span>
                상태: {profile.terms_agreed_at ? "정상" : "온보딩 미완료"}
              </span>
              <span>공개: {profile.is_public === false ? "비공개" : "공개"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 통계 */}
      <div className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-3">
        <Stat label="작성 글" value={qas?.length ?? 0} />
        <Stat label="댓글" value={comments?.length ?? 0} />
        <Stat label="좋아요" value={likes?.length ?? 0} />
      </div>

      {/* 역할 변경 폼 */}
      <RoleChangeForm
        userId={profile.id}
        currentRole={profile.role}
        currentDoctorId={currentDoctorId}
        doctors={doctorsForForm}
      />

      {/* 작성 글 */}
      <Section title="📝 작성 글" empty="작성 글 없음">
        {qas && qas.length > 0 && (
          <ul className="divide-y divide-[var(--border)]">
            {qas.map((q) => (
              <li key={q.id} className="py-2">
                <div className="flex items-baseline justify-between gap-2 text-xs text-[var(--text-muted)]">
                  <span className="rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[10px] font-medium">
                    {q.type === "post" ? "포스팅" : "Q&A"}
                  </span>
                  <span>{formatDate(q.created_at)}</span>
                </div>
                <Link
                  href={`/admin/qas/${q.id}/edit`}
                  className="mt-0.5 block text-sm text-[var(--text)] hover:text-[var(--primary)] hover:underline"
                >
                  {q.question?.slice(0, 80) ?? "(제목 없음)"}
                </Link>
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                  ♥ {q.like_count ?? 0} · 조회 {q.view_count ?? 0} · {q.status}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 댓글 */}
      <Section title="💬 댓글" empty="댓글 없음">
        {comments && comments.length > 0 && (
          <ul className="divide-y divide-[var(--border)]">
            {comments.map((c) => (
              <li key={c.id} className="py-2 text-sm">
                <div className="text-xs text-[var(--text-muted)]">
                  → {c.qa?.question?.slice(0, 50) ?? "(원글 없음)"} ·{" "}
                  {formatDate(c.created_at)}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[var(--text)]">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 좋아요 */}
      <Section title="❤️ 좋아요한 글" empty="좋아요 없음">
        {likes && likes.length > 0 && (
          <ul className="divide-y divide-[var(--border)]">
            {likes
              .filter((l) => l.qa)
              .map((l) => (
                <li key={l.qa!.id} className="py-2">
                  <Link
                    href={getQaUrl({
                      id: l.qa!.id,
                      type: l.qa!.type ?? undefined,
                      posted_as: l.qa!.posted_as ?? undefined,
                      post_year: l.qa!.post_year ?? null,
                      post_slug: l.qa!.post_slug ?? null,
                      shortcode: l.qa!.shortcode ?? null,
                      doctor: Array.isArray(l.qa!.doctor)
                        ? l.qa!.doctor[0] ?? null
                        : l.qa!.doctor ?? null,
                      author: Array.isArray(l.qa!.author)
                        ? l.qa!.author[0] ?? null
                        : l.qa!.author ?? null,
                    })}
                    className="block text-sm text-[var(--text)] hover:text-[var(--primary)] hover:underline"
                  >
                    {l.qa!.question?.slice(0, 80)}
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </Section>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-3 text-center">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-[var(--text)]">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = !!children;
  return (
    <div className="mb-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <h2 className="mb-2 text-sm font-bold text-[var(--text)]">{title}</h2>
      {hasChildren ? (
        children
      ) : (
        <p className="py-3 text-center text-xs text-[var(--text-muted)]">
          {empty}
        </p>
      )}
    </div>
  );
}
