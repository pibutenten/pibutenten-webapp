import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";
import { FACE_LABEL, SKIN_LABEL } from "@/lib/profile-options";
import MyPageView from "@/components/skin/mypage/MyPageView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "마이페이지",
  robots: { index: false, follow: false },
};

/**
 * birthdate(YYYY-MM-DD) → 연령대 라벨("30대" 등). KST 기준 만 나이를 10년 단위로 내림.
 *   미입력(null)·파싱 실패·음수면 null → 프로필 카드 칩 생략.
 */
function ageGroupFromBirthdate(birthdate: string | null): string | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  if (age < 0 || age > 130) return null;
  if (age < 10) return "10대 미만";
  const decade = Math.floor(age / 10) * 10;
  return `${decade}대`;
}

/**
 * /my — 마이페이지 허브.
 *
 *   - 관리자(admin) → /admin (운영 대시보드, 변경 없음)
 *   - 원장(doctor) → /doctor (원장 대시보드, 변경 없음)
 *   - 회원(user) → 이 화면에서 마이페이지 허브를 직접 렌더(2026-06-24 신설).
 *       프로필 카드 + 퀵 스탯 + 나의 활동/관심/설정/고객지원 메뉴. 각 항목은 운영 라우트로 연결
 *       (활동·관심 목록은 공개 프로필 /{handle} 의 탭, 설정=/settings, 고객센터=/contact 등).
 *   - 비로그인 → /login?next=/my
 *   - handle 미설정(예외) → /
 */
export default async function MyPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/my");

  const idCtx = await getIdentityContext(supabase);
  const active = idCtx?.active;
  if (active?.role === ROLES.ADMIN) redirect("/admin");
  if (active?.role === ROLES.DOCTOR) redirect("/doctor");

  // 회원 — active 명함(getIdentityContext SSOT) 기준. 없으면 base profile fallback.
  const activeId = active?.profileId ?? user.id;

  // 프로필(이름·핸들·아바타 + 디자인 태그칩 PII).
  // H-1 (2026-07-04 Phase 1-B): 비-PII(handle·display_name·avatar_url)는 일반 SELECT,
  //   PII(birthdate·face_shape·skin_type)는 get_profile_pii RPC(본인 → 전체)로 조회.
  const [{ data: baseProf }, { data: piiProf }] = await Promise.all([
    supabase
      .from("profiles")
      .select("handle, display_name, avatar_url")
      .eq("id", activeId)
      .maybeSingle()
      .returns<{
        handle: string | null;
        display_name: string | null;
        avatar_url: string | null;
      }>(),
    supabase
      .rpc("get_profile_pii", { p_target: activeId })
      .maybeSingle<{
        birthdate: string | null;
        face_shape: string | null;
        skin_type: string | null;
      }>(),
  ]);
  const prof = baseProf
    ? {
        handle: baseProf.handle,
        display_name: baseProf.display_name,
        avatar_url: baseProf.avatar_url,
        birthdate: piiProf?.birthdate ?? null,
        face_shape: piiProf?.face_shape ?? null,
        skin_type: piiProf?.skin_type ?? null,
      }
    : null;

  // handle 미설정(거의 도달 안 함) — 허브 링크들이 /{handle} 의존이라 안전하게 홈으로.
  const handle = prof?.handle ?? active?.handle ?? null;
  if (!handle) redirect("/");

  // 카운트 — /today·/{handle} 와 동일 정책으로 active 명함 기준 병렬 집계.
  //   좋아요·북마크: 본인 명함만 SELECT 가능(RLS). card_likes/saves.profile_id (ADR 0014 Phase 3).
  //   내가 쓴 글: 후기·리포트 제외(글쓰기 목록 정책), published.
  //   내 댓글: visible.
  //   최근 본 글: get_my_recent_view_count RPC(active 명함 기준 distinct 카드 수). auth.uid() 필요 →
  //     좋아요/북마크와 동일한 user 인증 클라이언트(supabase)에서 호출.
  const [likesRes, savesRes, postRes, commentRes, recentCountRes] =
    await Promise.all([
      supabase
        .from("card_likes")
        .select("card_id", { count: "exact", head: true })
        .eq("profile_id", activeId),
      supabase
        .from("card_saves")
        .select("card_id", { count: "exact", head: true })
        .eq("profile_id", activeId),
      supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("author_id", activeId)
        .eq("status", "published")
        .not("category", "in", "(review,review_summary)"),
      supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("author_id", activeId)
        .eq("status", "visible"),
      supabase.rpc("get_my_recent_view_count", { p_profile_id: activeId }),
    ]);

  // RPC 가 정수 1개 반환. 실패(에러·null)면 0 → "최근 본 글" 비활성 처리(StatCol).
  const recentCount =
    typeof recentCountRes.data === "number" ? recentCountRes.data : 0;

  const faceShape = prof?.face_shape ?? null;
  const skinType = prof?.skin_type ?? null;

  return (
    <MyPageView
      handle={handle}
      displayName={prof?.display_name?.trim() || "회원"}
      avatarUrl={prof?.avatar_url ?? active?.avatarUrl ?? null}
      ageGroupLabel={ageGroupFromBirthdate(prof?.birthdate ?? null)}
      faceShapeLabel={faceShape ? FACE_LABEL[faceShape] ?? faceShape : null}
      skinTypeLabel={skinType ? SKIN_LABEL[skinType] ?? skinType : null}
      likesCount={likesRes.count ?? 0}
      savesCount={savesRes.count ?? 0}
      postCount={postRes.count ?? 0}
      commentCount={commentRes.count ?? 0}
      recentCount={recentCount}
    />
  );
}
