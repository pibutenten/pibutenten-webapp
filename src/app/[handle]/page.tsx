import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type CardData } from "@/components/Card";
import ProfileTabs from "@/components/ProfileTabs";
import LogoutButton from "@/components/LogoutButton";
import BackButton from "@/components/BackButton";
import { SITE_URL } from "@/lib/site";
import type { UserRole } from "@/lib/user-grades";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import DoctorDashboardWidget from "@/components/doctor-dashboard/DoctorDashboardWidget";
import { getDoctorDashboardData } from "@/lib/doctor-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Props = {
  params: Promise<{ handle: string }>;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  role: UserRole;
  bio: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
  created_at: string;
  handle: string | null;
  birthdate: string | null;
  gender: "male" | "female" | "other" | null;
  face_shape: string | null;
  skin_type: string | null;
  skin_concerns: string[] | null;
  interested_procedures: string[] | null;
  liked_procedures: string[] | null;
  field_visibility: Record<string, boolean> | null;
  auth_user_id: string | null;
};

/**
 * 회원 프로필 페이지 — 핸들 기반 (v4 spec).
 *
 * URL: /{handle}
 *  - profiles.handle 매칭 → 프로필 뷰
 *  - 매칭 없음 → 404
 *
 * Phase 9: 모든 ID는 profiles에 독립 row로 존재 (auth_user_id로 묶음).
 * 한 사람이 의사·일반 두 모드로 활동하고 싶으면 별개 profile row로 분리.
 *
 * 본인 보기일 때만 [수정], [활동], [설정], [로그아웃] 노출.
 * 외부인 보기는 작성 글·댓글 탭만.
 */
