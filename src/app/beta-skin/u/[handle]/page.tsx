import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { getDoctorMetaBatch } from "@/lib/doctor-mapping";
import type { CardData } from "@/lib/types/card";
import BetaProfileView, { type BetaSkinInfo } from "./BetaProfileView";

/**
 * /beta-skin/u/[handle] — 신규 스킨 "공개 프로필" (명함 클릭 화면).
 *
 * 운영 `/[handle]` 의 데이터 로직을 그대로 재사용(profiles by handle + posts/reviews 20개 +
 *   댓글·좋아요·저장 카운트 + viewerStates + 피부정보). UI 만 베타 톤(BetaProfileView).
 * - 원장(doctors.slug 일치)은 베타에 공개 프로필이 없음(글상세 우측 프로필이 대체) → 운영 /doctors 로.
 * - 본인(isOwner)이면 [설정]·[로그아웃] 추가. admin 본인 1차 handle 은 운영 /admin 으로(베타 admin 은 Phase3).
 * - 비로그인(anon)은 PII 컬럼 select 제외(0122 column REVOKE 대응).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 프로필",
  robots: { index: false, follow: false },
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  role: "admin" | "doctor" | "user";
  bio: string | null;
  avatar_url: string | null;
  handle: string | null;
  field_visibility: Record<string, boolean> | null;
  auth_user_id: string | null;
  birthdate?: string | null;
  gender?: string | null;
  face_shape?: string | null;
  skin_type?: string | null;
  skin_concerns?: string[] | null;
  interested_procedures?: string[] | null;
};

export default async function BetaProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(handle)) notFound();

  const supabase = await createSupabaseServerClient();

  // 원장 slug 면 베타에 공개 프로필 없음 → 운영 /doctors 로(canonical 통일, 글상세 우측 프로필이 대체).
  const { data: doctorMatch } = await supabase
    .from("doctors")
    .select("slug")
    .eq("slug", handle)
    .maybeSingle();
  if (doctorMatch) redirect(`/doctors/${handle}`);

  // viewer 먼저 — anon 이면 PII 컬럼 제외(0122 RLS column REVOKE).
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const viewerIsAnon = !viewer;

  const baseSelect =
    "id, display_name, role, bio, avatar_url, handle, field_visibility, auth_user_id";
  const piiSelect =
    ", birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures";
  const { data: profile } = await supabase
    .from("profiles")
    .select(viewerIsAnon ? baseSelect : baseSelect + piiSelect)
    .eq("handle", handle)
    .maybeSingle()
    .returns<ProfileRow>();
  if (!profile) notFound();

  // 본인 판정 — 같은 auth_user_id 묶음(부계정 포함).
  const isOwner =
    !!viewer &&
    (viewer.id === profile.id || profile.auth_user_id === viewer.id);

  // admin 본인 1차 handle → 운영 /admin (베타 admin 은 Phase 3에서 신설).
  if (isOwner && viewer) {
    const { data: vp } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", viewer.id)
      .maybeSingle();
    if ((vp?.role as string | undefined) === "admin") redirect("/admin");
  }

  // 의사 매핑(회원 명함이 의사 매핑된 케이스) — 누끼 사진 우선. (원장 slug 는 위에서 redirect 됨)
  const metaMap = await getDoctorMetaBatch(supabase, [profile.id]);
  const docMeta = metaMap.get(profile.id);
  const avatarUrl = docMeta?.slug
    ? docMeta.photoUrl ?? `/doctors/${docMeta.slug}.png`
    : profile.avatar_url;
  const displayName = profile.display_name ?? handle;

  // 작성 글(일반) / 내 후기(review) — 각 최근 20개. 운영과 동일 select·정렬.
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

  // 받은 시술 — procedure_reviews distinct 시술명.
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

  // 댓글 카운트(탭 미클릭 시에도 표시).
  const { count: commentsCount } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("author_id", profile.id)
    .eq("status", "visible");

  // 좋아요/저장 카운트 — 본인만(RLS).
  let likesCount = 0;
  let savesCount = 0;
  if (isOwner) {
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

  // viewer 좋아요/저장 prefetch — posts+reviews 카드.
  const viewerStates = await fetchViewerStatesRecord(
    supabase,
    viewer?.id ?? null,
    [...posts, ...reviews].map((p) => p.id),
  );

  const skinInfo: BetaSkinInfo | undefined = viewerIsAnon
    ? undefined
    : {
        faceShape: profile.face_shape ?? null,
        skinType: profile.skin_type ?? null,
        skinConcerns: profile.skin_concerns ?? [],
        interestedProcedures: profile.interested_procedures ?? [],
        receivedProcedures,
        visibility: (profile.field_visibility ?? {}) as Record<string, boolean>,
      };

  return (
    <BetaProfileView
      handle={handle}
      displayName={displayName}
      avatarUrl={avatarUrl}
      bio={profile.bio}
      isOwner={isOwner}
      isDoctor={!!docMeta?.slug}
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
    />
  );
}
