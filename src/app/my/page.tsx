import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";
import {
  FACE_LABEL,
  SKIN_LABEL,
  CONCERN_LABEL,
  PROCEDURE_LABEL,
} from "@/lib/profile-options";
import { categoryKoToSlug, type ProcedureCategory } from "@/lib/procedure-report";
import MyPageView, { type ReceivedProcedure } from "@/components/skin/mypage/MyPageView";

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
 *   - 회원(user) → 이 화면에서 마이페이지 허브를 직접 렌더(2026-06-24 신설, 2026-07-08 신디자인).
 *       프로필 카드(내 피부 정보 접힘/펼침 — 피부고민·관심시술·받은시술 칩) + 퀵 스탯 +
 *       나의 활동/관심/설정/고객지원 메뉴. 각 항목은 운영 라우트로 연결
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
  if (active?.role === ROLES.CLINIC) redirect("/clinic"); // 병원 계정 — 회원 마이 대신 병원 대시보드

  // 회원 — active 명함(getIdentityContext SSOT) 기준. 없으면 base profile fallback.
  const activeId = active?.profileId ?? user.id;

  // 프로필(이름·핸들·아바타 + 디자인 태그칩 PII).
  // H-1 (2026-07-04 Phase 1-B): 비-PII(handle·display_name·avatar_url)는 일반 SELECT,
  //   PII(birthdate·face_shape·skin_type + 피부고민·관심시술 — UI 개편 Phase 3, 2026-07-08)는
  //   get_profile_pii RPC(본인 → 전체)로 조회. RPC 는 원래 skin_concerns·interested_procedures 를
  //   반환하고 있었고(마이그 0334), 여기 타입 제네릭만 3필드로 좁혀져 있었다 → 소비 확장.
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
        skin_concerns: string[] | null;
        interested_procedures: string[] | null;
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
        skin_concerns: piiProf?.skin_concerns ?? null,
        interested_procedures: piiProf?.interested_procedures ?? null,
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
  const [likesRes, savesRes, postRes, commentRes, recentCountRes, diariesRes] =
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
      // 받은 시술(내 피부 정보 펼침, UI 개편 Phase 3-1) — diaries(부모)+diary_procedures(자식).
      //   RLS 가 active 명함 소유분만 반환(createSupabaseServerClient 의 x-active-profile-id 헤더
      //   → current_active_profile_id() — /notes 서버 조회와 동일 경로, RPC 신설 불필요).
      //   최근 방문 우선(dedup 시 첫 등장 순서 보존). 날짜 미상(NULL)은 맨 끝(nullsFirst:false).
      //   상한 100: 마이페이지는 최근 이력 기반 distinct 칩만 필요 — 수백 건 활성 회원의
      //   전행 조회 방지 (전체 열람은 /notes 가 담당).
      supabase
        .from("diaries")
        .select("visited_on, diary_procedures(procedure_ko, sort_order)")
        .order("visited_on", { ascending: false, nullsFirst: false })
        .limit(100)
        .returns<
          {
            visited_on: string | null;
            diary_procedures: { procedure_ko: string; sort_order: number }[];
          }[]
        >(),
    ]);

  // RPC 가 정수 1개 반환. 실패(에러·null)면 0 → "최근 본 글" 비활성 처리(StatCol).
  const recentCount =
    typeof recentCountRes.data === "number" ? recentCountRes.data : 0;

  // 받은 시술명 distinct — 최근 방문 diary 부터, diary 안에서는 sort_order 순.
  const receivedNames: string[] = [];
  {
    const seen = new Set<string>();
    for (const d of diariesRes.data ?? []) {
      const procs = [...d.diary_procedures].sort((a, b) => a.sort_order - b.sort_order);
      for (const p of procs) {
        const name = p.procedure_ko?.trim();
        if (name && !seen.has(name)) {
          seen.add(name);
          receivedNames.push(name);
        }
      }
    }
  }

  // 시술 → 카테고리 매핑 (D11 원장 확정: 칩 색 = 카테고리 팔레트).
  //   tag_dictionary 서버 1쿼리(ko in (...) → 한글 category) 후 categoryKoToSlug(SSOT)로
  //   테마 slug 화. 사전 미등록(자유입력)·비시술 카테고리(피부고민 등)는 null → 회색 칩.
  //   diaries.source 는 표시에 사용하지 않음(D11 — 파란 점/회색 이분 구분 폐기).
  const catByName = new Map<string, ProcedureCategory | null>();
  if (receivedNames.length > 0) {
    const { data: tagRows } = await supabase
      .from("tag_dictionary")
      .select("ko, category")
      .eq("is_procedure", true)
      .in("ko", receivedNames)
      .returns<{ ko: string; category: string | null }[]>();
    for (const r of tagRows ?? []) catByName.set(r.ko, categoryKoToSlug(r.category));
  }
  const receivedProcedures: ReceivedProcedure[] = receivedNames.map((name) => ({
    name,
    category: catByName.get(name) ?? null,
  }));

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
      skinConcernLabels={(prof?.skin_concerns ?? []).map((c) => CONCERN_LABEL[c] ?? c)}
      interestedProcedureLabels={(prof?.interested_procedures ?? []).map(
        (p) => PROCEDURE_LABEL[p] ?? p,
      )}
      receivedProcedures={receivedProcedures}
      likesCount={likesRes.count ?? 0}
      savesCount={savesRes.count ?? 0}
      postCount={postRes.count ?? 0}
      commentCount={commentRes.count ?? 0}
      recentCount={recentCount}
    />
  );
}
