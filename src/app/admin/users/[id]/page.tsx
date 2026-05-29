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
import { getQaUrl } from "@/lib/card-url";
import { ROLES } from "@/lib/identity-shared";
import { getIdentityContext } from "@/lib/identity";
import BackButton from "@/components/BackButton";
import { formatIsoDate } from "@/lib/format-date";
import { getDoctorIdForProfile, getDoctorMetaBatch } from "@/lib/doctor-mapping";

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
  avatar_url: string | null;
};

type QaRow = {
  id: number;
  type: "qa" | "post";
  status: string;
  title: string;
  like_count: number | null;
  view_count: number | null;
  created_at: string;
};

type CommentRow = {
  id: number;
  card_id: number;
  body: string;
  created_at: string;
  status: string;
  card: { id: number; title: string } | null;
};

type LikeRow = {
  card: {
    id: number;
    title: string;
    created_at: string;
    type?: string | null;
    post_year?: number | null;
    post_slug?: string | null;
    shortcode?: string | null;
    doctor?: { slug: string } | { slug: string }[] | null;
    author?:
      | { handle?: string | null }
      | { handle?: string | null }[]
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
  // Critical-5 (2026-05-27): URL ?identity= 파라미터는 UUID 만 인정. 빈 값/비-UUID/옛 "primary" 는 base profile 로 처리.
  const identityParam = (sp.identity ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: me },
  } = await supabase.auth.getUser();
  if (!me) redirect(`/login?next=/admin/users/${id}`);

  // viewer의 active identity 권한 — admin/doctor 모드만 진입 가능, 역할변경은 admin만
  const viewerCtx = await getIdentityContext(supabase);
  if (!viewerCtx?.active) {
    redirect("/login?error=관리자 권한이 필요합니다");
  }
  if (!viewerCtx.isSuperAdmin && !viewerCtx.isDoctorAdmin) {
    redirect("/login?error=관리자 권한이 필요합니다");
  }
  const viewerIsAdmin = viewerCtx.isSuperAdmin;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, handle, display_name, role, level, activity_score, bio, created_at, terms_agreed_at, avatar_url",
    )
    .eq("id", id)
    .maybeSingle()
    .returns<ProfileRow>();
  if (!profile) notFound();

  // ─── Phase 9: Active identity = 같은 auth_user_id 묶음 안의 다른 profiles row ───
  //  'primary' or 미설정 → profile row 자체
  //  UUID → 묶음 안의 다른 profile (sub-identity)
  //
  //  허위 매핑 방지: 본 profile의 auth_user_id와 같은 묶음 안에만 한정.
  const groupKey = (profile as ProfileRow & { auth_user_id?: string | null })
    .id; // legacy fallback
  const { data: profileExt } = await supabase
    .from("profiles")
    .select("auth_user_id")
    .eq("id", id)
    .maybeSingle();
  const authUserId =
    (profileExt as { auth_user_id?: string | null } | null)?.auth_user_id ??
    null;

  // 묶음 안의 모든 profile (= 사용 가능한 identity 목록)
  const { data: groupRows } = authUserId
    ? await supabase
        .from("profiles")
        .select(
          "id, handle, display_name, avatar_url, role, created_at",
        )
        .or(`id.eq.${id},auth_user_id.eq.${authUserId}`)
        .order("created_at", { ascending: true })
    : { data: null };
  type GroupRow = {
    id: string;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
    created_at: string;
  };
  const allProfilesInGroup = (groupRows ?? []) as GroupRow[];

  // identity ↔ doctor 매핑 (SSOT: profiles.doctor_id)
  const groupProfileIds =
    allProfilesInGroup.length > 0
      ? allProfilesInGroup.map((p) => p.id)
      : [id];
  const groupDoctorMeta = await getDoctorMetaBatch(supabase, groupProfileIds);
  const doctorIdByProfile = new Map<string, string>(
    Array.from(groupDoctorMeta.entries()).map(([pid, m]) => [pid, m.doctorId]),
  );

  // legacy IdentityRow 형태로 매핑 (UI 호환)
  const allIdentities: IdentityRow[] = allProfilesInGroup.map((p) => ({
    id: p.id,
    profile_id: id,
    handle: p.handle ?? "",
    display_name: p.display_name ?? "",
    avatar_url: p.avatar_url,
    kind: p.role,
    doctor_id: doctorIdByProfile.get(p.id) ?? null,
    created_at: p.created_at,
  }));

  let activeIdentity:
    | (IdentityRow & { isPrimary: false })
    | null = null;
  // Critical-5 (2026-05-27): UUID 검증만. 옛 "primary" sentinel 분기 폐기.
  if (identityParam && /^[0-9a-f-]{36}$/i.test(identityParam)) {
    const found = allIdentities.find((r) => r.id === identityParam);
    if (found) activeIdentity = { ...found, isPrimary: false };
  }
  // unused 변수 경고 무시용
  void groupKey;

  // primary identity의 doctor 매핑 (doctor_accounts) — lib/doctor-mapping 헬퍼
  const primaryDoctorId = await getDoctorIdForProfile(supabase, id);

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

  // Phase 9: 작성 글 — author_id (profile.id) 기준.
  //   active identity = 묶음 안의 다른 profile → 그 profile.id로 필터
  //   없으면 본 profile.id + doctor_id NULL (개인 글)
  //   activeDoctorId 있으면 doctor_id로 fallback
  const targetAuthorId = activeIdentity?.id ?? id;

  let authoredCardsQuery = supabase
    .from("cards")
    .select("id, type, status, title, like_count, view_count, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (activeDoctorId) {
    authoredCardsQuery = authoredCardsQuery.eq("doctor_id", activeDoctorId);
  } else {
    authoredCardsQuery = authoredCardsQuery.eq("author_id", targetAuthorId).is("doctor_id", null);
  }
  const { data: authoredCards } = await authoredCardsQuery.returns<QaRow[]>();

  // 댓글
  const { data: comments } = await supabase
    .from("comments")
    .select("id, card_id, body, created_at, status, card:cards(id, title)")
    .eq("author_id", id)
    .order("created_at", { ascending: false })
    .limit(30)
    .returns<CommentRow[]>();

  // 좋아요
  // ADR 0014 Phase 3 (마이그 0187): card_likes.user_id → profile_id.
  const { data: likes } = await supabase
    .from("card_likes")
    .select(
      `card:cards(id, title, created_at, type, post_year, post_slug, shortcode,
        doctor:doctors(slug),
        author:profiles!cards_author_id_profiles_fkey(handle))`,
    )
    .eq("profile_id", id)
    .order("created_at", { ascending: false })
    .limit(30)
    .returns<LikeRow[]>();

  // 현재 매핑된 doctor_id (있으면) — lib/doctor-mapping 헬퍼
  const currentDoctorId = await getDoctorIdForProfile(supabase, id);

  // 매핑용 doctors 목록 — 각 doctor 매핑 상태 + 매핑된 profile 의 handle/display_name 만.
  // SSOT (profiles.doctor_id) 기반 역조회: doctors 목록 + profiles.doctor_id 분리 쿼리 후 메모리 join.
  const { data: allDoctors } = await supabase
    .from("doctors")
    .select("id, slug, name, branch")
    .order("name", { ascending: true })
    .returns<
      {
        id: string;
        slug: string;
        name: string;
        branch: string | null;
      }[]
    >();
  const { data: mappedProfilesData } = await supabase
    .from("profiles")
    .select("id, doctor_id, handle, display_name")
    .not("doctor_id", "is", null)
    .returns<
      {
        id: string;
        doctor_id: string;
        handle: string | null;
        display_name: string | null;
      }[]
    >();
  const mappedProfileByDoctor = new Map<
    string,
    { handle: string | null; display_name: string | null }
  >();
  for (const p of mappedProfilesData ?? []) {
    if (!mappedProfileByDoctor.has(p.doctor_id)) {
      mappedProfileByDoctor.set(p.doctor_id, {
        handle: p.handle,
        display_name: p.display_name,
      });
    }
  }
  const doctorsForForm = (allDoctors ?? []).map((d) => {
    const mappedProfile = mappedProfileByDoctor.get(d.id) ?? null;
    return {
      id: d.id,
      slug: d.slug,
      name: d.name,
      branch: d.branch,
      is_mapped: !!mappedProfile,
      mapped_handle: mappedProfile?.handle ?? null,
      mapped_display_name: mappedProfile?.display_name ?? null,
    };
  });

  // TODO(level/activity_score): 산정 로직 도입 전까지 admin 표시 임시 숨김.
  //   컬럼·SELECT·타입은 유지(향후 활성화 대비). 0179~ 정비와 함께 처리.
  // const lvlColor = LEVEL_COLORS[profile.level] ?? LEVEL_COLORS[0];

  // active identity의 표시 정보 결정
  const showDoctor = !!activeDoctor; // doctor identity면 doctor 정보 우선
  // active identity가 doctor면 doctors.photo_url (admin이 등록한 single source)
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
        : activeIdentity.kind === "user"
          ? "회원"
          : activeIdentity.kind
      : ROLE_LABELS[profile.role] ?? profile.role;

  return (
    <section className="w-full py-6">
      

      <div className="mb-1 -ml-1"><BackButton /></div>
      {/* Identity 스위처 (한 사람의 여러 ID) */}
      {(allIdentities?.length ?? 0) > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)]">이 회원의 ID:</span>
          <Link
            href={`/admin/users/${id}`}
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
                  : it.kind === "user"
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
              {/* TODO(level): 산정 로직 도입 전까지 임시 숨김 */}
              {/* {!showDoctor && !activeIdentity && profile.role === ROLES.USER && (
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: lvlColor.bg, color: lvlColor.fg }}
                >
                  {LEVEL_LABELS[profile.level] ?? "일반"}
                </span>
              )} */}
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
              <span>가입일: {formatIsoDate(profile.created_at)}</span>
              {/* TODO(activity_score): 산정 로직 도입 전까지 임시 숨김 */}
              {/* <span>활동점수: {profile.activity_score.toLocaleString()}</span> */}
              <span>
                상태: {profile.terms_agreed_at ? "정상" : "온보딩 미완료"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 통계 */}
      <div className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-3">
        <Stat label="작성 글" value={authoredCards?.length ?? 0} />
        <Stat label="댓글" value={comments?.length ?? 0} />
        <Stat label="좋아요" value={likes?.length ?? 0} />
      </div>

      {/* 역할 변경 폼 — viewer가 admin identity일 때만 노출 (원장 admin은 X) */}
      {viewerIsAdmin && (
        <RoleChangeForm
          userId={profile.id}
          currentRole={profile.role}
          currentDoctorId={currentDoctorId}
          doctors={doctorsForForm}
        />
      )}

      {/* 작성 글 */}
      <Section title="📝 작성 글" empty="작성 글 없음">
        {authoredCards && authoredCards.length > 0 && (
          <ul className="divide-y divide-[var(--border)]">
            {authoredCards.map((q) => (
              <li key={q.id} className="py-2">
                <div className="flex items-baseline justify-between gap-2 text-xs text-[var(--text-muted)]">
                  <span className="rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[10px] font-medium">
                    {q.type === "post" ? "포스팅" : "Q&A"}
                  </span>
                  <span>{formatIsoDate(q.created_at)}</span>
                </div>
                <Link
                  href={`/admin/cards/${q.id}/edit`}
                  className="mt-0.5 block text-sm text-[var(--text)] hover:text-[var(--primary)] hover:underline"
                >
                  {q.title?.slice(0, 80) ?? "(제목 없음)"}
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
                  → {c.card?.title?.slice(0, 50) ?? "(원글 없음)"} ·{" "}
                  {formatIsoDate(c.created_at)}
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
              .filter((l) => l.card)
              .map((l) => (
                <li key={l.card!.id} className="py-2">
                  <Link
                    href={getQaUrl({
                      id: l.card!.id,
                      type: l.card!.type ?? undefined,
                      post_year: l.card!.post_year ?? null,
                      post_slug: l.card!.post_slug ?? null,
                      shortcode: l.card!.shortcode ?? null,
                      doctor: Array.isArray(l.card!.doctor)
                        ? l.card!.doctor[0] ?? null
                        : l.card!.doctor ?? null,
                      author: Array.isArray(l.card!.author)
                        ? l.card!.author[0] ?? null
                        : l.card!.author ?? null,
                    })}
                    className="block text-sm text-[var(--text)] hover:text-[var(--primary)] hover:underline"
                  >
                    {l.card!.title?.slice(0, 80)}
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
