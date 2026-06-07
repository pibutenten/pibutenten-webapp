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
import { getDoctorMetaBatch } from "@/lib/doctor-mapping";

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
  created_at: string;
  handle: string | null;
  birthdate: string | null;
  gender: "male" | "female" | "other" | null;
  face_shape: string | null;
  skin_type: string | null;
  skin_concerns: string[] | null;
  interested_procedures: string[] | null;
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
   * skin_concerns/interested_procedures)을 select 목록에서 제외.
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
    "id, display_name, role, bio, avatar_url, created_at, handle, field_visibility, auth_user_id";
  const piiSelect =
    ", birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures";
  const select = viewerIsAnon ? baseSelect : baseSelect + piiSelect;

  const { data } = await supabase
    .from("profiles")
    .select(select)
    .eq("handle", handle)
    .maybeSingle()
    .returns<ProfileRow>();
  if (!data) return null;

  // 의사 매핑 확인 — doctor 사진·정보 single source (SSOT: profiles.doctor_id)
  const metaMap = await getDoctorMetaBatch(supabase, [data.id]);
  const docMeta = metaMap.get(data.id);
  if (docMeta && docMeta.slug) {
    return {
      profile: data,
      identity: {
        id: data.id,
        display_name: data.display_name ?? handle,
        avatar_url: docMeta.photoUrl ?? `/doctors/${docMeta.slug}.png`,
        bio: data.bio,
        kind: "doctor",
        doctor_id: docMeta.doctorId,
        doctor_slug: docMeta.slug,
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
    robots: { index: true, follow: true },
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
  // 단 묶음의 별개 identity handle(예: 회원용 명함 profile)로 접근한 경우엔 회원 프로필 그대로 노출.
  // (admin이 회원용 명함으로 SNS 활동하는 케이스 — 그때는 일반 회원 화면이 맞음)
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

  // 작성 글 / 내 후기 분리 — 이 profile.id로 작성된 published 글, 최근 20개씩.
  //  - 작성 글: 일반 글 (category != review/review_summary). 기존 "작성 글" 탭과 동일 의미.
  //  - 내 후기: 개별 시술후기 (category = review). 둘 다 CARD_LIST_SELECT·정렬·limit 재사용.
  const [postsRes, reviewsRes] = await Promise.all([
    supabase
      .from("cards")
      .select(CARD_LIST_SELECT)
      .eq("author_id", profile.id)
      .eq("status", "published")
      .not("category", "in", "(review,review_summary)")
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<CardData[]>(),
    supabase
      .from("cards")
      .select(CARD_LIST_SELECT)
      .eq("author_id", profile.id)
      .eq("status", "published")
      .eq("category", "review")
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<CardData[]>(),
  ]);

  const posts = postsRes.data ?? [];
  const reviews = reviewsRes.data ?? [];

  // 받은 시술 — procedure_reviews 에서 본인 후기의 distinct 시술명(procedure_ko) 배열.
  //  RLS(procedure_reviews_read_public + _read_own)가 공개카드 후기 + 본인 후기로 자동 통제.
  //  비로그인(anon)도 SELECT GRANT 있음 — 공개 카드에 연결된 후기만 보임.
  const { data: prRows } = await supabase
    .from("procedure_reviews")
    .select("procedure_ko")
    .eq("author_id", profile.id);
  const receivedProcedures = Array.from(
    new Set(
      (prRows ?? [])
        .map((r) => (r as { procedure_ko: string | null }).procedure_ko)
        .filter((v): v is string => !!v),
    ),
  );

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
    // ADR 0014 Phase 3 (마이그 0187): card_likes/saves.user_id → profile_id.
    const [likesRes, savesRes] = await Promise.all([
      supabase
        .from("card_likes")
        .select("card_id", { count: "exact", head: true })
        .eq("profile_id", profile.id),
      supabase
        .from("card_saves")
        .select("card_id", { count: "exact", head: true })
        .eq("profile_id", profile.id),
    ]);
    likesCount = likesRes.count ?? 0;
    savesCount = savesRes.count ?? 0;
  }

  // viewer prefetch — posts + reviews 카드에 대한 좋아요/저장
  const viewerStates = await fetchViewerStatesRecord(
    supabase,
    viewer?.id ?? null,
    [...posts, ...reviews].map((p) => p.id),
  );

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
              ✏️ 프로필·설정
            </Link>
            {/* admin은 위에서 /admin으로 redirect 되므로 여기 도달 X */}
          </div>
        )}

        {/* 피부 정보는 [피부고민] 탭으로 이동됨.
            의사 본인 대시보드는 별도 /doctor 라우트로 분리 (2026-05-22). */}
      </div>

      {/* 탭 — 작성 글 / 내 후기 / 댓글 / 좋아요(owner) / 저장(owner) / 피부고민 */}
      <ProfileTabs
        posts={posts}
        postsCount={posts.length}
        reviews={reviews}
        reviewsCount={reviews.length}
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
                receivedProcedures,
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
