import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HANDLE_RE } from "@/lib/identity-shared";
import { SITE_URL } from "@/lib/site";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";
import type { UserRole } from "@/lib/user-grades";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { getDoctorMetaBatch } from "@/lib/doctor-mapping";
import {
  FACE_LABEL,
  SKIN_LABEL,
  ageGroupFromBirthdate,
} from "@/lib/profile-options";
import type { CardData } from "@/lib/types/card";
import ProfileView from "@/components/skin/u/[handle]/ProfileView";

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
 * UI 개편 Phase 4 (2026-07-08): 프로필 2뎁스 신디자인.
 *   - 6탭 → 필터 칩(본인 5·타인 3) + 프로필 카드(태그 3종=연령대·얼굴형·피부타입).
 *   - skin 탭 제거(D7) — 받은 시술(procedure_reviews distinct) 등 skin 전용 prefetch 삭제.
 *     피부정보 상세는 /my "내 피부 정보"가 담당.
 *   - '프로필·설정' 아코디언 제거(D9) — 설정 데이터 조립은 공용 함수
 *     (src/lib/profile-settings-data.ts::buildProfileSettingsProps)로 추출되어
 *     /my/settings 전용 화면이 소비. 이 페이지는 설정을 더 이상 조립하지 않는다.
 *   - isOwner 판정·의사 slug redirect·admin redirect·타 탭 prefetch 는 불변.
 *
 * generateMetadata·canonical·robots·404·doctor slug redirect·handle 정규식 가드는 운영 그대로 보존.
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
  if (!HANDLE_RE.test(handle)) return null;
  const supabase = await createSupabaseServerClient();
  // H-1 (2026-07-04 Phase 1-B): 비-PII 는 일반 SELECT. PII 6종은 로그인 뷰어일 때만
  //   get_profile_pii RPC 로 조회 — RPC 가 내부에서 소유자=전체 / 타인=field_visibility 필터
  //   (contact_email·fitzpatrick 은 타인 항상 NULL)를 적용한다(옛 앱-계층 전용 필터를 DB 로 이관).
  const baseSelect =
    "id, display_name, role, bio, avatar_url, created_at, handle, field_visibility, auth_user_id";

  const { data } = await supabase
    .from("profiles")
    .select(baseSelect)
    .eq("handle", handle)
    .maybeSingle()
    .returns<ProfileRow>();
  if (!data) return null;

  if (!viewerIsAnon) {
    const { data: pii } = await supabase
      .rpc("get_profile_pii", { p_target: data.id })
      .maybeSingle<{
        birthdate: string | null;
        gender: string | null;
        face_shape: string | null;
        skin_type: string | null;
        skin_concerns: string[] | null;
        interested_procedures: string[] | null;
      }>();
    // 항상 명시 대입(pii 부재여도 undefined 아닌 null 로) — 호출자 null 기대 정합.
    data.birthdate = pii?.birthdate ?? null;
    data.gender = (pii?.gender ?? null) as ProfileRow["gender"];
    data.face_shape = pii?.face_shape ?? null;
    data.skin_type = pii?.skin_type ?? null;
    data.skin_concerns = pii?.skin_concerns ?? null;
    data.interested_procedures = pii?.interested_procedures ?? null;
  }

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
    .eq("is_listed", true) // 미공개 원장 slug 는 리다이렉트 대상에서도 제외(정정 §E-H2, 미들웨어와 일관)
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

  // 작성 글 / 내 후기 / 댓글 카운트 — 모두 profile.id 에만 의존하고 서로 독립적이라
  //  하나의 Promise.all 로 병렬 실행(워터폴 제거). 게이트(notFound)·redirect 이후라 profile.id 확정.
  //  - 작성 글: 일반 글 (category != review/review_summary).
  //  - 내 후기: 개별 시술후기 (category = review). 둘 다 CARD_LIST_SELECT·정렬·limit 재사용.
  //  - 댓글 카운트: 탭 미클릭 시에도 숫자 표시용 prefetch.
  //  (구 skin 탭용 '받은 시술' procedure_reviews distinct prefetch 는 D7 로 제거 —
  //   피부정보 상세는 /my 로 이동.)
  const [postsRes, reviewsRes, commentsCountRes] = await Promise.all([
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
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("author_id", profile.id)
      .eq("status", "visible"),
  ]);

  const posts = postsRes.data ?? [];
  const reviews = reviewsRes.data ?? [];
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

  // 프로필 태그 3종(연령대·얼굴형·피부타입) — 신디자인 프로필 카드(Phase 4-2).
  //   값은 get_profile_pii RPC 반환분(타인은 field_visibility 필터 적용됨) 기반이므로
  //   여기 라벨 매핑만 하면 타인 공개 규칙이 자동 존중된다. anon 은 PII 미조회 → 전부 null.
  const faceShape = profile.face_shape ?? null;
  const skinType = profile.skin_type ?? null;
  const ageGroupLabel = ageGroupFromBirthdate(profile.birthdate ?? null);
  const faceShapeLabel = faceShape ? FACE_LABEL[faceShape] ?? faceShape : null;
  const skinTypeLabel = skinType ? SKIN_LABEL[skinType] ?? skinType : null;

  // 필터 칩 노출 게이트용 field_visibility — anon 뷰어는 구(6탭) 동작 보존을 위해 빈 객체
  //   (기존에도 anon 은 skinInfo 미전달 → visibility={} 로 전 탭 노출이었음 — 동작 불변).
  const visibility: Record<string, boolean> = viewerIsAnon
    ? {}
    : ((profile.field_visibility ?? {}) as Record<string, boolean>);

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
      ageGroupLabel={ageGroupLabel}
      faceShapeLabel={faceShapeLabel}
      skinTypeLabel={skinTypeLabel}
      visibility={visibility}
    />
  );
}
