import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";
import { SITE_URL } from "@/lib/site";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";
import type { UserRole } from "@/lib/user-grades";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { getDoctorMetaBatch } from "@/lib/doctor-mapping";
import { DEFAULT_VISIBILITY, type FieldVisibility } from "@/lib/profile-options";
import type { CardData } from "@/lib/types/card";
import ProfileView, {
  type ProfileSkinInfo,
  type ProfileSettings,
} from "@/components/skin/u/[handle]/ProfileView";

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

// '프로필·설정' 아코디언 폼(ProfileEditClient)용 — 운영 my/page 의 ProfileRow 와 동일 컬럼.
type SettingsProfileRow = {
  id: string;
  role: "admin" | "doctor" | "user";
  display_name: string | null;
  marketing_email_consent: boolean | null;
  news_email_consent: boolean | null;
  terms_agreed_at: string | null;
  terms_agreed_version: string | null;
  privacy_agreed_at: string | null;
  privacy_agreed_version: string | null;
  handle: string | null;
  birthdate: string | null;
  gender: "male" | "female" | "other" | null;
  face_shape: string | null;
  skin_type: string | null;
  skin_concerns: string[] | null;
  interested_procedures: string[] | null;
  bio: string | null;
  avatar_url: string | null;
  field_visibility: FieldVisibility | null;
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
 * 신규 스킨 승격(2026-06-15): 본문 렌더를 ProfileView 로 교체.
 *   - 데이터 조립(작성글·후기·댓글·좋아요·저장·피부 + isOwner 시 settings 아코디언)은
 *     app skin u/[handle]/page.tsx 패턴을 이식.
 *   - generateMetadata·canonical·robots·404·doctor slug redirect·handle 정규식 가드는 운영 그대로 보존.
 *
 * 본인 보기(isOwner)일 때만 '프로필·설정' 아코디언 + 최하단 로그아웃 노출(ProfileView 내부 처리).
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
  // not-found 케이스 — soft-404 색인 차단 보강(상태코드와 무관하게 크롤러 noindex).
  if (!result)
    return {
      title: "찾을 수 없는 회원",
      robots: { index: false, follow: false },
    };
  const { profile, identity } = result;
  const name = identity
    ? identity.display_name
    : profile.display_name ?? handle;
  const bio = identity ? identity.bio : profile.bio;
  const title = name;
  const description = bio ?? `${name}의 피부텐텐 프로필`;
  const canonical = `${SITE_URL}/${handle}`;
  return {
    // v5.1: handle 노출 X — 닉네임만 (layout template이 "피부텐텐 | …" prefix 자동 추가)
    title,
    description,
    alternates: { canonical },
    // 회원 프로필 — 글이 전부 noindex(doodle/review)라 프로필도 색인 제외(빈 껍데기 색인 방지).
    robots: { index: false, follow: true },
    // noindex 여도 SNS 공유(카톡·트위터 등)는 발생 — OG/Twitter 카드 메타 제공 ([shortcode] 패턴 통일).
    ...buildSocialMeta({
      title,
      description,
      canonical,
      ogImage: buildOgImage(null),
      ogType: "profile",
    }),
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
  const profileAuthUserId =
    (profile as { auth_user_id?: string | null }).auth_user_id ?? null;
  const isOwner =
    !!viewer && (viewer.id === profile.id || profileAuthUserId === viewer.id);

  // 본인일 때 role 조회 — admin이 본인 1차 handle로 접근하면 /admin으로 redirect.
  // 단 묶음의 별개 identity handle(예: 회원용 명함 profile)로 접근한 경우엔 회원 프로필 그대로 노출.
  // (admin이 회원용 명함으로 SNS 활동하는 케이스 — 그때는 일반 회원 화면이 맞음)
  if (isOwner && viewer) {
    const { data: vp } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", viewer.id)
      .maybeSingle();
    const viewerRole =
      (vp?.role as "admin" | "doctor" | "user" | undefined) ?? null;
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

  // 작성 글 / 내 후기 / 받은 시술 / 댓글 카운트 — 모두 profile.id 에만 의존하고 서로 독립적이라
  //  하나의 Promise.all 로 병렬 실행(워터폴 제거). 게이트(notFound)·redirect 이후라 profile.id 확정.
  //  - 작성 글: 일반 글 (category != review/review_summary).
  //  - 내 후기: 개별 시술후기 (category = review). 둘 다 CARD_LIST_SELECT·정렬·limit 재사용.
  //  - 받은 시술: procedure_reviews 의 본인 후기 distinct 시술명(procedure_ko).
  //      RLS(procedure_reviews_read_public + _read_own)가 공개카드 후기 + 본인 후기로 자동 통제.
  //      비로그인(anon)도 SELECT GRANT 있음 — 공개 카드에 연결된 후기만 보임.
  //  - 댓글 카운트: 탭 미클릭 시에도 숫자 표시용 prefetch.
  const [postsRes, reviewsRes, prRowsRes, commentsCountRes] = await Promise.all([
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
    supabase
      .from("procedure_reviews")
      .select("procedure_ko")
      .eq("author_id", profile.id),
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("author_id", profile.id)
      .eq("status", "visible"),
  ]);

  const posts = postsRes.data ?? [];
  const reviews = reviewsRes.data ?? [];

  const prRows = prRowsRes.data;
  const receivedProcedures = Array.from(
    new Set(
      (prRows ?? [])
        .map((r) => (r as { procedure_ko: string | null }).procedure_ko)
        .filter((v): v is string => !!v),
    ),
  );

  const commentsCount = commentsCountRes.count;

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

  const skinInfo: ProfileSkinInfo | undefined = viewerIsAnon
    ? undefined
    : {
        faceShape: profile.face_shape ?? null,
        skinType: profile.skin_type ?? null,
        skinConcerns: profile.skin_concerns ?? [],
        interestedProcedures: profile.interested_procedures ?? [],
        receivedProcedures,
        visibility: (profile.field_visibility ?? {}) as Record<string, boolean>,
      };

  // 본인일 때만 '프로필·설정' 아코디언용 settings props 를 채움(운영 my/page 와 동일 쿼리·매핑).
  //   active 명함 단위(getIdentityContext SSOT) — 위 viewer.id 와 다를 수 있어 별도 결정.
  //   비-owner/anon 이면 null → 폼 미노출.
  //   저장 후 [← 프로필] 은 운영 공개 프로필(/{handle})로(앱 스킨과 달리 운영 경로 유지).
  let settings: ProfileSettings | null = null;
  if (isOwner && viewer) {
    const idCtx = await getIdentityContext(supabase);
    const targetProfileId = idCtx?.active?.profileId ?? viewer.id;
    const { data: sp } = await supabase
      .from("profiles")
      .select(
        "id, role, display_name, marketing_email_consent, news_email_consent, terms_agreed_at, terms_agreed_version, privacy_agreed_at, privacy_agreed_version, handle, birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures, bio, avatar_url, field_visibility",
      )
      .eq("id", targetProfileId)
      .maybeSingle()
      .returns<SettingsProfileRow>();
    if (sp) {
      settings = {
        userId: viewer.id,
        targetProfileId,
        currentEmail: viewer.email ?? "",
        loginProviders: (viewer.identities ?? []).map((i) => i.provider),
        profileHref: sp.handle ? `/${sp.handle}` : "/",
        readOnlyNameAndAvatar: sp.role === ROLES.DOCTOR,
        role: sp.role,
        initial: {
          displayName: sp.display_name ?? "",
          marketingConsent: !!sp.marketing_email_consent,
          newsConsent: !!sp.news_email_consent,
          termsAgreedAt: sp.terms_agreed_at ?? null,
          termsAgreedVersion: sp.terms_agreed_version ?? null,
          privacyAgreedAt: sp.privacy_agreed_at ?? null,
          privacyAgreedVersion: sp.privacy_agreed_version ?? null,
          birthdate: sp.birthdate ?? "",
          gender: sp.gender ?? null,
          faceShape: sp.face_shape ?? null,
          skinType: sp.skin_type ?? null,
          skinConcerns: sp.skin_concerns ?? [],
          interestedProcedures: sp.interested_procedures ?? [],
          bio: sp.bio ?? "",
          avatarUrl: sp.avatar_url ?? null,
          fieldVisibility: sp.field_visibility ?? DEFAULT_VISIBILITY,
        },
      };
    }
  }

  return (
    <ProfileView
      handle={handle}
      displayName={displayName}
      avatarUrl={avatarUrl}
      bio={bio}
      isOwner={isOwner}
      profileId={profile.id}
      posts={posts}
      reviews={reviews}
      postsCount={posts.length}
      reviewsCount={reviews.length}
      commentsCount={commentsCount ?? 0}
      likesCount={likesCount}
      savesCount={savesCount}
      viewerStates={viewerStates}
      viewerIsAnon={viewerIsAnon}
      skinInfo={skinInfo}
      settings={settings}
    />
  );
}