async function fetchProfileByHandle(
  handle: string,
  /**
   * 비로그인(anon) 호출이면 PII 컬럼(birthdate/gender/face_shape/skin_type/
   * skin_concerns/interested_procedures/liked_procedures)을 select 목록에서 제외.
   * 0122 마이그레이션으로 anon 은 위 컬럼에 column-level REVOKE 가 걸려 있어
   * 포함해서 호출하면 permission denied 로 전체 쿼리가 실패함.
   * A1 (2026-05-17).
   */
  viewerIsAnon: boolean = false,
): Promise<{
  profile: ProfileRow;
  /** doctor identity 정보 (doctor_accounts 매핑 있을 때) */
  identity?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    kind: string;
    doctor_id: string | null;
    doctor_slug: string | null;
  };
} | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(handle)) return null;
  const supabase = await createSupabaseServerClient();
  const baseSelect =
    "id, display_name, role, bio, avatar_url, is_public, created_at, handle, field_visibility, auth_user_id";
  const piiSelect =
    ", birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures, liked_procedures";
  const select = viewerIsAnon ? baseSelect : baseSelect + piiSelect;

  const { data } = await supabase
    .from("profiles")
    .select(select)
    .eq("handle", handle)
    .maybeSingle()
    .returns<ProfileRow>();
  if (!data) return null;

  // doctor_accounts 매핑 확인 — doctor 사진·정보 single source
  const { data: da } = await supabase
    .from("doctor_accounts")
    .select("doctor:doctors(id, slug, photo_url)")
    .eq("profile_id", data.id)
    .maybeSingle();
  const doc = (
    Array.isArray(da?.doctor) ? da?.doctor?.[0] : da?.doctor
  ) as { id: string; slug: string; photo_url: string | null } | undefined;
  if (doc) {
    return {
      profile: data,
      identity: {
        id: data.id,
        display_name: data.display_name ?? handle,
        avatar_url: doc.photo_url ?? `/doctors/${doc.slug}.png`,
        bio: data.bio,
        kind: "doctor",
        doctor_id: doc.id,
        doctor_slug: doc.slug,
      },
    };
  }
  return { profile: data };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  // metadata 생성은 PII 불필요 — viewerIsAnon=true 로 안전한 select 사용.
  const result = await fetchProfileByHandle(handle, true);
  if (!result) return { title: "찾을 수 없는 회원" };
  const { profile, identity } = result;
  const name = identity
    ? identity.display_name
    : profile.display_name ?? handle;
  const bio = identity ? identity.bio : profile.bio;
  return {
    // v5.1: handle 노출 X — 닉네임만 (layout template이 "피부텐텐 | …" prefix 자동 추가)
    title: name,
    description: bio ?? `${name}의 피부텐텐 프로필`,
    alternates: { canonical: `${SITE_URL}/${handle}` },
    robots: profile.is_public === false
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

export default async function HandleProfilePage({ params }: Props) {
  const { handle } = await params;

  // v5.1: handle이 의사 slug와 일치하면 → /doctors/{slug}로 308 redirect (canonical 통일)
  // 원장 페이지는 /doctors/{slug}만 — /{slug}로는 진입 X
  const supabase = await createSupabaseServerClient();
  const { data: doctorMatch } = await supabase
    .from("doctors")
    .select("slug")
    .eq("slug", handle)
    .maybeSingle();
  if (doctorMatch) redirect(`/doctors/${handle}`);

  // viewer 먼저 확인 — anon 이면 PII 컬럼 select 제외 (0122 RLS column REVOKE 대응).
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const viewerIsAnon = !viewer;

  const result = await fetchProfileByHandle(handle, viewerIsAnon);
  if (!result) notFound();
  const { profile, identity } = result;
  // Phase 9: 같은 auth_user_id 묶음이면 본인 (다른 ID여도 같은 사람)
  // - 본인 auth user의 메인 profile 접근: profile.id === viewer.id
  // - 본인 묶음 다른 profile 접근(부계정 등): profile.auth_user_id === viewer.id
  const profileAuthUserId = (profile as { auth_user_id?: string | null }).auth_user_id ?? null;
  const isOwner = !!viewer && (
    viewer.id === profile.id || profileAuthUserId === viewer.id
  );

  // 본인일 때 role 조회 — admin이 본인 1차 handle로 접근하면 /admin으로 redirect.
  // 단 묶음의 별개 identity handle(예: 배스킨 jminbae 회원용 profile)로 접근한 경우엔 회원 프로필 그대로 노출.
  // (배정민 케이스: admin인데 배스킨으로 SNS 활동 — 그때는 일반 회원 화면이 맞음)
  let viewerRole: "admin" | "doctor" | "user" | null = null;
  if (isOwner && viewer) {
    const { data: vp } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", viewer.id)
      .maybeSingle();
    viewerRole =
      ((vp?.role as "admin" | "doctor" | "user" | undefined) ?? null) ?? null;
    // identity가 있으면 redirect 안 함 (의사 매핑된 본인 화면)
    if (viewerRole === "admin" && !identity) {
      redirect("/admin");
    }
  }

  // identity가 있으면 identity의 display_name/avatar/bio를 우선 (multi-identity)
  const displayName = identity
    ? identity.display_name
    : profile.display_name ?? handle;
  const avatarUrl = identity ? identity.avatar_url : profile.avatar_url;
  const bio = identity ? identity.bio : profile.bio;

  // 작성 글 — 이 profile.id로 작성된 published 글만, 최근 20개
  const { data: postsData } = await supabase
    .from("cards")
    .select(CARD_LIST_SELECT)
    .eq("author_id", profile.id)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<CardData[]>();

  const posts = postsData ?? [];

  // 댓글 카운트 prefetch (탭 미클릭 시에도 숫자 표시)
  const { count: commentsCount } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("author_id", profile.id)
    .eq("status", "visible");

  // 좋아요/저장 카운트 prefetch — 본인 보기일 때만 (본인만 자기 likes/saves SELECT 가능)
  let likesCount = 0;
  let savesCount = 0;
  if (isOwner) {
    const [likesRes, savesRes] = await Promise.all([
      supabase
        .from("card_likes")
        .select("card_id", { count: "exact", head: true })
        .eq("user_id", profile.id),
      supabase
        .from("card_saves")
        .select("card_id", { count: "exact", head: true })
        .eq("user_id", profile.id),
    ]);
    likesCount = likesRes.count ?? 0;
    savesCount = savesRes.count ?? 0;
  }

  // viewer prefetch — posts에 대한 좋아요/저장
  const viewerStates = await fetchViewerStatesRecord(
    supabase,
    viewer?.id ?? null,
    posts.map((p) => p.id),
  );

  // 2026-05-22: 의사 본인 대시보드 데이터 (외부인에게는 fetch 안 함)
  const isDoctorOwner =
    isOwner && identity?.kind === "doctor" && !!identity?.doctor_id;
  const doctorDashboardData = isDoctorOwner
    ? await getDoctorDashboardData(
        supabase,
        identity?.doctor_id ?? null,
        profile.id,
      )
    : null;

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1">
        <BackButton />
      </div>
      {/* 프로필 헤더 — 사진 가운데, 카드 wrapper 없이 */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="h-[128px] w-[128px] overflow-hidden rounded-full bg-[var(--bg-soft)] sm:h-[144px] sm:w-[144px]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              // doctor 누끼 사진은 상반신 — 작은 원형에서 얼굴이 잘리지 않도록 위쪽으로 정렬
              style={
                identity?.doctor_id
                  ? { objectPosition: "50% 12%" }
                  : undefined
              }
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-5xl text-[var(--text-muted)]">
              👤
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <h1 className="text-xl font-bold text-[var(--text)]">
            {displayName}
          </h1>
        </div>
        <div className="mt-0.5 text-sm text-[var(--text-muted)]">@{handle}</div>
        {bio && (
          <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">
            {bio}
          </p>
        )}
        {isOwner && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
            <Link
              href="/settings/profile"
              className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
            >
              ✏️ 프로필 수정
            </Link>
            {/* admin은 위에서 /admin으로 redirect 되므로 여기 도달 X */}
          </div>
        )}

        {/* 피부 정보는 [피부고민] 탭으로 이동됨 */}
      </div>

      {/* 2026-05-22: 의사 본인 대시보드 — 본인+의사 모드일 때만 (외부인 비노출) */}
      {isDoctorOwner && doctorDashboardData && (
        <div className="mx-auto w-full max-w-[680px] px-4 sm:px-0">
          <DoctorDashboardWidget
            data={doctorDashboardData}
            doctorSlug={identity?.doctor_slug ?? null}
          />
        </div>
      )}

      {/* 탭 — 작성 글 / 피부고민 / 댓글 / 좋아요(owner) / 저장(owner) */}
      <ProfileTabs
        posts={posts}
        postsCount={posts.length}
        commentsCount={commentsCount ?? 0}
        likesCount={likesCount}
        savesCount={savesCount}
        isOwner={isOwner}
        profileId={profile.id}
        skinInfo={
          viewerIsAnon
            ? undefined
            : {
                faceShape: profile.face_shape,
                skinType: profile.skin_type,
                skinConcerns: profile.skin_concerns ?? [],
                interestedProcedures: profile.interested_procedures ?? [],
                likedProcedures: profile.liked_procedures ?? [],
                visibility: (profile.field_visibility ?? {}) as Record<
                  string,
                  boolean
                >,
              }
        }
        viewerStates={viewerStates}
        viewerIsAnon={viewerIsAnon}
      />

      {/* 본인 접속 시 페이지 최하단에 로그아웃 (탈퇴는 /settings/profile에 유지) */}
      {isOwner && (
        <div className="mt-12 flex justify-center border-t border-[var(--border)] pt-6">
          <LogoutButton />
        </div>
      )}
    </section>
  );
}
